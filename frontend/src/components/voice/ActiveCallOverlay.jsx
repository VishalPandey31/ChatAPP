import React, { useEffect, useState, useRef } from 'react';
import { useVoiceCallStore } from '../../store/voiceCallStore';
import './VoiceCall.css';

const padZero = (num) => num.toString().padStart(2, '0');

const isMobileBrowser = () => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent || '');
};

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
    const [audioOutput, setAudioOutput] = useState('speaker'); // 'speaker' or 'earpiece'
    const remoteAudioRef = useRef(null);
    const ringbackToneRef = useRef(null);

    // Determines if overlay should be visible
    const isVisible = callState === 'CALLING' || callState === 'CONNECTING' || callState === 'CONNECTED';

    // Handle remote media stream mapping
    useEffect(() => {
        if (remoteAudioRef.current && remoteStream) {
            remoteAudioRef.current.srcObject = remoteStream;
            
            // Explicitly play to bypass browser autoplay policies when possible
            remoteAudioRef.current.play().catch(e => {
                console.warn("Audio autoplay prevented or failed:", e);
            });
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

    const toggleAudioOutput = async () => {
        if (!remoteAudioRef.current) return;

        // Best reliable browser-supported approach (Chrome 93+)
        // Summons the native OS hardware selection dialog for audio output
        if (typeof navigator.mediaDevices.selectAudioOutput === 'function') {
            try {
                const device = await navigator.mediaDevices.selectAudioOutput();
                await remoteAudioRef.current.setSinkId(device.deviceId);
                
                // Try to loosely infer UI state from the selected label
                const lbl = device.label.toLowerCase();
                if (lbl.includes('earpiece') || lbl.includes('phone') || lbl.includes('built-in receiver')) {
                    setAudioOutput('earpiece');
                } else if (lbl.includes('speaker')) {
                    setAudioOutput('speaker');
                } else {
                    // Update state to opposite just to show UI feedback
                    setAudioOutput(prev => prev === 'speaker' ? 'earpiece' : 'speaker'); 
                }
                return;
            } catch (err) {
                console.warn('User cancelled or selectAudioOutput failed:', err);
                return; // Do not manipulate UI if the native prompt was dismissed
            }
        }

        // Standard JS web layer lacks hardware access to Android's physical top earpiece directly
        // Thus, we explicitly alert this OS sandbox limitation instead of faking the UI state
        if (isMobileBrowser()) {
            alert("Platform limitation: Mobile web browsers restrict direct JavaScript access to the physical Earpiece layout. The OS forces default media to the Speakerphone. For private calls, please use a headset or Bluetooth device.");
            return;
        }

        // Desktop Fallback logic (USB headsets, monitors, etc.)
        const newOutput = audioOutput === 'speaker' ? 'earpiece' : 'speaker';
        
        if (typeof remoteAudioRef.current.setSinkId === 'function') {
            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                const audioOutputs = devices.filter(d => d.kind === 'audiooutput');
                let targetDevice = null;
                
                if (newOutput === 'earpiece') {
                    targetDevice = audioOutputs.find(d => {
                        const lbl = d.label.toLowerCase();
                        return lbl.includes('earpiece') || lbl.includes('phone') || lbl.includes('handset') || lbl.includes('receiver');
                    });
                    
                    if (targetDevice) {
                        await remoteAudioRef.current.setSinkId(targetDevice.deviceId);
                    } else {
                        try {
                            await remoteAudioRef.current.setSinkId('default');
                        } catch (e) {
                            await remoteAudioRef.current.setSinkId('');
                        }
                    }
                } else {
                    targetDevice = audioOutputs.find(d => {
                        const lbl = d.label.toLowerCase();
                        return lbl.includes('speaker') && !lbl.includes('default');
                    });
                    
                    if (!targetDevice) {
                        targetDevice = audioOutputs.find(d => d.label.toLowerCase().includes('speaker'));
                    }
                    
                    if (targetDevice) {
                        await remoteAudioRef.current.setSinkId(targetDevice.deviceId);
                    } else {
                        await remoteAudioRef.current.setSinkId(''); 
                    }
                }
                setAudioOutput(newOutput);
            } catch (err) {
                console.warn('setSinkId API failed or hardware rejected routing:', err);
                setAudioOutput(newOutput); 
            }
        } else {
            console.warn('setSinkId not supported on this browser.');
            setAudioOutput(newOutput);
        }
    };

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
                    className="btn-voice-action" 
                    onClick={toggleAudioOutput}
                    title={audioOutput === 'speaker' ? "Switch to Earpiece" : "Switch to Speaker"}
                    style={{ backgroundColor: audioOutput === 'earpiece' ? 'var(--bg-secondary, #1E293B)' : '' }}
                >
                    {audioOutput === 'speaker' ? '🔊' : '📱'}
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
