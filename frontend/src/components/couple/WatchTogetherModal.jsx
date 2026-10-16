import React, { useState, useEffect, useRef } from 'react';
import { 
    X, 
    Play, 
    Pause, 
    RotateCcw, 
    RotateCw, 
    RefreshCw, 
    Film, 
    ExternalLink, 
    Maximize2, 
    Minimize2, 
    Radio, 
    Music, 
    CheckCircle2, 
    AlertTriangle 
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import './CoupleFeatures.css';

const YoutubeIcon = ({ size = 20, color = 'currentColor', style = {} }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
        <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"></path>
        <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" fill={color}></polygon>
    </svg>
);

const PRESETS = [
    { id: 'jfKfPfyJRdk', title: '🎧 Lo-Fi Beats (24/7)', type: 'lofi' },
    { id: 'kJQP7kiw5Fk', title: '❤️ Romantic Melodies', type: 'romantic' },
    { id: 'DeimyLD57ZE', title: '☕ Rainy Cafe Vibes', type: 'chill' },
    { id: 'B91wc5dCEBA', title: '📱 Trending Short', type: 'short' },
    { id: 'JGwWNGJdvx8', title: '🎵 Shape of You', type: 'music' }
];

export default function WatchTogetherModal({ isOpen = true, onClose, projectId, partnerName }) {
    const { socket } = useAuthStore();
    const [videoInput, setVideoInput] = useState('');
    const [currentVideoId, setCurrentVideoId] = useState('jfKfPfyJRdk'); // High-reliability active Lo-Fi stream
    const [isPlaying, setIsPlaying] = useState(true);
    const [currentTime, setCurrentTime] = useState(0);
    const [isTheater, setIsTheater] = useState(false); // Bada Screen / Theater Mode
    const [playerEngine, setPlayerEngine] = useState('youtube'); // 'youtube' or 'invidious' (unrestricted)
    const [syncStatus, setSyncStatus] = useState('Connected');
    const iframeRef = useRef(null);

    // Extract YouTube ID from standard video, Shorts, mobile, or embed URL
    const extractVideoId = (input) => {
        if (!input) return '';
        const clean = input.trim();

        // 1. YouTube Shorts: youtube.com/shorts/<id>
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

    // Send command to the YouTube iframe via standard postMessage
    const sendPlayerCommand = (func, args = []) => {
        if (iframeRef.current && iframeRef.current.contentWindow) {
            try {
                iframeRef.current.contentWindow.postMessage(
                    JSON.stringify({ event: 'command', func, args }),
                    '*'
                );
            } catch (e) {
                console.warn('[WatchTogether] postMessage error:', e);
            }
        }
    };

    // Listen to two-way socket events from partner
    useEffect(() => {
        if (!isOpen || !socket) return;

        const handleSync = (payload) => {
            if (!payload) return;
            setSyncStatus(`Synced with ${partnerName || 'Partner'}`);
            setTimeout(() => setSyncStatus('Connected'), 2500);

            if (payload.action === 'LOAD_VIDEO' && payload.videoId) {
                setCurrentVideoId(payload.videoId);
                if (payload.engine) setPlayerEngine(payload.engine);
                setIsPlaying(true);
            } else if (payload.action === 'PLAY') {
                setIsPlaying(true);
                sendPlayerCommand('playVideo');
                if (typeof payload.currentTime === 'number') {
                    sendPlayerCommand('seekTo', [payload.currentTime, true]);
                }
            } else if (payload.action === 'PAUSE') {
                setIsPlaying(false);
                sendPlayerCommand('pauseVideo');
                if (typeof payload.currentTime === 'number') {
                    sendPlayerCommand('seekTo', [payload.currentTime, true]);
                }
            } else if (payload.action === 'SEEK' && typeof payload.time === 'number') {
                setCurrentTime(payload.time);
                sendPlayerCommand('seekTo', [payload.time, true]);
            } else if (payload.action === 'CHANGE_ENGINE' && payload.engine) {
                setPlayerEngine(payload.engine);
            }
        };

        socket.on('watch_together:sync', handleSync);

        return () => {
            socket.off('watch_together:sync', handleSync);
        };
    }, [isOpen, socket, partnerName]);

    if (isOpen === false) return null;

    // Build the optimal embed URL based on chosen engine
    const getEmbedSrc = () => {
        const origin = window.location.origin;
        if (playerEngine === 'invidious') {
            // Unrestricted mirror that bypasses "Playback restricted by owner" blocks
            return `https://yewtu.be/embed/${currentVideoId}?autoplay=1`;
        }
        // Official YouTube Embed with origin and strict-origin referrer support
        return `https://www.youtube.com/embed/${currentVideoId}?autoplay=1&enablejsapi=1&origin=${encodeURIComponent(origin)}&widget_referrer=${encodeURIComponent(origin)}&playsinline=1&rel=0`;
    };

    // User loads a new video or Shorts URL
    const handleLoadVideo = (e) => {
        if (e) e.preventDefault();
        const id = extractVideoId(videoInput);
        if (id) {
            setCurrentVideoId(id);
            setVideoInput('');
            setIsPlaying(true);
            if (socket && projectId) {
                socket.emit('watch_together:action', {
                    projectId,
                    action: 'LOAD_VIDEO',
                    videoId: id,
                    engine: playerEngine
                });
            }
        }
    };

    // User selects a quick preset
    const handleQuickPreset = (presetId) => {
        setCurrentVideoId(presetId);
        setIsPlaying(true);
        if (socket && projectId) {
            socket.emit('watch_together:action', {
                projectId,
                action: 'LOAD_VIDEO',
                videoId: presetId,
                engine: playerEngine
            });
        }
    };

    // Synced Control: Play
    const handlePlay = () => {
        setIsPlaying(true);
        sendPlayerCommand('playVideo');
        if (socket && projectId) {
            socket.emit('watch_together:action', {
                projectId,
                action: 'PLAY',
                currentTime
            });
        }
    };

    // Synced Control: Pause
    const handlePause = () => {
        setIsPlaying(false);
        sendPlayerCommand('pauseVideo');
        if (socket && projectId) {
            socket.emit('watch_together:action', {
                projectId,
                action: 'PAUSE',
                currentTime
            });
        }
    };

    // Synced Control: Skip -10 seconds
    const handleRewind10 = () => {
        const target = Math.max(0, currentTime - 10);
        setCurrentTime(target);
        sendPlayerCommand('seekTo', [target, true]);
        if (socket && projectId) {
            socket.emit('watch_together:action', {
                projectId,
                action: 'SEEK',
                time: target
            });
        }
    };

    // Synced Control: Skip +10 seconds
    const handleForward10 = () => {
        const target = currentTime + 10;
        setCurrentTime(target);
        sendPlayerCommand('seekTo', [target, true]);
        if (socket && projectId) {
            socket.emit('watch_together:action', {
                projectId,
                action: 'SEEK',
                time: target
            });
        }
    };

    // Synced Control: Force Resync
    const handleSyncNow = () => {
        sendPlayerCommand('seekTo', [currentTime, true]);
        if (socket && projectId) {
            socket.emit('watch_together:action', {
                projectId,
                action: 'SEEK',
                time: currentTime
            });
        }
        setSyncStatus('Timing re-aligned!');
        setTimeout(() => setSyncStatus('Connected'), 2500);
    };

    // Toggle between Official YouTube and Unrestricted Invidious Player
    const handleToggleEngine = () => {
        const newEngine = playerEngine === 'youtube' ? 'invidious' : 'youtube';
        setPlayerEngine(newEngine);
        if (socket && projectId) {
            socket.emit('watch_together:action', {
                projectId,
                action: 'CHANGE_ENGINE',
                engine: newEngine
            });
        }
    };

    return (
        <div className="watch-together-overlay">
            <div className={`watch-together-card ${isTheater ? 'is-theater' : ''}`}>
                {/* Header with Title, Sync Status & Theater Mode */}
                <div style={{ 
                    padding: '12px 18px', 
                    borderBottom: '1px solid rgba(255, 255, 255, 0.08)', 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    backgroundColor: '#090d16' 
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        <YoutubeIcon size={24} color="#ef4444" />
                        <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <h3 style={{ margin: 0, color: '#f8fafc', fontSize: 16, fontWeight: 700 }}>
                                    Watch Together
                                </h3>
                                <span style={{
                                    fontSize: 11,
                                    backgroundColor: 'rgba(37, 211, 102, 0.15)',
                                    color: '#25d366',
                                    border: '1px solid rgba(37, 211, 102, 0.3)',
                                    borderRadius: 12,
                                    padding: '2px 8px',
                                    fontWeight: 600,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4
                                }}>
                                    <CheckCircle2 size={11} />
                                    {syncStatus}
                                </span>
                            </div>
                            <span style={{ fontSize: 12, color: '#94a3b8' }}>
                                Both controlling in real-time with {partnerName || 'Partner'}
                            </span>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        {/* Toggle Theater / Maximize Mode (Bada Screen) */}
                        <button
                            type="button"
                            onClick={() => setIsTheater(!isTheater)}
                            title={isTheater ? "Normal View" : "Theater Mode (Bada Screen)"}
                            style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: 4, 
                                color: isTheater ? '#ef4444' : '#94a3b8', 
                                fontSize: 12, 
                                padding: '6px 10px', 
                                borderRadius: 8, 
                                background: isTheater ? 'rgba(239, 68, 68, 0.15)' : '#1e293b',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                cursor: 'pointer',
                                fontWeight: 600
                            }}
                        >
                            {isTheater ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                            <span style={{ display: 'none', md: 'inline' }}>{isTheater ? 'Exit' : 'Full'}</span>
                        </button>

                        {/* Open in YouTube App */}
                        <a
                            href={`https://youtu.be/${currentVideoId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Open in YouTube App"
                            style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: 4, 
                                color: '#94a3b8', 
                                fontSize: 12, 
                                textDecoration: 'none', 
                                padding: '6px 10px', 
                                borderRadius: 8, 
                                background: '#1e293b',
                                border: '1px solid rgba(255, 255, 255, 0.1)'
                            }}
                        >
                            <ExternalLink size={14} /> 
                            <span>App</span>
                        </a>

                        {/* Close Modal */}
                        <button
                            type="button"
                            onClick={onClose}
                            style={{ 
                                background: 'transparent', 
                                border: 'none', 
                                color: '#94a3b8', 
                                cursor: 'pointer', 
                                padding: 6,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                            title="Close"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Main Player Frame (Clean & Unrestricted) */}
                <div className="watch-player-wrapper">
                    <iframe
                        key={`${currentVideoId}-${playerEngine}`}
                        ref={iframeRef}
                        className="watch-player-iframe"
                        src={getEmbedSrc()}
                        title="Watch Together Video Player"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        referrerPolicy="strict-origin-when-cross-origin"
                        allowFullScreen
                    />
                </div>

                {/* ─── SYNCHRONIZED TWO-WAY CONTROLLER BAR ─── */}
                <div className="watch-sync-toolbar">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {/* Play / Pause Toggle Button */}
                        {isPlaying ? (
                            <button
                                type="button"
                                className="watch-sync-ctrl-btn play-btn"
                                onClick={handlePause}
                                title="Pause for both"
                            >
                                <Pause size={16} />
                                <span>Pause</span>
                            </button>
                        ) : (
                            <button
                                type="button"
                                className="watch-sync-ctrl-btn play-btn"
                                onClick={handlePlay}
                                title="Play for both"
                            >
                                <Play size={16} />
                                <span>Play</span>
                            </button>
                        )}

                        {/* Rewind 10s */}
                        <button
                            type="button"
                            className="watch-sync-ctrl-btn"
                            onClick={handleRewind10}
                            title="Rewind 10 seconds for both"
                        >
                            <RotateCcw size={14} />
                            <span>-10s</span>
                        </button>

                        {/* Forward 10s */}
                        <button
                            type="button"
                            className="watch-sync-ctrl-btn"
                            onClick={handleForward10}
                            title="Forward 10 seconds for both"
                        >
                            <RotateCw size={14} />
                            <span>+10s</span>
                        </button>

                        {/* Resync Button */}
                        <button
                            type="button"
                            className="watch-sync-ctrl-btn"
                            onClick={handleSyncNow}
                            title="Force Resync"
                        >
                            <RefreshCw size={14} />
                            <span>Sync</span>
                        </button>
                    </div>

                    {/* Unrestricted Player Engine Switcher (Fix for "Video unavailable") */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button
                            type="button"
                            onClick={handleToggleEngine}
                            style={{
                                background: playerEngine === 'invidious' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.15)',
                                color: playerEngine === 'invidious' ? '#34d399' : '#f87171',
                                border: `1px solid ${playerEngine === 'invidious' ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.3)'}`,
                                borderRadius: 10,
                                padding: '6px 12px',
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6
                            }}
                            title="Switch player engine if video shows unavailable"
                        >
                            <Radio size={14} />
                            <span>
                                {playerEngine === 'youtube' 
                                    ? 'Video unavailable? Switch to Unrestricted Player' 
                                    : 'Using Unrestricted Player (Active)'}
                            </span>
                        </button>
                    </div>
                </div>

                {/* Input & Quick Presets Section */}
                <div style={{ 
                    padding: '12px 16px 16px', 
                    backgroundColor: '#0b1120', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: 10 
                }}>
                    {/* Link Input Bar */}
                    <form onSubmit={handleLoadVideo} style={{ display: 'flex', gap: 8 }}>
                        <input
                            type="text"
                            placeholder="Paste YouTube Video or Shorts link (e.g. youtube.com/shorts/... or song link)"
                            value={videoInput}
                            onChange={(e) => setVideoInput(e.target.value)}
                            style={{
                                flex: 1,
                                backgroundColor: '#1e293b',
                                border: '1px solid rgba(255, 255, 255, 0.12)',
                                borderRadius: 10,
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
                                borderRadius: 10,
                                padding: '10px 18px',
                                fontSize: 13,
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                whiteSpace: 'nowrap',
                                boxShadow: '0 4px 14px rgba(239, 68, 68, 0.4)'
                            }}
                        >
                            <Film size={15} />
                            <span>Play & Sync</span>
                        </button>
                    </form>

                    {/* Presets: Songs, Lo-Fi, Shorts */}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600, marginRight: 4 }}>
                            QUICK PLAY:
                        </span>
                        {PRESETS.map((preset) => (
                            <button
                                key={preset.id}
                                type="button"
                                onClick={() => handleQuickPreset(preset.id)}
                                style={{
                                    background: currentVideoId === preset.id ? 'rgba(239, 68, 68, 0.25)' : 'rgba(255, 255, 255, 0.06)',
                                    border: currentVideoId === preset.id ? '1px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.1)',
                                    color: currentVideoId === preset.id ? '#f87171' : '#e2e8f0',
                                    borderRadius: 20,
                                    padding: '5px 12px',
                                    fontSize: 12,
                                    fontWeight: 500,
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                {preset.title}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
