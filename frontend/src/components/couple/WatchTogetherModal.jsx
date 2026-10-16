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
    const [currentVideoId, setCurrentVideoId] = useState('5qap5aO4i9A'); // Guaranteed active permanent Lo-Fi Chill Beats
    const iframeRef = useRef(null);

    // Extract YouTube ID from standard video, Shorts, mobile, or embed URL
    const extractVideoId = (input) => {
        if (!input) return '';
        const clean = input.trim();

        // 1. YouTube Shorts: youtube.com/shorts/<id> or youtu.be/shorts/<id>
        const shortsMatch = clean.match(/(?:youtube\.com|youtu\.be)\/shorts\/([a-zA-Z0-9_-]{11})/i);
        if (shortsMatch && shortsMatch[1]) return shortsMatch[1];

        // 2. youtu.be/<id>
        const youtuBeMatch = clean.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/i);
        if (youtuBeMatch && youtuBeMatch[1]) return youtuBeMatch[1];

        // 3. youtube.com/live/<id>
        const liveMatch = clean.match(/youtube\.com\/live\/([a-zA-Z0-9_-]{11})/i);
        if (liveMatch && liveMatch[1]) return liveMatch[1];

        // 4. youtube.com/embed/<id>
        const embedMatch = clean.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/i);
        if (embedMatch && embedMatch[1]) return embedMatch[1];

        // 5. Standard watch?v=<id> or &v=<id>
        const watchMatch = clean.match(/[?&]v=([a-zA-Z0-9_-]{11})/i);
        if (watchMatch && watchMatch[1]) return watchMatch[1];

        // 6. Direct 11-character video ID
        const rawIdMatch = clean.match(/^([a-zA-Z0-9_-]{11})$/);
        if (rawIdMatch && rawIdMatch[1]) return rawIdMatch[1];

        // 7. General fallback
        const generalMatch = clean.match(/([a-zA-Z0-9_-]{11})/);
        if (generalMatch && generalMatch[1]) return generalMatch[1];

        return clean;
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <a
                            href={`https://youtu.be/${currentVideoId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Open in YouTube App"
                            style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#94a3b8', fontSize: 12, textDecoration: 'none', padding: '4px 8px', borderRadius: 6, background: '#1e293b' }}
                        >
                            <ExternalLink size={14} /> Open
                        </a>
                        <button
                            onClick={onClose}
                            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 6 }}
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Player Frame */}
                <div className="watch-player-wrapper">
                    <iframe
                        ref={iframeRef}
                        className="watch-player-iframe"
                        src={`https://www.youtube-nocookie.com/embed/${currentVideoId}?autoplay=1&enablejsapi=1&rel=0`}
                        title="YouTube video player"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                    />
                </div>

                {/* Controls & Input */}
                <div style={{ padding: 18, backgroundColor: '#090d16', display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <form onSubmit={handleLoadVideo} style={{ display: 'flex', gap: 10 }}>
                        <input
                            type="text"
                            placeholder="Paste YouTube Video or Shorts link (e.g. youtube.com/shorts/...)"
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
                                gap: 6,
                                whiteSpace: 'nowrap'
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
                            onClick={() => handleQuickPreset('5qap5aO4i9A')}
                            style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#fca5a5', borderRadius: 20, padding: '4px 12px', fontSize: 12, cursor: 'pointer' }}
                        >
                            🎧 Lo-Fi Beats
                        </button>
                        <button
                            type="button"
                            onClick={() => handleQuickPreset('kJQP7kiw5Fk')}
                            style={{ background: 'rgba(236, 72, 153, 0.12)', border: '1px solid rgba(236, 72, 153, 0.3)', color: '#f472b6', borderRadius: 20, padding: '4px 12px', fontSize: 12, cursor: 'pointer' }}
                        >
                            ❤️ Romantic Melodies
                        </button>
                        <button
                            type="button"
                            onClick={() => handleQuickPreset('DeimyLD57ZE')}
                            style={{ background: 'rgba(59, 130, 246, 0.12)', border: '1px solid rgba(59, 130, 246, 0.3)', color: '#93c5fd', borderRadius: 20, padding: '4px 12px', fontSize: 12, cursor: 'pointer' }}
                        >
                            ☕ Rainy Cafe
                        </button>
                        <button
                            type="button"
                            onClick={() => handleQuickPreset('B91wc5dCEBA')}
                            style={{ background: 'rgba(168, 85, 247, 0.12)', border: '1px solid rgba(168, 85, 247, 0.3)', color: '#d8b4fe', borderRadius: 20, padding: '4px 12px', fontSize: 12, cursor: 'pointer' }}
                        >
                            📱 YouTube Short
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
