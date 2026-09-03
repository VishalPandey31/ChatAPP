import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const { login, user } = useAuthStore();
  const navigate = useNavigate();

  // Pre-warm: fire a health ping when this page mounts (supplements App.jsx global warm-up)
  const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
  React.useEffect(() => {
    if (user) { navigate('/projects'); return; }
    fetch(`${BACKEND_URL}/api/health`, { mode: 'cors', credentials: 'include' }).catch(() => {});
  }, [user, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isLoading) return;
    setError('');
    setIsLoading(true);
    setLoadingMessage('Authenticating...');

    // Render free-tier cold start takes up to ~50s.
    // 8 attempts with 3s base × 1.4x backoff = ~70s total coverage.
    let attempt = 0;
    const maxRetries = 8;
    let delay = 3000;

    while (attempt < maxRetries) {
      try {
        await login({ email, password });
        import('../store/projectStore').then(m => m.useProjectStore.getState().fetchProjects());
        navigate('/projects');
        return; // Success, exit
      } catch (err) {
        const isNetworkError = err.message === 'Failed to fetch' || err.message?.includes('NetworkError');
        if (isNetworkError) {
           attempt++;
           if (attempt >= maxRetries) {
             setError('Server is genuinely unreachable. Please check your connection or try again later.');
             break;
           }
           const secs = Math.ceil(delay / 1000);
           setLoadingMessage(`Server is waking up... (Attempt ${attempt}/${maxRetries} — retrying in ${secs}s)`);
           await new Promise(resolve => setTimeout(resolve, delay));
           delay = Math.floor(delay * 1.4);
        } else {
           setError(err.message || 'Login failed. Please check credentials.');
           break;
        }
      }
    }
    setIsLoading(false);
    setLoadingMessage('');
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
            autoComplete="email"
          />
          <input 
            type="password" 
            className="input-field" 
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
          <button type="submit" className="btn" style={{ width: '100%', opacity: isLoading ? 0.7 : 1, cursor: isLoading ? 'not-allowed' : 'pointer' }} disabled={isLoading}>
            {isLoading ? loadingMessage : 'Login'}
          </button>
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
