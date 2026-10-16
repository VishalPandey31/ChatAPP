import React, { useState, useEffect, useRef } from 'react';
import { Heart, X, Sparkles } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import './CoupleFeatures.css';

export default function VirtualTouchModal({ isOpen = true, onClose, projectId, partnerName }) {
    const { socket } = useAuthStore();
    const [isLocalTouching, setIsLocalTouching] = useState(false);
    const [isPeerTouching, setIsPeerTouching] = useState(false);
    const vibrateIntervalRef = useRef(null);

    const isBothTouching = isLocalTouching && isPeerTouching;

    // Listen to peer touch status from socket
    useEffect(() => {
        if (!isOpen || !socket) return;

        const handlePeerState = (data) => {
            setIsPeerTouching(Boolean(data?.isTouching));
        };

        socket.on('virtual_touch:peer_state', handlePeerState);

        return () => {
            socket.off('virtual_touch:peer_state', handlePeerState);
        };
    }, [isOpen, socket]);

    // Handle Heartbeat Haptic Vibration when both are touching
    useEffect(() => {
        if (isBothTouching) {
            if (navigator.vibrate) {
                navigator.vibrate([100, 60, 100, 60, 250]);
            }
            vibrateIntervalRef.current = setInterval(() => {
                if (navigator.vibrate) {
                    navigator.vibrate([100, 60, 100, 60, 250]);
                }
            }, 850);
        } else {
            if (vibrateIntervalRef.current) {
                clearInterval(vibrateIntervalRef.current);
                vibrateIntervalRef.current = null;
            }
        }

        return () => {
            if (vibrateIntervalRef.current) {
                clearInterval(vibrateIntervalRef.current);
                vibrateIntervalRef.current = null;
            }
        };
    }, [isBothTouching]);

    if (isOpen === false) return null;

    const startTouch = () => {
        setIsLocalTouching(true);
        if (navigator.vibrate) {
            navigator.vibrate(60);
        }
        if (socket && projectId) {
            socket.emit('virtual_touch:state', { projectId, isTouching: true });
        }
    };

    const stopTouch = () => {
        setIsLocalTouching(false);
        if (socket && projectId) {
            socket.emit('virtual_touch:state', { projectId, isTouching: false });
        }
    };

    return (
        <div className="virtual-touch-overlay">
            {/* Top Bar */}
            <div style={{ position: 'absolute', top: 24, left: 24, right: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#f43f5e', fontWeight: 700, fontSize: 16 }}>
                    <Heart size={20} fill="#f43f5e" />
                    <span>Virtual Touch & Heartbeat Sync</span>
                </div>
                <button
                    onClick={() => {
                        stopTouch();
                        if (onClose) onClose();
                    }}
                    style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: 40, height: 40, color: '#ffffff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                    <X size={20} />
                </button>
            </div>

            {/* Status Message */}
            <div style={{ textAlign: 'center', marginBottom: 32, padding: '0 20px' }}>
                <h2 style={{ color: '#ffffff', fontSize: 22, fontWeight: 700, margin: '0 0 8px 0' }}>
                    {isBothTouching ? '❤️ Hearts Connected!' : isPeerTouching ? `${partnerName || 'Partner'} is touching! Hold now!` : 'Press & Hold the Heart'}
                </h2>
                <p style={{ color: isBothTouching ? '#f472b6' : '#94a3b8', fontSize: 14, margin: 0 }}>
                    {isBothTouching
                        ? 'Simulated heartbeat active. You are holding hands in real-time.'
                        : `When both you and ${partnerName || 'your partner'} touch the screen together, your hearts sync and vibrate.`}
                </p>
            </div>

            {/* Glowing Interactive Heart Area */}
            <div
                className="touch-heart-wrapper"
                onMouseDown={startTouch}
                onMouseUp={stopTouch}
                onTouchStart={startTouch}
                onTouchEnd={stopTouch}
            >
                <div className={`touch-aura ${isBothTouching ? 'active-both' : ''}`} />
                <Heart
                    size={isBothTouching ? 140 : isLocalTouching ? 125 : 110}
                    color={isBothTouching ? '#f43f5e' : isLocalTouching ? '#ec4899' : '#881337'}
                    fill={isBothTouching ? '#f43f5e' : isLocalTouching ? '#ec4899' : '#4c0519'}
                    style={{
                        transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
                        filter: isBothTouching ? 'drop-shadow(0 0 30px #f43f5e)' : isLocalTouching ? 'drop-shadow(0 0 15px #ec4899)' : 'none'
                    }}
                />
            </div>

            {/* Bottom status badge */}
            <div style={{ marginTop: 40, display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(15, 23, 42, 0.8)', padding: '10px 20px', borderRadius: 30, border: '1px solid #334155' }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: isPeerTouching ? '#10b981' : '#64748b', display: 'inline-block' }} />
                <span style={{ color: '#cbd5e1', fontSize: 13, fontWeight: 500 }}>
                    {partnerName || 'Partner'}: {isPeerTouching ? 'Touching ❤️' : 'Waiting...'}
                </span>
            </div>
        </div>
    );
}
