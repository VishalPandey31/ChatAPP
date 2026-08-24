import { create } from 'zustand';
import { useAuthStore } from './authStore';
import { useChatStore } from './chatStore';

const ICE_SERVERS = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" }
    ]
};

// Format duration for display
const formatDuration = (secs) => {
    if (!secs || secs < 1) return '0 secs';
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    if (m === 0) return `${s} sec${s !== 1 ? 's' : ''}`;
    return s > 0 ? `${m} min${m !== 1 ? 's' : ''} ${s} sec${s !== 1 ? 's' : ''}` : `${m} min${m !== 1 ? 's' : ''}`;
};

export const useVoiceCallStore = create((set, get) => ({
    // Call States: IDLE, CALLING, RINGING, CONNECTING, CONNECTED
    callState: 'IDLE',

    // Call participant data
    activeCall: null,

    // Internal WebRTC
    peerConnection: null,
    localStream: null,
    remoteStream: null,
    isMuted: false,
    iceCandidateQueue: [],

    // Track connection time for duration calculation
    connectedAt: null,

    // Socket Event Helpers
    _initSocketListeners: () => {
        const socket = useAuthStore.getState().socket;
        if (!socket) return;

        socket.off('incoming-call');
        socket.off('call-accepted');
        socket.off('call-rejected');
        socket.off('call-ended');
        socket.off('call-failed');
        socket.off('webrtc-offer');
        socket.off('webrtc-answer');
        socket.off('webrtc-ice-candidate');
        socket.off('voice-call:record');

        socket.on('incoming-call', (data) => {
            const { callerId, callerName, callId } = data;
            const { callState } = get();

            if (callState !== 'IDLE') {
                socket.emit('reject-call', {
                    callerId,
                    receiverId: useAuthStore.getState().user._id,
                    callId,
                    reason: 'busy'
                });
                return;
            }

            set({
                callState: 'RINGING',
                activeCall: { callerId, callerName, receiverId: useAuthStore.getState().user._id, callId, isIncoming: true }
            });
        });

        socket.on('call-accepted', async (data) => {
            const { callId } = data;
            const { activeCall, callState } = get();
            if (!activeCall || activeCall.callId !== callId || callState !== 'CALLING') return;
            set({ callState: 'CONNECTING' });
            await get()._createOffer();
        });

        socket.on('call-rejected', (data) => {
            const { activeCall } = get();
            if (activeCall) {
                get()._saveCallRecord({
                    status: data.reason === 'busy' ? 'missed' : 'declined'
                });
            }
            get()._cleanup('Call rejected: ' + (data.reason || 'declined'));
        });

        socket.on('call-ended', () => {
            const { activeCall, connectedAt } = get();
            if (activeCall) {
                const duration = connectedAt ? Math.round((Date.now() - connectedAt) / 1000) : 0;
                get()._saveCallRecord({ status: 'completed', duration });
            }
            get()._cleanup('Call ended by remote');
        });

        socket.on('call-failed', (data) => {
            const { activeCall } = get();
            if (activeCall) {
                get()._saveCallRecord({ status: 'failed' });
            }
            get()._cleanup('Call failed: ' + (data.reason || ''));
        });

        socket.on('webrtc-offer', async (data) => {
            const { offer, callId } = data;
            const { activeCall } = get();
            if (!activeCall || activeCall.callId !== callId) return;
            set({ callState: 'CONNECTING' });
            await get()._handleOffer(offer);
        });

        socket.on('webrtc-answer', async (data) => {
            const { answer, callId } = data;
            const { activeCall, peerConnection } = get();
            if (!activeCall || activeCall.callId !== callId || !peerConnection) return;
            try {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
                get()._processIceQueue();
            } catch (err) {
                console.error("Failed to set remote description from answer", err);
            }
        });

        socket.on('webrtc-ice-candidate', async (data) => {
            const { candidate, callId } = data;
            const { activeCall, peerConnection, iceCandidateQueue } = get();
            if (!activeCall || activeCall.callId !== callId || !peerConnection) return;
            const rtcCandidate = new RTCIceCandidate(candidate);
            if (peerConnection.remoteDescription?.type) {
                try { await peerConnection.addIceCandidate(rtcCandidate); }
                catch (e) { console.error("ICE candidate error", e); }
            } else {
                set({ iceCandidateQueue: [...iceCandidateQueue, rtcCandidate] });
            }
        });

        // Receive call record from backend and inject into chat
        socket.on('voice-call:record', (record) => {
            const addMessage = useChatStore.getState().addMessage;
            if (addMessage && record) {
                addMessage(record);
            }
        });
    },

    _processIceQueue: async () => {
        const { peerConnection, iceCandidateQueue } = get();
        if (peerConnection?.remoteDescription) {
            for (const c of iceCandidateQueue) {
                try { await peerConnection.addIceCandidate(c); }
                catch (e) { console.error(e); }
            }
            set({ iceCandidateQueue: [] });
        }
    },

    // Save call record via socket → backend → DB → both clients
    _saveCallRecord: ({ status, duration = 0 }) => {
        const socket = useAuthStore.getState().socket;
        const { activeCall } = get();
        if (!socket || !activeCall) return;

        // Get projectId from current chat context
        const projectId = useChatStore.getState().currentProjectId || null;

        socket.emit('call-save-record', {
            callId: activeCall.callId,
            callerId: activeCall.callerId,
            receiverId: activeCall.receiverId || activeCall.receiverId,
            projectId,
            status,
            duration
        });
    },

    // A Starts Call
    startCall: (receiverId, receiverName) => {
        const socket = useAuthStore.getState().socket;
        const currentUser = useAuthStore.getState().user;
        if (!socket || !currentUser) return;

        get()._initSocketListeners();

        const callId = `call-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
        set({
            callState: 'CALLING',
            activeCall: {
                callerId: currentUser._id,
                callerName: currentUser.name,
                receiverId,
                receiverName,
                callId,
                isIncoming: false
            },
            connectedAt: null
        });

        socket.emit('call-user', {
            callerId: currentUser._id,
            receiverId,
            callId,
            callerName: currentUser.name
        });

        // 30-second timeout: no answer
        const timer = setTimeout(() => {
            const { callState, activeCall } = get();
            if (callState === 'CALLING' && activeCall?.callId === callId) {
                get()._saveCallRecord({ status: 'no_answer' });
                get()._cleanup('Call timeout - no answer');
            }
        }, 30000);
        set({ _timeoutTimer: timer });
    },

    // B Accepts Call
    acceptCall: async () => {
        const socket = useAuthStore.getState().socket;
        const currentUser = useAuthStore.getState().user;
        const { activeCall, _timeoutTimer } = get();
        if (!socket || !currentUser || !activeCall) return;

        if (_timeoutTimer) clearTimeout(_timeoutTimer);

        const stream = await get()._getLocalStream();
        if (!stream) {
            get().rejectCall('No microphone permission');
            return;
        }

        set({ callState: 'CONNECTING' });
        socket.emit('accept-call', {
            callerId: activeCall.callerId,
            receiverId: activeCall.receiverId,
            callId: activeCall.callId
        });
    },

    rejectCall: (reason = 'declined') => {
        const socket = useAuthStore.getState().socket;
        const { activeCall, _timeoutTimer } = get();
        if (_timeoutTimer) clearTimeout(_timeoutTimer);
        if (socket && activeCall) {
            // Only emit reject-call for the caller to hear; backend will NOT auto-save from this
            socket.emit('reject-call', {
                callerId: activeCall.callerId,
                receiverId: activeCall.receiverId,
                callId: activeCall.callId,
                reason
            });
            // Callee saves the record (caller does via call-rejected listener)
            get()._saveCallRecord({ status: reason === 'busy' ? 'missed' : 'declined' });
        }
        get()._cleanup();
    },

    endCall: () => {
        const socket = useAuthStore.getState().socket;
        const { activeCall, connectedAt, _timeoutTimer } = get();
        if (_timeoutTimer) clearTimeout(_timeoutTimer);
        if (socket && activeCall) {
            const targetId = activeCall.isIncoming ? activeCall.callerId : activeCall.receiverId;
            socket.emit('end-call', { targetId, callId: activeCall.callId });
            const duration = connectedAt ? Math.round((Date.now() - connectedAt) / 1000) : 0;
            get()._saveCallRecord({ status: duration > 0 ? 'completed' : 'cancelled', duration });
        }
        get()._cleanup();
    },

    cancelCall: () => {
        const socket = useAuthStore.getState().socket;
        const { activeCall, _timeoutTimer } = get();
        if (_timeoutTimer) clearTimeout(_timeoutTimer);
        if (socket && activeCall && !activeCall.isIncoming) {
            const targetId = activeCall.receiverId;
            socket.emit('end-call', { targetId, callId: activeCall.callId });
            get()._saveCallRecord({ status: 'cancelled' });
        }
        get()._cleanup();
    },

    toggleMute: () => {
        const { localStream, isMuted } = get();
        if (localStream) {
            const tracks = localStream.getAudioTracks();
            if (tracks.length > 0) {
                tracks[0].enabled = isMuted;
                set({ isMuted: !isMuted });
            }
        }
    },

    _getLocalStream: async () => {
        const { localStream } = get();
        if (localStream) return localStream;

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.error("WebRTC getUserMedia is not supported in this browser or context (requires HTTPS).");
            alert("Microphone access is not supported. Please ensure you are on HTTPS or using a supported browser.");
            return null;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
                video: false
            });
            set({ localStream: stream });
            return stream;
        } catch (error) {
            console.error("Microphone access denied:", error);
            alert("Microphone permission is required for voice calls.");
            return null;
        }
    },

    _createPeerConnection: () => {
        const { activeCall } = get();
        const socket = useAuthStore.getState().socket;
        const pc = new RTCPeerConnection(ICE_SERVERS);
        const targetId = activeCall.isIncoming ? activeCall.callerId : activeCall.receiverId;

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('webrtc-ice-candidate', { targetId, candidate: event.candidate, callId: activeCall.callId });
            }
        };

        pc.ontrack = (event) => {
            const stream = (event.streams && event.streams[0]) || new MediaStream([event.track]);
            set({ remoteStream: stream });
        };

        pc.onconnectionstatechange = () => {
            console.log("[WebRTC] State:", pc.connectionState);
            if (pc.connectionState === 'connected') {
                set({ callState: 'CONNECTED', connectedAt: Date.now() });
            } else if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
                const { connectedAt, activeCall } = get();
                if (activeCall) {
                    const duration = connectedAt ? Math.round((Date.now() - connectedAt) / 1000) : 0;
                    if (pc.connectionState === 'failed') {
                        get()._saveCallRecord({ status: 'failed' });
                    } else if (duration > 0) {
                        get()._saveCallRecord({ status: 'completed', duration });
                    }
                }
                get()._cleanup();
            }
        };

        set({ peerConnection: pc });
        return pc;
    },

    _createOffer: async () => {
        const { activeCall } = get();
        const socket = useAuthStore.getState().socket;
        const stream = await get()._getLocalStream();
        if (!stream) { get().endCall(); return; }
        const pc = get()._createPeerConnection();
        stream.getTracks().forEach(track => pc.addTrack(track, stream));
        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit('webrtc-offer', { targetId: activeCall.receiverId, offer: pc.localDescription, callId: activeCall.callId });
        } catch (error) {
            console.error("Error creating WebRTC offer:", error);
            get().endCall();
        }
    },

    _handleOffer: async (offer) => {
        const { activeCall } = get();
        const socket = useAuthStore.getState().socket;
        const stream = await get()._getLocalStream();
        if (!stream) return;
        const pc = get()._createPeerConnection();
        stream.getTracks().forEach(track => pc.addTrack(track, stream));
        try {
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            get()._processIceQueue();
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit('webrtc-answer', { targetId: activeCall.callerId, answer: pc.localDescription, callId: activeCall.callId });
        } catch (error) {
            console.error("Error handling offer:", error);
            get().endCall();
        }
    },

    _cleanup: (logMsg) => {
        if (logMsg) console.log(`[VoiceCall] ${logMsg}`);
        const { peerConnection, localStream, _timeoutTimer } = get();
        if (_timeoutTimer) clearTimeout(_timeoutTimer);
        if (peerConnection) {
            peerConnection.ontrack = null;
            peerConnection.onicecandidate = null;
            peerConnection.onconnectionstatechange = null;
            peerConnection.close();
        }
        if (localStream) {
            localStream.getTracks().forEach(track => { track.stop(); localStream.removeTrack(track); });
        }
        set({
            callState: 'IDLE', activeCall: null, peerConnection: null,
            localStream: null, remoteStream: null, isMuted: false,
            iceCandidateQueue: [], connectedAt: null, _timeoutTimer: null
        });
    },

    initListeners: () => get()._initSocketListeners(),
    removeListeners: () => {
        const socket = useAuthStore.getState().socket;
        if (!socket) return;
        ['incoming-call', 'call-accepted', 'call-rejected', 'call-ended', 'call-failed',
            'webrtc-offer', 'webrtc-answer', 'webrtc-ice-candidate', 'voice-call:record']
            .forEach(ev => socket.off(ev));
    }
}));
