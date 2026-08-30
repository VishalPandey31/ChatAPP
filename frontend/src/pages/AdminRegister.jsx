import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

const AdminRegister = () => {
  const [formData, setFormData] = useState({
    secretCode: '',
    email: '',
    password: '',
    confirmPassword: '',
    securityQuestionAnswer: ''
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const { registerAdmin, user } = useAuthStore();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (user) navigate('/projects');
  }, [user, navigate]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isLoading) return;
    setError('');
    
    if (formData.password !== formData.confirmPassword) {
      return setError('Passwords do not match.');
    }

    setIsLoading(true);
    setLoadingMessage('Registering...');

    let attempt = 0;
    const maxRetries = 5;
    let delay = 2000;

    while (attempt < maxRetries) {
      try {
        await registerAdmin(formData);
        navigate('/projects');
        return; // Success, exit
      } catch (err) {
        if (err.message === 'Failed to fetch') {
           attempt++;
           if (attempt >= maxRetries) {
             setError('Server is genuinely unreachable. Please check your connection or try again later.');
             break;
           }
           setLoadingMessage(`Waking up backend... (Attempt ${attempt}/${maxRetries} - retrying in ${delay/1000}s)`);
           await new Promise(resolve => setTimeout(resolve, delay));
           delay = Math.floor(delay * 1.5);
        } else {
           setError(err.message || 'Registration failed. Check credentials.');
           break;
        }
      }
    }
    setIsLoading(false);
    setLoadingMessage('');
  };

  return (
    <div className="auth-container animate-fade-in">
      <div className="auth-box" style={{ borderColor: 'var(--accent-color)' }}>
        <div className="auth-header">
          <h2>Admin Registration</h2>
          <p>Restricted access point. Secure initialization only.</p>
        </div>
        
        {error && <div style={{ color: 'var(--danger-color)', marginBottom: '16px', fontSize: '14px', textAlign: 'center' }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <input 
            type="password" 
            name="secretCode"
            className="input-field" 
            placeholder="Admin Secret Code"
            value={formData.secretCode}
            onChange={handleChange}
            required
          />
          <input 
            type="email" 
            name="email"
            className="input-field" 
            placeholder="Admin Email Address"
            value={formData.email}
            onChange={handleChange}
            required
          />
          <input 
            type="password" 
            name="password"
            className="input-field" 
            placeholder="Password"
            value={formData.password}
            onChange={handleChange}
            required
          />
          <input 
            type="password" 
            name="confirmPassword"
            className="input-field" 
            placeholder="Confirm Password"
            value={formData.confirmPassword}
            onChange={handleChange}
            required
          />
          
          <div style={{ marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '14px' }}>
            Security Question: What's your best game?
          </div>
          <input 
            type="text" 
            name="securityQuestionAnswer"
            className="input-field" 
            placeholder="Answer"
            value={formData.securityQuestionAnswer}
            onChange={handleChange}
            required
          />

          <button type="submit" className="btn btn-secondary" style={{ width: '100%', color: 'var(--accent-color)', opacity: isLoading ? 0.7 : 1, cursor: isLoading ? 'not-allowed' : 'pointer' }} disabled={isLoading}>
            {isLoading ? loadingMessage : 'Register Admin'}
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

export default AdminRegister;
