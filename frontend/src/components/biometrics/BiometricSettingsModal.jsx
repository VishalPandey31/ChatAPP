import React, { useState } from 'react';
import { Shield, Eye, RefreshCw, Trash2, X, Check, Lock, ShieldAlert } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import './Biometrics.css';

export default function BiometricSettingsModal({ isOpen, onClose, onOpenEnroll }) {
    const { 
        faceProfile, 
        antiSnatchActive, 
        setAntiSnatchActive, 
        deleteFaceProfile,
        setSecurityLocked,
        securityMode,
        setSecurityMode 
    } = useAuthStore();

    const [isDeleting, setIsDeleting] = useState(false);

    if (!isOpen) return null;

    const isEnrolled = Boolean(faceProfile?.isConfigured);
    const enrolledDate = faceProfile?.enrolledAt 
        ? new Date(faceProfile.enrolledAt).toLocaleDateString() 
        : 'Active';

    const handleDelete = async () => {
        if (!window.confirm('Are you sure you want to reset and remove your Face Biometric profile?')) return;
        setIsDeleting(true);
        try {
            await deleteFaceProfile();
            onClose();
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className="bio-modal-backdrop">
            <div className="bio-card" style={{ maxWidth: 440 }}>
                <div className="bio-card-header">
                    <div className="bio-title-wrap">
                        <div className="bio-icon-box">
                            <Shield size={24} />
                        </div>
                        <div>
                            <h2 className="bio-card-title">Couple EyeGuard Protection</h2>
                            <p className="bio-card-subtitle">Biometric Face & Anti-Snatch Security</p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose}
                        style={{ background: 'none', border: 'none', color: '#8696a0', cursor: 'pointer', padding: 4 }}
                    >
                        <X size={20} />
                    </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Status Card */}
                    <div style={{
                        background: '#202c33',
                        borderRadius: 12,
                        padding: 16,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        border: '1px solid rgba(255, 255, 255, 0.08)'
                    }}>
                        <div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 2 }}>
                                Face Biometrics
                            </div>
                            <div style={{ fontSize: 12, color: isEnrolled ? '#34d399' : '#8696a0' }}>
                                {isEnrolled ? `Enrolled (${enrolledDate})` : 'Not enrolled yet'}
                            </div>
                        </div>

                        {isEnrolled ? (
                            <div style={{
                                background: 'rgba(16, 185, 129, 0.15)',
                                color: '#10b981',
                                padding: '4px 10px',
                                borderRadius: 20,
                                fontSize: 12,
                                fontWeight: 600,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4
                            }}>
                                <Check size={14} /> Active
                            </div>
                        ) : (
                            <button
                                className="bio-btn bio-btn-primary"
                                style={{ width: 'auto', padding: '6px 14px', fontSize: 12 }}
                                onClick={() => {
                                    onClose();
                                    onOpenEnroll();
                                }}
                            >
                                Enroll Now
                            </button>
                        )}
                    </div>

                    {/* Security Mode Options */}
                    <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#e9edef', marginBottom: 8 }}>
                            Security Action on Face Mismatch
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <label style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                background: securityMode === 'face_login' ? 'rgba(16, 185, 129, 0.12)' : '#202c33',
                                border: securityMode === 'face_login' ? '1px solid #10b981' : '1px solid rgba(255,255,255,0.06)',
                                padding: '10px 12px',
                                borderRadius: 10,
                                cursor: 'pointer',
                                fontSize: 13,
                                color: '#fff'
                            }}>
                                <input 
                                    type="radio" 
                                    name="security_mode_opt" 
                                    checked={securityMode === 'face_login'} 
                                    onChange={() => setSecurityMode('face_login')} 
                                    style={{ accentColor: '#10b981' }} 
                                />
                                <div>
                                    <div style={{ fontWeight: 600 }}>🛡️ Face Recognition + Login</div>
                                    <div style={{ fontSize: 11, color: '#8696a0' }}>Locks screen and kicks to Login page if face mismatches</div>
                                </div>
                            </label>

                            <label style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                background: securityMode === 'face_youtube' ? 'rgba(239, 68, 68, 0.12)' : '#202c33',
                                border: securityMode === 'face_youtube' ? '1px solid #ef4444' : '1px solid rgba(255,255,255,0.06)',
                                padding: '10px 12px',
                                borderRadius: 10,
                                cursor: 'pointer',
                                fontSize: 13,
                                color: '#fff'
                            }}>
                                <input 
                                    type="radio" 
                                    name="security_mode_opt" 
                                    checked={securityMode === 'face_youtube'} 
                                    onChange={() => setSecurityMode('face_youtube')} 
                                    style={{ accentColor: '#ef4444' }} 
                                />
                                <div>
                                    <div style={{ fontWeight: 600 }}>📺 Face Recognition + YouTube</div>
                                    <div style={{ fontSize: 11, color: '#8696a0' }}>Instantly opens YouTube to disguise chats if face mismatches</div>
                                </div>
                            </label>

                            <label style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                background: securityMode === 'none' ? 'rgba(59, 130, 246, 0.12)' : '#202c33',
                                border: securityMode === 'none' ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.06)',
                                padding: '10px 12px',
                                borderRadius: 10,
                                cursor: 'pointer',
                                fontSize: 13,
                                color: '#fff'
                            }}>
                                <input 
                                    type="radio" 
                                    name="security_mode_opt" 
                                    checked={securityMode === 'none'} 
                                    onChange={() => setSecurityMode('none')} 
                                    style={{ accentColor: '#3b82f6' }} 
                                />
                                <div>
                                    <div style={{ fontWeight: 600 }}>💬 Without Face Recognition</div>
                                    <div style={{ fontSize: 11, color: '#8696a0' }}>Normal chatting mode. Camera is disabled, no redirects.</div>
                                </div>
                            </label>
                        </div>
                    </div>

                    {/* Test Lock Screen Button */}
                    {isEnrolled && (
                        <button
                            type="button"
                            className="bio-btn bio-btn-secondary"
                            onClick={() => {
                                onClose();
                                setSecurityLocked(true, 'FACE_MISMATCH');
                            }}
                        >
                            <ShieldAlert size={16} />
                            Test Anti-Snatch Lock Screen
                        </button>
                    )}

                    {/* Re-enroll or Delete */}
                    {isEnrolled && (
                        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                            <button
                                type="button"
                                className="bio-btn bio-btn-secondary"
                                style={{ flex: 1 }}
                                onClick={() => {
                                    onClose();
                                    onOpenEnroll();
                                }}
                            >
                                <RefreshCw size={14} /> Re-scan Face
                            </button>
                            <button
                                type="button"
                                className="bio-btn bio-btn-danger"
                                style={{ width: 'auto', padding: '12px 16px' }}
                                onClick={handleDelete}
                                disabled={isDeleting}
                                title="Reset Face Profile"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
