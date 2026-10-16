import React, { useState } from 'react';
import { useVoiceCallStore } from '../../store/voiceCallStore';
import { Video } from 'lucide-react';
import CallConfirmModal from './CallConfirmModal';

const VideoCallButton = ({ receiverId, receiverName }) => {
    const { callState, startCall } = useVoiceCallStore();
    const [confirmStep, setConfirmStep] = useState(0); // 0: closed, 1: first popup, 2: second popup

    const handleButtonClick = () => {
        if (callState !== 'IDLE') {
            alert("Finish your current call first.");
            return;
        }
        if (!receiverId || receiverId === 'unknown') {
            alert("The chat system couldn't determine the recipient. Please ensure you are inside an active chat.");
            return;
        }
        // Step 1: First popup
        setConfirmStep(1);
    };

    const handleNextStep = () => {
        // Step 2: Second confirmation popup
        setConfirmStep(2);
    };

    const handleFinalConfirm = () => {
        // Confirmed 2 times -> start the video call!
        setConfirmStep(0);
        startCall(receiverId, receiverName, 'video');
    };

    const handleCancel = () => {
        setConfirmStep(0);
    };

    return (
        <>
            <span 
                className="icon-btn"
                onClick={handleButtonClick}
                title="Video Call"
                style={{ 
                    padding: '8px', 
                    borderRadius: '8px', 
                    cursor: 'pointer', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    transition: 'all 0.2s',
                    color: '#10B981',
                    marginRight: '6px',
                    flexShrink: 0
                }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(16, 185, 129, 0.15)'} 
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
            >
                <Video size={18} />
            </span>

            <CallConfirmModal 
                isOpen={confirmStep > 0}
                step={confirmStep}
                receiverName={receiverName}
                callType="video"
                onNext={handleNextStep}
                onConfirm={handleFinalConfirm}
                onCancel={handleCancel}
            />
        </>
    );
};

export default VideoCallButton;
