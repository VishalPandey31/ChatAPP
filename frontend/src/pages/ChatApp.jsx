import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { useProjectStore } from '../store/projectStore';
import { Search, BarChart3, Settings, Smile, Image as ImageIcon, Send as SendIcon, MessageSquare, UserCircle, Plus, Trash2, X, Reply } from 'lucide-react';
import TeamModal from '../components/TeamModal';
import ActiveMembersModal from '../components/ActiveMembersModal';

const ChatApp = () => {
  const { user, logout, socket, onlineUsers } = useAuthStore();
  const { messages, isMessagesLoading, getProjectMessages, sendProjectMessage, addMessage, clearProjectChat, clearMessagesLocally } = useChatStore();
  const { projects, fetchProjects } = useProjectStore();
  const navigate = useNavigate();
  const { projectId } = useParams();
  const [msgContent, setMsgContent] = useState('');
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const messagesEndRef = useRef(null);
  
  const currentProject = projects.find(p => p._id === projectId);

  useEffect(() => {
    if (projects.length === 0) fetchProjects();
  }, [projects, fetchProjects]);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    if (user.role === 'USER' && user.approvalStatus === 'PENDING') {
      return;
    }
    
    if (projectId) {
      getProjectMessages(projectId);
    }
  }, [user, navigate, projectId, getProjectMessages]);

  useEffect(() => {
    if (socket && projectId) {
      // Connect to the specific project room
      socket.emit("join_project", projectId);

      const handleReceiveMsg = (msg) => {
        // Since we are in the room, any message received is for this project
        addMessage(msg);
      };

      socket.on('receive_project_message', handleReceiveMsg);

      const handleClear = () => {
         clearMessagesLocally();
      };
      socket.on('chat_cleared', handleClear);

      return () => {
        socket.off('receive_project_message', handleReceiveMsg);
        socket.off('chat_cleared', handleClear);
      };
    }
  }, [socket, projectId, addMessage]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = (e) => {
    e.preventDefault();
    if (!msgContent.trim() || !projectId) return;
    
    sendProjectMessage(projectId, msgContent, replyingTo?._id);
    setMsgContent('');
    setReplyingTo(null);
  };
  
  const handleClearChat = () => {
    if (window.confirm("Are you sure you want to completely clear this chat for everyone?")) {
        clearProjectChat(projectId);
    }
  };

  if (user?.role === 'USER' && user?.approvalStatus === 'PENDING') {
    return (
      <div className="auth-container">
        <div className="auth-box" style={{ textAlign: 'center' }}>
          <h2>Waiting for Approval</h2>
          <p style={{ marginTop: '20px', color: 'var(--text-secondary)' }}>Your account is waiting for admin approval.</p>
          <div style={{ marginTop: '30px' }}>
            <button className="btn btn-secondary" onClick={() => logout()}>Logout</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mobile-chat-wrapper" style={{ display: 'flex', height: '100vh', backgroundColor: 'var(--bg-primary)' }}>
      {/* Left Sidebar removed for full screen mode */}

      {/* FULL SCREEN CHAT AREA */}
      <div className="chat-main-area" style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#0B1120' }}>
        
        {/* Chat Header */}
        <div className="chat-header" style={{ padding: '16px 24px', borderBottom: '1px solid #243044', backgroundColor: '#0B1120', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ backgroundColor: 'rgba(37, 99, 235, 0.15)', color: '#2563eb', padding: '8px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <MessageSquare size={20} />
            </div>
            <div style={{ fontWeight: '600', fontSize: '18px', color: '#F8FAFC', letterSpacing: '0.3px', fontFamily: '"Inter", sans-serif' }}>
              ChatApp
            </div>
          </div>
          <div className="chat-header-icons" style={{ display: 'flex', gap: '8px', color: '#94A3B8' }}>
            <span className="icon-btn" title="Search" style={{ padding: '8px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#111827'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
              <Search size={18} />
            </span>
            <span className="icon-btn" title="Analytics" style={{ padding: '8px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#111827'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
              <BarChart3 size={18} />
            </span>
            <span className="icon-btn" title="Settings" style={{ padding: '8px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#111827'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
              <Settings size={18} />
            </span>
            {user?.role === 'ADMIN' && (
              <span className="icon-btn" style={{ padding: '8px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s', color: '#10B981' }} onClick={() => setShowTeamModal(true)} title="Manage Team" onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(16, 185, 129, 0.1)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                <Plus size={18} />
              </span>
            )}
            {user?.role === 'ADMIN' && (
              <span className="icon-btn" style={{ padding: '8px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s', color: '#EF4444' }} onClick={handleClearChat} title="Clear Chat" onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                <Trash2 size={18} />
              </span>
            )}
            <span className="icon-btn" style={{ padding: '8px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s', color: '#3B82F6' }} onClick={() => setShowActivityModal(true)} title="Activity" onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.1)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
              <UserCircle size={18} />
            </span>
          </div>
        </div>

            {/* Messages */}
            <div className="chat-messages" style={{ flex: 1, padding: '24px 32px', overflowY: 'auto' }}>
              {isMessagesLoading ? (
                <div style={{ textAlign: 'center', color: '#64748B', fontFamily: '"Inter", sans-serif', fontSize: '14px', marginTop: '20px' }}>Loading messages...</div>
              ) : (
                messages.map((msg, index) => {
                  const senderId = typeof msg.sender === 'object' ? msg.sender?._id : msg.sender;
                  const isMine = senderId === user._id;
                  
                  // Safe fallback parsing for incoming messages regardless of backend Mongoose population status
                  let senderDisplay = 'Teammate';
                  if (typeof msg.sender === 'object' && msg.sender?.email) {
                    senderDisplay = msg.sender.name || msg.sender.email.split('@')[0];
                  } else if (currentProject) {
                    const matchedMember = [currentProject.admin, ...(currentProject.collaborators || [])].find(m => m && (m._id === senderId || m === senderId));
                    if (matchedMember && typeof matchedMember === 'object' && matchedMember.email) {
                      senderDisplay = matchedMember.name || matchedMember.email.split('@')[0];
                    }
                  }

                  return (
                    <div key={index} style={{ display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start', marginBottom: '20px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', maxWidth: '65%' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', justifyContent: isMine ? 'flex-end' : 'flex-start' }}>
                          {!isMine && <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#2563EB' }} />}
                          <span style={{ fontSize: '12px', fontWeight: '600', color: '#94A3B8', fontFamily: '"Inter", sans-serif' }}>
                            {isMine ? (user.name || user.email.split('@')[0]) : senderDisplay}
                          </span>
                          <span style={{ fontSize: '11px', color: '#64748B', fontFamily: '"Inter", sans-serif' }}>
                            {new Date(msg.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                          </span>
                        </div>
                        <div className="chat-bubble relative group" style={{ 
                          background: isMine ? 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)' : '#151E2F', 
                          color: isMine ? '#ffffff' : '#F8FAFC',
                          padding: '12px 16px', 
                          borderRadius: isMine ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                          border: isMine ? 'none' : '1px solid #243044',
                          wordBreak: 'break-word',
                          lineHeight: '1.5',
                          fontSize: '15px',
                          fontFamily: '"Inter", sans-serif',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                          position: 'relative'
                        }}>
                          {/* Hover Reply Button */}
                          <div 
                            title="Reply"
                            onClick={() => setReplyingTo(msg)}
                            style={{
                              position: 'absolute',
                              top: '50%',
                              [isMine ? 'left' : 'right']: '-44px',
                              transform: 'translateY(-50%)',
                              width: '32px',
                              height: '32px',
                              borderRadius: '50%',
                              backgroundColor: '#111827',
                              border: '1px solid #243044',
                              display: 'flex',
                              justifyContent: 'center',
                              alignItems: 'center',
                              cursor: 'pointer',
                              opacity: 0,
                              visibility: 'hidden',
                              transition: 'opacity 0.2s, background-color 0.2s',
                              color: '#94A3B8'
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = '#F8FAFC'; e.currentTarget.style.backgroundColor = '#1E293B'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = '#94A3B8'; e.currentTarget.style.backgroundColor = '#111827'; }}
                            className="reply-btn"
                          >
                            <Reply size={14} />
                          </div>

                          {/* Reply Context Nested Block */}
                          {msg.replyTo && (() => {
                            const replySenderId = typeof msg.replyTo.sender === 'object' ? msg.replyTo.sender?._id : msg.replyTo.sender;
                            let replyDisplay = 'Teammate';
                            if (replySenderId === user._id) {
                              replyDisplay = 'You';
                            } else if (typeof msg.replyTo.sender === 'object' && msg.replyTo.sender?.email) {
                              replyDisplay = msg.replyTo.sender.name || msg.replyTo.sender.email.split('@')[0];
                            } else if (currentProject) {
                              const matchedMember = [currentProject.admin, ...(currentProject.collaborators || [])].find(m => m && (m._id === replySenderId || m === replySenderId));
                              if (matchedMember && typeof matchedMember === 'object' && matchedMember.email) {
                                replyDisplay = matchedMember.name || matchedMember.email.split('@')[0];
                              }
                            }
                            return (
                            <div style={{
                              backgroundColor: isMine ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.25)',
                              borderLeft: `3px solid ${isMine ? '#93C5FD' : '#2563EB'}`,
                              padding: '8px 12px',
                              borderRadius: '6px',
                              marginBottom: '10px',
                              fontSize: '13px'
                            }}>
                              <div style={{ fontWeight: '600', color: isMine ? '#BFDBFE' : '#60A5FA', marginBottom: '2px' }}>
                                {replyDisplay}
                              </div>
                              <div style={{ color: isMine ? '#E0F2FE' : '#94A3B8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {msg.replyTo.content}
                              </div>
                            </div>
                            );
                          })()}
                          
                          {msg.content}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="chat-input-wrapper" style={{ padding: '0 32px 24px', backgroundColor: '#0B1120' }}>
              
              {/* Replying Preview Box */}
              {replyingTo && (() => {
                  const replyPreviewSenderId = typeof replyingTo.sender === 'object' ? replyingTo.sender?._id : replyingTo.sender;
                  let replyPreviewDisplay = 'Teammate';
                  if (replyPreviewSenderId === user._id) {
                    replyPreviewDisplay = 'yourself';
                  } else if (typeof replyingTo.sender === 'object' && replyingTo.sender?.email) {
                    replyPreviewDisplay = replyingTo.sender.name || replyingTo.sender.email.split('@')[0];
                  } else if (currentProject) {
                    const matchedMember = [currentProject.admin, ...(currentProject.collaborators || [])].find(m => m && m._id === replyPreviewSenderId);
                    if (matchedMember) replyPreviewDisplay = matchedMember.name || matchedMember.email.split('@')[0];
                  }
                  
                  return (
                <div className="animate-fade-in" style={{ backgroundColor: '#111827', padding: '12px 20px', borderRadius: '16px 16px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: '4px solid #2563EB', borderTop: '1px solid #243044', borderRight: '1px solid #243044' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '13px', fontWeight: '600', color: '#3B82F6', fontFamily: '"Inter", sans-serif' }}>
                      Replying to {replyPreviewDisplay}
                    </span>
                    <span style={{ fontSize: '13px', color: '#94A3B8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '300px', fontFamily: '"Inter", sans-serif' }}>
                      {replyingTo.content}
                    </span>
                  </div>
                  <X size={18} onClick={() => setReplyingTo(null)} style={{ color: '#94A3B8', cursor: 'pointer' }} />
                </div>
                );
              })()}

              <form onSubmit={handleSend} style={{ backgroundColor: '#111827', display: 'flex', gap: '16px', alignItems: 'center', padding: '12px 16px', borderRadius: replyingTo ? '0 0 16px 16px' : '100px', border: '1px solid #243044', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)', transition: 'all 0.2s' }}>
                <span className="icon-btn" title="Emoji" style={{ color: '#64748B', cursor: 'pointer', padding: '6px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }} onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#1E293B'; e.currentTarget.style.color = '#94A3B8'; }} onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#64748B'; }}>
                  <Smile size={20} />
                </span>
                <span className="icon-btn" title="Add Media" style={{ color: '#64748B', cursor: 'pointer', padding: '6px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }} onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#1E293B'; e.currentTarget.style.color = '#94A3B8'; }} onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#64748B'; }}>
                  <ImageIcon size={20} />
                </span>
                <input 
                  type="text" 
                  value={msgContent}
                  onChange={(e) => setMsgContent(e.target.value)}
                  placeholder="Message the collaborative space..." 
                  style={{ 
                    flex: 1, 
                    backgroundColor: 'transparent', 
                    border: 'none', 
                    color: '#F8FAFC',
                    fontSize: '15px',
                    fontFamily: '"Inter", sans-serif',
                    outline: 'none',
                    padding: '4px 0'
                  }} 
                />
                <button type="submit" disabled={!msgContent.trim()} style={{ 
                  backgroundColor: msgContent.trim() ? '#2563EB' : '#1E293B', 
                  color: msgContent.trim() ? 'white' : '#64748B', 
                  border: 'none', 
                  width: '40px', 
                  height: '40px', 
                  borderRadius: '50%',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  cursor: msgContent.trim() ? 'pointer' : 'default',
                  transition: 'background-color 0.2s, box-shadow 0.2s',
                  boxShadow: msgContent.trim() ? '0 2px 8px rgba(37, 99, 235, 0.4)' : 'none'
                }}>
                  <SendIcon size={18} style={{ marginLeft: '2px' }} />
                </button>
              </form>
            </div>
      </div>

      {/* TEAM MODAL OVERLAY */}
      {showTeamModal && <TeamModal onClose={() => setShowTeamModal(false)} />}
      
      {/* ACTIVITY MODAL OVERLAY */}
      {showActivityModal && <ActiveMembersModal onClose={() => setShowActivityModal(false)} project={currentProject} />}
    </div>
  );
};

export default ChatApp;
