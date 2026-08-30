import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { useProjectStore } from '../store/projectStore';
import { Search, BarChart3, Settings, Smile, Image as ImageIcon, Send as SendIcon, MessageSquare, UserCircle, Plus, Trash2, X, Reply, MoreVertical, Pencil, Check, CheckCheck, Clock, Lock, ChevronDown, RefreshCcw } from 'lucide-react';
import TeamModal from '../components/TeamModal';
import ActiveMembersModal from '../components/ActiveMembersModal';
import EmojiPicker from 'emoji-picker-react';
import { useVoiceCallStore } from '../store/voiceCallStore';
import IncomingCallModal from '../components/voice/IncomingCallModal';
import ActiveCallOverlay from '../components/voice/ActiveCallOverlay';
import VoiceCallButton from '../components/voice/VoiceCallButton';
import CallRecordBubble from '../components/voice/CallRecordBubble';

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

const renderMessageContent = (content) => {
    if (!content) return null;
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = content.split(urlRegex);
    return parts.map((part, i) => {
        if (part.match(urlRegex)) {
            return (
                <a key={i} href={part} target="_blank" rel="noopener noreferrer" style={{ color: '#60A5FA', textDecoration: 'underline', wordBreak: 'break-all', overflowWrap: 'anywhere' }} onClick={(e) => e.stopPropagation()}>
                    {part}
                </a>
            );
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
    });
};


const formatLastSeen = (dateInput) => {
    if (!dateInput) return 'Offline';
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return 'Offline';
    const now = new Date();
    const diffMs = now - date;
    const diffMin = Math.max(0, Math.floor(diffMs / 60000));
    const diffHrs = Math.floor(diffMin / 60);
    
    // Check if dates match by year, month, and date
    const checkDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffDays = Math.round((today - checkDate) / (1000 * 60 * 60 * 24)); 
    
    if (diffMin < 1) return `Last seen just now`;
    if (diffMin < 60) return `Last seen ${diffMin} min ago`;
    if (diffDays === 0) return `last seen today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    if (diffDays === 1) return `last seen yesterday at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    
    const dateOptions = { day: 'numeric', month: 'short' };
    const dateStr = date.toLocaleDateString('en-GB', dateOptions);
    return `last seen on ${dateStr} at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
};

const ChatApp = () => {
  const { user, logout, socket, onlineUsers, lastSeenMap } = useAuthStore();
  const { messages, isMessagesLoading, isMoreMessagesLoading, getProjectMessages, syncMissedMessages, sendProjectMessage, addMessage, clearProjectChat, clearMessagesLocally, updateMessage, deleteMessageLocally, updateMessageStatus, updateProjectMessagesStatus, setActiveRecipientId, recoverMessagesAction } = useChatStore();
  const initVoiceListeners = useVoiceCallStore(s => s.initListeners);
  const removeVoiceListeners = useVoiceCallStore(s => s.removeListeners);
  const { projects, fetchProjects } = useProjectStore();
  const navigate = useNavigate();
  const { projectId } = useParams();
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showImageLightbox, setShowImageLightbox] = useState(null);
  const [pendingImage, setPendingImage] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 1024);
  const [editingMessage, setEditingMessage] = useState(null);
  const [typingUsers, setTypingUsers] = useState(new Map());
  const [reactionMsgId, setReactionMsgId] = useState(null);
  const [activeMenuMsgId, setActiveMenuMsgId] = useState(null);
  const [timeTicker, setTimeTicker] = useState(Date.now());
  const [showExitModal, setShowExitModal] = useState(false);
  const activeMenuRef = useRef(null);
  const messagesEndRef = useRef(null);
  const isScrolledUpRef = useRef(false);
  const [showScrollArrow, setShowScrollArrow] = useState(false);
  const [unreadScrollCount, setUnreadScrollCount] = useState(0);
  const fileInputRef = useRef(null);
  const pressTimer = useRef(null);
  const isTypingRef = useRef(false);
  const typingTimeoutRef = useRef(null);
  const textareaRef = useRef(null);
  
  const [recoveryState, setRecoveryState] = useState(null);
  const [isSending, setIsSending] = useState(false);

  const handleRecoverMessages = async () => {
      try {
          setRecoveryState('Recovering recent messages...');
          const count = await recoverMessagesAction(projectId, 100);
          setRecoveryState(count > 0 ? `Chat synchronized — ${count} messages recovered` : 'No missing messages found');
          setTimeout(() => setRecoveryState(null), 3000);
      } catch (err) {
          setRecoveryState('Failed to recover messages');
          setTimeout(() => setRecoveryState(null), 3000);
      }
  };

  const currentProject = projects.find(p => p._id === projectId);

  const [permission, setPermission] = useState(window.Notification?.permission);

  const getCallTarget = () => {
      if (!currentProject || !user) return null;
      const otherMembers = [currentProject.admin, ...(currentProject.collaborators || [])].filter(m => {
          if (!m) return false;
          const mId = m._id ? m._id.toString() : m.toString();
          const uId = user._id ? user._id.toString() : user.toString();
          return String(mId) !== String(uId);
      });
      if (otherMembers.length > 0) return otherMembers[0];

      // Deep fallback: grab from messages array
      if (messages && messages.length > 0) {
          const otherMsg = messages.find(msg => {
              if (!msg || !msg.sender) return false;
              const sId = msg.sender._id ? msg.sender._id.toString() : msg.sender.toString();
              const uId = user._id ? user._id.toString() : user.toString();
              return String(sId) !== String(uId);
          });
          if (otherMsg) return otherMsg.sender;
      }
      return null;
  };

  const callTarget = getCallTarget();
  const targetIdStr = callTarget ? (callTarget._id ? callTarget._id.toString() : callTarget.toString()) : null;

  useEffect(() => {
      if (targetIdStr) {
          setActiveRecipientId(targetIdStr);
      }
  }, [targetIdStr, setActiveRecipientId]);

  useEffect(() => {
     if (currentProject && currentProject.screenshotProtectionEnabled) {
         const handleKeyDown = (e) => {
             if (e.key === 'PrintScreen' || (e.ctrlKey && e.key === 'p') || (e.metaKey && e.shiftKey && (e.key === 's' || e.key === '3' || e.key === '4' || e.key === '5'))) {
                e.preventDefault();
                document.body.style.filter = 'blur(15px)';
                setTimeout(() => document.body.style.filter = 'none', 3000);
             }
         };
         
         const handleContextMenu = (e) => e.preventDefault();
         const handleVisibilityChange = () => {
             if (document.hidden) {
                 document.body.style.filter = 'blur(15px)';
             } else {
                 document.body.style.filter = 'none';
             }
         };
         
         window.addEventListener('keydown', handleKeyDown);
         window.addEventListener('contextmenu', handleContextMenu);
         document.addEventListener('visibilitychange', handleVisibilityChange);
         
         document.body.style.userSelect = 'none';
         document.body.style.WebkitUserSelect = 'none';

         return () => {
             window.removeEventListener('keydown', handleKeyDown);
             window.removeEventListener('contextmenu', handleContextMenu);
             document.removeEventListener('visibilitychange', handleVisibilityChange);
             document.body.style.filter = 'none';
             document.body.style.userSelect = 'auto';
             document.body.style.WebkitUserSelect = 'auto';
         }
     }
  }, [currentProject?.screenshotProtectionEnabled]);

  useEffect(() => {
      // Explicitly check presence on load/reconnect to fix any missed socket broadcasts
      if (socket && targetIdStr) {
          socket.emit("check_presence", targetIdStr);
      }
  }, [socket, targetIdStr]);

  useEffect(() => {
      if (socket) {
          initVoiceListeners();
          return () => removeVoiceListeners();
      }
  }, [socket, initVoiceListeners, removeVoiceListeners]);

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
      if (!isMobile) return;
      
      window.history.pushState(null, null, window.location.href);
      
      const handlePopState = (e) => {
          setShowExitModal(true);
          window.history.pushState(null, null, window.location.href);
      };
      
      window.addEventListener('popstate', handlePopState);
      return () => window.removeEventListener('popstate', handlePopState);
  }, [isMobile]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 1024);
    window.addEventListener('resize', handleResize);
    if (window.Notification?.permission === 'granted') {
        import('../utils/pushService').then(({ subscribeToPushNotifications }) => {
            subscribeToPushNotifications();
        });
    }
    const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible' && socket && projectId && user) {
            // Aggressive Resume Cycle to bypass zombie mobile sockets
            if (socket.connected) {
                // Background delta sync triggered dynamically
                syncMissedMessages(projectId);
                useChatStore.getState().flushPendingMessages(socket);
                socket.emit("project_messages_seen", { projectId, userId: user._id });
            } else {
                console.warn("[Lifecycle] Visibility resumed but socket dead, attempting reconnect");
                socket.connect();
            }
        }
    };
    
    const handleOnline = () => {
        if (socket && projectId) {
            if (socket.disconnected) socket.connect();
            else {
                syncMissedMessages(projectId);
                useChatStore.getState().flushPendingMessages(socket);
            }
        }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleVisibilityChange);
    window.addEventListener('online', handleOnline);

    return () => {
        window.removeEventListener('resize', handleResize);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        window.removeEventListener('focus', handleVisibilityChange);
        window.removeEventListener('online', handleOnline);
    }
  }, [socket, projectId, user]);

  useEffect(() => {
    const timer = setInterval(() => setTimeTicker(Date.now()), 60000);
    return () => clearInterval(timer);
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
    if (projectId && currentProject && user) {
      // Set E2EE encryption target: the OTHER person in this conversation
      const others = [currentProject.admin, ...(currentProject.collaborators || [])].filter(m => {
        if (!m) return false;
        const mId = (m._id || m).toString();
        return mId !== user._id.toString();
      });
      if (others.length > 0) {
        const recipientId = (others[0]._id || others[0]).toString();
        setActiveRecipientId(recipientId);
      }
    }
  }, [projectId, currentProject, user, setActiveRecipientId]);

  useEffect(() => {
    if (socket && projectId) {
      // Connect to the specific project room immediately if socket is alive
      if (socket.connected) {
          socket.emit("join_project", projectId);
          socket.emit("project_messages_seen", { projectId, userId: user?._id });
      }

      // CRITICAL: Rejoin room and flush queue whenever auto-reconnect succeeds
      const onConnectResume = () => {
          console.warn("[Lifecycle] Socket successfully (re)connected, syncing room state");
          socket.emit("join_project", projectId);
          syncMissedMessages(projectId);
          useChatStore.getState().flushPendingMessages(socket);
      };
      socket.on('connect', onConnectResume);

      const handleReceiveMsg = (msg) => {
        // Since we are in the room, any message received is for this project
        addMessage(msg);
        
        // Push Notification & Sound if not the sender
        const incomingSenderId = typeof msg.sender === 'object' ? msg.sender?._id : msg.sender;
        if (incomingSenderId !== user._id) {
            if (isScrolledUpRef.current) {
                setUnreadScrollCount(prev => prev + 1);
            }
            
            socket.emit("project_message_delivered", { messageId: msg._id, projectId, receiverId: user._id });
            
            const isFocused = document.visibilityState === 'visible' && document.hasFocus();
            
            // Only emit SEEN if the user is actively looking at the window
            if (isFocused) {
                socket.emit("project_messages_seen", { projectId, userId: user._id });
            }
            
            playNotificationSound();
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
        socket.off('connect', onConnectResume);
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
    // Only smooth scroll if actually needed, don't blindly thrash layout
    const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
    const senderId = lastMsg && (typeof lastMsg.sender === 'object' ? lastMsg.sender?._id : lastMsg.sender);
    const isMine = senderId === user._id;

    if (!isScrolledUpRef.current || isMine) {
       messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const updateSendButtonStyles = (val, img = pendingImage) => {
      const btn = document.getElementById('chat-send-btn');
      if (btn) {
          const hasText = Boolean(val.trim()) || Boolean(img);
          btn.disabled = !hasText;
          btn.style.backgroundColor = hasText ? '#2563EB' : '#1E293B';
          btn.style.color = hasText ? 'white' : '#64748B';
          btn.style.boxShadow = hasText ? '0 2px 8px rgba(37, 99, 235, 0.4)' : 'none';
          btn.style.cursor = hasText ? 'pointer' : 'default';
      }
  };

  const handleTyping = (e) => {
      const val = e.target.value;
      updateSendButtonStyles(val);
      
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

  const handleSend = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (isSending) return;
    const currentMessage = textareaRef.current?.value || '';
    
    // Check if empty (no image and no text)
    if (!projectId) return;
    if (!currentMessage.trim() && !pendingImage) return;

    setIsSending(true);

    try {
        if (pendingImage) {
            await sendProjectMessage(projectId, pendingImage, replyingTo?.id, 'IMAGE');
            setPendingImage(null);
        }
        
        if (currentMessage.trim()) {
            if (editingMessage && !pendingImage) {
                await useChatStore.getState().editProjectMessage(editingMessage._id, projectId, currentMessage);
                setEditingMessage(null);
            } else {
                // Delay text slightly if sending with image to preserve visual order
                if (pendingImage) {
                    await new Promise(r => setTimeout(r, 100));
                }
                await sendProjectMessage(projectId, currentMessage, replyingTo?.id, 'TEXT');
            }
        }
        
        setReplyingTo(null);
        setShowEmojiPicker(false);
        if (textareaRef.current) {
            textareaRef.current.value = '';
            textareaRef.current.style.height = 'auto'; 
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
        updateSendButtonStyles('');
        
        if (socket && typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
            socket.emit("stop_typing_project", { senderId: user._id, projectId });
        }
    } catch (err) {
        console.error("Message send failed:", err);
    } finally {
        setIsSending(false);
    }
  };

  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) return alert('File is too large! Maximum 20MB.');
    
    const reader = new FileReader();
    reader.onload = (event) => {
       setPendingImage(event.target.result);
       updateSendButtonStyles(textareaRef.current?.value || '', event.target.result);
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
    <div className="mobile-chat-wrapper" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-primary)', overflowX: 'hidden', width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box' }}>
      {/* Left Sidebar removed for full screen mode */}

      {/* FULL SCREEN CHAT AREA */}
      <div className="chat-main-area" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', backgroundColor: '#0B1120', overflow: 'hidden', width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
        
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
              <span style={{ fontSize: '12px', color: '#94A3B8', fontFamily: '"Inter", sans-serif', minHeight: '15px' }}>
                {(() => {
                    if (!callTarget) return 'Offline';
                    
                    const targetId = callTarget._id ? callTarget._id.toString() : callTarget.toString();
                    if (onlineUsers.includes(targetId)) {
                        return (
                            <span style={{ color: '#25D366', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#25D366' }} />
                                Online
                            </span>
                        );
                    }
                    
                    // Fallback to real authStore tracked map, then object property
                    const reliableLastSeen = lastSeenMap && lastSeenMap[targetId] ? lastSeenMap[targetId] : callTarget.lastSeen;
                    
                    if (reliableLastSeen) {
                        return <span>{formatLastSeen(reliableLastSeen)}</span>;
                    }

                    return <span>Offline</span>;
                })()}
              </span>
            </div>
          </div>
          {isMobile ? (
            <div className="mobile-header-menu" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <VoiceCallButton receiverId={callTarget?._id || callTarget || 'unknown'} receiverName={callTarget?.name || (callTarget?.email ? callTarget.email.split('@')[0] : 'Teammate')} />
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
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', cursor: 'pointer', color: '#10B981', borderRadius: '6px', transition: 'background-color 0.2s' }} onClick={() => { setShowTeamModal(true); setShowMobileMenu(false); }}>
                          <Plus size={18} />
                          <span style={{ fontSize: '14px', fontWeight: '500', fontFamily: '"Inter", sans-serif' }}>New/Add</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', cursor: 'pointer', color: '#8B5CF6', borderRadius: '6px', transition: 'background-color 0.2s' }} onClick={() => { handleRecoverMessages(); setShowMobileMenu(false); }}>
                          <RefreshCcw size={18} />
                          <span style={{ fontSize: '14px', fontWeight: '500', fontFamily: '"Inter", sans-serif' }}>Recover Missing Messages</span>
                        </div>
                      </>
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
            <div className="desktop-header-menu" style={{ display: 'flex', gap: '8px', color: '#94A3B8', alignItems: 'center' }}>
              <VoiceCallButton receiverId={callTarget?._id || callTarget || 'unknown'} receiverName={callTarget?.name || (callTarget?.email ? callTarget.email.split('@')[0] : 'Teammate')} />
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
                <>
                  <span className="icon-btn" style={{ padding: '8px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s', color: '#10B981' }} onClick={() => setShowTeamModal(true)} title="Manage Team" onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(16, 185, 129, 0.1)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                    <Plus size={18} />
                  </span>
                  <span className="icon-btn" style={{ padding: '8px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s', color: '#8B5CF6' }} onClick={handleRecoverMessages} title="Recover Recent Messages" onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(139, 92, 246, 0.1)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                    <RefreshCcw size={18} />
                  </span>
                </>
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

        {recoveryState && (
          <div style={{ padding: '8px 16px', backgroundColor: '#4C1D95', color: '#DDD6FE', display: 'flex', justifyContent: 'center', alignItems: 'center', flexShrink: 0, borderBottom: '1px solid #1e293b', fontSize: '13px', fontWeight: '500', animation: 'fadeIn 0.2s' }}>
            {recoveryState}
          </div>
        )}

            {/* Messages */}
            <div className="chat-messages" onScroll={(e) => {
                if (activeMenuMsgId) setActiveMenuMsgId(null);
                
                const scrollContainer = e.target;
                const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
                const isUp = scrollHeight - scrollTop - clientHeight > 150;
                
                if (isUp !== isScrolledUpRef.current) {
                    isScrolledUpRef.current = isUp;
                    setShowScrollArrow(isUp);
                }
                
                if (!isUp && unreadScrollCount > 0) {
                    setUnreadScrollCount(0);
                }

                if (scrollTop < 50) {
                    const store = useChatStore.getState();
                    if (!store.isMessagesLoading && !store.isMoreMessagesLoading) {
                        const previousScrollHeight = scrollHeight;
                        useChatStore.setState({ isMoreMessagesLoading: true }); // Prevent immediate refires
                        store.loadMoreProjectMessages(projectId).finally(() => {
                            setTimeout(() => {
                                scrollContainer.scrollTop = Math.max(50, scrollContainer.scrollHeight - previousScrollHeight);
                            }, 50);
                        });
                    }
                }
            }} style={{ flex: 1, minHeight: 0, padding: `24px 32px ${(showEmojiPicker || reactionMsgId) ? 400 : 24}px 32px`, overflowY: 'auto', overflowX: 'hidden', width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box', WebkitOverflowScrolling: 'touch' }}>
              
              {isMoreMessagesLoading && (
                  <div style={{ textAlign: 'center', padding: '12px 0', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', color: '#94A3B8', fontSize: '13px' }}>
                      <div style={{ width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.1)', borderTopColor: '#3B82F6', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                      Loading older messages...
                      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                  </div>
              )}

              {React.useMemo(() => {
                if (isMessagesLoading) {
                  return <div style={{ textAlign: 'center', color: '#64748B', fontFamily: '"Inter", sans-serif', fontSize: '14px', marginTop: '20px' }}>Loading messages...</div>;
                }
                return messages.map((msg, index) => {
                  // CALL_RECORD: render as call bubble, skip normal message rendering
                  if (msg.messageType === 'CALL_RECORD') {
                      return <CallRecordBubble key={msg._id || index} message={msg} />;
                  }

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
                    
                    // Incoming (left side) -> swipe right. Outgoing (right side) -> swipe left
                    const isValidSwipe = isMine ? (diffX < 0 && diffX > -80) : (diffX > 0 && diffX < 80);
                    
                    if (isValidSwipe) {
                       e.currentTarget.style.transform = `translateX(${diffX}px)`;
                       const icon = e.currentTarget.querySelector('.swipe-reply-icon');
                       if (icon) {
                         icon.style.opacity = Math.min(Math.abs(diffX) / 50, 1);
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

                    if ((!isMine && diffX > 50) || (isMine && diffX < -50)) {
                      setReplyingTo({
                          id: msg._id || msg.id,
                          senderId: typeof msg.sender === 'object' ? (msg.sender?._id || msg.sender?.id) : msg.sender,
                          text: msg.content || msg.text,
                          messageType: msg.messageType,
                          deleted: msg.deleted
                      });
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
                    <div key={index} style={{ display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start', marginBottom: '20px', width: '100%', maxWidth: '100%', overflowX: 'hidden', boxSizing: 'border-box' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', maxWidth: '85%', minWidth: 0 }}>
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
                        
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                          
                          {/* Swipe to reply icon indicator */}
                          <div className="swipe-reply-icon" style={{  
                            position: 'absolute', 
                            [isMine ? 'right' : 'left']: '-30px', 
                            opacity: 0, 
                            color: '#e2e8f0', 
                            backgroundColor: '#2563EB',
                            borderRadius: '50%',
                            padding: '4px',
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center'
                          }}>
                            <Reply size={14} style={{ transform: isMine ? 'scaleX(-1)' : 'none' }} />
                          </div>

                          <div id={`msg-bubble-${msg._id}`} data-ismine={Boolean(isMine)} className="chat-bubble relative group" 
                            onTouchStart={(e) => { handleTouchStart(e); handleBubbleTouchStart(e); }}
                            onTouchMove={(e) => { handleTouchMove(e); handleBubbleTouchEnd(e); }}
                            onTouchEnd={(e) => { handleTouchEnd(e, msg); handleBubbleTouchEnd(e); }}
                            onTouchCancel={handleBubbleTouchEnd}
                            onContextMenu={(e) => { if (isMobile) { e.preventDefault(); return; } e.preventDefault(); setActiveMenuMsgId(msg._id); }}
                            style={{ 
                            background: isMine ? 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)' : '#151E2F', 
                            color: isMine ? '#ffffff' : '#F8FAFC',
                            padding: '12px 16px', 
                            borderRadius: isMine ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                            border: isMine ? 'none' : '1px solid #243044',
                            wordBreak: 'break-word',
                            overflowWrap: 'anywhere',
                            whiteSpace: 'pre-wrap',
                            minWidth: 0,
                            maxWidth: '100%',
                            boxSizing: 'border-box',
                            lineHeight: '1.5',
                            fontSize: '15px', 
                            fontFamily: '"Inter", sans-serif',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                            userSelect: 'none', // Prevent text selection on mobile swipe
                            zIndex: 2
                          }}>
                            {/* Hover Actions Menu Desktop/Mobile */}
                            {!isMobile && (
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
                                {!msg.deleted && <div title="Reply" onClick={() => setReplyingTo({ id: msg._id || msg.id, senderId: typeof msg.sender === 'object' ? (msg.sender?._id || msg.sender?.id) : msg.sender, text: msg.content || msg.text, messageType: msg.messageType, deleted: msg.deleted })} style={{ width: '30px', height: '30px', borderRadius: '50%', backgroundColor: '#111827', border: '1px solid #243044', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', color: '#94A3B8' }} onMouseEnter={e => { e.currentTarget.style.color = '#F8FAFC'; e.currentTarget.style.backgroundColor = '#1E293B'; }} onMouseLeave={e => { e.currentTarget.style.color = '#94A3B8'; e.currentTarget.style.backgroundColor = '#111827'; }}><Reply size={14} /></div>}
                                {isMine && !msg.deleted && msg.messageType === 'TEXT' && <div title="Edit" onClick={() => { setEditingMessage(msg); setMsgContent(msg.content); }} style={{ width: '30px', height: '30px', borderRadius: '50%', backgroundColor: '#111827', border: '1px solid #243044', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', color: '#94A3B8' }} onMouseEnter={e => { e.currentTarget.style.color = '#F8FAFC'; e.currentTarget.style.backgroundColor = '#1E293B'; }} onMouseLeave={e => { e.currentTarget.style.color = '#94A3B8'; e.currentTarget.style.backgroundColor = '#111827'; }}><Pencil size={14} /></div>}
                                {isMine && !msg.deleted && <div title="Delete" onClick={() => { if(window.confirm('Delete message for everyone?')) socket.emit("delete_project_message", { messageId: msg._id, senderId: user._id, projectId }); }} style={{ width: '30px', height: '30px', borderRadius: '50%', backgroundColor: '#111827', border: '1px solid #243044', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', color: '#94A3B8' }} onMouseEnter={e => { e.currentTarget.style.color = '#EF4444'; e.currentTarget.style.backgroundColor = '#1E293B'; }} onMouseLeave={e => { e.currentTarget.style.color = '#94A3B8'; e.currentTarget.style.backgroundColor = '#111827'; }}><Trash2 size={14} /></div>}
                            </div>
                            )}
                            
                            {/* Desktop Context Menu */}
                            {activeMenuMsgId === msg._id && !isMobile && (
                                <>
                                  <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 }} onPointerDown={() => setActiveMenuMsgId(null)} onContextMenu={(e) => { e.preventDefault(); setActiveMenuMsgId(null); }} />
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
                                      {/* DESKTOP QUICK REACTIONS STRIP */}
                                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', marginBottom: '4px', backgroundColor: '#0F172A', borderRadius: '8px', userSelect: 'none' }}>
                                          {['👍', '❤️', '😂', '😮', '😢', '🙏'].map(emoji => (
                                              <div key={emoji} onClick={(e) => { 
                                                   e.stopPropagation();
                                                   socket.emit("project_message_reaction", { messageId: msg._id, userId: user._id, reaction: emoji, projectId });
                                                   setActiveMenuMsgId(null);
                                              }} style={{ fontSize: '20px', cursor: 'pointer', transform: 'scale(1)', transition: 'transform 0.1s' }} onMouseEnter={e => e.currentTarget.style.transform='scale(1.2)'} onMouseLeave={e => e.currentTarget.style.transform='scale(1)'}>
                                                  {emoji}
                                              </div>
                                          ))}
                                          <div onClick={(e) => { e.stopPropagation(); setReactionMsgId(msg._id); setActiveMenuMsgId(null); }} style={{ fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', backgroundColor: '#334155', borderRadius: '50%', cursor: 'pointer', color: '#F8FAFC' }} onMouseEnter={e => e.currentTarget.style.backgroundColor='#475569'} onMouseLeave={e => e.currentTarget.style.backgroundColor='#334155'}>
                                              <Plus size={16} />
                                          </div>
                                      </div>

                                      <div title="More Reactions" onClick={() => { setReactionMsgId(reactionMsgId === msg._id ? null : msg._id); setActiveMenuMsgId(null); }} style={{ color: '#94A3B8', padding: '12px 10px', display: 'flex', alignItems: 'center', gap: '12px', fontSize: '15px', cursor: 'pointer', borderRadius: '4px' }} onMouseEnter={e=>e.currentTarget.style.backgroundColor='#1E293B'} onMouseLeave={e=>e.currentTarget.style.backgroundColor='transparent'}><Smile size={20} /> More Reactions</div>
                                      {!msg.deleted && <div title="Reply" onClick={() => { setReplyingTo({ id: msg._id || msg.id, senderId: typeof msg.sender === 'object' ? (msg.sender?._id || msg.sender?.id) : msg.sender, text: msg.content || msg.text, messageType: msg.messageType, deleted: msg.deleted }); setActiveMenuMsgId(null); }} style={{ color: '#94A3B8', padding: '12px 10px', display: 'flex', alignItems: 'center', gap: '12px', fontSize: '15px', cursor: 'pointer', borderRadius: '4px' }} onMouseEnter={e=>e.currentTarget.style.backgroundColor='#1E293B'} onMouseLeave={e=>e.currentTarget.style.backgroundColor='transparent'}><Reply size={20} /> Reply</div>}
                                      {isMine && !msg.deleted && msg.messageType === 'TEXT' && <div title="Edit" onClick={() => { setEditingMessage(msg); if(textareaRef.current) { textareaRef.current.value = msg.content; textareaRef.current.style.height = 'auto'; textareaRef.current.focus(); } setActiveMenuMsgId(null); }} style={{ color: '#94A3B8', padding: '12px 10px', display: 'flex', alignItems: 'center', gap: '12px', fontSize: '15px' }}><Pencil size={20} /> Edit</div>}
                                      
                                      <div style={{ height: '1px', backgroundColor: '#243044', margin: '4px 0' }} />
                                      <div title="Delete for me" onClick={() => { setActiveMenuMsgId(null); useChatStore.getState().removeMessageFromUI(msg._id); }} style={{ color: '#EF4444', padding: '12px 10px', display: 'flex', alignItems: 'center', gap: '12px', fontSize: '15px' }}><Trash2 size={20} /> Delete for me</div>
                                      {isMine && !msg.deleted && <div title="Delete for everyone" onClick={() => { setActiveMenuMsgId(null); if(window.confirm('Delete message for everyone?')) socket.emit("delete_project_message", { messageId: msg._id, senderId: user._id, projectId }); }} style={{ color: '#EF4444', padding: '12px 10px', display: 'flex', alignItems: 'center', gap: '12px', fontSize: '15px' }}><Trash2 size={20} /> Delete for everyone</div>}
                                  </div>
                                </>
                            )}

                            {/* Reply Context Nested Block */}
                            {msg.replyTo && (() => {
                              const replySenderId = typeof msg.replyTo.senderId === 'object' ? msg.replyTo.senderId?._id?.toString() : msg.replyTo.senderId?.toString();
                              let replyDisplay = 'Teammate';
                              if (replySenderId === user._id.toString()) {
                                replyDisplay = 'You';
                              } else if (currentProject) {
                                const matchedMember = [currentProject.admin, ...(currentProject.collaborators || [])].find(m => {
                                    if (!m) return false;
                                    const stringId = m._id ? m._id.toString() : m.toString();
                                    return stringId === replySenderId;
                                });
                                if (matchedMember && typeof matchedMember === 'object' && matchedMember.email) {
                                  replyDisplay = matchedMember.name || matchedMember.email.split('@')[0];
                                }
                              }
                              return (
                              <div 
                                onClick={() => {
                                  const targetId = typeof msg.replyTo === 'object' ? (msg.replyTo.id || msg.replyTo._id) : msg.replyTo;
                                  const element = document.getElementById(`msg-bubble-${targetId}`);
                                  if (element) {
                                      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                      element.classList.remove('highlight-flash');
                                      void element.offsetWidth; // trigger reflow
                                      element.classList.add('highlight-flash');
                                  }
                                }}
                                onMouseEnter={e => e.currentTarget.style.backgroundColor = isMine ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.35)'}
                                onMouseLeave={e => e.currentTarget.style.backgroundColor = isMine ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.25)'}
                                style={{
                                backgroundColor: isMine ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.25)',
                                borderLeft: `3px solid ${isMine ? '#93C5FD' : '#2563EB'}`,
                                padding: '8px 12px',
                                borderRadius: '6px',
                                marginBottom: '10px',
                                fontSize: '13px',
                                cursor: 'pointer',
                                transition: 'background-color 0.2s',
                              }}>
                                <div style={{ fontWeight: '600', color: isMine ? '#BFDBFE' : '#60A5FA', marginBottom: '2px' }}>
                                  {replyDisplay}
                                </div>
                                <div style={{ color: isMine ? '#E0F2FE' : '#94A3B8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  {msg.replyTo.messageType === 'IMAGE' && <ImageIcon size={12} />}
                                  {msg.replyTo.messageType === 'IMAGE' ? 'Photo' : msg.replyTo.text}
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
                                renderMessageContent(msg.content)
                            )}

                            {msg.edited && !msg.deleted && <span style={{ fontSize: '11px', marginLeft: '6px', opacity: 0.7 }}>(edited)</span>}

                            {/* Reactions */}
                            {msg.reactions && msg.reactions.length > 0 && (
                                <div style={{ 
                                    position: 'absolute', 
                                    bottom: '-12px', 
                                    [isMine ? 'right' : 'left']: '16px', 
                                    display: 'flex', 
                                    alignItems: 'center',
                                    gap: '2px', 
                                    flexWrap: 'nowrap',
                                    backgroundColor: '#1E293B',
                                    padding: '2px 6px',
                                    borderRadius: '12px',
                                    border: '1px solid #334155',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                                    zIndex: 5
                                }}>
                                    {Object.entries(msg.reactions.reduce((acc, r) => { acc[r.reaction] = (acc[r.reaction] || 0) + 1; return acc; }, {})).slice(0, 4).map(([emoji, count]) => (
                                        <div key={emoji} onClick={(e) => { e.stopPropagation(); if (user) socket.emit("project_message_reaction", { messageId: msg._id, userId: user._id, reaction: emoji, projectId }); }} style={{ fontSize: '13px', display: 'flex', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}>
                                            <span>{emoji}</span>
                                            {count > 1 && <span style={{ fontSize: '11px', marginLeft: '3px', color: '#CBD5E1', fontWeight: 'bold' }}>{count}</span>}
                                        </div>
                                    ))}
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

            {/* Typing Indicator */}
            {typingUsers.size > 0 && (
                <div className="animate-fade-in" style={{ padding: '0 32px 10px 32px', fontSize: '13px', color: '#94A3B8', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '6px' }}>
                     <div style={{ display: 'flex', gap: '3px' }}>
                          <span style={{ display: 'inline-block', width: '4px', height: '4px', backgroundColor: '#94A3B8', borderRadius: '50%', animation: 'typingBounce 1.4s infinite ease-in-out both', animationDelay: '-0.32s' }}></span>
                          <span style={{ display: 'inline-block', width: '4px', height: '4px', backgroundColor: '#94A3B8', borderRadius: '50%', animation: 'typingBounce 1.4s infinite ease-in-out both', animationDelay: '-0.16s' }}></span>
                          <span style={{ display: 'inline-block', width: '4px', height: '4px', backgroundColor: '#94A3B8', borderRadius: '50%', animation: 'typingBounce 1.4s infinite ease-in-out both' }}></span>
                     </div>
                     {Array.from(typingUsers.values()).join(', ')} is typing...
                     <style>{`@keyframes typingBounce { 0%, 80%, 100% { transform: scale(0); opacity: 0.5; } 40% { transform: scale(1); opacity: 1; } }`}</style>
                </div>
            )}

            {/* Input Area */}
            <div className="chat-input-wrapper" style={{ flexShrink: 0, padding: '0 32px', paddingBottom: 'max(24px, env(safe-area-inset-bottom, 24px))', paddingTop: '10px', backgroundColor: '#0B1120' }}>
              
              {/* Pre-input States (Editing/Replying) */}
              {editingMessage ? (
                <div className="animate-fade-in" style={{ backgroundColor: '#111827', padding: '12px 20px', borderRadius: '16px 16px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: '4px solid #10B981', borderTop: '1px solid #243044', borderRight: '1px solid #243044' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: '13px', fontWeight: '600', color: '#10B981', fontFamily: '"Inter", sans-serif', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Pencil size={14}/> Editing Message
                    </span>
                    <span style={{ fontSize: '13px', color: '#94A3B8', whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere', maxHeight: '40px', overflow: 'hidden', flex: 1, minWidth: 0, fontFamily: '"Inter", sans-serif' }}>
                      {editingMessage.content}
                    </span>
                  </div>
                  <X size={18} onClick={() => { setEditingMessage(null); if (textareaRef.current) textareaRef.current.value = ''; updateSendButtonStyles(''); }} style={{ color: '#94A3B8', cursor: 'pointer' }} />
                </div>
              ) : replyingTo ? (() => {
                  const replyPreviewSenderId = typeof replyingTo.senderId === 'object' ? replyingTo.senderId?._id : replyingTo.senderId;
                  let replyPreviewDisplay = 'Teammate';
                  if (replyPreviewSenderId === user._id) {
                    replyPreviewDisplay = 'yourself';
                  } else if (currentProject) {
                    const matchedMember = [currentProject.admin, ...(currentProject.collaborators || [])].find(m => m && m._id === replyPreviewSenderId);
                    if (matchedMember) replyPreviewDisplay = matchedMember.name || matchedMember.email.split('@')[0];
                  }
                  
                  return (
                <div className="animate-fade-in" style={{ backgroundColor: '#111827', padding: '12px 20px', borderRadius: '16px 16px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: '4px solid #2563EB', borderTop: '1px solid #243044', borderRight: '1px solid #243044' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', overflow: 'hidden', flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: '13px', fontWeight: '600', color: '#3B82F6', fontFamily: '"Inter", sans-serif' }}>
                      Replying to {replyPreviewDisplay}
                    </span>
                    <span style={{ fontSize: '13px', color: '#94A3B8', whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere', maxHeight: '40px', overflow: 'hidden', flex: 1, minWidth: 0, fontFamily: '"Inter", sans-serif', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {replyingTo.messageType === 'IMAGE' && <ImageIcon size={12} />}
                      {replyingTo.messageType === 'IMAGE' ? 'Photo' : replyingTo.text}
                    </span>
                  </div>
                  <X size={18} onClick={() => setReplyingTo(null)} style={{ color: '#94A3B8', cursor: 'pointer', flexShrink: 0, paddingLeft: '8px' }} />
                </div>
                );
              })() : null}
              
              {/* Image Preview State */}
              {pendingImage && (
                  <div className="animate-fade-in" style={{ backgroundColor: '#111827', padding: '12px 20px', borderRadius: replyingTo || editingMessage ? '0' : '16px 16px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderTop: '1px solid #243044', borderRight: '1px solid #243044', borderLeft: '1px solid #243044' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <span style={{ fontSize: '13px', fontWeight: '600', color: '#94A3B8', fontFamily: '"Inter", sans-serif' }}>
                              Image Attachment
                          </span>
                          <img src={pendingImage} style={{ height: '80px', borderRadius: '8px', objectFit: 'cover', border: '1px solid #243044' }} alt="Preview" />
                      </div>
                      <X size={18} onClick={() => { setPendingImage(null); updateSendButtonStyles(''); if (fileInputRef.current) fileInputRef.current.value = ''; }} style={{ color: '#94A3B8', cursor: 'pointer', marginTop: '4px' }} />
                  </div>
              )}

              <div style={{ position: 'relative' }}>
                  {(showEmojiPicker || reactionMsgId) && (
                      <div style={{ position: 'fixed', inset: 0, zIndex: 100000, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)', animation: 'fadeIn 0.2s forwards' }} onClick={(e) => { if (e.target === e.currentTarget) { setShowEmojiPicker(false); setReactionMsgId(null); } }}>
                          <style>{`
                              .picker-gboard-style .EmojiPickerReact { border: none !important; border-radius: 20px 20px 0 0 !important; background-color: #111827 !important; }
                              .picker-gboard-style .epr-emoji-category-label { background-color: #111827 !important; color: #94A3B8 !important; }
                              .picker-gboard-style .epr-search { background-color: #1E293B !important; border-color: #334155 !important; color: #F8FAFC !important; }
                          `}</style>
                          <div className="picker-gboard-style" style={{ height: '45vh', width: '100%', animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards' }} onClick={e => e.stopPropagation()}>
                              <EmojiPicker 
                                  theme="dark" 
                                  width="100%" 
                                  height="100%"
                                  skinTonesDisabled
                                  onEmojiClick={(e) => {
                                      if (reactionMsgId) {
                                          socket.emit("project_message_reaction", { messageId: reactionMsgId, userId: user._id, reaction: e.emoji, projectId });
                                          setReactionMsgId(null);
                                      } else if (textareaRef.current) {
                                          const start = textareaRef.current.selectionStart;
                                          const end = textareaRef.current.selectionEnd;
                                          const text = textareaRef.current.value;
                                          const newText = text.substring(0, start) + e.emoji + text.substring(end);
                                          textareaRef.current.value = newText;
                                          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + e.emoji.length;
                                          updateSendButtonStyles(newText);
                                      }
                                  }} 
                              />
                          </div>
                      </div>
                  )}
                  <div style={{ backgroundColor: '#111827', display: 'flex', gap: '16px', alignItems: 'center', padding: '12px 16px', borderRadius: replyingTo || editingMessage || pendingImage ? '0 0 16px 16px' : '100px', border: '1px solid #243044', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)', transition: 'all 0.2s' }}>
                    <span className="icon-btn" onClick={() => setShowEmojiPicker(!showEmojiPicker)} title="Add Emoji" style={{ color: showEmojiPicker ? '#2563EB' : '#64748B', cursor: 'pointer', padding: '6px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }} onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#1E293B'; e.currentTarget.style.color = '#94A3B8'; }} onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = showEmojiPicker ? '#2563EB' : '#64748B'; }}>
                      <Smile size={20} />
                    </span>
                    <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageSelect} style={{ display: 'none' }} />
                    <span className="icon-btn" onClick={() => fileInputRef.current?.click()} title="Add Media" style={{ color: '#64748B', cursor: 'pointer', padding: '6px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }} onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#1E293B'; e.currentTarget.style.color = '#94A3B8'; }} onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#64748B'; }}>
                      <ImageIcon size={20} />
                    </span>
                <textarea 
                  ref={textareaRef}
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
                <button id="chat-send-btn" type="button" onClick={handleSend} style={{ 
                  backgroundColor: '#1E293B', 
                  color: '#64748B', 
                  border: 'none', 
                  width: '40px', 
                  height: '40px', 
                  borderRadius: '50%',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  cursor: 'default',
                  transition: 'background-color 0.2s, box-shadow 0.2s',
                  boxShadow: 'none'
                }}>
                  <SendIcon size={18} style={{ marginLeft: '2px' }} />
                </button>
              </div>
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
      {/* Mobile Bottom Action Sheet Portal */}
      {isMobile && activeMenuMsgId && createPortal((
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99999, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', animation: 'fadeIn 0.2s forwards' }}>
            <style>{`
              @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
              @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            `}</style>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' }} onPointerDown={(e) => { e.stopPropagation(); setActiveMenuMsgId(null); }} />
            <div style={{ position: 'relative', backgroundColor: '#1E293B', borderTopLeftRadius: '24px', borderTopRightRadius: '24px', padding: '16px', paddingBottom: 'max(24px, env(safe-area-inset-bottom, 24px))', display: 'flex', flexDirection: 'column', gap: '4px', zIndex: 100000, boxShadow: '0 -4px 25px rgba(0,0,0,0.5)', animation: 'slideUp 0.2s cubic-bezier(0.2, 0.8, 0.2, 1) forwards' }}>
                <div style={{ width: '40px', height: '4px', backgroundColor: '#334155', borderRadius: '4px', margin: '0 auto 16px auto' }} />
                
                {(() => {
                   const activeMsg = messages.find(m => m._id === activeMenuMsgId);
                   if (!activeMsg) return null;
                   const senderId = typeof activeMsg.sender === 'object' ? activeMsg.sender?._id : activeMsg.sender;
                   const isMine = senderId === user._id;

                   const Item = ({ icon: Icon, label, color = '#F8FAFC', action }) => (
                       <div onPointerDown={(e) => { e.stopPropagation(); setActiveMenuMsgId(null); action(); }} style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '16px', fontSize: '16px', color, borderRadius: '12px', cursor: 'pointer', userSelect: 'none' }} onTouchStart={(e) => e.currentTarget.style.backgroundColor='rgba(255,255,255,0.05)'} onTouchEnd={(e) => e.currentTarget.style.backgroundColor='transparent'} onTouchCancel={(e) => e.currentTarget.style.backgroundColor='transparent'}>
                           <Icon size={22} style={{ color: color === '#F8FAFC' ? '#94A3B8' : color }} />
                           {label}
                       </div>
                   );

                   return (
                       <>
                         {/* QUICK REACTIONS STRIP */}
                         <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', marginBottom: '8px', backgroundColor: '#0F172A', borderRadius: '20px', userSelect: 'none' }}>
                             {['👍', '❤️', '😂', '😮', '😢', '🙏'].map(emoji => (
                                 <div key={emoji} onClick={(e) => { 
                                      e.stopPropagation();
                                      socket.emit("project_message_reaction", { messageId: activeMsg._id, userId: user._id, reaction: emoji, projectId });
                                      setActiveMenuMsgId(null);
                                 }} style={{ fontSize: '26px', cursor: 'pointer', transform: 'scale(1)', transition: 'transform 0.1s' }} onTouchStart={e => e.currentTarget.style.transform='scale(1.2)'} onTouchEnd={e => e.currentTarget.style.transform='scale(1)'} onTouchCancel={e => e.currentTarget.style.transform='scale(1)'}>
                                     {emoji}
                                 </div>
                             ))}
                             <div onClick={(e) => { e.stopPropagation(); setReactionMsgId(activeMsg._id); setActiveMenuMsgId(null); }} style={{ fontSize: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '38px', height: '38px', backgroundColor: '#334155', borderRadius: '50%', cursor: 'pointer', color: '#F8FAFC' }} onTouchStart={e => e.currentTarget.style.backgroundColor='#475569'} onTouchEnd={e => e.currentTarget.style.backgroundColor='#334155'}>
                                 <Plus size={20} />
                             </div>
                         </div>

                         <Item icon={Smile} label="More Reactions" action={() => setReactionMsgId(reactionMsgId === activeMsg._id ? null : activeMsg._id)} />
                         {!activeMsg.deleted && <Item icon={Reply} label="Reply" action={() => setReplyingTo({ id: activeMsg._id || activeMsg.id, senderId: typeof activeMsg.sender === 'object' ? (activeMsg.sender?._id || activeMsg.sender?.id) : activeMsg.sender, text: activeMsg.content || activeMsg.text, messageType: activeMsg.messageType, deleted: activeMsg.deleted })} />}
                         {isMine && !activeMsg.deleted && activeMsg.messageType === 'TEXT' && <Item icon={Pencil} label="Edit" action={() => { setEditingMessage(activeMsg); if(textareaRef.current) { textareaRef.current.value = activeMsg.content; textareaRef.current.style.height = 'auto'; textareaRef.current.focus(); } }} />}
                         {!activeMsg.deleted && <Item icon={Trash2} label="Delete for me" action={() => { deleteMessageLocally(activeMsg._id); }} />}
                         {isMine && !activeMsg.deleted && <Item icon={Trash2} color="#EF4444" label="Delete for everyone" action={() => { if(window.confirm('Delete message for everyone?')) socket.emit("delete_project_message", { messageId: activeMsg._id, senderId: user._id, projectId }); }} />}
                       </>
                   );
                })()}
            </div>
        </div>
      ), document.body)}

      {/* WHATSAPP-STYLE SCROLL TO BOTTOM BADGE */}
      {showScrollArrow && (
          <div 
              onClick={() => {
                  messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                  setUnreadScrollCount(0);
              }}
              style={{
                  position: 'absolute',
                  bottom: '90px',
                  right: '24px',
                  width: '42px',
                  height: '42px',
                  backgroundColor: '#1E293B',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                  zIndex: 40,
                  border: '1px solid #334155',
                  color: '#94A3B8',
                  transition: 'all 0.2s'
              }}
          >
              <ChevronDown size={24} />
              {unreadScrollCount > 0 && (
                  <div style={{
                      position: 'absolute',
                      top: '-6px',
                      right: '-6px',
                      backgroundColor: '#25D366',
                      color: '#000',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                  }}>
                      {unreadScrollCount}
                  </div>
              )}
          </div>
      )}
      
      {/* MOBILE EXIT MODAL */}
      {showExitModal && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div className="animate-fade-in" style={{ backgroundColor: '#1E293B', padding: '24px', borderRadius: '16px', width: '320px', maxWidth: '90vw', border: '1px solid #334155', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)' }}>
                  <h3 style={{ color: '#F8FAFC', margin: 0, marginBottom: '8px', fontSize: '18px', fontFamily: '"Inter", sans-serif' }}>Leave Chat?</h3>
                  <p style={{ color: '#94A3B8', fontSize: '14px', fontFamily: '"Inter", sans-serif', lineHeight: '1.5', margin: 0 }}>Are you sure you want to leave this chat?</p>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                      <button onClick={() => setShowExitModal(false)} style={{ padding: '8px 16px', color: '#94A3B8', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: '500' }}>Cancel</button>
                      <button onClick={() => { 
                          setShowExitModal(false); 
                          window.history.go(-2); 
                      }} style={{ padding: '8px 16px', background: '#EF4444', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '500' }}>Leave</button>
                  </div>
              </div>
          </div>
      )}

      {/* VOICE CALL UI */}
      <IncomingCallModal />
      <ActiveCallOverlay />
    </div>
  );
};

export default ChatApp;
