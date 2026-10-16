import React, { useEffect, useRef } from 'react';
import { useVoiceCallStore } from '../../store/voiceCallStore';
import { Phone, Video, PhoneCall, PhoneOff } from 'lucide-react';
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

    const isVideo = activeCall.callType === 'video';

    return (
        <div className="voice-call-overlay">
            <div className="incoming-call-modal">
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
                    <div style={{ width: '60px', height: '60px', borderRadius: '50%', backgroundColor: isVideo ? 'rgba(16, 185, 129, 0.15)' : 'rgba(37, 211, 102, 0.15)', color: isVideo ? '#10B981' : '#25D366', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {isVideo ? <Video size={30} /> : <Phone size={30} />}
                    </div>
                </div>
                <div className="voice-call-header pulse-anim">
                    <div className="voice-caller-name">{activeCall.callerName || 'Teammate'}</div>
                    <div className="voice-call-status">
                        {isVideo ? 'Incoming WhatsApp Video Call...' : 'Incoming WhatsApp Voice Call...'}
                    </div>
                </div>
                <div className="voice-call-actions" style={{ justifyContent: 'center', gap: '32px', marginTop: '16px' }}>
                    <button className="btn-voice-action btn-decline" onClick={() => rejectCall('declined')} title="Decline Call">
                        <PhoneOff size={22} />
                    </button>
                    <button className="btn-voice-action btn-accept" onClick={acceptCall} title="Accept Call">
                        {isVideo ? <Video size={22} /> : <PhoneCall size={22} />}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default IncomingCallModal;
