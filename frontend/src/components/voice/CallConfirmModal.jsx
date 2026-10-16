import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Phone, PhoneCall, Video, X } from 'lucide-react';
import './VoiceCall.css';

const CallConfirmModal = ({
    isOpen,
    step = 1,
    receiverName,
    callType = 'voice', // 'voice' or 'video'
    onNext,
    onConfirm,
    onCancel
}) => {
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                onCancel();
            } else if (e.key === 'Enter') {
                if (step === 1) {
                    onNext();
                } else {
                    onConfirm();
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, step, onNext, onConfirm, onCancel]);

    if (!isOpen) return null;

    const isVideo = callType === 'video';
    const callLabel = isVideo ? 'video call' : 'voice call';
    const callActionName = isVideo ? 'Video Call' : 'Call';

    const modalContent = (
        <div 
            className="call-confirm-backdrop"
            onClick={onCancel}
        >
            <div 
                className="call-confirm-modal"
                key={step}
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="call-confirm-title"
            >
                {/* Close Button */}
                <button 
                    type="button"
                    className="call-confirm-close-btn"
                    onClick={onCancel}
                    title="Cancel"
                    aria-label="Close"
                >
                    <X size={18} />
                </button>

                {/* Animated Call Icon */}
                <div className={`call-confirm-icon-wrap ${step === 2 ? 'step-2' : ''}`} style={isVideo ? { backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#10B981' } : {}}>
                    {isVideo ? (
                        <Video size={28} />
                    ) : (
                        step === 1 ? <Phone size={28} /> : <PhoneCall size={28} />
                    )}
                </div>

                {/* Step Indicators */}
                <div className="call-confirm-steps">
                    <span className={`step-dot ${step >= 1 ? 'active' : ''}`} />
                    <span className={`step-line ${step >= 2 ? 'active' : ''}`} />
                    <span className={`step-dot ${step >= 2 ? 'active' : ''}`} />
                </div>
                <div className="call-confirm-badge">
                    {step === 1 ? 'Confirmation 1 of 2' : 'Final Confirmation 2 of 2'}
                </div>

                {/* Main Heading */}
                <h3 id="call-confirm-title" className="call-confirm-title">
                    {isVideo ? 'Are you sure you want to video call?' : 'Are you sure you want to call?'}
                </h3>

                {/* Descriptive Context */}
                <p className="call-confirm-desc">
                    {step === 1 ? (
                        <>You are about to start a {callLabel} with <strong className="call-confirm-target">{receiverName || 'Teammate'}</strong>.</>
                    ) : (
                        <>Please confirm once more. Click below to place the {callLabel} to <strong className="call-confirm-target">{receiverName || 'Teammate'}</strong>.</>
                    )}
                </p>

                {/* Actions */}
                <div className="call-confirm-actions">
                    <button 
                        type="button"
                        className="call-confirm-btn call-confirm-btn-cancel"
                        onClick={onCancel}
                    >
                        Cancel
                    </button>
                    {step === 1 ? (
                        <button 
                            type="button"
                            className="call-confirm-btn call-confirm-btn-primary"
                            onClick={onNext}
                            autoFocus
                        >
                            {isVideo ? <Video size={16} style={{ marginRight: '6px' }} /> : <Phone size={16} style={{ marginRight: '6px' }} />}
                            Yes, {callActionName}
                        </button>
                    ) : (
                        <button 
                            type="button"
                            className="call-confirm-btn call-confirm-btn-primary final"
                            onClick={onConfirm}
                            autoFocus
                        >
                            {isVideo ? <Video size={16} style={{ marginRight: '6px' }} /> : <PhoneCall size={16} style={{ marginRight: '6px' }} />}
                            Confirm & {callActionName}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
};

export default CallConfirmModal;
