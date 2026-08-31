import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import AdminLogin from './pages/AdminLogin';
import AdminRegister from './pages/AdminRegister';
import ProjectDashboard from './pages/ProjectDashboard';
import ChatApp from './pages/ChatApp';
import { useAuthStore } from './store/authStore';

const ProtectedRoute = ({ children, requireAdmin = false }) => {
  const { user, isCheckingAuth } = useAuthStore();
  
  if (isCheckingAuth) return <div style={{height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center'}}>Loading...</div>;

  if (!user) return <Navigate to="/login" />;

  if (requireAdmin && user.role !== 'ADMIN') return <Navigate to="/projects" />;

  return children;
};

const App = () => {
  const { checkAuth } = useAuthStore();

  useEffect(() => {
    // ─── BACKEND PRE-WARM ───────────────────────────────────────────
    // Fire-and-forget: wake Render backend IMMEDIATELY when any page loads.
    // By the time the user types credentials (~10-15s), the server is awake.
    const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
    fetch(`${BACKEND_URL}/api/health`, { mode: 'cors', credentials: 'include' }).catch(() => {});

    // Validate the persistent httpOnly session cookie on every page load/refresh.
    // If no valid session exists, checkAuth sets user: null and ProtectedRoute
    // redirects to /login automatically.
    checkAuth();

    // Globally sync Background Service Worker push connection on boot if previously granted
    if (window.Notification && window.Notification.permission === 'granted') {
        import('./utils/pushService').then(({ subscribeToPushNotifications }) => {
            subscribeToPushNotifications();
        }).catch(err => console.error("Global SW sync failed", err));
    }
  }, [checkAuth]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" />} />
        <Route path="/login" element={<Login />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin/register" element={<AdminRegister />} />
        
        <Route path="/projects" element={
          <ProtectedRoute>
            <ProjectDashboard />
          </ProtectedRoute>
        } />

        {/* Can accommodate /chat or /chat/:projectId depending on need */}
        <Route path="/chat/:projectId?" element={
          <ProtectedRoute>
            <ChatApp />
          </ProtectedRoute>
        } />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
