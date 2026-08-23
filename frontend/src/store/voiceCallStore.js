import { create } from 'zustand';
import { useAuthStore } from './authStore';

const ICE_SERVERS = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" }
    ]
};

export const useVoiceCallStore = create((set, get) => ({
    // Call States: IDLE, CALLING, RINGING, CONNECTING, CONNECTED
    callState: 'IDLE',

    // Call participant data: { callerId, callerName, receiverId, receiverName, callId, isIncoming }
    activeCall: null,

    // Internal WebRTC
    peerConnection: null,
    localStream: null,
    remoteStream: null,

    // Controls
    isMuted: false,

    // Queue ICE candidates received before remote description is set
    iceCandidateQueue: [],

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

        socket.on('incoming-call', (data) => {
            const { callerId, callerName, callId } = data;
            const { callState } = get();

            if (callState !== 'IDLE') {
                // Busy handling
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
            // Caller: The receiver accepted, time to create WebRTC Offer
            await get()._createOffer();
        });

        socket.on('call-rejected', (data) => {
            get()._cleanup('Call rejected: ' + (data.reason || 'declined'));
        });

        socket.on('call-ended', (data) => {
            get()._cleanup('Call ended by remote');
        });

        socket.on('call-failed', (data) => {
            get()._cleanup('Call failed: ' + (data.reason || ''));
        });

        socket.on('webrtc-offer', async (data) => {
            const { offer, callId } = data;
            const { activeCall, callState } = get();
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
            // Connection goes to CONNECTED via peerConnection onconnectionstatechange
        });

        socket.on('webrtc-ice-candidate', async (data) => {
            const { candidate, callId } = data;
            const { activeCall, peerConnection, iceCandidateQueue } = get();
            if (!activeCall || activeCall.callId !== callId || !peerConnection) return;

            const rtcCandidate = new RTCIceCandidate(candidate);
            if (peerConnection.remoteDescription && peerConnection.remoteDescription.type) {
                try {
                    await peerConnection.addIceCandidate(rtcCandidate);
                } catch (e) {
                    console.error("Error adding received ice candidate", e);
                }
            } else {
                set({ iceCandidateQueue: [...iceCandidateQueue, rtcCandidate] });
            }
        });
    },

    // Queue processor for ICE candidates
    _processIceQueue: async () => {
        const { peerConnection, iceCandidateQueue } = get();
        if (peerConnection && peerConnection.remoteDescription) {
            for (const c of iceCandidateQueue) {
                try {
                    await peerConnection.addIceCandidate(c);
                } catch (e) {
                    console.error(e);
                }
            }
            set({ iceCandidateQueue: [] });
        }
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
            }
        });

        socket.emit('call-user', {
            callerId: currentUser._id,
            receiverId,
            callId,
            callerName: currentUser.name
        });
    },

    // B Accepts Call
    acceptCall: async () => {
        const socket = useAuthStore.getState().socket;
        const currentUser = useAuthStore.getState().user;
        const { activeCall } = get();

        if (!socket || !currentUser || !activeCall) return;

        // Ensure mic permission before firing accept to avert UI locking if denied
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
        const { activeCall } = get();
        if (socket && activeCall) {
            socket.emit('reject-call', {
                callerId: activeCall.callerId,
                receiverId: activeCall.receiverId,
                callId: activeCall.callId,
                reason
            });
        }
        get()._cleanup();
    },

    endCall: () => {
        const socket = useAuthStore.getState().socket;
        const { activeCall } = get();
        if (socket && activeCall) {
            const targetId = activeCall.isIncoming ? activeCall.callerId : activeCall.receiverId;
            socket.emit('end-call', {
                targetId,
                callId: activeCall.callId
            });
        }
        get()._cleanup();
    },

    toggleMute: () => {
        const { localStream, isMuted } = get();
        if (localStream) {
            const audioTracks = localStream.getAudioTracks();
            if (audioTracks.length > 0) {
                audioTracks[0].enabled = isMuted; // Toggle enabled state
                set({ isMuted: !isMuted });
            }
        }
    },

    // Internal WebRTC logic
    _getLocalStream: async () => {
        const { localStream } = get();
        if (localStream) return localStream;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },
                video: false // No video for Voice Calling
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

        // Re-use external TURN settings if possible, otherwise rely on robust STUN
        const pc = new RTCPeerConnection(ICE_SERVERS);

        const targetId = activeCall.isIncoming ? activeCall.callerId : activeCall.receiverId;

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('webrtc-ice-candidate', {
                    targetId,
                    candidate: event.candidate,
                    callId: activeCall.callId
                });
            }
        };

        pc.ontrack = (event) => {
            if (event.streams && event.streams[0]) {
                set({ remoteStream: event.streams[0] });
            }
        };

        pc.onconnectionstatechange = () => {
            console.log("[WebRTC] Connection State: ", pc.connectionState);
            if (pc.connectionState === 'connected') {
                set({ callState: 'CONNECTED' });
            } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
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
        if (!stream) {
            get().endCall();
            return;
        }

        const pc = get()._createPeerConnection();
        stream.getTracks().forEach(track => {
            pc.addTrack(track, stream);
        });

        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            socket.emit('webrtc-offer', {
                targetId: activeCall.receiverId,
                offer: pc.localDescription,
                callId: activeCall.callId
            });
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
        stream.getTracks().forEach(track => {
            pc.addTrack(track, stream);
        });

        try {
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            get()._processIceQueue();

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            socket.emit('webrtc-answer', {
                targetId: activeCall.callerId,
                answer: pc.localDescription,
                callId: activeCall.callId
            });
        } catch (error) {
            console.error("Error handling offer or creating answer:", error);
            get().endCall();
        }
    },

    _cleanup: (logMsg) => {
        if (logMsg) console.log(`[VoiceCall] cleanup - ${logMsg}`);

        const { peerConnection, localStream } = get();

        if (peerConnection) {
            peerConnection.ontrack = null;
            peerConnection.onicecandidate = null;
            peerConnection.onconnectionstatechange = null;
            peerConnection.close();
        }

        if (localStream) {
            localStream.getTracks().forEach(track => {
                track.stop(); // Mandate hardware cleanup to remove browser indicator
                localStream.removeTrack(track);
            });
        }

        set({
            callState: 'IDLE',
            activeCall: null,
            peerConnection: null,
            localStream: null,
            remoteStream: null,
            isMuted: false,
            iceCandidateQueue: []
        });
    },

    initListeners: () => get()._initSocketListeners(),
    removeListeners: () => {
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
    }
}));
