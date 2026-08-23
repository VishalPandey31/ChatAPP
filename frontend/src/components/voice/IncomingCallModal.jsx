import React, { useEffect, useRef } from 'react';
import { useVoiceCallStore } from '../../store/voiceCallStore';
import './VoiceCall.css';

const IncomingCallModal = () => {
    const { callState, activeCall, acceptCall, rejectCall } = useVoiceCallStore();
    const audioRef = useRef(null);

    useEffect(() => {
        if (callState === 'RINGING' && activeCall?.isIncoming) {
            // Attempt to play a ringing sound
            const audio = new Audio('https://actions.google.com/sounds/v1/alarms/phone_ring.ogg');
            audio.loop = true;
            audio.play().catch(e => console.warn("Autoplay prevented for ringtone:", e));
            audioRef.current = audio;
        }

        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.currentTime = 0;
            }
        };
    }, [callState, activeCall]);

    if (callState !== 'RINGING' || !activeCall?.isIncoming) return null;

    return (
        <div className="voice-call-overlay">
            <div className="incoming-call-modal">
                <div className="voice-call-header pulse-anim">
                    <div className="voice-caller-name">{activeCall.callerName}</div>
                    <div className="voice-call-status">Incoming voice call...</div>
                </div>
                <div className="voice-call-actions" style={{ justifyContent: 'center' }}>
                    <button className="btn-voice-action btn-decline" onClick={() => rejectCall('declined')} title="Decline">
                        🔴
                    </button>
                    <button className="btn-voice-action btn-accept" onClick={acceptCall} title="Accept">
                        🟢
                    </button>
                </div>
            </div>
        </div>
    );
};

export default IncomingCallModal;
