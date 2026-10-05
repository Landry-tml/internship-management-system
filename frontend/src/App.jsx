import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import NotificationCenter from './components/NotificationCenter';
import Login from './pages/Login';
import Register from './pages/Register';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import Internships from './pages/Internships';
import Applications from './pages/Applications';
import Tasks from './pages/Tasks';
import Reports from './pages/Reports';
import Evaluations from './pages/Evaluations';
import Feedbacks from './pages/Feedbacks';
import Analytics from './pages/Analytics';
import AdminUsers from './pages/AdminUsers';
import Settings from './pages/Settings';
import { localizeApplication } from './i18n';

export default function App() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('home');
  const [language, setLanguage] = useState(() => localStorage.getItem('ims_language') === 'fr' ? 'fr' : 'en');
  const [theme, setTheme] = useState(() => localStorage.getItem('ims_theme') === 'dark' ? 'dark' : 'light');

  useEffect(() => {
    const savedUser = localStorage.getItem('ims_user');
    const token = localStorage.getItem('ims_token');
    if (savedUser && token) {
      try {
        setUser(JSON.parse(savedUser));
        setActiveTab('dashboard');
      } catch (e) {
        localStorage.removeItem('ims_user');
      }
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
    const root = document.querySelector('.app-container');
    if (!root) return undefined;

    const applyLanguage = () => localizeApplication(root, language);
    applyLanguage();
    const observer = new MutationObserver(applyLanguage);
    observer.observe(root, { childList: true, characterData: true, subtree: true });
    return () => observer.disconnect();
  }, [language, user, activeTab]);

  const handleLanguageChange = (nextLanguage) => {
    const normalizedLanguage = nextLanguage === 'fr' ? 'fr' : 'en';
    localStorage.setItem('ims_language', normalizedLanguage);
    setLanguage(normalizedLanguage);
  };

  const handleThemeChange = (nextTheme) => {
    const normalizedTheme = nextTheme === 'dark' ? 'dark' : 'light';
    localStorage.setItem('ims_theme', normalizedTheme);
    setTheme(normalizedTheme);
  };

  const handleProfileUpdated = (updatedUser) => {
    const nextUser = { ...user, ...updatedUser };
    localStorage.setItem('ims_user', JSON.stringify(nextUser));
    setUser(nextUser);
  };

  const handleLoginSuccess = (userData) => {
    setUser(userData);
    setActiveTab('dashboard');
  };

  const handleLogout = () => {
    localStorage.removeItem('ims_token');
    localStorage.removeItem('ims_user');
    setUser(null);
    setActiveTab('login');
  };

  if (!user) {
    if (activeTab === 'home') {
      return (
        <Home
          onLogin={() => setActiveTab('login')}
          onRegister={() => setActiveTab('register')}
        />
      );
    }
    if (activeTab === 'register') {
      return (
        <Register
          onRegisterSuccess={handleLoginSuccess}
          onSwitchToLogin={() => setActiveTab('login')}
          onSwitchToHome={() => setActiveTab('home')}
        />
      );
    }
    return (
      <Login
        onLoginSuccess={handleLoginSuccess}
        onSwitchToRegister={() => setActiveTab('register')}
        onSwitchToHome={() => setActiveTab('home')}
      />
    );
  }

  return (
    <div className="app-container" data-theme={theme}>
      <Sidebar
        user={user}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onLogout={handleLogout}
      />

      <main className="main-content">
        <NotificationCenter user={user} />
        {activeTab === 'dashboard' && <Dashboard user={user} setActiveTab={setActiveTab} />}
        {activeTab === 'internships' && <Internships user={user} />}
        {activeTab === 'applications' && <Applications user={user} />}
        {activeTab === 'tasks' && <Tasks user={user} />}
        {activeTab === 'reports' && <Reports user={user} />}
        {activeTab === 'evaluations' && <Evaluations user={user} />}
        {activeTab === 'feedbacks' && <Feedbacks user={user} />}
        {activeTab === 'analytics' && <Analytics />}
        {activeTab === 'users' && <AdminUsers />}
        {activeTab === 'settings' && (
          <Settings
            user={user}
            language={language}
            onLanguageChange={handleLanguageChange}
            theme={theme}
            onThemeChange={handleThemeChange}
            onProfileUpdated={handleProfileUpdated}
          />
        )}
      </main>
    </div>
  );
}
