import React, { useState } from 'react';
import { useVoiceCallStore } from '../../store/voiceCallStore';
import { Phone } from 'lucide-react';
import CallConfirmModal from './CallConfirmModal';

const VoiceCallButton = ({ receiverId, receiverName }) => {
    const { callState, startCall } = useVoiceCallStore();
    const [confirmStep, setConfirmStep] = useState(0); // 0: closed, 1: first popup, 2: second popup

    const handleButtonClick = () => {
        if (callState !== 'IDLE') {
            alert("Finish your current call first.");
            return;
        }
        if (!receiverId || receiverId === 'unknown') {
            alert("The chat system couldn't determine the receiverID. But this is the call button!");
            return;
        }
        // Trigger the 1st confirmation popup
        setConfirmStep(1);
    };

    const handleNextStep = () => {
        // User confirmed 1st popup -> show 2nd confirmation popup
        setConfirmStep(2);
    };

    const handleFinalConfirm = () => {
        // User confirmed 2nd popup -> initiate the call!
        setConfirmStep(0);
        startCall(receiverId, receiverName);
    };

    const handleCancel = () => {
        setConfirmStep(0);
    };

    return (
        <>
            <span 
                className="icon-btn"
                onClick={handleButtonClick}
                title="Voice Call"
                style={{ 
                    padding: '6px 8px', 
                    borderRadius: '8px', 
                    cursor: 'pointer', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    transition: 'all 0.2s',
                    color: '#25d366',
                    flexShrink: 0
                }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(37, 211, 102, 0.1)'} 
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
            >
                <Phone size={18} />
            </span>

            <CallConfirmModal 
                isOpen={confirmStep > 0}
                step={confirmStep}
                receiverName={receiverName}
                onNext={handleNextStep}
                onConfirm={handleFinalConfirm}
                onCancel={handleCancel}
            />
        </>
    );
};

export default VoiceCallButton;

