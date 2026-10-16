import React, { useEffect, useState, useRef } from 'react';
import { useVoiceCallStore } from '../../store/voiceCallStore';
import { Mic, MicOff, Video, VideoOff, PhoneOff, Volume2, Smartphone, SwitchCamera, Phone } from 'lucide-react';
import './VoiceCall.css';

const padZero = (num) => num.toString().padStart(2, '0');

const isMobileBrowser = () => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent || '');
};

const ActiveCallOverlay = () => {
    const { 
        callState, 
        activeCall, 
        localStream,
        remoteStream, 
        isMuted, 
        isVideoMuted,
        toggleMute, 
        toggleVideo,
        switchCamera,
        endCall 
    } = useVoiceCallStore();
    
    const [duration, setDuration] = useState(0);
    const [audioOutput, setAudioOutput] = useState('speaker'); // 'speaker' or 'earpiece'
    const remoteAudioRef = useRef(null);
    const remoteVideoRef = useRef(null);
    const localVideoRef = useRef(null);
    const ringbackToneRef = useRef(null);

    // Determines if overlay should be visible
    const isVisible = callState === 'CALLING' || callState === 'CONNECTING' || callState === 'CONNECTED';
    const isVideoCall = activeCall?.callType === 'video';

    // Handle remote media stream mapping (audio and video)
    useEffect(() => {
        if (remoteAudioRef.current && remoteStream) {
            remoteAudioRef.current.srcObject = remoteStream;
            remoteAudioRef.current.play().catch(e => {
                console.warn("Audio autoplay prevented or failed:", e);
            });
        }
        if (remoteVideoRef.current && remoteStream) {
            remoteVideoRef.current.srcObject = remoteStream;
            remoteVideoRef.current.play().catch(e => {
                console.warn("Remote video play prevented:", e);
            });
        }
    }, [remoteStream, isVisible]);

    // Handle local camera preview
    useEffect(() => {
        if (localVideoRef.current && localStream) {
            localVideoRef.current.srcObject = localStream;
            localVideoRef.current.play().catch(e => {
                console.warn("Local video preview prevented:", e);
            });
        }
    }, [localStream, isVisible]);

    // Format duration
    const formatDuration = (seconds) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        if (h > 0) return `${padZero(h)}:${padZero(m)}:${padZero(s)}`;
        return `${padZero(m)}:${padZero(s)}`;
    };

    // Duration timer handling
    useEffect(() => {
        let timer = null;
        if (callState === 'CONNECTED') {
            setDuration(0);
            timer = setInterval(() => {
                setDuration(prev => prev + 1);
            }, 1000);
        } else {
            setDuration(0);
        }
        return () => {
            if (timer) clearInterval(timer);
        };
    }, [callState]);

    // Ringback tone for calling out
    useEffect(() => {
        if (callState === 'CALLING' && !activeCall?.isIncoming) {
            const audio = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');
            audio.loop = true;
            audio.play().catch(e => console.warn("Autoplay prevented:", e));
            ringbackToneRef.current = audio;
        }
        return () => {
             if (ringbackToneRef.current) {
                 ringbackToneRef.current.pause();
                 ringbackToneRef.current.currentTime = 0;
             }
        };
    }, [callState, activeCall]);

    const toggleAudioOutput = async () => {
        if (!remoteAudioRef.current) return;

        if (typeof navigator.mediaDevices?.selectAudioOutput === 'function') {
            try {
                const device = await navigator.mediaDevices.selectAudioOutput();
                await remoteAudioRef.current.setSinkId(device.deviceId);
                const lbl = device.label.toLowerCase();
                if (lbl.includes('earpiece') || lbl.includes('phone') || lbl.includes('built-in receiver')) {
                    setAudioOutput('earpiece');
                } else {
                    setAudioOutput('speaker');
                }
                return;
            } catch (err) {
                console.warn('User dismissed selectAudioOutput dialog:', err);
                return;
            }
        }

        if (isMobileBrowser()) {
            alert("Mobile browsers restrict direct JavaScript earpiece override. Please connect headphones or bluetooth for private listening.");
            return;
        }

        const newOutput = audioOutput === 'speaker' ? 'earpiece' : 'speaker';
        if (typeof remoteAudioRef.current.setSinkId === 'function') {
            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                const audioOutputs = devices.filter(d => d.kind === 'audiooutput');
                let targetDevice = null;
                if (newOutput === 'earpiece') {
                    targetDevice = audioOutputs.find(d => {
                        const lbl = d.label.toLowerCase();
                        return lbl.includes('earpiece') || lbl.includes('phone') || lbl.includes('handset');
                    });
                    await remoteAudioRef.current.setSinkId(targetDevice ? targetDevice.deviceId : 'default');
                } else {
                    targetDevice = audioOutputs.find(d => d.label.toLowerCase().includes('speaker'));
                    await remoteAudioRef.current.setSinkId(targetDevice ? targetDevice.deviceId : '');
                }
                setAudioOutput(newOutput);
            } catch (err) {
                console.warn('setSinkId failed:', err);
                setAudioOutput(newOutput);
            }
        } else {
            setAudioOutput(newOutput);
        }
    };

    if (!isVisible) return null;

    const targetName = activeCall?.isIncoming ? (activeCall?.callerName || 'Teammate') : (activeCall?.receiverName || 'Teammate');

    // ──────────────────────────────────────────
    // 1. VIDEO CALL UI
    // ──────────────────────────────────────────
    if (isVideoCall) {
        return (
            <div className="video-call-screen">
                {/* Main Remote Video */}
                {remoteStream ? (
                    <video 
                        ref={remoteVideoRef} 
                        autoPlay 
                        playsInline 
                        className="video-call-main"
                    />
                ) : (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f172a' }}>
                        <div style={{ width: '90px', height: '90px', borderRadius: '50%', backgroundColor: '#1e293b', border: '3px solid #10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', color: '#10b981', marginBottom: '16px' }}>
                            <Video size={42} />
                        </div>
                        <div style={{ fontSize: '20px', fontWeight: '600', color: '#f8fafc', marginBottom: '6px' }}>
                            {targetName}
                        </div>
                        <div style={{ fontSize: '14px', color: '#10b981' }} className="pulse-anim">
                            {callState === 'CALLING' ? 'Calling...' : callState === 'CONNECTING' ? 'Connecting video...' : 'Video connected'}
                        </div>
                    </div>
                )}

                {/* Floating Local PiP Video Preview */}
                <video 
                    ref={localVideoRef} 
                    autoPlay 
                    playsInline 
                    muted 
                    className="video-call-pip"
                    style={{ display: isVideoMuted ? 'none' : 'block' }}
                />

                {/* Top Info Badge */}
                <div className="video-call-header-overlay">
                    <span className="video-call-name">{targetName}</span>
                    <span className="video-call-time">
                        {callState === 'CONNECTED' ? `⏱️ ${formatDuration(duration)}` : callState === 'CALLING' ? 'Calling...' : 'Connecting...'}
                    </span>
                </div>

                {/* Bottom WhatsApp Floating Action Bar */}
                <div className="video-call-controls-wrap">
                    {/* Toggle Microphone */}
                    <button 
                        className={`btn-video-ctrl ${isMuted ? 'active-off' : ''}`}
                        onClick={toggleMute}
                        title={isMuted ? "Unmute Mic" : "Mute Mic"}
                    >
                        {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
                    </button>

                    {/* Toggle Camera */}
                    <button 
                        className={`btn-video-ctrl ${isVideoMuted ? 'active-off' : ''}`}
                        onClick={toggleVideo}
                        title={isVideoMuted ? "Turn Camera On" : "Turn Camera Off"}
                    >
                        {isVideoMuted ? <VideoOff size={22} /> : <Video size={22} />}
                    </button>

                    {/* Flip Camera (Front / Back) */}
                    <button 
                        className="btn-video-ctrl"
                        onClick={switchCamera}
                        title="Flip Camera (Front/Rear)"
                    >
                        <SwitchCamera size={22} />
                    </button>

                    {/* Speaker / Earpiece Toggle */}
                    <button 
                        className="btn-video-ctrl"
                        onClick={toggleAudioOutput}
                        title={audioOutput === 'speaker' ? "Switch to Earpiece" : "Switch to Speaker"}
                    >
                        {audioOutput === 'speaker' ? <Volume2 size={22} /> : <Smartphone size={22} />}
                    </button>

                    {/* End Call */}
                    <button 
                        className="btn-video-ctrl btn-end-call"
                        onClick={endCall}
                        title="End Call"
                    >
                        <PhoneOff size={22} />
                    </button>
                </div>

                {/* Audio element for WebRTC Remote Stream */}
                <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />
            </div>
        );
    }

    // ──────────────────────────────────────────
    // 2. VOICE CALL UI (WhatsApp Style)
    // ──────────────────────────────────────────
    return (
        <div className="voice-call-overlay">
            <div className="voice-call-header">
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
                    <div style={{ width: '80px', height: '80px', borderRadius: '50%', backgroundColor: '#1e293b', border: '3px solid #25d366', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#25d366', boxShadow: '0 0 25px rgba(37, 211, 102, 0.3)' }} className="pulse-anim">
                        <Phone size={36} />
                    </div>
                </div>
                <div className="voice-caller-name">{targetName}</div>
                {callState === 'CALLING' && <div className="voice-call-status pulse-anim">Calling...</div>}
                {callState === 'CONNECTING' && <div className="voice-call-status pulse-anim">Connecting...</div>}
                {callState === 'CONNECTED' && <div className="voice-call-duration">⏱️ {formatDuration(duration)}</div>}
            </div>

            <div className="voice-call-actions">
                <button 
                    className={`btn-voice-action btn-mute ${isMuted ? 'muted' : ''}`} 
                    onClick={toggleMute}
                    title={isMuted ? "Unmute Mic" : "Mute Mic"}
                    style={{ color: isMuted ? '#ef4444' : '#ffffff' }}
                >
                    {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
                </button>
                <button 
                    className="btn-voice-action" 
                    onClick={toggleAudioOutput}
                    title={audioOutput === 'speaker' ? "Switch to Earpiece" : "Switch to Speaker"}
                    style={{ backgroundColor: audioOutput === 'earpiece' ? 'var(--bg-secondary, #1E293B)' : '', color: '#ffffff' }}
                >
                    {audioOutput === 'speaker' ? <Volume2 size={22} /> : <Smartphone size={22} />}
                </button>
                <button 
                    className="btn-voice-action btn-end" 
                    onClick={endCall}
                    title="End Call"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                    <PhoneOff size={22} />
                </button>
            </div>

            {/* Hidden audio element for WebRTC Remote Stream */}
            <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />
        </div>
    );
};

export default ActiveCallOverlay;
