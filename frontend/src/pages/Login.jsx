import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login, user } = useAuthStore();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (user) navigate('/projects');
  }, [user, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await login({ email, password });
      navigate('/projects');
    } catch (err) {
      setError(err.message || 'Login failed. Please check credentials.');
    }
  };

  return (
    <div className="auth-container animate-fade-in">
      <div className="auth-box">
        <div className="auth-header">
          <h2>User Login</h2>
          <p>Login with credentials provided by your Administrator.</p>
        </div>
        
        {error && <div style={{ color: 'var(--danger-color)', marginBottom: '16px', fontSize: '14px', textAlign: 'center' }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <input 
            type="email" 
            className="input-field" 
            placeholder="Email Address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input 
            type="password" 
            className="input-field" 
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit" className="btn" style={{ width: '100%' }}>Login</button>
        </form>

        <div className="auth-links" style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <Link to="/login" className="auth-link">Login as User</Link>
          <Link to="/admin/login" className="auth-link">Login as Admin</Link>
          <Link to="/admin/register" className="auth-link">Register as Admin</Link>
        </div>
      </div>
    </div>
  );
};

export default Login;
