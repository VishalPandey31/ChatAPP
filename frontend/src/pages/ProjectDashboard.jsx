import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useProjectStore } from '../store/projectStore';
import { FaPlus, FaUsers, FaSignOutAlt, FaTrash, FaShieldAlt, FaYoutube, FaComments, FaCheckCircle } from 'react-icons/fa';
import FaceEnrollModal from '../components/biometrics/FaceEnrollModal';

const ProjectDashboard = () => {
  const { user, logout, socket, faceProfile, fetchFaceProfile, securityMode, setSecurityMode } = useAuthStore();
  const { projects, isLoading, fetchProjects, createProject, deleteProject, toggleScreenshotProtection, addProjectRealtime, removeProjectRealtime, updateProjectRealtime } = useProjectStore();
  const navigate = useNavigate();
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [showFaceEnrollModal, setShowFaceEnrollModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');

  useEffect(() => {
    fetchProjects();
    fetchFaceProfile();

    if (socket) {
      const handleCreated = (newProject) => {
        addProjectRealtime(newProject);
      };
      const handleDeleted = ({ projectId }) => {
        removeProjectRealtime(projectId);
      };
      const handleUpdated = (updatedProject) => {
        updateProjectRealtime(updatedProject);
      };

      socket.on('project:created', handleCreated);
      socket.on('project:deleted', handleDeleted);
      socket.on('project:updated', handleUpdated);

      return () => {
        socket.off('project:created', handleCreated);
        socket.off('project:deleted', handleDeleted);
        socket.off('project:updated', handleUpdated);
      };
    }
  }, [fetchProjects, fetchFaceProfile, socket, addProjectRealtime, removeProjectRealtime, updateProjectRealtime]);

  const handleSelectMode = (mode) => {
    setSecurityMode(mode);
    if ((mode === 'face_login' || mode === 'face_youtube') && !faceProfile?.isConfigured) {
      setShowFaceEnrollModal(true);
    }
  };

  const handleCreateProject = async (e) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    try {
      await createProject(newProjectName);
      setNewProjectName('');
      setShowNewProjectModal(false);
    } catch (err) {
      alert(err.message);
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
    <div style={{ minHeight: '100vh', backgroundColor: '#020617', padding: '40px', fontFamily: 'Inter, sans-serif' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', paddingBottom: '20px', borderBottom: '1px solid #1e293b' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: '#c4b5fd', margin: 0, textShadow: '0 0 10px rgba(139, 92, 246, 0.4)' }}>
          <span style={{ color: '#3b82f6' }}>Dash</span>board
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ color: '#94a3b8', fontSize: '14px' }}>Welcome, <strong style={{ color: '#f8fafc' }}>{user?.name || user?.email?.split('@')[0]}</strong></span>
          <button 
            onClick={logout} 
            title="Logout"
            style={{ 
              backgroundColor: 'transparent', 
              color: '#94a3b8', 
              border: 'none', 
              fontSize: '20px', 
              cursor: 'pointer', 
              transition: 'color 0.2s',
              display: 'flex',
              alignItems: 'center'
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#ef4444'}
            onMouseLeave={(e) => e.currentTarget.style.color = '#94a3b8'}
          >
            <FaSignOutAlt />
          </button>
        </div>
      </div>

      {/* ─── 3 SECURITY MODES SELECTOR (JUST BELOW DASHBOARD HEADER) ─── */}
      <div style={{
        backgroundColor: '#0f172a',
        border: '1px solid #1e293b',
        borderRadius: '16px',
        padding: '24px',
        marginBottom: '36px',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <FaShieldAlt style={{ color: '#10b981', fontSize: '20px' }} />
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: '#f8fafc' }}>
                Couple Secret Chat Security Mode
              </h2>
            </div>
            <p style={{ margin: '4px 0 0 0', color: '#94a3b8', fontSize: '13px' }}>
              Select how your chats will be protected during this session.
            </p>
          </div>

          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 14px',
            borderRadius: '20px',
            backgroundColor: securityMode === 'face_login' ? 'rgba(16, 185, 129, 0.15)' : securityMode === 'face_youtube' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(59, 130, 246, 0.15)',
            color: securityMode === 'face_login' ? '#34d399' : securityMode === 'face_youtube' ? '#f87171' : '#60a5fa',
            border: `1px solid ${securityMode === 'face_login' ? 'rgba(16, 185, 129, 0.4)' : securityMode === 'face_youtube' ? 'rgba(239, 68, 68, 0.4)' : 'rgba(59, 130, 246, 0.4)'}`,
            fontSize: '12px',
            fontWeight: '600'
          }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'currentColor' }} />
            Active Mode: {securityMode === 'face_login' ? 'Face Recognition + Login' : securityMode === 'face_youtube' ? 'Face Recognition + YouTube' : 'Without Face Recognition'}
          </div>
        </div>

        {/* 3 Interactive Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '16px'
        }}>
          {/* Card 1: Face Recognition + Login */}
          <div
            onClick={() => handleSelectMode('face_login')}
            style={{
              backgroundColor: securityMode === 'face_login' ? 'rgba(16, 185, 129, 0.08)' : '#020617',
              border: securityMode === 'face_login' ? '2px solid #10b981' : '1px solid #1e293b',
              borderRadius: '12px',
              padding: '20px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              boxShadow: securityMode === 'face_login' ? '0 0 20px rgba(16, 185, 129, 0.2)' : 'none'
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ width: '42px', height: '42px', borderRadius: '10px', backgroundColor: 'rgba(16, 185, 129, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981', fontSize: '20px' }}>
                  <FaShieldAlt />
                </div>
                {securityMode === 'face_login' && (
                  <FaCheckCircle style={{ color: '#10b981', fontSize: '20px' }} />
                )}
              </div>
              <h3 style={{ margin: '0 0 6px 0', fontSize: '16px', fontWeight: '700', color: '#fff' }}>
                Face Recognition + Login
              </h3>
              <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8', lineHeight: '1.5' }}>
                Continuous face & eye monitoring. If face mismatches or phone is snatched, immediately locks and sends user back to the <strong>Login screen</strong>.
              </p>
            </div>
            <div style={{ marginTop: '16px', fontSize: '11px', color: '#34d399', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Couple High-Security
            </div>
          </div>

          {/* Card 2: Face Recognition + YouTube */}
          <div
            onClick={() => handleSelectMode('face_youtube')}
            style={{
              backgroundColor: securityMode === 'face_youtube' ? 'rgba(239, 68, 68, 0.08)' : '#020617',
              border: securityMode === 'face_youtube' ? '2px solid #ef4444' : '1px solid #1e293b',
              borderRadius: '12px',
              padding: '20px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              boxShadow: securityMode === 'face_youtube' ? '0 0 20px rgba(239, 68, 68, 0.2)' : 'none'
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ width: '42px', height: '42px', borderRadius: '10px', backgroundColor: 'rgba(239, 68, 68, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444', fontSize: '20px' }}>
                  <FaYoutube />
                </div>
                {securityMode === 'face_youtube' && (
                  <FaCheckCircle style={{ color: '#ef4444', fontSize: '20px' }} />
                )}
              </div>
              <h3 style={{ margin: '0 0 6px 0', fontSize: '16px', fontWeight: '700', color: '#fff' }}>
                Face Recognition + YouTube
              </h3>
              <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8', lineHeight: '1.5' }}>
                Secret Disguise Mode. If face mismatches or phone is grabbed, immediately redirects to <strong>YouTube</strong> to completely disguise the chat!
              </p>
            </div>
            <div style={{ marginTop: '16px', fontSize: '11px', color: '#f87171', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Stealth Disguise Mode
            </div>
          </div>

          {/* Card 3: Without Face Recognition */}
          <div
            onClick={() => handleSelectMode('none')}
            style={{
              backgroundColor: securityMode === 'none' ? 'rgba(59, 130, 246, 0.08)' : '#020617',
              border: securityMode === 'none' ? '2px solid #3b82f6' : '1px solid #1e293b',
              borderRadius: '12px',
              padding: '20px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              boxShadow: securityMode === 'none' ? '0 0 20px rgba(59, 130, 246, 0.2)' : 'none'
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ width: '42px', height: '42px', borderRadius: '10px', backgroundColor: 'rgba(59, 130, 246, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6', fontSize: '20px' }}>
                  <FaComments />
                </div>
                {securityMode === 'none' && (
                  <FaCheckCircle style={{ color: '#3b82f6', fontSize: '20px' }} />
                )}
              </div>
              <h3 style={{ margin: '0 0 6px 0', fontSize: '16px', fontWeight: '700', color: '#fff' }}>
                Without Face Recognition
              </h3>
              <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8', lineHeight: '1.5' }}>
                Standard chatting mode. Camera is completely disabled, no facial scanning or redirects will occur.
              </p>
            </div>
            <div style={{ marginTop: '16px', fontSize: '11px', color: '#60a5fa', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Standard Chat Mode
            </div>
          </div>
        </div>
      </div>

      {/* Projects Grid Heading */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#f8fafc', margin: 0 }}>
          Your Chats & Projects
        </h2>
        <span style={{ fontSize: '13px', color: '#94a3b8' }}>
          Select a chat to start messaging
        </span>
      </div>

      {/* Projects Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '24px' }}>
        
        {/* NEW PROJECT CARD (Visible to Admins and Approved Users) */}
        {(user?.role === 'ADMIN' || user?.approvalStatus === 'APPROVED') && (
          <div 
            onClick={() => setShowNewProjectModal(true)}
          style={{ 
            border: '1px dashed #334155', 
            borderRadius: '12px', 
            height: '180px', 
            display: 'flex', 
            flexDirection: 'column',
            justifyContent: 'center', 
            alignItems: 'center',
            backgroundColor: '#0f172a',
            cursor: 'pointer',
            transition: 'border 0.2s, transform 0.2s'
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#3b82f6'; e.currentTarget.style.transform = 'translateY(-2px)' }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#334155'; e.currentTarget.style.transform = 'none' }}
        >
          <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#1e293b', display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#60a5fa', fontSize: '20px', marginBottom: '16px' }}>
            <FaPlus />
          </div>
          <div style={{ color: '#94a3b8', fontWeight: '600', fontSize: '15px' }}>New Project</div>
        </div>
        )}

        {/* EXISTING PROJECTS */}
        {isLoading ? (
          <div style={{ color: '#94a3b8' }}>Loading projects...</div>
        ) : (
          projects.map(project => (
            <div 
              key={project._id}
              onClick={() => navigate(`/chat/${project._id}`)}
              style={{ 
                backgroundColor: '#0f172a', 
                borderRadius: '12px', 
                padding: '24px', 
                cursor: 'pointer',
                border: '1px solid #1e293b',
                transition: 'border 0.2s',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                height: '180px'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#3b82f6' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#1e293b' }}
            >
              {(user?.role === 'ADMIN' || user?.approvalStatus === 'APPROVED') && (
                <div style={{ position: 'absolute', top: '16px', right: '16px', display: 'flex', gap: '12px' }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleScreenshotProtection(project._id);
                    }}
                    style={{
                      backgroundColor: 'transparent',
                      border: 'none',
                      color: project.screenshotProtectionEnabled ? '#34d399' : '#64748b',
                      cursor: 'pointer',
                      fontSize: '16px',
                      transition: 'color 0.2s'
                    }}
                    title={project.screenshotProtectionEnabled ? "Disable Screenshot Protection" : "Enable Screenshot Protection"}
                  >
                    <FaShieldAlt />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm("Are you sure you want to delete this project? All chat history in it will be permanently deleted.")) {
                        deleteProject(project._id);
                      }
                    }}
                    style={{
                      backgroundColor: 'transparent',
                      border: 'none',
                      color: '#ef4444',
                      cursor: 'pointer',
                      fontSize: '16px'
                    }}
                    title="Delete Project"
                  >
                    <FaTrash />
                  </button>
                </div>
              )}
              
              <div>
                <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', color: '#f8fafc', paddingRight: '20px' }}>{project.name}</h3>
                <p style={{ color: '#64748b', fontSize: '13px', margin: '0 0 24px 0' }}>Last updated recently</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8', fontSize: '13px', backgroundColor: '#1e293b', padding: '6px 12px', borderRadius: '16px', width: 'fit-content' }}>
                <FaUsers /> {project.collaborators?.length || 1} Collaborators
              </div>
            </div>
          ))
        )}

      </div>

      {/* NEW PROJECT MODAL */}
      {showNewProjectModal && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, zIndex: 9999, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <div className="modal-content" style={{ width: '100%', maxWidth: '400px', backgroundColor: '#0f172a', borderRadius: '12px', padding: '24px', border: '1px solid #1e293b' }}>
            <h2 style={{ margin: '0 0 20px 0', color: '#f8fafc', fontSize: '18px' }}>Create New Project</h2>
            <form onSubmit={handleCreateProject}>
              <input 
                type="text" 
                placeholder="Project Name (e.g. hacketon 1)" 
                value={newProjectName}
                onChange={e => setNewProjectName(e.target.value)}
                style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #1e293b', padding: '12px', borderRadius: '8px', color: '#f8fafc', fontSize: '14px', outline: 'none', marginBottom: '20px' }}
                autoFocus
                required
              />
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowNewProjectModal(false)} style={{ backgroundColor: 'transparent', color: '#94a3b8', border: 'none', padding: '8px 16px', cursor: 'pointer', borderRadius: '6px' }}>Cancel</button>
                <button type="submit" style={{ backgroundColor: '#2563eb', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '6px', fontWeight: '600', cursor: 'pointer' }}>Create Project</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FACE ENROLLMENT MODAL */}
      <FaceEnrollModal 
        isOpen={showFaceEnrollModal} 
        onClose={() => setShowFaceEnrollModal(false)} 
      />
    </div>
  );
};

export default ProjectDashboard;
