import React, { useEffect, useRef, useState } from 'react';
import { useVoiceCallStore } from '../../store/voiceCallStore';
import { Phone, Video, PhoneOff, MessageSquare, ChevronUp, User } from 'lucide-react';
import './VoiceCall.css';

const QUICK_MESSAGES = [
    "Can't talk right now. What's up?",
    "I'll call you right back.",
    "I'm on my way.",
    "Call you in a few minutes, love ❤️"
];

const IncomingCallModal = () => {
    const { callState, activeCall, acceptCall, rejectCall, rejectCallWithMessage } = useVoiceCallStore();
    const audioRef = useRef(null);
    const [showMessageSheet, setShowMessageSheet] = useState(false);
    const [customMsg, setCustomMsg] = useState('');
    const touchStartY = useRef(null);

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
    const callerName = activeCall.callerName || (activeCall.callerEmail ? activeCall.callerEmail.split('@')[0] : 'Teammate');
    const callerSubtitle = activeCall.callerEmail || (isVideo ? 'WhatsApp video call' : 'WhatsApp voice call');
    const callerAvatar = activeCall.callerAvatar;

    // Handle swipe up gesture to accept
    const handleTouchStart = (e) => {
        touchStartY.current = e.touches[0].clientY;
    };

    const handleTouchEnd = (e) => {
        if (touchStartY.current === null) return;
        const touchEndY = e.changedTouches[0].clientY;
        const diffY = touchStartY.current - touchEndY;
        // If swiped up by more than 60px -> accept call
        if (diffY > 60) {
            acceptCall();
        }
        touchStartY.current = null;
    };

    return (
        <div 
            className="wa-incoming-container"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
        >
            {/* Top Contact Info (Screenshot 2: Name + Subtitle) */}
            <div className="wa-incoming-top">
                <div className="wa-incoming-name">
                    {callerName}
                </div>
                <div className="wa-incoming-subtitle">
                    {isVideo ? (
                        <>
                            <Video size={15} style={{ color: '#25d366' }} />
                            <span>Incoming WhatsApp video call</span>
                        </>
                    ) : (
                        <>
                            <Phone size={14} style={{ color: '#25d366' }} />
                            <span>{callerSubtitle}</span>
                        </>
                    )}
                </div>
            </div>

            {/* Center Avatar with Concentric Glowing Waves (Screenshot 2) */}
            <div className="wa-incoming-avatar-wrap">
                <div className="wa-incoming-avatar-circle">
                    {callerAvatar ? (
                        <img 
                            src={callerAvatar} 
                            alt={callerName} 
                            className="wa-avatar-img"
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                    ) : (
                        <div className="wa-avatar-default">
                            <User size={84} strokeWidth={1.5} />
                        </div>
                    )}
                </div>
            </div>

            {/* Bottom 3 Action Buttons (Screenshot 2: Decline | Swipe up to accept | Message) */}
            <div className="wa-incoming-actions">
                {/* 1. Decline Button */}
                <button 
                    type="button"
                    className="wa-incoming-btn-item"
                    onClick={() => rejectCall('declined')}
                    title="Decline Call"
                >
                    <div className="wa-incoming-circle-btn decline">
                        <PhoneOff size={26} />
                    </div>
                    <span className="wa-incoming-label">Decline</span>
                </button>

                {/* 2. Accept Button with Upward Bouncing Chevron */}
                <button 
                    type="button"
                    className="wa-incoming-btn-item"
                    onClick={acceptCall}
                    title="Accept Call"
                >
                    <ChevronUp size={20} className="wa-chevron-bounce" strokeWidth={2.5} />
                    <div className="wa-incoming-circle-btn accept">
                        {isVideo ? <Video size={30} /> : <Phone size={28} />}
                    </div>
                    <span className="wa-incoming-label" style={{ color: '#e9edef', fontWeight: '600' }}>
                        Swipe up to accept
                    </span>
                </button>

                {/* 3. Message Button */}
                <button 
                    type="button"
                    className="wa-incoming-btn-item"
                    onClick={() => setShowMessageSheet(true)}
                    title="Reply with message"
                >
                    <div className="wa-incoming-circle-btn message">
                        <MessageSquare size={24} />
                    </div>
                    <span className="wa-incoming-label">Message</span>
                </button>
            </div>

            {/* Quick Message Reply Bottom Sheet */}
            {showMessageSheet && (
                <div className="wa-message-reply-modal" onClick={() => setShowMessageSheet(false)}>
                    <div className="wa-message-reply-card" onClick={e => e.stopPropagation()}>
                        <div className="wa-message-reply-title">Reply with message & decline</div>
                        {QUICK_MESSAGES.map((msg, idx) => (
                            <button 
                                key={idx} 
                                className="wa-quick-msg-item"
                                onClick={() => {
                                    setShowMessageSheet(false);
                                    rejectCallWithMessage(msg);
                                }}
                            >
                                {msg}
                            </button>
                        ))}
                        <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                            <input 
                                type="text"
                                placeholder="Type custom message..."
                                value={customMsg}
                                onChange={e => setCustomMsg(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && customMsg.trim()) {
                                        setShowMessageSheet(false);
                                        rejectCallWithMessage(customMsg.trim());
                                    }
                                }}
                                style={{
                                    flex: 1,
                                    background: 'rgba(255, 255, 255, 0.08)',
                                    border: '1px solid rgba(255, 255, 255, 0.15)',
                                    borderRadius: '10px',
                                    padding: '10px 14px',
                                    color: '#fff',
                                    fontSize: '14px',
                                    outline: 'none'
                                }}
                            />
                            {customMsg.trim() && (
                                <button 
                                    className="btn btn-primary"
                                    onClick={() => {
                                        setShowMessageSheet(false);
                                        rejectCallWithMessage(customMsg.trim());
                                    }}
                                    style={{
                                        backgroundColor: '#25d366',
                                        color: '#0b141a',
                                        border: 'none',
                                        borderRadius: '10px',
                                        padding: '0 16px',
                                        fontWeight: '600',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Send
                                </button>
                            )}
                        </div>
                        <button 
                            className="wa-quick-msg-cancel"
                            onClick={() => setShowMessageSheet(false)}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default IncomingCallModal;
