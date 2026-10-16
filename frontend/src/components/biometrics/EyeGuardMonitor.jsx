import React, { useState, useEffect, useRef } from 'react';
import { Eye, ShieldCheck, ShieldAlert, Sparkles } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useVoiceCallStore } from '../../store/voiceCallStore';
import { loadFaceModels, detectFaceInVideo, compareFaceDescriptors } from '../../utils/faceRecognitionService';
import './Biometrics.css';

export default function EyeGuardMonitor({ onOpenSettings, onOpenEnroll, compact = false }) {
    const { 
        user, 
        faceProfile, 
        antiSnatchActive, 
        isSecurityLocked, 
        setSecurityLocked,
        securityMode,
        logout
    } = useAuthStore();

    const { activeCall } = useVoiceCallStore();

    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const mismatchCountRef = useRef(0);
    const noFaceCountRef = useRef(0);

    const [monitorStatus, setMonitorStatus] = useState('idle'); // 'idle' | 'scanning' | 'verified' | 'warning'
    const [dominantExpr, setDominantExpr] = useState('');
    const [hasCameraError, setHasCameraError] = useState(false);

    const isEnrolled = Boolean(faceProfile?.isConfigured && faceProfile?.descriptor?.length === 128);
    const isModeActive = securityMode !== 'none' && antiSnatchActive;

    // Helper: trigger security action based on selected mode (YouTube vs Login)
    const triggerSecurityBreach = (reason) => {
        if (securityMode === 'face_youtube') {
            console.warn(`[EyeGuard] Face mismatch detected! Stealth disguise redirecting to YouTube (${reason})...`);
            // Instant redirect to YouTube
            window.location.replace('https://www.youtube.com');
            return;
        }

        if (securityMode === 'face_login') {
            console.warn(`[EyeGuard] Face mismatch detected! Logging out and redirecting to login page (${reason})...`);
            logout();
            window.location.href = '/login?alert=mismatch';
            return;
        }

        // Fallback: lock screen modal
        setSecurityLocked(true, reason);
    };

    // Initialize background camera when enrolled & active
    useEffect(() => {
        if (!user || !isEnrolled || !isModeActive || isSecurityLocked || activeCall) {
            // Stop camera if not needed or during active calls
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(t => t.stop());
                streamRef.current = null;
            }
            setMonitorStatus('idle');
            return;
        }

        let isCancelled = false;

        async function initCamera() {
            try {
                await loadFaceModels();
                if (isCancelled) return;

                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 } },
                    audio: false
                });

                if (isCancelled) {
                    stream.getTracks().forEach(t => t.stop());
                    return;
                }

                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    await videoRef.current.play().catch(() => {});
                }

                setHasCameraError(false);
                setMonitorStatus('scanning');
            } catch (err) {
                console.warn('[EyeGuard] Background camera init error:', err);
                setHasCameraError(true);
            }
        }

        initCamera();

        return () => {
            isCancelled = true;
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(t => t.stop());
                streamRef.current = null;
            }
        };
    }, [user, isEnrolled, isModeActive, isSecurityLocked, activeCall]);

    // Continuous presence detection loop (every 1.5 seconds)
    useEffect(() => {
        if (!isEnrolled || !isModeActive || isSecurityLocked || activeCall || hasCameraError) return;

        let intervalId = null;

        const scanTick = async () => {
            if (!videoRef.current || videoRef.current.readyState < 2) return;
            if (!faceProfile?.descriptor) return;

            try {
                const res = await detectFaceInVideo(videoRef.current, { inputSize: 224, scoreThreshold: 0.45 });

                if (res.detected && res.descriptor) {
                    noFaceCountRef.current = 0; // face is present
                    const comp = compareFaceDescriptors(faceProfile.descriptor, res.descriptor, 0.58);

                    if (comp.match) {
                        // OWNER CONFIRMED!
                        mismatchCountRef.current = 0;
                        setMonitorStatus('verified');
                        if (res.dominantExpression) {
                            setDominantExpr(res.dominantExpression);
                        }
                    } else {
                        // STRANGER'S FACE DETECTED!
                        mismatchCountRef.current += 1;
                        setMonitorStatus('warning');
                        console.warn(`[EyeGuard] Mismatch detected (${mismatchCountRef.current}/2)! Distance: ${comp.distance}`);

                        if (mismatchCountRef.current >= 2) {
                            // PHONE SNATCHED OR DIFFERENT PERSON LOOKING
                            mismatchCountRef.current = 0;
                            triggerSecurityBreach('FACE_MISMATCH');
                        }
                    }
                } else {
                    // NO FACE VISIBLE (phone laid down or turned away)
                    noFaceCountRef.current += 1;
                    if (noFaceCountRef.current >= 3) {
                        setMonitorStatus('warning');
                        noFaceCountRef.current = 0;
                        triggerSecurityBreach('NO_FACE');
                    }
                }
            } catch (err) {
                console.warn('[EyeGuard] Scan loop tick error:', err);
            }
        };

        intervalId = setInterval(scanTick, 1500);

        return () => {
            if (intervalId) clearInterval(intervalId);
        };
    }, [isEnrolled, isModeActive, isSecurityLocked, activeCall, hasCameraError, faceProfile, securityMode]);

    return (
        <>
            {/* Hidden Video for Face Processing */}
            <video
                ref={videoRef}
                style={{
                    position: 'fixed',
                    width: '1px',
                    height: '1px',
                    opacity: 0.01,
                    pointerEvents: 'none',
                    zIndex: -9999
                }}
                autoPlay
                muted
                playsInline
            />

            {/* Header Badge */}
            {securityMode === 'none' ? (
                <div 
                    className={`eyeguard-badge unregistered ${compact ? 'compact' : ''}`}
                    onClick={onOpenSettings}
                    title="Normal Mode (No face scanning). Click to switch security modes."
                    style={{ background: 'rgba(59, 130, 246, 0.12)', borderColor: 'rgba(59, 130, 246, 0.35)', color: '#60a5fa' }}
                >
                    <Sparkles size={compact ? 15 : 13} />
                    {!compact && <span className="eyeguard-label">Mode: Normal</span>}
                </div>
            ) : isEnrolled ? (
                <div 
                    className={`eyeguard-badge ${compact ? 'compact' : ''} ${monitorStatus === 'verified' ? '' : monitorStatus === 'warning' ? 'danger' : 'warning'}`}
                    onClick={onOpenSettings}
                    title={securityMode === 'face_youtube' ? "YouTube Stealth Active. Click to configure." : "Face Guard Active. Click to configure."}
                    style={securityMode === 'face_youtube' ? { borderColor: 'rgba(239, 68, 68, 0.4)', color: '#f87171', background: 'rgba(239, 68, 68, 0.1)' } : {}}
                >
                    <span className="eyeguard-dot" style={securityMode === 'face_youtube' ? { background: '#ef4444', boxShadow: '0 0 8px #ef4444' } : {}} />
                    <Eye size={compact ? 15 : 13} />
                    {!compact && (
                        <span className="eyeguard-label">
                            {securityMode === 'face_youtube'
                                ? (monitorStatus === 'verified' ? `YouTube Stealth` : 'Stealth')
                                : (monitorStatus === 'verified' ? `Face Guard` : 'Scanning')}
                        </span>
                    )}
                </div>
            ) : (
                <div 
                    className={`eyeguard-badge unregistered ${compact ? 'compact' : ''}`}
                    onClick={onOpenEnroll}
                    title="Click to set up Eye & Face Protection for Secret Chats"
                >
                    <Sparkles size={compact ? 15 : 13} />
                    {!compact && <span className="eyeguard-label">Setup Face ID</span>}
                </div>
            )}
        </>
    );
}
