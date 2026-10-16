import React, { useState, useEffect } from 'react';
import { Flame, X, AlertTriangle } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import './CoupleFeatures.css';

export default function ViewOnceModal({ isOpen = true, onClose, onBurned, message, projectId }) {
    const { socket } = useAuthStore();
    const [timeLeft, setTimeLeft] = useState(5);
    const [isDissolving, setIsDissolving] = useState(false);

    useEffect(() => {
        if (!isOpen || !message) return;

        setTimeLeft(5);
        setIsDissolving(false);

        const timer = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(timer);
                    setIsDissolving(true);
                    setTimeout(() => {
                        // Trigger shredding from backend and close
                        if (socket && projectId && message._id) {
                            socket.emit('message:view_once_opened', { messageId: message._id, projectId });
                        }
                        if (typeof onBurned === 'function') {
                            onBurned(message._id);
                        }
                        if (onClose) onClose();
                    }, 1200);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [isOpen, message, socket, projectId, onClose, onBurned]);

    if (isOpen === false || !message) return null;

    const isVideo = message.messageType === 'VIDEO';

    return (
        <div className="viewonce-lightbox">
            {/* Countdown Badge */}
            <div className="viewonce-timer-pill">
                <Flame size={18} color="#ef4444" />
                <span>Self-destructing in {timeLeft}s</span>
            </div>

            {/* Media Container */}
            <div
                className={isDissolving ? 'dissolve-animation' : ''}
                style={{ maxWidth: '90vw', maxHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
                {isVideo ? (
                    <video
                        src={message.content}
                        autoPlay
                        playsInline
                        style={{ maxWidth: '100%', maxHeight: '75vh', borderRadius: 12, boxShadow: '0 10px 30px rgba(0,0,0,0.8)' }}
                    />
                ) : (
                    <img
                        src={message.content}
                        alt="View once secret media"
                        style={{ maxWidth: '100%', maxHeight: '75vh', objectFit: 'contain', borderRadius: 12, boxShadow: '0 10px 30px rgba(0,0,0,0.8)' }}
                    />
                )}
            </div>

            <div style={{ position: 'absolute', bottom: 24, color: '#94a3b8', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertTriangle size={15} color="#eab308" />
                <span>View-once protection active. This media will be permanently shredded.</span>
            </div>
        </div>
    );
}
