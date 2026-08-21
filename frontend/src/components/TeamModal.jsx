import React, { useEffect, useState } from 'react';
import { useAdminStore } from '../store/adminStore';
import { useAuthStore } from '../store/authStore';
import { FaPlus, FaRegClock, FaUserFriends, FaTrash, FaTimes } from 'react-icons/fa';

const TeamModal = ({ onClose }) => {
  const { users, isLoading, error, fetchUsers, createUser, updateUserStatus, removeUser } = useAdminStore();
  const { socket } = useAuthStore();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });

  useEffect(() => {
    fetchUsers();
    if (socket) {
      socket.on('new_approval_request', () => { fetchUsers(); });
    }
    return () => {
      if (socket) socket.off('new_approval_request');
    };
  }, [fetchUsers, socket]);

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    try {
      if(!formData.email || !formData.password) return;
      await createUser({
        ...formData,
        name: formData.email.split('@')[0], 
        confirmPassword: formData.password
      });
      setFormData({ email: '', password: '' });
    } catch (err) {
      alert(err.message || 'Error creating user');
    }
  };

  const pendingUsers = users.filter(u => u.approvalStatus === 'PENDING' && u.accountStatus !== 'REMOVED');
  const currentTeam = users.filter(u => u.accountStatus === 'ACTIVE' && u.approvalStatus === 'APPROVED');

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '40px 20px', overflowY: 'auto', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ width: '100%', maxWidth: '420px', backgroundColor: '#060a11', borderRadius: '16px', position: 'relative', overflow: 'hidden', border: '1px solid #1e293b' }}>
        
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '18px', color: '#f8fafc', fontWeight: 'bold' }}>Team Management</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '18px' }}><FaTimes /></button>
        </div>

        <div style={{ padding: '24px' }}>
          {/* STEP 1 */}
          <div style={{ border: '1px solid #1e293b', borderRadius: '12px', padding: '24px', backgroundColor: '#0f172a', marginBottom: '24px' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#3b82f6', fontSize: '15px', fontWeight: '600', letterSpacing: '0.5px', marginBottom: '24px', textTransform: 'uppercase' }}>
              <FaPlus size={14}/> STEP 1: CREATE MEMBER
            </h3>
            <form onSubmit={handleAddSubmit}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', color: '#94a3b8', marginBottom: '8px', fontWeight: '500' }}>Gmail Address</label>
                <input 
                  type="email" 
                  placeholder="member@gmail.com" 
                  required 
                  value={formData.email} 
                  onChange={e => setFormData({...formData, email: e.target.value})}
                  style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #1e293b', padding: '12px 16px', borderRadius: '8px', color: '#f8fafc', fontSize: '14px', outline: 'none' }}
                />
              </div>
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '13px', color: '#94a3b8', marginBottom: '8px', fontWeight: '500' }}>Assign Password</label>
                <input 
                  type="text" 
                  placeholder="set-password-123" 
                  required 
                  value={formData.password} 
                  onChange={e => setFormData({...formData, password: e.target.value})}
                  style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #1e293b', padding: '12px 16px', borderRadius: '8px', color: '#f8fafc', fontSize: '14px', outline: 'none' }}
                />
              </div>
              <button type="submit" style={{ width: '100%', backgroundColor: '#2563eb', color: 'white', border: 'none', padding: '14px', borderRadius: '8px', fontWeight: '600', fontSize: '15px', cursor: 'pointer' }}>
                Create & Invite Member
              </button>
              <div style={{ textAlign: 'center', marginTop: '16px', fontSize: '12px', color: '#64748b' }}>
                * User will be created with <span style={{ color: '#eab308' }}>PENDING</span> status until you approve them below.
              </div>
            </form>
          </div>

          {/* STEP 2 */}
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#eab308', fontSize: '15px', fontWeight: '600', letterSpacing: '0.5px', marginBottom: '16px', textTransform: 'uppercase' }}>
            <FaRegClock size={16}/> STEP 2: PENDING REQUESTS
          </h3>
          
          {pendingUsers.length === 0 ? (
            <div style={{ border: '1px dashed #1e293b', borderRadius: '12px', padding: '32px', textAlign: 'center', color: '#64748b', fontSize: '14px', marginBottom: '32px' }}>
              No pending join requests.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '32px' }}>
              {pendingUsers.map(user => (
                <div key={user._id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid #1e293b', backgroundColor: '#0f172a', borderRadius: '8px', padding: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#3f3f46', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '600', color: '#d4d4d8' }}>
                      {user.email[0].toUpperCase()}
                    </div>
                    <span style={{ fontSize: '15px', color: '#e2e8f0' }}>{user.email}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => { updateUserStatus(user._id, 'approve'); socket?.emit('admin:approve-user', user._id); }} style={{ backgroundColor: '#22c55e', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', fontSize: '12px', cursor: 'pointer', fontWeight: '600' }}>Approve</button>
                    <button onClick={() => { updateUserStatus(user._id, 'reject'); socket?.emit('admin:reject-user', user._id); }} style={{ backgroundColor: 'transparent', color: '#ef4444', border: '1px solid #ef4444', padding: '6px 12px', borderRadius: '4px', fontSize: '12px', cursor: 'pointer', fontWeight: '600' }}>Reject</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* TEAM */}
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#22c55e', fontSize: '15px', fontWeight: '600', letterSpacing: '0.5px', marginBottom: '16px', textTransform: 'uppercase' }}>
            <FaUserFriends size={16}/> CURRENT TEAM
          </h3>
          
          {currentTeam.length === 0 ? (
            <div style={{ border: '1px solid #1e293b', backgroundColor: '#0f172a', borderRadius: '12px', padding: '32px', textAlign: 'center', color: '#64748b', fontSize: '14px' }}>
              No team members yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {currentTeam.map(user => (
                <div key={user._id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid #1e293b', backgroundColor: '#0f172a', borderRadius: '8px', padding: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#064e3b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 'bold', color: '#34d399' }}>
                      {user.email[0].toUpperCase()}
                    </div>
                    <span style={{ fontSize: '15px', color: '#e2e8f0' }}>{user.email}</span>
                  </div>
                  <button 
                    onClick={() => { removeUser(user._id); socket?.emit('admin:remove-user', user._id); }}
                    style={{ backgroundColor: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '16px', padding: '8px' }}
                  >
                    <FaTrash />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default TeamModal;
