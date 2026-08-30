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

    // Reload Hijacking Security - Redirect to native YouTube App
    const navEntries = performance.getEntriesByType("navigation");
    if (navEntries.length > 0 && navEntries[0].type === "reload") {
        if (sessionStorage.getItem('youtube_redirected')) {
            sessionStorage.removeItem('youtube_redirected');
        } else {
            sessionStorage.setItem('youtube_redirected', 'true');
            const ua = navigator.userAgent || navigator.vendor || window.opera;
            if (/android/i.test(ua)) {
                window.location.replace("vnd.youtube://");
                setTimeout(() => {
                    window.location.replace("https://m.youtube.com");
                }, 600);
            } else if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) {
                window.location.replace("youtube://www.youtube.com/");
                setTimeout(() => {
                    window.location.replace("https://www.youtube.com");
                }, 600);
            } else {
                window.location.replace("https://www.youtube.com");
            }
            return;
        }
    }

    const hasActiveSession = sessionStorage.getItem('active_session_flag');
    if (!hasActiveSession) {
        sessionStorage.setItem('active_session_flag', 'true');
        useAuthStore.getState().logout(false).then(() => {
            checkAuth();
        });
    } else {
        checkAuth();
    }

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
