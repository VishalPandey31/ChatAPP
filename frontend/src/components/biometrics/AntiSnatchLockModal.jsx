import React, { useState, useEffect, useRef } from 'react';
import { ShieldAlert, KeyRound, LogOut, CheckCircle2, Eye, EyeOff, RefreshCw, AlertTriangle } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { loadFaceModels, detectFaceInVideo, compareFaceDescriptors } from '../../utils/faceRecognitionService';
import './Biometrics.css';

export default function AntiSnatchLockModal() {
    const { isSecurityLocked, lockReason, faceProfile, setSecurityLocked, unlockWithPassword, logout } = useAuthStore();
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const pwdInputRef = useRef(null);

    const [password, setPassword] = useState('');
    const [pwdError, setPwdError] = useState('');
    const [showPasswordText, setShowPasswordText] = useState(false);
    const [isVerifyingPwd, setIsVerifyingPwd] = useState(false);
    const [scannerStatus, setScannerStatus] = useState('Position face to unlock...');
    const [isMatching, setIsMatching] = useState(false);
    const [unlockedSuccess, setUnlockedSuccess] = useState(false);

    // Always reset password to completely empty whenever screen locks - enforce manual typing
    useEffect(() => {
        if (isSecurityLocked) {
            setPassword('');
            setPwdError('');
            setIsVerifyingPwd(false);
            if (pwdInputRef.current) {
                pwdInputRef.current.value = '';
            }
            const t1 = setTimeout(() => {
                setPassword('');
                if (pwdInputRef.current) pwdInputRef.current.value = '';
            }, 60);
            const t2 = setTimeout(() => {
                setPassword('');
                if (pwdInputRef.current) pwdInputRef.current.value = '';
            }, 250);
            return () => {
                clearTimeout(t1);
                clearTimeout(t2);
            };
        }
    }, [isSecurityLocked]);

    // Initialize camera scanner for instant biometric re-unlock
    useEffect(() => {
        if (!isSecurityLocked) return;

        let active = true;

        async function initCamera() {
            try {
                await loadFaceModels();
                if (!active) return;

                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 480 } },
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
            } catch (err) {
                console.warn('[AntiSnatchLock] Camera unlock init error:', err);
                setScannerStatus('Camera unavailable. Enter password to unlock.');
            }
        }

        initCamera();

        return () => {
            active = false;
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(t => t.stop());
                streamRef.current = null;
            }
        };
    }, [isSecurityLocked]);

    // Continuous face match detection while locked
    useEffect(() => {
        if (!isSecurityLocked || unlockedSuccess) return;

        let intervalId = null;

        const checkFace = async () => {
            if (!videoRef.current || videoRef.current.readyState < 2) return;
            if (!faceProfile || !faceProfile.descriptor || faceProfile.descriptor.length !== 128) return;

            try {
                const res = await detectFaceInVideo(videoRef.current, { inputSize: 224, scoreThreshold: 0.5 });
                if (res.detected && res.descriptor) {
                    const comp = compareFaceDescriptors(faceProfile.descriptor, res.descriptor, 0.55);

                    if (comp.match && res.eyesOpen) {
                        // OWNER DETECTED!
                        setIsMatching(true);
                        setScannerStatus('Owner Verified! Unlocking chats...');
                        setUnlockedSuccess(true);

                        setTimeout(() => {
                            setSecurityLocked(false, null);
                        }, 800);
                    } else if (!res.eyesOpen) {
                        setScannerStatus('Please open eyes and look at the screen...');
                    } else {
                        setScannerStatus('Face mismatch! Unregistered face detected.');
                    }
                } else {
                    setScannerStatus('Looking for owner face...');
                }
            } catch (err) {
                console.warn('[AntiSnatchLock] Face check error:', err);
            }
        };

        intervalId = setInterval(checkFace, 600);

        return () => {
            if (intervalId) clearInterval(intervalId);
        };
    }, [isSecurityLocked, unlockedSuccess, faceProfile, setSecurityLocked]);

    const handlePasswordSubmit = async (e) => {
        e.preventDefault();
        const pwdToVerify = password.trim();
        if (!pwdToVerify) return;

        setIsVerifyingPwd(true);
        setPwdError('');

        try {
            await unlockWithPassword(pwdToVerify);
            setPassword('');
            if (pwdInputRef.current) pwdInputRef.current.value = '';
            setUnlockedSuccess(true);
        } catch (err) {
            setPassword('');
            if (pwdInputRef.current) pwdInputRef.current.value = '';
            setPwdError(err.message || 'Incorrect password.');
        } finally {
            setIsVerifyingPwd(false);
        }
    };

    if (!isSecurityLocked) return null;

    return (
        <div className="antisnatch-lock-screen">
            <div className="antisnatch-icon-wrap">
                <ShieldAlert size={42} />
            </div>

            <h1 className="antisnatch-title">
                {lockReason === 'NO_FACE' ? 'UNATTENDED PHONE DETECTED' : 'FACE MISMATCH DETECTED'}
            </h1>
            <p className="antisnatch-subtitle">
                Anti-Snatch Couple Protection is active. Chats have been instantly locked to safeguard your secret messages.
            </p>

            {/* Circular Camera Face Unlock Box */}
            <div className="antisnatch-scan-box" style={{ borderColor: isMatching ? '#10b981' : '#ef4444' }}>
                <video 
                    ref={videoRef} 
                    className="antisnatch-scan-video" 
                    autoPlay 
                    muted 
                    playsInline 
                />
            </div>

            <div style={{ 
                fontSize: 13, 
                fontWeight: 600, 
                color: isMatching ? '#34d399' : '#f87171', 
                marginBottom: 20,
                display: 'flex',
                alignItems: 'center',
                gap: 6
            }}>
                <Eye size={16} />
                <span>{scannerStatus}</span>
            </div>

            {/* Password Unlock Alternative - Strictly Manual Typing */}
            <div className="antisnatch-unlock-card">
                <form 
                    onSubmit={handlePasswordSubmit} 
                    autoComplete="off" 
                    style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
                >
                    {/* Hidden decoys to divert browser autofill */}
                    <input type="text" name="decoy_username" style={{ display: 'none' }} tabIndex={-1} autoComplete="off" />
                    <input type="password" name="decoy_password" style={{ display: 'none' }} tabIndex={-1} autoComplete="off" />

                    <div style={{ position: 'relative', width: '100%' }}>
                        <input 
                            ref={pwdInputRef}
                            type={showPasswordText ? "text" : "password"}
                            name="one_time_security_pin"
                            id="manual_unlock_security_key"
                            placeholder="Type password manually to unlock"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="antisnatch-pwd-input"
                            style={{ paddingRight: '40px' }}
                            autoComplete="off"
                            autoCorrect="off"
                            autoCapitalize="off"
                            spellCheck="false"
                            data-lpignore="true"
                            data-1p-ignore="true"
                            data-bwignore="true"
                            data-form-type="other"
                            autoFocus
                        />
                        <button
                            type="button"
                            onClick={() => setShowPasswordText(!showPasswordText)}
                            style={{
                                position: 'absolute',
                                right: '10px',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                background: 'none',
                                border: 'none',
                                color: '#8696a0',
                                cursor: 'pointer',
                                padding: '4px',
                                display: 'flex',
                                alignItems: 'center'
                            }}
                            title={showPasswordText ? "Hide password" : "Show password"}
                        >
                            {showPasswordText ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                    </div>

                    {pwdError && (
                        <div style={{ color: '#f87171', fontSize: 12, textAlign: 'left' }}>
                            {pwdError}
                        </div>
                    )}
                    <button 
                        type="submit" 
                        className="bio-btn bio-btn-primary"
                        disabled={isVerifyingPwd || !password.trim()}
                    >
                        <KeyRound size={16} />
                        {isVerifyingPwd ? 'Verifying Password...' : 'Unlock with Password'}
                    </button>
                </form>

                <div style={{ display: 'flex', justifyContent: 'center', marginTop: 4 }}>
                    <button 
                        type="button" 
                        onClick={() => logout()}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: '#8696a0',
                            fontSize: 12,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 5,
                            cursor: 'pointer',
                            padding: '6px 12px'
                        }}
                    >
                        <LogOut size={14} />
                        <span>Log Out & Exit App</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
