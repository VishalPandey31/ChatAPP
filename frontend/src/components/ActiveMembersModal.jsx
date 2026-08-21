import React from 'react';
import { useAuthStore } from '../store/authStore';
import { useProjectStore } from '../store/projectStore';

const ActiveMembersModal = ({ onClose, project }) => {
    const onlineUsers = useAuthStore(state => state.onlineUsers);
    const currentUser = useAuthStore(state => state.user);
    const fetchProjects = useProjectStore(state => state.fetchProjects);

    const handleRefresh = async () => {
        const socket = useAuthStore.getState().socket;
        if (socket) socket.emit("get_online_users");
        if (fetchProjects) {
            try {
                await fetchProjects();
            } catch (err) {
                console.error("Failed to refresh projects", err);
            }
        }
    };

    if (!project) return null;

        const formatLastSeen = (dateString) => {
            if (!dateString) return 'Offline';
            const d = new Date(dateString);
            if (isNaN(d.getTime())) return 'Offline';
            return `Last seen: ${d.toLocaleString([], { dateStyle: 'short', timeStyle: 'medium' })}`;
        };

        return (
            <div style={{ position: 'fixed', inset: 0, zIndex: 9999, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', backdropFilter: 'blur(5px)' }}>
              <div className="animate-fade-in" style={{ width: '100%', maxWidth: '420px', backgroundColor: '#0a0f1c', borderRadius: '16px', padding: '24px', border: '1px solid #1e293b', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)' }}>
                
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#10b981' }}>
                         <span style={{ fontSize: '20px', display: 'flex' }}>
                            <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 640 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M224 256A128 128 0 1 0 224 0a128 128 0 1 0 0 256zm-45.7 48C71.8 304 0 375.8 0 482.3C0 498.7 13.3 512 29.7 512H322.8c-3.1-8.8-3.7-18.4-1.4-27.8l15-60.1c2.8-11.3 8.6-21.5 16.8-29.7l40.3-40.3c-32.1-31-75.7-50.1-123.9-50.1H178.3zm435.5-68.3c-15.6-15.6-40.9-15.6-56.6 0l-29.4 29.4 71 71 29.4-29.4c15.6-15.6 15.6-40.9 0-56.6l-14.4-14.4zM375.9 417c-4.1 4.1-7 9.2-8.4 14.9l-15 60.1c-1.4 5.5 .2 11.2 4.2 15.2s9.7 5.6 15.2 4.2l60.1-15c5.6-1.4 10.8-4.3 14.9-8.4L576.1 358.7l-71-71L375.9 417z"></path></svg>
                         </span>
                         <h2 style={{ margin: 0, color: '#f8fafc', fontSize: '22px', fontWeight: '700' }}>Team Online Status</h2>
                    </div>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '24px', cursor: 'pointer', transition: 'color 0.2s' }} onMouseEnter={e => e.target.style.color = 'white'} onMouseLeave={e => e.target.style.color = '#94a3b8'}>×</button>
                </div>
                
                {/* Divider */}
                <div style={{ height: '1px', backgroundColor: '#1e293b', marginBottom: '20px' }}></div>
    
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '400px', overflowY: 'auto' }}>
                    {[project.admin, ...(project.collaborators || [])].filter(Boolean).filter(member => {
                        const memberId = member._id || member;
                        const currentUserId = currentUser?._id || currentUser?.id;
                        return memberId !== currentUserId;
                    }).map(member => {
                        const memberId = member._id || member;
                        const isOnline = onlineUsers.includes(memberId);
                        return (
                            <div key={memberId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', backgroundColor: '#1e293b', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.03)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                    <div style={{ position: 'relative' }}>
                                        <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#334155', color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center', fontWeight: 'bold', fontSize: '20px' }}>
                                            {member.name ? member.name.charAt(0).toUpperCase() : (member.email ? member.email.charAt(0).toUpperCase() : '?')}
                                        </div>
                                        <div style={{ 
                                            position: 'absolute', bottom: 0, right: 0, width: '14px', height: '14px', borderRadius: '50%', 
                                            backgroundColor: isOnline ? '#10b981' : '#64748b', border: '3px solid #1e293b' 
                                        }} />
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', overflow: 'hidden' }}>
                                        <span style={{ 
                                            color: '#f8fafc', 
                                            fontWeight: '700', 
                                            fontSize: '16px',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            maxWidth: '180px',
                                            display: 'block'
                                        }} title={member.email || member.name || 'Unknown User'}>
                                            {member.email || member.name || 'Unknown User'}
                                        </span>
                                        <span style={{ color: isOnline ? '#10b981' : '#94a3b8', fontSize: '14px', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            {isOnline ? (
                                                <><span style={{fontSize: '10px'}}>●</span> Online Now</>
                                            ) : formatLastSeen(member.lastSeen)}
                                        </span>
                                    </div>
                                </div>
                                
                                {/* Pill */}
                                <div style={{ 
                                    padding: '6px 12px', 
                                    borderRadius: '20px', 
                                    fontSize: '13px', 
                                    fontWeight: '600',
                                    backgroundColor: isOnline ? 'rgba(16, 185, 129, 0.15)' : 'rgba(148, 163, 184, 0.15)',
                                    color: isOnline ? '#10b981' : '#94a3b8'
                                }}>
                                    {isOnline ? 'Online' : 'Offline'}
                                </div>
                            </div>
                        )
                    })}
                </div>
                
                {/* Refresh Button */}
                <button 
                    onClick={handleRefresh}
                    style={{
                        marginTop: '24px',
                        width: '100%',
                        padding: '12px',
                        backgroundColor: '#1E293B',
                        color: '#f8fafc',
                        border: '1px solid rgba(255, 255, 255, 0.05)',
                        borderRadius: '8px',
                        fontWeight: '600',
                        fontSize: '14px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        transition: 'background-color 0.2s'
                    }}
                    onMouseEnter={(e) => e.target.style.backgroundColor = '#334155'}
                    onMouseLeave={(e) => e.target.style.backgroundColor = '#1E293B'}
                >
                    <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 512 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M256 112c-88.4 0-169 35.8-227.1 94.1-7.5 7.5-7.5 19.8 0 27.3l27.1 27.2c7.2 7.2 18.7 7.4 26.2.7C125.4 218 187.3 192 256 192s130.6 26 173.8 69.3c7.5 6.7 19 6.5 26.2-.7l27.1-27.2c7.5-7.5 7.5-19.8 0-27.3C425 147.8 344.4 112 256 112zm0-96C141.1 112 36.1 162.2 0 200.7c0 0 15 15.3 27.8 28.1 7.2 7.2 18.7 7.6 26.3 1 45.4-38.3 114.7-57.8 201.9-57.8 87.2 0 156.4 19.6 201.9 57.8 7.6 6.5 19.2 6.1 26.3-1 12.8-12.8 27.8-28.1 27.8-28.1C475.9 162.2 370.9 16 256 16zM135.2 360.7c7.1 7.1 18.5 7.3 25.8 1.1 25.9-20.7 58.7-33.8 95-33.8s69.2 13.1 95 33.8c7.3 6.3 18.7 6.1 25.8-1.1l27-27.4c7.3-7.4 7.2-19.4-.3-26.6-39.6-36.9-92.4-56.7-147.5-56.7-55.2 0-108 19.8-147.5 56.7-7.4 7.2-7.6 19.2-.3 26.6l27 27.4zM256 464c26.5 0 48-21.5 48-48s-21.5-48-48-48-48 21.5-48 48 21.5 48 48 48z"></path></svg>
                    Refresh Status
                </button>
              </div>
            </div>
        );
};

export default ActiveMembersModal;
