import React, { useState, useEffect, useRef } from 'react';
import { Eye, ShieldCheck, ShieldAlert, Sparkles } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useVoiceCallStore } from '../../store/voiceCallStore';
import { loadFaceModels, detectFaceInVideo, compareFaceDescriptors } from '../../utils/faceRecognitionService';
import './Biometrics.css';

export default function EyeGuardMonitor({ onOpenSettings, onOpenEnroll }) {
    const { 
        user, 
        faceProfile, 
        antiSnatchActive, 
        isSecurityLocked, 
        setSecurityLocked 
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

    // Initialize background camera when enrolled & active
    useEffect(() => {
        if (!user || !isEnrolled || !antiSnatchActive || isSecurityLocked || activeCall) {
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
    }, [user, isEnrolled, antiSnatchActive, isSecurityLocked, activeCall]);

    // Continuous presence detection loop (every 1.5 seconds)
    useEffect(() => {
        if (!isEnrolled || !antiSnatchActive || isSecurityLocked || activeCall || hasCameraError) return;

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
                            console.warn('[EyeGuard] Locking screen due to Face Mismatch!');
                            setSecurityLocked(true, 'FACE_MISMATCH');
                            mismatchCountRef.current = 0;
                        }
                    }
                } else {
                    // NO FACE VISIBLE (phone laid down or turned away)
                    noFaceCountRef.current += 1;
                    if (noFaceCountRef.current >= 3) {
                        setMonitorStatus('warning');
                        console.warn('[EyeGuard] Locking screen due to Unattended Phone!');
                        setSecurityLocked(true, 'NO_FACE');
                        noFaceCountRef.current = 0;
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
    }, [isEnrolled, antiSnatchActive, isSecurityLocked, activeCall, hasCameraError, faceProfile, setSecurityLocked]);

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
            {isEnrolled ? (
                <div 
                    className={`eyeguard-badge ${monitorStatus === 'verified' ? '' : monitorStatus === 'warning' ? 'danger' : 'warning'}`}
                    onClick={onOpenSettings}
                    title="EyeGuard Anti-Snatch Couple Protection (Click for Settings)"
                >
                    <span className="eyeguard-dot" />
                    <Eye size={13} />
                    <span>
                        {monitorStatus === 'verified' 
                            ? `EyeGuard: Active ${dominantExpr ? `(${dominantExpr})` : ''}` 
                            : monitorStatus === 'warning' 
                            ? 'EyeGuard: Alert' 
                            : 'EyeGuard: Securing...'}
                    </span>
                </div>
            ) : (
                <div 
                    className="eyeguard-badge unregistered"
                    onClick={onOpenEnroll}
                    title="Click to set up Eye & Face Protection for Secret Chats"
                >
                    <Sparkles size={13} />
                    <span>Setup EyeGuard</span>
                </div>
            )}
        </>
    );
}
