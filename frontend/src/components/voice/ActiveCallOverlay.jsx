import React, { useEffect, useState, useRef } from 'react';
import { useVoiceCallStore } from '../../store/voiceCallStore';
import { 
    Mic, 
    MicOff, 
    Video, 
    VideoOff, 
    PhoneOff, 
    Volume2, 
    Smartphone, 
    SwitchCamera, 
    Minimize2, 
    UserPlus, 
    MoreHorizontal, 
    Share2, 
    User,
    ShieldCheck,
    VolumeX
} from 'lucide-react';
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
        isMinimized,
        toggleMinimize,
        toggleMute, 
        toggleVideo,
        switchCamera,
        upgradeToVideo,
        endCall,
        isWhisperMode,
        toggleWhisperMode
    } = useVoiceCallStore();
    
    const [duration, setDuration] = useState(0);
    const [audioOutput, setAudioOutput] = useState('speaker'); // 'speaker' or 'earpiece'
    const [showMoreMenu, setShowMoreMenu] = useState(false);
    const [shareTooltip, setShareTooltip] = useState(false);

    const remoteAudioRef = useRef(null);
    const remoteVideoRef = useRef(null);
    const localVideoRef = useRef(null);
    const ringbackToneRef = useRef(null);

    // Determines if overlay should be visible
    const isVisible = callState === 'CALLING' || callState === 'CONNECTING' || callState === 'CONNECTED';
    const isVideoCall = activeCall?.callType === 'video';

    // Robust audio playback with instant autoplay unlocker
    const tryPlayAudio = () => {
        const audioEl = remoteAudioRef.current;
        if (!audioEl || !remoteStream) return;
        
        if (audioEl.srcObject !== remoteStream) {
            audioEl.srcObject = remoteStream;
        }
        audioEl.muted = false;
        audioEl.volume = 1.0;

        const playPromise = audioEl.play();
        if (playPromise !== undefined) {
            playPromise.then(() => {
                console.log("[ActiveCallOverlay] Remote audio playing successfully!");
            }).catch(e => {
                console.warn("[ActiveCallOverlay] Autoplay blocked, listening for touch/click to unlock audio:", e);
                const unlock = () => {
                    audioEl.play().catch(() => {});
                    window.removeEventListener('click', unlock);
                    window.removeEventListener('touchstart', unlock);
                };
                window.addEventListener('click', unlock, { once: true });
                window.addEventListener('touchstart', unlock, { once: true });
            });
        }
    };

    // Handle remote media stream mapping (audio and video)
    useEffect(() => {
        if (remoteStream) {
            tryPlayAudio();
        }
        if (remoteVideoRef.current && remoteStream) {
            remoteVideoRef.current.srcObject = remoteStream;
            remoteVideoRef.current.play().catch(e => {
                console.warn("Remote video play prevented:", e);
            });
        }
    }, [remoteStream, isVisible, callState]);

    // Handle local camera preview
    useEffect(() => {
        if (localVideoRef.current && localStream) {
            localVideoRef.current.srcObject = localStream;
            localVideoRef.current.play().catch(e => {
                console.warn("Local video preview prevented:", e);
            });
        }
    }, [localStream, isVisible]);

    // Format duration MM:SS
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
            // Toggle state visually for mobile indicator
            setAudioOutput(prev => prev === 'speaker' ? 'earpiece' : 'speaker');
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

    const handleShareClick = () => {
        if (navigator.share) {
            navigator.share({
                title: 'Couple Call',
                text: 'Join our private call',
                url: window.location.href
            }).catch(() => {});
        } else {
            navigator.clipboard?.writeText(window.location.href);
            setShareTooltip(true);
            setTimeout(() => setShareTooltip(false), 2500);
        }
    };

    if (!isVisible) return null;

    const targetName = activeCall?.isIncoming ? (activeCall?.callerName || 'Teammate') : (activeCall?.receiverName || 'Teammate');
    const targetAvatar = activeCall?.isIncoming ? activeCall?.callerAvatar : activeCall?.receiverAvatar;

    // ──────────────────────────────────────────────────────────────────────────
    // MINIMIZED FLOATING PILL (Allows user to chat while calling)
    // ──────────────────────────────────────────────────────────────────────────
    if (isMinimized) {
        return (
            <div className="wa-minimized-pill" onClick={toggleMinimize}>
                <span className="wa-minimized-dot" />
                <span className="wa-minimized-text">
                    {targetName} • {callState === 'CONNECTED' ? formatDuration(duration) : 'Calling...'}
                </span>
                <button 
                    type="button" 
                    className="wa-minimized-end"
                    onClick={(e) => {
                        e.stopPropagation();
                        endCall();
                    }}
                    title="End Call"
                >
                    <PhoneOff size={14} />
                </button>

                {/* Hidden Audio Element */}
                <audio 
                    ref={remoteAudioRef} 
                    autoPlay 
                    playsInline 
                    style={{ position: 'fixed', top: '-1000px', left: '-1000px', width: '1px', height: '1px', opacity: 0.01, pointerEvents: 'none' }} 
                />
            </div>
        );
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 1. VIDEO CALL UI (WhatsApp Style)
    // ──────────────────────────────────────────────────────────────────────────
    if (isVideoCall) {
        return (
            <div className="wa-video-screen" onClick={tryPlayAudio} onTouchStart={tryPlayAudio}>
                {/* Main Remote Video */}
                {remoteStream ? (
                    <video 
                        ref={remoteVideoRef} 
                        autoPlay 
                        playsInline 
                        className="wa-video-remote"
                    />
                ) : (
                    <div className="wa-call-container" style={{ position: 'absolute', inset: 0, justifyContent: 'center' }}>
                        <div className="wa-avatar-pulse-container" style={{ marginBottom: '24px' }}>
                            <div className="wa-ripple-ring" />
                            <div className="wa-ripple-ring delay-1" />
                            <div className="wa-avatar-circle">
                                {targetAvatar ? (
                                    <img src={targetAvatar} alt={targetName} className="wa-avatar-img" />
                                ) : (
                                    <div className="wa-avatar-default">
                                        <User size={72} strokeWidth={1.5} />
                                    </div>
                                )}
                            </div>
                        </div>
                        <div style={{ fontSize: '22px', fontWeight: '700', color: '#ffffff', marginBottom: '8px' }}>
                            {targetName}
                        </div>
                        <div style={{ fontSize: '14px', color: '#25d366', fontWeight: '500' }}>
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
                    className="wa-video-pip"
                    onClick={switchCamera}
                    title="Tap to flip camera"
                    style={{ display: isVideoMuted ? 'none' : 'block' }}
                />

                {/* Top Bar with Info Badge & Minimize */}
                <div className="wa-video-topbar">
                    <button 
                        type="button" 
                        className="wa-top-btn" 
                        onClick={toggleMinimize}
                        title="Minimize"
                    >
                        <Minimize2 size={20} />
                    </button>

                    <div className="wa-video-info-pill">
                        <span>{targetName}</span>
                        <span style={{ color: '#25d366' }}>•</span>
                        <span>{callState === 'CONNECTED' ? formatDuration(duration) : 'Connecting...'}</span>
                    </div>

                    <button 
                        type="button" 
                        className="wa-top-btn" 
                        onClick={switchCamera}
                        title="Flip Camera (Front/Rear)"
                    >
                        <SwitchCamera size={20} />
                    </button>
                </div>

                {/* Bottom WhatsApp Floating Action Bar */}
                <div className="wa-video-bottom-dock">
                    {/* Flip Camera */}
                    <button 
                        type="button"
                        className="wa-control-btn"
                        onClick={switchCamera}
                        title="Flip Camera (Front/Rear)"
                    >
                        <SwitchCamera size={22} />
                    </button>

                    {/* Toggle Camera On/Off */}
                    <button 
                        type="button"
                        className={`wa-control-btn ${isVideoMuted ? 'btn-danger-red' : ''}`}
                        onClick={toggleVideo}
                        title={isVideoMuted ? "Turn Camera On" : "Turn Camera Off"}
                    >
                        {isVideoMuted ? <VideoOff size={22} /> : <Video size={22} />}
                    </button>

                    {/* Toggle Microphone */}
                    <button 
                        type="button"
                        className={`wa-control-btn ${isMuted ? 'btn-active-white' : ''}`}
                        onClick={toggleMute}
                        title={isMuted ? "Unmute Mic" : "Mute Mic"}
                    >
                        {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
                    </button>

                    {/* Speaker Output Toggle */}
                    <button 
                        type="button"
                        className={`wa-control-btn ${audioOutput === 'speaker' ? 'btn-active-white' : ''}`}
                        onClick={toggleAudioOutput}
                        title={audioOutput === 'speaker' ? "Speaker On" : "Earpiece"}
                    >
                        {audioOutput === 'speaker' ? <Volume2 size={22} /> : <Smartphone size={22} />}
                    </button>

                    {/* End Call Button */}
                    <button 
                        type="button"
                        className="wa-control-btn btn-danger-red"
                        onClick={endCall}
                        title="End Call"
                    >
                        <PhoneOff size={24} />
                    </button>
                </div>

                {/* Audio element for WebRTC Remote Stream */}
                <audio 
                    ref={remoteAudioRef} 
                    autoPlay 
                    playsInline 
                    style={{ position: 'fixed', top: '-1000px', left: '-1000px', width: '1px', height: '1px', opacity: 0.01, pointerEvents: 'none' }} 
                />
            </div>
        );
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 2. VOICE CALL UI (Screenshot 1: WhatsApp Voice Call)
    // ──────────────────────────────────────────────────────────────────────────
    return (
        <div className="wa-call-container" onClick={tryPlayAudio} onTouchStart={tryPlayAudio}>
            {/* Top Bar (Screenshot 1: Shrink Left | Name + Status Center | Mic Pill + User Right) */}
            <div className="wa-call-topbar">
                <button 
                    type="button"
                    className="wa-top-btn" 
                    onClick={toggleMinimize}
                    title="Minimize"
                >
                    <Minimize2 size={20} />
                </button>

                <div className="wa-call-top-center">
                    <div className="wa-call-contact-name">{targetName}</div>
                    <div className={`wa-call-status-subtitle ${callState === 'CONNECTED' ? 'connected' : ''}`}>
                        {callState === 'CALLING' && 'Calling'}
                        {callState === 'CONNECTING' && 'Connecting...'}
                        {callState === 'CONNECTED' && formatDuration(duration)}
                    </div>
                </div>

                <div className="wa-call-top-right">
                    <span className="wa-green-mic-pill" title="Microphone Active">
                        <Mic size={14} strokeWidth={2.5} />
                    </span>
                    <button 
                        type="button"
                        className="wa-top-btn"
                        onClick={handleShareClick}
                        title="Invite Partner"
                    >
                        <UserPlus size={19} />
                    </button>
                </div>
            </div>

            {/* Center: Large Circular Avatar with Concentric Pulse Rings (Screenshot 1) */}
            <div className="wa-avatar-center-wrap">
                <div className="wa-avatar-pulse-container">
                    <div className="wa-ripple-ring" />
                    <div className="wa-ripple-ring delay-1" />
                    <div className="wa-ripple-ring delay-2" />
                    
                    <div className="wa-avatar-circle">
                        {targetAvatar ? (
                            <img 
                                src={targetAvatar} 
                                alt={targetName} 
                                className="wa-avatar-img"
                                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                            />
                        ) : (
                            <div className="wa-avatar-default">
                                <User size={78} strokeWidth={1.5} />
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Bottom Floating Control Card (Screenshot 1: 2 Rows of 3 Buttons) */}
            <div className="wa-bottom-sheet-card" style={{ position: 'relative' }}>
                {/* Optional "More" Popup Menu */}
                {showMoreMenu && (
                    <div className="wa-more-options-menu" onClick={e => e.stopPropagation()}>
                        <button 
                            type="button" 
                            className="wa-more-menu-row"
                            onClick={() => {
                                toggleWhisperMode();
                                setShowMoreMenu(false);
                            }}
                        >
                            {isWhisperMode ? <VolumeX size={18} style={{ color: '#25d366' }} /> : <Volume2 size={18} />}
                            <span>Whisper Mode (Sensitive Mic): {isWhisperMode ? 'ON' : 'OFF'}</span>
                        </button>
                        <div className="wa-more-menu-row" style={{ cursor: 'default', color: '#25d366' }}>
                            <ShieldCheck size={18} />
                            <span>End-to-end encrypted</span>
                        </div>
                    </div>
                )}

                {/* Share copied tooltip notification */}
                {shareTooltip && (
                    <div style={{
                        position: 'absolute',
                        top: '-36px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: '#25d366',
                        color: '#0b141a',
                        padding: '4px 12px',
                        borderRadius: '16px',
                        fontSize: '12px',
                        fontWeight: '600'
                    }}>
                        Link copied!
                    </div>
                )}

                <div className="wa-controls-grid">
                    {/* Row 1, Col 1: Audio (Bluetooth / Speaker Toggle) */}
                    <button 
                        type="button"
                        className="wa-control-item"
                        onClick={toggleAudioOutput}
                        title={audioOutput === 'speaker' ? "Speaker On" : "Earpiece"}
                    >
                        <div className={`wa-control-btn ${audioOutput === 'speaker' ? 'btn-active-white' : ''}`}>
                            {audioOutput === 'speaker' ? <Volume2 size={24} /> : <Smartphone size={24} />}
                        </div>
                        <span className="wa-control-label">Audio</span>
                    </button>

                    {/* Row 1, Col 2: Video (Switch / Upgrade to Video) */}
                    <button 
                        type="button"
                        className="wa-control-item"
                        onClick={upgradeToVideo}
                        title="Switch to Video Call"
                    >
                        <div className="wa-control-btn">
                            <Video size={24} />
                        </div>
                        <span className="wa-control-label">Video</span>
                    </button>

                    {/* Row 1, Col 3: Mute */}
                    <button 
                        type="button"
                        className="wa-control-item"
                        onClick={toggleMute}
                        title={isMuted ? "Unmute Mic" : "Mute Mic"}
                    >
                        <div className={`wa-control-btn ${isMuted ? 'btn-active-mute' : ''}`}>
                            {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
                        </div>
                        <span className="wa-control-label">Mute</span>
                    </button>

                    {/* Row 2, Col 1: More */}
                    <button 
                        type="button"
                        className="wa-control-item"
                        onClick={() => setShowMoreMenu(!showMoreMenu)}
                        title="More options"
                    >
                        <div className="wa-control-btn">
                            <MoreHorizontal size={24} />
                        </div>
                        <span className="wa-control-label">More</span>
                    </button>

                    {/* Row 2, Col 2: Share */}
                    <button 
                        type="button"
                        className="wa-control-item"
                        onClick={handleShareClick}
                        title="Share call link"
                    >
                        <div className="wa-control-btn">
                            <Share2 size={24} />
                        </div>
                        <span className="wa-control-label">Share</span>
                    </button>

                    {/* Row 2, Col 3: End Call */}
                    <button 
                        type="button"
                        className="wa-control-item"
                        onClick={endCall}
                        title="End Call"
                    >
                        <div className="wa-control-btn btn-danger-red">
                            <PhoneOff size={24} />
                        </div>
                        <span className="wa-control-label">End</span>
                    </button>
                </div>
            </div>

            {/* Hidden audio element for WebRTC Remote Stream */}
            <audio 
                ref={remoteAudioRef} 
                autoPlay 
                playsInline 
                style={{ position: 'fixed', top: '-1000px', left: '-1000px', width: '1px', height: '1px', opacity: 0.01, pointerEvents: 'none' }} 
            />
        </div>
    );
};

export default ActiveCallOverlay;
