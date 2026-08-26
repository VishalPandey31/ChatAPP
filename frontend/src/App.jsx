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
    // Reload Hijacking Security - Redirect to native YouTube App
    const navEntries = performance.getEntriesByType("navigation");
    if (navEntries.length > 0 && navEntries[0].type === "reload") {
        if (sessionStorage.getItem('youtube_redirected')) {
            // We just came back from a redirect (e.g. Chrome tab restoration loop)
            // Allow the user to stay on our site this time, but reset the flag.
            sessionStorage.removeItem('youtube_redirected');
        } else {
            sessionStorage.setItem('youtube_redirected', 'true');
            const ua = navigator.userAgent || navigator.vendor || window.opera;
            if (/android/i.test(ua)) {
                // Native Android App Link - Use vnd.youtube to skip intent popup
                window.location.replace("vnd.youtube://");
                setTimeout(() => {
                    window.location.replace("https://m.youtube.com");
                }, 600);
            } else if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) {
                // iOS Custom URL Scheme
                window.location.replace("youtube://www.youtube.com/");
                // Fallback for iOS if app is missing
                setTimeout(() => {
                    window.location.replace("https://www.youtube.com");
                }, 600);
            } else {
                // Desktop fallback
                window.location.replace("https://www.youtube.com");
            }
            return;
        }
    }

    const navEntries = performance.getEntriesByType("navigation");
    const isReload = navEntries.length > 0 && navEntries[0].type === "reload";

    const enforceSecurity = () => {
        const lastActiveStr = sessionStorage.getItem('last_active_time');
        const now = Date.now();
        
        if (isReload) {
            sessionStorage.setItem('last_active_time', now.toString()); // Allow
            checkAuth();
            return;
        }

        // If no time (fresh tab), or explicitly zeroed by unload, or backgrounded for > 30 seconds
        if (!lastActiveStr || lastActiveStr === '0' || (now - parseInt(lastActiveStr, 10)) > 30000) {
            sessionStorage.setItem('last_active_time', now.toString());
            useAuthStore.getState().logout(false).then(() => { checkAuth(); });
        } else {
            sessionStorage.setItem('last_active_time', now.toString());
            checkAuth();
        }
    };
    
    enforceSecurity();

    const handleUnload = () => {
        sessionStorage.setItem('last_active_time', '0');
        // We still try to explicitly signal the backend since the user is leaving
        useAuthStore.getState().logout(true);
    };

    const heartbeatInterval = setInterval(() => {
        if (document.visibilityState === 'visible') {
            sessionStorage.setItem('last_active_time', Date.now().toString());
        }
    }, 5000);

    const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
            enforceSecurity();
        } else {
            sessionStorage.setItem('last_active_time', Date.now().toString());
        }
    };

    window.addEventListener('beforeunload', handleUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Globally sync Background Service Worker push connection on boot if previously granted
    if (window.Notification && window.Notification.permission === 'granted') {
        import('./utils/pushService').then(({ subscribeToPushNotifications }) => {
            subscribeToPushNotifications();
        }).catch(err => console.error("Global SW sync failed", err));
    }
    return () => {
        window.removeEventListener('beforeunload', handleUnload);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        clearInterval(heartbeatInterval);
    };
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
