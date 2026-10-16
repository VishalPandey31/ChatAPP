import React, { useState, useEffect, useRef } from 'react';
import { X, Play, Pause, RefreshCw, Film, ExternalLink } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import './CoupleFeatures.css';

const YoutubeIcon = ({ size = 20, color = 'currentColor', style = {} }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
        <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"></path>
        <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" fill={color}></polygon>
    </svg>
);

export default function WatchTogetherModal({ isOpen = true, onClose, projectId, partnerName }) {
    const { socket } = useAuthStore();
    const [videoInput, setVideoInput] = useState('');
    const [currentVideoId, setCurrentVideoId] = useState('jfKfPfyJRdk'); // Default Lo-Fi Beats
    const iframeRef = useRef(null);

    // Extract YouTube ID from URL or raw ID
    const extractVideoId = (url) => {
        if (!url) return '';
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : url.trim();
    };

    // Socket sync listener
    useEffect(() => {
        if (!isOpen || !socket) return;

        const handleSync = (payload) => {
            if (payload?.action === 'LOAD_VIDEO' && payload?.videoId) {
                setCurrentVideoId(payload.videoId);
            }
        };

        socket.on('watch_together:sync', handleSync);

        return () => {
            socket.off('watch_together:sync', handleSync);
        };
    }, [isOpen, socket]);

    if (isOpen === false) return null;

    const handleLoadVideo = (e) => {
        if (e) e.preventDefault();
        const id = extractVideoId(videoInput);
        if (id) {
            setCurrentVideoId(id);
            setVideoInput('');
            if (socket && projectId) {
                socket.emit('watch_together:action', {
                    projectId,
                    action: 'LOAD_VIDEO',
                    videoId: id
                });
            }
        }
    };

    const handleQuickPreset = (presetId) => {
        setCurrentVideoId(presetId);
        if (socket && projectId) {
            socket.emit('watch_together:action', {
                projectId,
                action: 'LOAD_VIDEO',
                videoId: presetId
            });
        }
    };

    return (
        <div className="watch-together-overlay">
            <div className="watch-together-card">
                {/* Header */}
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0f172a' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <YoutubeIcon size={22} color="#ef4444" />
                        <div>
                            <h3 style={{ margin: 0, color: '#f8fafc', fontSize: 16, fontWeight: 700 }}>
                                Watch Together (YouTube Sync)
                            </h3>
                            <span style={{ fontSize: 12, color: '#94a3b8' }}>
                                Synced with {partnerName || 'Partner'}
                            </span>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 6 }}
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Player Frame */}
                <div className="watch-player-wrapper">
                    <iframe
                        ref={iframeRef}
                        className="watch-player-iframe"
                        src={`https://www.youtube.com/embed/${currentVideoId}?autoplay=1&enablejsapi=1`}
                        title="YouTube video player"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                    />
                </div>

                {/* Controls & Input */}
                <div style={{ padding: 18, backgroundColor: '#090d16', display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <form onSubmit={handleLoadVideo} style={{ display: 'flex', gap: 10 }}>
                        <input
                            type="text"
                            placeholder="Paste any YouTube video link or ID (e.g. https://youtu.be/...)"
                            value={videoInput}
                            onChange={(e) => setVideoInput(e.target.value)}
                            style={{
                                flex: 1,
                                backgroundColor: '#1e293b',
                                border: '1px solid #334155',
                                borderRadius: 8,
                                padding: '10px 14px',
                                color: '#f8fafc',
                                fontSize: 13,
                                outline: 'none'
                            }}
                        />
                        <button
                            type="submit"
                            style={{
                                backgroundColor: '#ef4444',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: 8,
                                padding: '10px 18px',
                                fontSize: 13,
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6
                            }}
                        >
                            <Film size={15} />
                            <span>Play & Sync</span>
                        </button>
                    </form>

                    {/* Romantic / Chill Presets */}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Quick Presets:</span>
                        <button
                            type="button"
                            onClick={() => handleQuickPreset('jfKfPfyJRdk')}
                            style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#fca5a5', borderRadius: 20, padding: '4px 12px', fontSize: 12, cursor: 'pointer' }}
                        >
                            🎧 Lo-Fi Beats
                        </button>
                        <button
                            type="button"
                            onClick={() => handleQuickPreset('5qap5aO4i9A')}
                            style={{ background: 'rgba(236, 72, 153, 0.12)', border: '1px solid rgba(236, 72, 153, 0.3)', color: '#f472b6', borderRadius: 20, padding: '4px 12px', fontSize: 12, cursor: 'pointer' }}
                        >
                            ❤️ Romantic Piano
                        </button>
                        <button
                            type="button"
                            onClick={() => handleQuickPreset('DeimyLD57ZE')}
                            style={{ background: 'rgba(59, 130, 246, 0.12)', border: '1px solid rgba(59, 130, 246, 0.3)', color: '#93c5fd', borderRadius: 20, padding: '4px 12px', fontSize: 12, cursor: 'pointer' }}
                        >
                            ☕ Rainy Cafe
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
