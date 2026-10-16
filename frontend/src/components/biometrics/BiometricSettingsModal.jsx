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
        setSecurityLocked 
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

                    {/* Toggle Anti-Snatch */}
                    {isEnrolled && (
                        <div style={{
                            background: '#202c33',
                            borderRadius: 12,
                            padding: 16,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            border: '1px solid rgba(255, 255, 255, 0.08)'
                        }}>
                            <div style={{ maxWidth: 260 }}>
                                <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 2 }}>
                                    Anti-Snatch Eye Tracking
                                </div>
                                <div style={{ fontSize: 12, color: '#8696a0', lineHeight: 1.4 }}>
                                    Scans your face & eyes every second while chatting. If another person grabs the phone or face mismatches, chats lock instantly!
                                </div>
                            </div>

                            <input 
                                type="checkbox"
                                checked={antiSnatchActive}
                                onChange={(e) => setAntiSnatchActive(e.target.checked)}
                                style={{ width: 22, height: 22, accentColor: '#00a884', cursor: 'pointer' }}
                            />
                        </div>
                    )}

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
