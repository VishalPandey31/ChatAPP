import React, { useEffect, useState, useRef } from 'react';
import { useVoiceCallStore } from '../../store/voiceCallStore';
import './VoiceCall.css';

const padZero = (num) => num.toString().padStart(2, '0');

const ActiveCallOverlay = () => {
    const { 
        callState, 
        activeCall, 
        remoteStream, 
        isMuted, 
        toggleMute, 
        endCall 
    } = useVoiceCallStore();
    
    const [duration, setDuration] = useState(0);
    const remoteAudioRef = useRef(null);
    const ringbackToneRef = useRef(null);

    // Determines if overlay should be visible
    const isVisible = callState === 'CALLING' || callState === 'CONNECTING' || callState === 'CONNECTED';

    // Handle remote media stream mapping
    useEffect(() => {
        if (remoteAudioRef.current && remoteStream) {
            remoteAudioRef.current.srcObject = remoteStream;
        }
    }, [remoteStream, isVisible]);

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

    if (!isVisible) return null;

    const targetName = activeCall?.isIncoming ? activeCall?.callerName : activeCall?.receiverName;

    return (
        <div className="voice-call-overlay">
            <div className="voice-call-header">
                <div className="voice-caller-name">{targetName}</div>
                {callState === 'CALLING' && <div className="voice-call-status pulse-anim">Calling...</div>}
                {callState === 'CONNECTING' && <div className="voice-call-status pulse-anim">Connecting...</div>}
                {callState === 'CONNECTED' && <div className="voice-call-duration">🔊 {formatDuration(duration)}</div>}
            </div>

            <div className="voice-call-actions">
                <button 
                    className={`btn-voice-action btn-mute ${isMuted ? 'muted' : ''}`} 
                    onClick={toggleMute}
                    title={isMuted ? "Unmute" : "Mute"}
                >
                    {isMuted ? '🔇' : '🎤'}
                </button>
                <button 
                    className="btn-voice-action btn-end" 
                    onClick={endCall}
                    title="End Call"
                >
                    🔴
                </button>
            </div>

            {/* Hidden audio element for WebRTC Remote Stream */}
            <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />
        </div>
    );
};

export default ActiveCallOverlay;
