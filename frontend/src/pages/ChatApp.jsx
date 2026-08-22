import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { useProjectStore } from '../store/projectStore';
import { Search, BarChart3, Settings, Smile, Image as ImageIcon, Send as SendIcon, MessageSquare, UserCircle, Plus, Trash2, X, Reply, MoreVertical, Pencil, Check, CheckCheck, Clock } from 'lucide-react';
import TeamModal from '../components/TeamModal';
import ActiveMembersModal from '../components/ActiveMembersModal';
import EmojiPicker from 'emoji-picker-react';

const playNotificationSound = () => {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(800, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.15);
    } catch (e) {
        console.error(e);
    }
};

const ChatApp = () => {
  const { user, logout, socket, onlineUsers } = useAuthStore();
  const { messages, isMessagesLoading, getProjectMessages, sendProjectMessage, addMessage, clearProjectChat, clearMessagesLocally, updateMessage, deleteMessageLocally, updateMessageStatus, updateProjectMessagesStatus } = useChatStore();
  const { projects, fetchProjects } = useProjectStore();
  const navigate = useNavigate();
  const { projectId } = useParams();
  const [msgContent, setMsgContent] = useState('');
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showImageLightbox, setShowImageLightbox] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 1024);
  const [editingMessage, setEditingMessage] = useState(null);
  const [typingUsers, setTypingUsers] = useState(new Map());
  const [reactionMsgId, setReactionMsgId] = useState(null);
  const [activeMenuMsgId, setActiveMenuMsgId] = useState(null);
  const activeMenuRef = useRef(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const pressTimer = useRef(null);
  const isTypingRef = useRef(false);
  const typingTimeoutRef = useRef(null);
  const textareaRef = useRef(null);
  
  const currentProject = projects.find(p => p._id === projectId);

  const [permission, setPermission] = useState(window.Notification?.permission);

  useEffect(() => {
     if (activeMenuMsgId && activeMenuRef.current) {
        const menu = activeMenuRef.current;
        const bubble = document.getElementById(`msg-bubble-${activeMenuMsgId}`);
        if (!bubble || !menu) return;

        const bubbleRect = bubble.getBoundingClientRect();
        const menuRect = menu.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
        
        const isMine = bubble.dataset.ismine === 'true';

        let menuTop = bubbleRect.bottom + 4;
        let menuLeft = isMine ? bubbleRect.right - menuRect.width : bubbleRect.left;

        const chatInput = document.querySelector('.chat-input-wrapper');
        const inputTop = chatInput ? chatInput.getBoundingClientRect().top : viewportHeight;
        
        let spaceBelow = inputTop - bubbleRect.bottom;
        let spaceAbove = bubbleRect.top;

        if (menuTop + menuRect.height > inputTop) {
            if (spaceAbove > menuRect.height + 4) {
                menuTop = bubbleRect.top - menuRect.height - 4;
            } else {
                menuTop = Math.max(0, inputTop - menuRect.height - 4);
            }
        }
        
        if (menuTop < 4) menuTop = 4;
        if (menuLeft < 4) menuLeft = 4;
        if (menuLeft + menuRect.width > viewportWidth - 4) {
           menuLeft = viewportWidth - menuRect.width - 4;
        }

        requestAnimationFrame(() => {
            menu.style.top = `${menuTop}px`;
            menu.style.left = `${menuLeft}px`;
            menu.style.opacity = '1';
            menu.style.visibility = 'visible';
            menu.style.transform = 'scale(1)';
        });
     }
  }, [activeMenuMsgId]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 1024);
    window.addEventListener('resize', handleResize);
    if (window.Notification?.permission === 'granted') {
        import('../utils/pushService').then(({ subscribeToPushNotifications }) => {
            subscribeToPushNotifications();
        });
    }
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleEnablePush = async () => {
      const p = await Notification.requestPermission();
      setPermission(p);
      if (p === 'granted') {
          const { subscribeToPushNotifications } = await import('../utils/pushService');
          subscribeToPushNotifications();
      }
  };

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
      socket.emit("project_messages_seen", { projectId, userId: user._id });

      const handleReceiveMsg = (msg) => {
        // Since we are in the room, any message received is for this project
        addMessage(msg);
        
        // Push Notification & Sound if not the sender
        const incomingSenderId = typeof msg.sender === 'object' ? msg.sender?._id : msg.sender;
        if (incomingSenderId !== user._id) {
            socket.emit("project_message_delivered", { messageId: msg._id, projectId, receiverId: user._id });
            socket.emit("project_messages_seen", { projectId, userId: user._id });
            playNotificationSound();
            if (Notification.permission === 'granted') {
                let senderDisplay = 'Teammate';
                if (typeof msg.sender === 'object' && msg.sender?.name) senderDisplay = msg.sender.name;
                
                if (navigator.serviceWorker) {
                    navigator.serviceWorker.ready.then(reg => {
                        reg.showNotification(`New message from ${senderDisplay}`, {
                            body: msg.messageType === 'IMAGE' ? '📷 Image' : msg.content,
                            icon: '/favicon.svg',
                            badge: '/favicon.svg',
                            requireInteraction: false
                        });
                    });
                } else {
                    const notification = new Notification(`New message from ${senderDisplay}`, {
                        body: msg.messageType === 'IMAGE' ? '📷 Image' : msg.content,
                        icon: '/favicon.svg',
                        requireInteraction: false
                    });
                    notification.onclick = () => { window.focus(); notification.close(); };
                }
            }
        }
      };

      socket.on('receive_project_message', handleReceiveMsg);

      const handleClear = () => {
         clearMessagesLocally();
      };
      const handleMessageEdited = (msg) => updateMessage(msg);
      const handleMessageDeleted = ({messageId}) => deleteMessageLocally(messageId);
      const handleReactionUpdated = (msg) => updateMessage(msg);
      const handleStatusUpdate = ({messageId, status}) => updateMessageStatus(messageId, status);
      const handleProjectRead = ({readerId}) => updateProjectMessagesStatus(projectId, 'READ', readerId);
      const handleDisplayTyping = ({senderId, name}) => senderId !== user._id && setTypingUsers(prev => new Map(prev).set(senderId, name));
      const handleHideTyping = ({senderId}) => {
          setTypingUsers(prev => {
              const newMap = new Map(prev);
              newMap.delete(senderId);
              return newMap;
          });
      };

      socket.on('chat_cleared', handleClear);
      socket.on('message_edited', handleMessageEdited);
      socket.on('message_deleted', handleMessageDeleted);
      socket.on('message_reaction_updated', handleReactionUpdated);
      socket.on('message_status_update', handleStatusUpdate);
      socket.on('project_status_read', handleProjectRead);
      socket.on('display_typing_project', handleDisplayTyping);
      socket.on('hide_typing_project', handleHideTyping);

      return () => {
        socket.off('receive_project_message', handleReceiveMsg);
        socket.off('chat_cleared', handleClear);
        socket.off('message_edited', handleMessageEdited);
        socket.off('message_deleted', handleMessageDeleted);
        socket.off('message_reaction_updated', handleReactionUpdated);
        socket.off('message_status_update', handleStatusUpdate);
        socket.off('project_status_read', handleProjectRead);
        socket.off('display_typing_project', handleDisplayTyping);
        socket.off('hide_typing_project', handleHideTyping);
      };
    }
  }, [socket, projectId, addMessage, updateMessage, deleteMessageLocally, updateMessageStatus, updateProjectMessagesStatus, user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typingUsers]);

  const handleTyping = (e) => {
      setMsgContent(e.target.value);
      
      if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
          const newHeight = Math.min(textareaRef.current.scrollHeight, isMobile ? 120 : 160);
          textareaRef.current.style.height = `${newHeight}px`;
      }

      if (socket && projectId) {
          if (!isTypingRef.current) {
              isTypingRef.current = true;
              socket.emit("typing_project", { senderId: user._id, projectId, name: user.name || user.email.split('@')[0] });
          }
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = setTimeout(() => {
              isTypingRef.current = false;
              socket.emit("stop_typing_project", { senderId: user._id, projectId });
          }, 1500);
      }
  };

  const handleSend = (e) => {
    e.preventDefault();
    if (!msgContent.trim() || !projectId) return;
    
    if (editingMessage) {
        socket.emit("edit_project_message", { messageId: editingMessage._id, senderId: user._id, newContent: msgContent, projectId });
        setEditingMessage(null);
    } else {
        sendProjectMessage(projectId, msgContent, replyingTo?._id, 'TEXT');
    }
    
    setMsgContent('');
    setReplyingTo(null);
    setShowEmojiPicker(false);
    if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'; // Reset back
    }
    
    if (socket && typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        socket.emit("stop_typing_project", { senderId: user._id, projectId });
    }
  };

  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) return alert('File is too large! Maximum 20MB.');
    
    const reader = new FileReader();
    reader.onload = (event) => {
       const base64String = event.target.result;
       sendProjectMessage(projectId, base64String, replyingTo?._id, 'IMAGE');
       setReplyingTo(null);
    };
    reader.readAsDataURL(file);
    e.target.value = ''; // reset so same file can be chosen again
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
    <div className="mobile-chat-wrapper" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-primary)' }}>
      {/* Left Sidebar removed for full screen mode */}

      {/* FULL SCREEN CHAT AREA */}
      <div className="chat-main-area" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', backgroundColor: '#0B1120', overflow: 'hidden' }}>
        
        {/* Chat Header */}
        <div className="chat-header" style={{ flexShrink: 0, position: 'relative', zIndex: 50, padding: '16px 24px', borderBottom: '1px solid #243044', backgroundColor: '#0B1120', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ backgroundColor: 'rgba(37, 99, 235, 0.15)', color: '#2563eb', padding: '8px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <MessageSquare size={20} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontWeight: '600', fontSize: '16px', color: '#F8FAFC', letterSpacing: '0.3px', fontFamily: '"Inter", sans-serif' }}>
                 {currentProject ? currentProject.name : 'ChatApp'}
              </span>
              <span style={{ fontSize: '12px', color: '#94A3B8', fontFamily: '"Inter", sans-serif' }}>
                {(() => {
                    const typingStr = Array.from(typingUsers.values()).join(', ');
                    if (typingStr) return <span style={{ color: '#25D366', fontStyle: 'italic' }}>{typingStr} typing...</span>;
                    if (!currentProject) return 'Offline';
                    const otherMembers = [currentProject.admin, ...(currentProject.collaborators || [])].filter(m => m && (m._id || m) !== user._id);
                    const onlineCount = otherMembers.filter(m => onlineUsers.includes(m._id || m)).length;
                    return onlineCount > 0 ? (otherMembers.length === 1 ? 'Online' : `${onlineCount} member(s) online`) : 'Offline';
                })()}
              </span>
            </div>
          </div>
          {isMobile ? (
            <div className="mobile-header-menu" style={{ position: 'relative' }}>
              <span className="icon-btn" style={{ padding: '8px', borderRadius: '8px', cursor: 'pointer', display: 'flex', color: '#94A3B8' }} aria-label="Menu" aria-expanded={showMobileMenu} onClick={() => setShowMobileMenu(!showMobileMenu)}>
                <MoreVertical size={20} />
              </span>
              {showMobileMenu && (
                <>
                  <div 
                    style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 40 }} 
                    onClick={() => setShowMobileMenu(false)}
                  />
                  <div style={{ position: 'absolute', top: '100%', right: '0', backgroundColor: '#111827', border: '1px solid #243044', borderRadius: '8px', padding: '8px', display: 'flex', flexDirection: 'column', gap: '4px', zIndex: 50, minWidth: '180px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', cursor: 'pointer', color: '#94A3B8', borderRadius: '6px', transition: 'background-color 0.2s' }} onClick={() => setShowMobileMenu(false)}>
                      <Search size={18} />
                      <span style={{ fontSize: '14px', fontWeight: '500', fontFamily: '"Inter", sans-serif' }}>Search</span>
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', cursor: 'pointer', color: '#94A3B8', borderRadius: '6px', transition: 'background-color 0.2s' }} onClick={() => setShowMobileMenu(false)}>
                      <BarChart3 size={18} />
                      <span style={{ fontSize: '14px', fontWeight: '500', fontFamily: '"Inter", sans-serif' }}>Analytics</span>
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', cursor: 'pointer', color: '#94A3B8', borderRadius: '6px', transition: 'background-color 0.2s' }} onClick={() => setShowMobileMenu(false)}>
                      <Settings size={18} />
                      <span style={{ fontSize: '14px', fontWeight: '500', fontFamily: '"Inter", sans-serif' }}>Settings</span>
                    </div>
                    
                    {user?.role === 'ADMIN' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', cursor: 'pointer', color: '#10B981', borderRadius: '6px', transition: 'background-color 0.2s' }} onClick={() => { setShowTeamModal(true); setShowMobileMenu(false); }}>
                        <Plus size={18} />
                        <span style={{ fontSize: '14px', fontWeight: '500', fontFamily: '"Inter", sans-serif' }}>New/Add</span>
                      </div>
                    )}
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', cursor: 'pointer', color: '#EF4444', borderRadius: '6px', transition: 'background-color 0.2s' }} onClick={() => { handleClearChat(); setShowMobileMenu(false); }}>
                      <Trash2 size={18} />
                      <span style={{ fontSize: '14px', fontWeight: '500', fontFamily: '"Inter", sans-serif' }}>Delete</span>
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', cursor: 'pointer', color: '#3B82F6', borderRadius: '6px', transition: 'background-color 0.2s' }} onClick={() => { setShowActivityModal(true); setShowMobileMenu(false); }}>
                      <UserCircle size={18} />
                      <span style={{ fontSize: '14px', fontWeight: '500', fontFamily: '"Inter", sans-serif' }}>Profile</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="desktop-header-menu" style={{ display: 'flex', gap: '8px', color: '#94A3B8' }}>
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
              <span className="icon-btn" style={{ padding: '8px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s', color: '#EF4444' }} onClick={handleClearChat} title="Clear Chat" onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                <Trash2 size={18} />
              </span>
              <span className="icon-btn" style={{ padding: '8px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s', color: '#3B82F6' }} onClick={() => setShowActivityModal(true)} title="Activity" onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.1)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                <UserCircle size={18} />
              </span>
            </div>
          )}
        </div>

        {permission === 'default' && (
          <div style={{ padding: '12px 16px', backgroundColor: 'rgba(37, 211, 102, 0.1)', color: '#25D366', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, borderBottom: '1px solid #1e293b' }}>
            <span style={{ fontSize: '13px', flex: 1, marginRight: '12px' }}>Enable notifications to receive new encrypted messages even when the app is closed.</span>
            <button onClick={handleEnablePush} style={{ backgroundColor: '#25D366', color: '#000', padding: '6px 12px', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '600', fontSize: '12px', flexShrink: 0 }}>Enable</button>
          </div>
        )}

            {/* Messages */}
            <div className="chat-messages" onScroll={() => activeMenuMsgId && setActiveMenuMsgId(null)} style={{ flex: 1, minHeight: 0, padding: '24px 32px', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
              {React.useMemo(() => {
                if (isMessagesLoading) {
                  return <div style={{ textAlign: 'center', color: '#64748B', fontFamily: '"Inter", sans-serif', fontSize: '14px', marginTop: '20px' }}>Loading messages...</div>;
                }
                return messages.map((msg, index) => {
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

                  const handleTouchStart = (e) => {
                    e.currentTarget.style.transition = 'none';
                    e.currentTarget.dataset.startX = e.touches[0].clientX;
                    e.currentTarget.dataset.swiping = 'true';
                  };

                  const handleTouchMove = (e) => {
                    if (e.currentTarget.dataset.swiping !== 'true') return;
                    const startX = parseFloat(e.currentTarget.dataset.startX);
                    const currentX = e.touches[0].clientX;
                    const diffX = currentX - startX;
                    
                    // Only apply right-swiping up to 80px
                    if (diffX > 0 && diffX < 80) {
                       e.currentTarget.style.transform = `translateX(${diffX}px)`;
                       const icon = e.currentTarget.querySelector('.swipe-reply-icon');
                       if (icon) {
                         icon.style.opacity = Math.min(diffX / 50, 1);
                       }
                    }
                  };

                  const handleTouchEnd = (e, msg) => {
                    e.currentTarget.dataset.swiping = 'false';
                    const startX = parseFloat(e.currentTarget.dataset.startX);
                    const endX = e.changedTouches[0].clientX;
                    const diffX = endX - startX;

                    e.currentTarget.style.transition = 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)';
                    e.currentTarget.style.transform = `translateX(0px)`;
                    
                    const icon = e.currentTarget.querySelector('.swipe-reply-icon');
                    if (icon) {
                       icon.style.transition = 'opacity 0.3s ease-out';
                       icon.style.opacity = 0;
                    }

                    if (diffX > 50) {
                      setReplyingTo(msg);
                    }
                    
                    setTimeout(() => {
                        if (e.currentTarget) e.currentTarget.style.transition = '';
                        if (icon) icon.style.transition = '';
                    }, 300);
                  };

                  const handleBubbleTouchStart = (e) => {
                      pressTimer.current = setTimeout(() => {
                           setActiveMenuMsgId(msg._id);
                           if (window.navigator && window.navigator.vibrate) window.navigator.vibrate(50);
                      }, 500);
                  };
                  const handleBubbleTouchEnd = () => {
                      if (pressTimer.current) clearTimeout(pressTimer.current);
                  };

                  return (
                    <div key={index} style={{ display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start', marginBottom: '20px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', maxWidth: '65%' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', justifyContent: isMine ? 'flex-end' : 'flex-start' }}>
                          {!isMine && <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#2563EB' }} />}
                          <span style={{ fontSize: '12px', fontWeight: '600', color: '#94A3B8', fontFamily: '"Inter", sans-serif' }}>
                            {isMine ? (user.name || user.email.split('@')[0]) : senderDisplay}
                          </span>
                          <span style={{ fontSize: '11px', color: '#64748B', fontFamily: '"Inter", sans-serif', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            {new Date(msg.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                            {isMine && (
                                msg.status === 'SENDING' ? <Clock size={12} opacity={0.6} /> :
                                msg.status === 'READ' ? <CheckCheck size={14} color="#60A5FA" /> :
                                msg.status === 'DELIVERED' ? <CheckCheck size={14} color="#94A3B8" /> :
                                <Check size={14} color="#94A3B8" />
                            )}
                          </span>
                        </div>
                        
                        {/* Interactive message row container */}
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                          
                          {/* Swipe to reply icon indicator */}
                          <div className="swipe-reply-icon" style={{ 
                            position: 'absolute', 
                            left: '-30px', 
                            opacity: 0, 
                            color: '#e2e8f0', 
                            backgroundColor: '#2563EB',
                            borderRadius: '50%',
                            padding: '4px',
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center'
                          }}>
                            <Reply size={14} />
                          </div>

                          <div id={`msg-bubble-${msg._id}`} data-ismine={Boolean(isMine)} className="chat-bubble relative group" 
                            onTouchStart={(e) => { handleTouchStart(e); handleBubbleTouchStart(e); }}
                            onTouchMove={(e) => { handleTouchMove(e); handleBubbleTouchEnd(e); }}
                            onTouchEnd={(e) => { handleTouchEnd(e, msg); handleBubbleTouchEnd(e); }}
                            onTouchCancel={handleBubbleTouchEnd}
                            onContextMenu={(e) => { if (isMobile) { e.preventDefault(); setActiveMenuMsgId(msg._id); } }}
                            style={{ 
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
                            position: 'relative',
                            userSelect: 'none', // Prevent text selection on mobile swipe
                            width: '100%',
                            zIndex: 2
                          }}>
                            {/* Hover Actions Menu Desktop/Mobile */}
                            <div 
                              style={{
                                position: 'absolute',
                                top: '50%',
                                [isMine ? 'left' : 'right']: isMine ? (msg.deleted ? '-70px' : '-130px') : '-70px',
                                transform: 'translateY(-50%)',
                                display: 'flex',
                                gap: '6px',
                                opacity: 0,
                                visibility: 'hidden',
                                transition: 'opacity 0.2s',
                              }}
                              className="md-show-on-hover"
                            >
                                <div title="React" onClick={() => setReactionMsgId(reactionMsgId === msg._id ? null : msg._id)} style={{ width: '30px', height: '30px', borderRadius: '50%', backgroundColor: '#111827', border: '1px solid #243044', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', color: '#94A3B8' }} onMouseEnter={e => { e.currentTarget.style.color = '#F8FAFC'; e.currentTarget.style.backgroundColor = '#1E293B'; }} onMouseLeave={e => { e.currentTarget.style.color = '#94A3B8'; e.currentTarget.style.backgroundColor = '#111827'; }}><Smile size={14} /></div>
                                {!msg.deleted && <div title="Reply" onClick={() => setReplyingTo(msg)} style={{ width: '30px', height: '30px', borderRadius: '50%', backgroundColor: '#111827', border: '1px solid #243044', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', color: '#94A3B8' }} onMouseEnter={e => { e.currentTarget.style.color = '#F8FAFC'; e.currentTarget.style.backgroundColor = '#1E293B'; }} onMouseLeave={e => { e.currentTarget.style.color = '#94A3B8'; e.currentTarget.style.backgroundColor = '#111827'; }}><Reply size={14} /></div>}
                                {isMine && !msg.deleted && msg.messageType === 'TEXT' && <div title="Edit" onClick={() => { setEditingMessage(msg); setMsgContent(msg.content); }} style={{ width: '30px', height: '30px', borderRadius: '50%', backgroundColor: '#111827', border: '1px solid #243044', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', color: '#94A3B8' }} onMouseEnter={e => { e.currentTarget.style.color = '#F8FAFC'; e.currentTarget.style.backgroundColor = '#1E293B'; }} onMouseLeave={e => { e.currentTarget.style.color = '#94A3B8'; e.currentTarget.style.backgroundColor = '#111827'; }}><Pencil size={14} /></div>}
                                {isMine && !msg.deleted && <div title="Delete" onClick={() => { if(window.confirm('Delete message for everyone?')) socket.emit("delete_project_message", { messageId: msg._id, senderId: user._id, projectId }); }} style={{ width: '30px', height: '30px', borderRadius: '50%', backgroundColor: '#111827', border: '1px solid #243044', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', color: '#94A3B8' }} onMouseEnter={e => { e.currentTarget.style.color = '#EF4444'; e.currentTarget.style.backgroundColor = '#1E293B'; }} onMouseLeave={e => { e.currentTarget.style.color = '#94A3B8'; e.currentTarget.style.backgroundColor = '#111827'; }}><Trash2 size={14} /></div>}
                            </div>
                            
                            {/* Mobile Long Press Menu */}
                            {activeMenuMsgId === msg._id && isMobile && (
                                <>
                                  <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 }} onClick={() => setActiveMenuMsgId(null)} onTouchStart={() => setActiveMenuMsgId(null)} />
                                  <div 
                                    ref={activeMenuRef}
                                    style={{ 
                                      position: 'fixed', 
                                      opacity: 0, 
                                      visibility: 'hidden',
                                      backgroundColor: '#111827', 
                                      border: '1px solid #243044', 
                                      borderRadius: '8px', 
                                      padding: '8px', 
                                      display: 'flex', 
                                      flexDirection: 'column', 
                                      gap: '4px', 
                                      zIndex: 101, 
                                      boxShadow: '0 4px 12px rgba(0,0,0,0.5)', 
                                      minWidth: '180px', 
                                      maxWidth: 'calc(100vw - 24px)', 
                                      maxHeight: '400px', 
                                      overflowY: 'auto',
                                      transform: 'scale(0.95)',
                                      transition: 'opacity 0.15s ease-out, transform 0.15s ease-out'
                                    }}>
                                      <div title="React" onClick={() => { setReactionMsgId(reactionMsgId === msg._id ? null : msg._id); setActiveMenuMsgId(null); }} style={{ color: '#94A3B8', padding: '12px 10px', display: 'flex', alignItems: 'center', gap: '12px', fontSize: '15px' }}><Smile size={20} /> React</div>
                                      {!msg.deleted && <div title="Reply" onClick={() => { setReplyingTo(msg); setActiveMenuMsgId(null); }} style={{ color: '#94A3B8', padding: '12px 10px', display: 'flex', alignItems: 'center', gap: '12px', fontSize: '15px' }}><Reply size={20} /> Reply</div>}
                                      {isMine && !msg.deleted && msg.messageType === 'TEXT' && <div title="Edit" onClick={() => { setEditingMessage(msg); setMsgContent(msg.content); setActiveMenuMsgId(null); }} style={{ color: '#94A3B8', padding: '12px 10px', display: 'flex', alignItems: 'center', gap: '12px', fontSize: '15px' }}><Pencil size={20} /> Edit</div>}
                                      
                                      <div style={{ height: '1px', backgroundColor: '#243044', margin: '4px 0' }} />
                                      <div title="Delete for me" onClick={() => { setActiveMenuMsgId(null); useChatStore.getState().removeMessageFromUI(msg._id); }} style={{ color: '#EF4444', padding: '12px 10px', display: 'flex', alignItems: 'center', gap: '12px', fontSize: '15px' }}><Trash2 size={20} /> Delete for me</div>
                                      {isMine && !msg.deleted && <div title="Delete for everyone" onClick={() => { setActiveMenuMsgId(null); if(window.confirm('Delete message for everyone?')) socket.emit("delete_project_message", { messageId: msg._id, senderId: user._id, projectId }); }} style={{ color: '#EF4444', padding: '12px 10px', display: 'flex', alignItems: 'center', gap: '12px', fontSize: '15px' }}><Trash2 size={20} /> Delete for everyone</div>}
                                  </div>
                                </>
                            )}

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
                            
                            {msg.deleted ? (
                                <div style={{ fontStyle: 'italic', color: isMine ? 'rgba(255,255,255,0.7)' : '#94A3B8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Trash2 size={14} opacity={0.6}/> This message was deleted
                                </div>
                            ) : msg.messageType === 'IMAGE' ? (
                                <img src={msg.content} alt="Shared UI" draggable={false} style={{ maxWidth: '280px', maxHeight: '280px', borderRadius: '8px', cursor: 'pointer', display: 'block' }} onClick={() => setShowImageLightbox(msg.content)} />
                            ) : (
                                msg.content
                            )}

                            {msg.edited && !msg.deleted && <span style={{ fontSize: '11px', marginLeft: '6px', opacity: 0.7 }}>(edited)</span>}

                            {/* Reactions */}
                            {msg.reactions && msg.reactions.length > 0 && (
                                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '6px' }}>
                                    {Object.entries(msg.reactions.reduce((acc, r) => { acc[r.reaction] = (acc[r.reaction] || 0) + 1; return acc; }, {})).map(([emoji, count]) => (
                                        <div key={emoji} onClick={() => { if (user) socket.emit("project_message_reaction", { messageId: msg._id, userId: user._id, reaction: emoji, projectId }); }} style={{ backgroundColor: 'rgba(0,0,0,0.2)', padding: '2px 6px', borderRadius: '12px', fontSize: '12px', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.1)' }}>
                                            {emoji} {count}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Reaction Picker Overlay */}
                            {reactionMsgId === msg._id && (
                                <div style={{ position: 'absolute', [isMine ? 'right' : 'left']: '0', top: '100%', zIndex: 10, marginTop: '4px', filter: 'drop-shadow(0 10px 15px rgba(0,0,0,0.5))' }}>
                                    <EmojiPicker theme="dark" onEmojiClick={(e) => { socket.emit("project_message_reaction", { messageId: msg._id, userId: user._id, reaction: e.emoji, projectId }); setReactionMsgId(null); }} width={260} height={350} searchDisabled />
                                </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                });
              }, [messages, isMessagesLoading, user, currentProject, isMobile, activeMenuMsgId, reactionMsgId, projectId])}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="chat-input-wrapper" style={{ flexShrink: 0, padding: '0 32px', paddingBottom: 'max(24px, env(safe-area-inset-bottom, 24px))', paddingTop: '10px', backgroundColor: '#0B1120' }}>
              
              {/* Pre-input States (Editing/Replying) */}
              {editingMessage ? (
                <div className="animate-fade-in" style={{ backgroundColor: '#111827', padding: '12px 20px', borderRadius: '16px 16px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: '4px solid #10B981', borderTop: '1px solid #243044', borderRight: '1px solid #243044' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '13px', fontWeight: '600', color: '#10B981', fontFamily: '"Inter", sans-serif', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Pencil size={14}/> Editing Message
                    </span>
                    <span style={{ fontSize: '13px', color: '#94A3B8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '300px', fontFamily: '"Inter", sans-serif' }}>
                      {editingMessage.content}
                    </span>
                  </div>
                  <X size={18} onClick={() => { setEditingMessage(null); setMsgContent(''); }} style={{ color: '#94A3B8', cursor: 'pointer' }} />
                </div>
              ) : replyingTo ? (() => {
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
              })() : null}

              <div style={{ position: 'relative' }}>
                  {showEmojiPicker && (
                    <div style={{ position: 'absolute', bottom: '60px', left: '0', zIndex: 50 }}>
                        <EmojiPicker theme="dark" onEmojiClick={(e) => setMsgContent(msgContent + e.emoji)} />
                    </div>
                  )}
                  <form onSubmit={handleSend} style={{ backgroundColor: '#111827', display: 'flex', gap: '16px', alignItems: 'center', padding: '12px 16px', borderRadius: replyingTo ? '0 0 16px 16px' : '100px', border: '1px solid #243044', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)', transition: 'all 0.2s' }}>
                    <span className="icon-btn" onClick={() => setShowEmojiPicker(!showEmojiPicker)} title="Emoji" style={{ color: '#64748B', cursor: 'pointer', padding: '6px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }} onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#1E293B'; e.currentTarget.style.color = '#94A3B8'; }} onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#64748B'; }}>
                      <Smile size={20} />
                    </span>
                    <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageSelect} style={{ display: 'none' }} />
                    <span className="icon-btn" onClick={() => fileInputRef.current?.click()} title="Add Media" style={{ color: '#64748B', cursor: 'pointer', padding: '6px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }} onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#1E293B'; e.currentTarget.style.color = '#94A3B8'; }} onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#64748B'; }}>
                      <ImageIcon size={20} />
                    </span>
                <textarea 
                  ref={textareaRef}
                  value={msgContent}
                  onChange={handleTyping}
                  placeholder="Message the collaborative space..." 
                  onKeyDown={(e) => {
                     if (e.key === 'Enter' && !e.shiftKey) {
                         e.preventDefault();
                         handleSend(e);
                     }
                  }}
                  style={{ 
                    flex: 1, 
                    backgroundColor: 'transparent', 
                    border: 'none', 
                    color: '#F8FAFC',
                    fontSize: '15px',
                    fontFamily: '"Inter", sans-serif',
                    outline: 'none',
                    padding: '8px 0',
                    resize: 'none',
                    maxHeight: isMobile ? '120px' : '160px',
                    overflowY: 'auto'
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
      </div>

      {/* TEAM MODAL OVERLAY */}
      {showTeamModal && <TeamModal onClose={() => setShowTeamModal(false)} />}
      
      {/* ACTIVITY MODAL OVERLAY */}
      {showActivityModal && <ActiveMembersModal onClose={() => setShowActivityModal(false)} project={currentProject} />}
      
      {/* IMAGE LIGHTBOX OVERLAY */}
      {showImageLightbox && (
          <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.9)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <X size={32} style={{ position: 'absolute', top: '24px', right: '24px', color: 'white', cursor: 'pointer' }} onClick={() => setShowImageLightbox(null)} />
              <img src={showImageLightbox} style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain' }} alt="Lightbox" />
          </div>
      )}
    </div>
  );
};

export default ChatApp;
