import React, { useEffect, useState, useRef } from 'react';
import { useVoiceCallStore } from '../../store/voiceCallStore';
import './VoiceCall.css';

const padZero = (num) => num.toString().padStart(2, '0');

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
        const newOutput = audioOutput === 'speaker' ? 'earpiece' : 'speaker';
        
        if (remoteAudioRef.current && typeof remoteAudioRef.current.setSinkId === 'function') {
            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                const audioOutputs = devices.filter(d => d.kind === 'audiooutput');
                let targetDevice = null;
                
                if (newOutput === 'earpiece') {
                    // Try to find a device containing earpiece, phone, or handset
                    targetDevice = audioOutputs.find(d => {
                        const lbl = d.label.toLowerCase();
                        return lbl.includes('earpiece') || lbl.includes('phone') || lbl.includes('handset');
                    });
                } else {
                    // Try to find a device containing speaker
                    targetDevice = audioOutputs.find(d => d.label.toLowerCase().includes('speaker'));
                    if (!targetDevice) {
                        targetDevice = audioOutputs.find(d => d.deviceId === 'default') || audioOutputs[0];
                    }
                }

                if (targetDevice) {
                    await remoteAudioRef.current.setSinkId(targetDevice.deviceId);
                } else if (newOutput === 'speaker') {
                    await remoteAudioRef.current.setSinkId(''); // fallback generic speaker output
                } else {
                    console.warn('Earpiece device not distinctly found in enumerateDevices.');
                }
                setAudioOutput(newOutput);
            } catch (err) {
                console.warn('setSinkId API failed or hardware rejected routing:', err);
                setAudioOutput(newOutput); // Keep UI state toggled to allow OS-level hardware routing matching
            }
        } else {
            console.warn('setSinkId not supported on this browser (e.g. iOS Safari). Audio routing gracefully handled by OS constraints.');
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
