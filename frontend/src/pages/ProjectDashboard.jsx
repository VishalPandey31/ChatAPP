import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useProjectStore } from '../store/projectStore';
import { FaPlus, FaUsers, FaSignOutAlt, FaTrash } from 'react-icons/fa';

const ProjectDashboard = () => {
  const { user, logout } = useAuthStore();
  const { projects, isLoading, fetchProjects, createProject, deleteProject } = useProjectStore();
  const navigate = useNavigate();
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px', paddingBottom: '20px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: '#c4b5fd', margin: 0, textShadow: '0 0 10px rgba(139, 92, 246, 0.4)' }}>
          <span style={{ color: '#3b82f6' }}>Dash</span>board
        </h1>
        <div style={{ display: 'flex', alignItems: 'center' }}>
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

      {/* Projects Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '24px' }}>
        
        {/* NEW PROJECT CARD (Visible to Admins only) */}
        {user?.role === 'ADMIN' && (
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
              {user?.role === 'ADMIN' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm("Are you sure you want to delete this project?")) {
                      deleteProject(project._id);
                    }
                  }}
                  style={{
                    position: 'absolute',
                    top: '16px',
                    right: '16px',
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

    </div>
  );
};

export default ProjectDashboard;
