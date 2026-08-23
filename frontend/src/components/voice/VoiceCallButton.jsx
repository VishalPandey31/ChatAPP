import React from 'react';
import { useVoiceCallStore } from '../../store/voiceCallStore';
import { Phone } from 'lucide-react';

const VoiceCallButton = ({ receiverId, receiverName }) => {
    const { callState, startCall } = useVoiceCallStore();

    const handleStartCall = () => {
        if (callState === 'IDLE') {
            if (!receiverId || receiverId === 'unknown') {
                alert("The chat system couldn't determine the receiverID. But this is the call button!");
                return;
            }
            startCall(receiverId, receiverName);
        } else {
            alert("Finish your current call first.");
        }
    };

    return (
        <span 
            className="icon-btn"
            onClick={handleStartCall}
            title="Voice Call"
            style={{ 
                padding: '8px', 
                borderRadius: '8px', 
                cursor: 'pointer', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                transition: 'all 0.2s',
                color: '#25d366',
                marginRight: '8px',
                flexShrink: 0
            }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(37, 211, 102, 0.1)'} 
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
        >
            <Phone size={18} />
        </span>
    );
};

export default VoiceCallButton;
