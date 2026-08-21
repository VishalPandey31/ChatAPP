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
        // iOS and Android generic scheme for YouTube App
        window.location.replace("vnd.youtube://");
        setTimeout(() => {
             // Fallback for laptops/desktops where scheme fails
             window.location.replace("https://www.youtube.com");
        }, 500);
        return;
    }

    checkAuth();

    const handleUnload = () => {
      // Fire synchronous HTTP logout without expecting Response logic
      useAuthStore.getState().logout(true);
    };

    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
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
