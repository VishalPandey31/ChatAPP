import React, { useState, useEffect, useRef } from 'react';
import { Shield, Eye, CheckCircle2, AlertCircle, X, Camera, RefreshCw } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { loadFaceModels, detectFaceInVideo } from '../../utils/faceRecognitionService';
import './Biometrics.css';

export default function FaceEnrollModal({ isOpen, onClose }) {
    const { saveFaceProfile } = useAuthStore();
    const videoRef = useRef(null);
    const streamRef = useRef(null);

    const [statusText, setStatusText] = useState('Initializing camera & neural models...');
    const [progress, setProgress] = useState(0);
    const [isScanning, setIsScanning] = useState(false);
    const [isComplete, setIsComplete] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [faceDetected, setFaceDetected] = useState(false);
    const [eyesOpen, setEyesOpen] = useState(false);
    const [dominantExpr, setDominantExpr] = useState('neutral');

    // Samples collected to average for rock-solid biometric descriptor
    const samplesRef = useRef([]);

    useEffect(() => {
        if (!isOpen) return;

        let active = true;

        async function startEnrollment() {
            try {
                setStatusText('Loading facial recognition models...');
                await loadFaceModels();

                if (!active) return;
                setStatusText('Requesting front camera access...');

                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
                    audio: false
                });

                if (!active) {
                    stream.getTracks().forEach(t => t.stop());
                    return;
                }

                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    await videoRef.current.play();
                }

                setIsScanning(true);
                setStatusText('Please position your face inside the oval guide...');
            } catch (err) {
                console.error('[FaceEnroll] Camera/model init error:', err);
                setErrorMsg(err.name === 'NotAllowedError' 
                    ? 'Camera access was denied. Please allow camera permissions to enroll your face.' 
                    : 'Failed to access camera or load neural networks.');
            }
        }

        startEnrollment();

        return () => {
            active = false;
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(t => t.stop());
                streamRef.current = null;
            }
        };
    }, [isOpen]);

    // Face scanning loop
    useEffect(() => {
        if (!isScanning || isComplete) return;

        let intervalId = null;

        const scanLoop = async () => {
            if (!videoRef.current || videoRef.current.readyState < 2) return;

            try {
                const res = await detectFaceInVideo(videoRef.current, { inputSize: 224, scoreThreshold: 0.5 });

                if (res.detected) {
                    setFaceDetected(true);
                    setEyesOpen(res.eyesOpen);
                    setDominantExpr(res.dominantExpression || 'neutral');

                    if (!res.eyesOpen) {
                        setStatusText('Eyes not clearly visible! Please look straight at the screen.');
                        return;
                    }

                    // Collect valid biometric sample
                    samplesRef.current.push({
                        descriptor: res.descriptor,
                        ear: res.avgEAR
                    });

                    const currentCount = samplesRef.current.length;
                    const targetCount = 8;
                    const pct = Math.min(100, Math.round((currentCount / targetCount) * 100));
                    setProgress(pct);
                    setStatusText(`Scanning facial landmarks & eyes... ${pct}% (Hold still)`);

                    if (currentCount >= targetCount) {
                        // All samples gathered! Average the 128-d vectors
                        setIsScanning(false);
                        setStatusText('Processing & securing biometric template in database...');

                        const avgDescriptor = new Array(128).fill(0);
                        let avgEARSum = 0;

                        for (const s of samplesRef.current) {
                            for (let i = 0; i < 128; i++) {
                                avgDescriptor[i] += s.descriptor[i];
                            }
                            avgEARSum += s.ear;
                        }

                        for (let i = 0; i < 128; i++) {
                            avgDescriptor[i] /= currentCount;
                        }
                        const finalEAR = Number((avgEARSum / currentCount).toFixed(3));

                        await saveFaceProfile(avgDescriptor, finalEAR);

                        setIsComplete(true);
                        setStatusText('🎉 Biometric Face & Eye Profile Enrolled Successfully!');
                        setTimeout(() => {
                            if (onClose) onClose();
                        }, 1800);
                    }
                } else {
                    setFaceDetected(false);
                    setStatusText('No face detected. Please align your face inside the oval.');
                }
            } catch (e) {
                console.warn('[FaceEnroll] Scan tick error:', e);
            }
        };

        intervalId = setInterval(scanLoop, 400);

        return () => {
            if (intervalId) clearInterval(intervalId);
        };
    }, [isScanning, isComplete, saveFaceProfile, onClose]);

    if (!isOpen) return null;

    return (
        <div className="bio-modal-backdrop">
            <div className="bio-card">
                <div className="bio-card-header">
                    <div className="bio-title-wrap">
                        <div className="bio-icon-box">
                            <Shield size={24} />
                        </div>
                        <div>
                            <h2 className="bio-card-title">Setup Face & Eye Guard</h2>
                            <p className="bio-card-subtitle">Biometric Anti-Snatch Couple Protection</p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose} 
                        style={{ background: 'none', border: 'none', color: '#8696a0', cursor: 'pointer', padding: 4 }}
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Viewport */}
                <div className="bio-scanner-viewport">
                    <video 
                        ref={videoRef} 
                        className="bio-camera-video" 
                        autoPlay 
                        muted 
                        playsInline 
                    />

                    {/* Scanner HUD Overlay */}
                    <div className="bio-hud-overlay">
                        <div className={`bio-face-oval ${faceDetected ? 'active' : ''}`}>
                            <div className="bio-scan-laser" />
                        </div>
                        <div className="bio-reticle tl" />
                        <div className="bio-reticle tr" />
                        <div className="bio-reticle bl" />
                        <div className="bio-reticle br" />
                    </div>

                    {/* Status Pill */}
                    <div className="bio-status-bar">
                        <span className={`bio-status-pill ${faceDetected ? 'success' : 'warning'}`}>
                            <Eye size={13} />
                            {faceDetected ? (eyesOpen ? 'Eyes: Open' : 'Eyes: Look at Camera') : 'Searching Face'}
                        </span>
                        <span>Expression: <strong style={{ color: '#00a884' }}>{dominantExpr}</strong></span>
                    </div>
                </div>

                {/* Progress */}
                <div className="bio-progress-wrap">
                    <div className="bio-progress-label">
                        <span>{statusText}</span>
                        <span>{progress}%</span>
                    </div>
                    <div className="bio-progress-bar">
                        <div className="bio-progress-fill" style={{ width: `${progress}%` }} />
                    </div>
                </div>

                {errorMsg && (
                    <div style={{ 
                        background: 'rgba(239, 68, 68, 0.15)', 
                        border: '1px solid rgba(239, 68, 68, 0.3)', 
                        padding: '10px 14px', 
                        borderRadius: 10, 
                        color: '#f87171', 
                        fontSize: 12, 
                        marginBottom: 16,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8
                    }}>
                        <AlertCircle size={16} />
                        <span>{errorMsg}</span>
                    </div>
                )}

                {isComplete ? (
                    <div style={{ textAlign: 'center', color: '#34d399', fontWeight: 600, padding: '10px 0' }}>
                        <CheckCircle2 size={32} style={{ margin: '0 auto 8px auto', display: 'block' }} />
                        <span>Face Biometrics Registered & Active!</span>
                    </div>
                ) : (
                    <div style={{ display: 'flex', gap: 10 }}>
                        <button 
                            type="button" 
                            className="bio-btn bio-btn-secondary" 
                            onClick={onClose}
                        >
                            Cancel
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
