import React from 'react';
import { Phone, PhoneMissed, PhoneOff } from 'lucide-react';
import { useVoiceCallStore } from '../../store/voiceCallStore';
import { useAuthStore } from '../../store/authStore';

const formatTime = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const CallRecordBubble = ({ message }) => {
    const { callMeta, createdAt, sender } = message;
    const { user } = useAuthStore();
    const { callState, startCall } = useVoiceCallStore();

    if (!callMeta) return null;

    const { status, duration, callerId, receiverId } = callMeta;
    const isMissed = status === 'missed';
    const isDeclined = status === 'declined';
    const isCompleted = status === 'completed';
    const isCancelled = status === 'cancelled';
    const isFailed = status === 'failed';
    const isNoAnswer = status === 'no_answer';

    const myId = user?._id?.toString();
    const callerIdStr = callerId?._id?.toString() || callerId?.toString();
    const iWasCaller = myId === callerIdStr;

    // For missed call: the other person is the caller (i.e., I missed their call)
    const isMissedToMe = isMissed && !iWasCaller;

    // Determine the other user ID for callback
    const otherUserId = iWasCaller
        ? (receiverId?._id?.toString() || receiverId?.toString())
        : callerIdStr;

    const otherUserName = iWasCaller
        ? (message.receiver?.name || 'Teammate')
        : (message.sender?.name || 'Teammate');

    const handleCallBack = () => {
        if (callState !== 'IDLE') {
            alert("Finish your current call first.");
            return;
        }
        if (otherUserId && otherUserId !== 'undefined') {
            startCall(otherUserId, otherUserName);
        }
    };

    let iconEl, labelEl, subLabelEl;

    if (isMissedToMe) {
        iconEl = <PhoneMissed size={18} style={{ color: '#EF4444', flexShrink: 0 }} />;
        labelEl = <span style={{ fontWeight: 600, color: '#EF4444', fontSize: '14px' }}>Missed call</span>;
        subLabelEl = (
            <span
                style={{ fontSize: '12px', color: '#60A5FA', cursor: 'pointer', textDecoration: 'underline' }}
                onClick={handleCallBack}
            >
                Tap to call back
            </span>
        );
    } else if (isDeclined) {
        iconEl = <PhoneOff size={18} style={{ color: '#94A3B8', flexShrink: 0 }} />;
        labelEl = <span style={{ fontWeight: 600, color: '#E2E8F0', fontSize: '14px' }}>Voice call</span>;
        subLabelEl = <span style={{ fontSize: '12px', color: '#94A3B8' }}>Declined</span>;
    } else if (isNoAnswer) {
        iconEl = <Phone size={18} style={{ color: '#94A3B8', flexShrink: 0 }} />;
        labelEl = <span style={{ fontWeight: 600, color: '#E2E8F0', fontSize: '14px' }}>Voice call</span>;
        subLabelEl = <span style={{ fontSize: '12px', color: '#94A3B8' }}>No answer</span>;
    } else if (isFailed) {
        iconEl = <PhoneOff size={18} style={{ color: '#F87171', flexShrink: 0 }} />;
        labelEl = <span style={{ fontWeight: 600, color: '#E2E8F0', fontSize: '14px' }}>Voice call</span>;
        subLabelEl = <span style={{ fontSize: '12px', color: '#F87171' }}>Failed</span>;
    } else if (isCancelled) {
        iconEl = <Phone size={18} style={{ color: '#94A3B8', flexShrink: 0 }} />;
        labelEl = <span style={{ fontWeight: 600, color: '#E2E8F0', fontSize: '14px' }}>Voice call</span>;
        subLabelEl = <span style={{ fontSize: '12px', color: '#94A3B8' }}>Cancelled</span>;
    } else {
        // completed
        const dur = duration > 0 ? (() => {
            const m = Math.floor(duration / 60);
            const s = duration % 60;
            if (m === 0) return `${s} sec${s !== 1 ? 's' : ''}`;
            return s > 0 ? `${m} min${m !== 1 ? 's' : ''} ${s} sec${s !== 1 ? 's' : ''}` : `${m} min${m !== 1 ? 's' : ''}`;
        })() : '0 secs';
        iconEl = <Phone size={18} style={{ color: '#25D366', flexShrink: 0 }} />;
        labelEl = <span style={{ fontWeight: 600, color: '#E2E8F0', fontSize: '14px' }}>Voice call</span>;
        subLabelEl = <span style={{ fontSize: '12px', color: '#94A3B8' }}>{dur}</span>;
    }

    return (
        <div style={{
            display: 'flex',
            justifyContent: 'center',
            width: '100%',
            padding: '4px 0'
        }}>
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                backgroundColor: isMissedToMe ? 'rgba(239,68,68,0.08)' : '#1E293B',
                border: `1px solid ${isMissedToMe ? 'rgba(239,68,68,0.25)' : '#243044'}`,
                borderRadius: '12px',
                padding: '10px 16px',
                maxWidth: '280px',
                minWidth: '200px',
                cursor: isMissedToMe ? 'pointer' : 'default',
            }}
            onClick={isMissedToMe ? handleCallBack : undefined}
            >
                <div style={{
                    backgroundColor: isMissedToMe ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.05)',
                    borderRadius: '50%',
                    width: '36px',
                    height: '36px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                }}>
                    {iconEl}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    {labelEl}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginTop: '2px' }}>
                        {subLabelEl}
                        <span style={{ fontSize: '11px', color: '#64748B', whiteSpace: 'nowrap' }}>
                            {formatTime(createdAt)}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CallRecordBubble;
