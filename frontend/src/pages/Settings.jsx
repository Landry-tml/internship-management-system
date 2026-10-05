import React, { useEffect, useState } from 'react';
import { Globe2, Loader2, Mail, Moon, Phone, Save, Settings as SettingsIcon, Sun, UserRound } from 'lucide-react';
import api from '../services/api';

export default function Settings({ user, language, onLanguageChange, theme = 'light', onThemeChange = () => {}, onProfileUpdated }) {
  const [profile, setProfile] = useState({
    name: user.name || '',
    phone: user.phone || '',
    bio: user.bio || '',
    avatar: user.avatar || ''
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    setProfile({
      name: user.name || '',
      phone: user.phone || '',
      bio: user.bio || '',
      avatar: user.avatar || ''
    });
  }, [user]);

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const response = await api.put('/users/profile', profile);
      if (!response.data?.user) throw new Error('The profile service returned an invalid response.');
      onProfileUpdated(response.data.user);
      setSuccess('Profile updated successfully.');
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Unable to update your profile.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '1040px', margin: '0 auto' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div style={{ width: '48px', height: '48px', borderRadius: '15px', display: 'grid', placeItems: 'center', color: '#fff', background: 'linear-gradient(135deg, #2563eb, #7c3aed)', boxShadow: '0 8px 18px rgba(37,99,235,0.2)' }}>
          <SettingsIcon size={23} aria-hidden="true" />
        </div>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a' }}>Settings</h1>
          <p style={{ color: '#64748b', fontSize: '0.88rem' }}>Manage your profile and display preferences.</p>
        </div>
      </header>

      {error && <div role="alert" className="glass-card" style={{ padding: '12px 16px', color: '#b91c1c', background: '#fef2f2' }}>{error}</div>}
      {success && <div role="status" className="glass-card" style={{ padding: '12px 16px', color: '#166534', background: '#f0fdf4' }}>{success}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', gap: '20px', alignItems: 'start' }}>
        <form onSubmit={handleSubmit} className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingBottom: '16px', borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ width: '46px', height: '46px', borderRadius: '50%', display: 'grid', placeItems: 'center', background: '#dbeafe', color: '#1d4ed8', fontWeight: 800, fontSize: '1.1rem' }}>
              {profile.name.trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('') || <UserRound size={20} />}
            </div>
            <div>
              <h2 style={{ color: '#0f172a', fontSize: '1.1rem', fontWeight: 750 }}>Profile information</h2>
              <p style={{ color: '#64748b', fontSize: '0.8rem', textTransform: 'capitalize' }}>{user.role} account</p>
            </div>
          </div>
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label htmlFor="settings-name">Full name</label>
            <input id="settings-name" className="input-field" maxLength={100} required value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} placeholder="Example: Alex Rivera" />
          </div>
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label htmlFor="settings-email">Email</label>
            <div style={{ position: 'relative' }}>
              <Mail size={16} aria-hidden="true" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
              <input id="settings-email" className="input-field" value={user.email || ''} disabled readOnly style={{ paddingLeft: '38px', background: '#f8fafc', color: '#475569' }} />
            </div>
            <small style={{ color: '#64748b' }}>Contact an administrator if you need to change this address.</small>
          </div>
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label htmlFor="settings-phone">Phone</label>
            <div style={{ position: 'relative' }}>
              <Phone size={16} aria-hidden="true" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
              <input id="settings-phone" className="input-field" maxLength={30} value={profile.phone} onChange={(event) => setProfile({ ...profile, phone: event.target.value })} placeholder="Example: +1 555 010 1234" style={{ paddingLeft: '38px' }} />
            </div>
          </div>
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label htmlFor="settings-bio">Biography</label>
            <textarea id="settings-bio" className="input-field" rows="4" maxLength={2000} value={profile.bio} onChange={(event) => setProfile({ ...profile, bio: event.target.value })} placeholder="Example: Final-year computer science student interested in web development and data analytics." />
            <small style={{ color: '#64748b' }}>{profile.bio.length}/2000 characters</small>
          </div>
          <button type="submit" className="btn-primary" disabled={saving} style={{ alignSelf: 'flex-start', minWidth: '168px', justifyContent: 'center' }}>
            {saving ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />}
            {saving ? 'Saving' : 'Save changes'}
          </button>
        </form>

        <section className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '13px', display: 'grid', placeItems: 'center', color: '#047857', background: '#d1fae5' }}>
            <Globe2 size={21} aria-hidden="true" />
          </div>
          <div>
            <h2 style={{ color: '#0f172a', fontSize: '1.1rem', fontWeight: 750 }}>Display language</h2>
            <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: '5px' }}>Choose your preferred language for the application.</p>
          </div>
          <label htmlFor="settings-language" style={{ color: '#334155', fontSize: '0.85rem', fontWeight: 650 }}>Language</label>
          <select
            id="settings-language"
            className="input-field"
            value={language}
            onChange={(event) => onLanguageChange(event.target.value)}
            style={{ color: '#0f172a', backgroundColor: '#fff', width: '100%' }}
          >
            <option value="en">English</option>
            <option value="fr">Français</option>
          </select>
          <div style={{ borderRadius: '12px', padding: '14px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
            <p style={{ color: '#475569', fontSize: '0.82rem', lineHeight: 1.6 }}>
              {language === 'fr'
                ? 'La préférence de langue est enregistrée sur cet appareil et s’applique à l’interface.'
                : 'Your language preference is saved on this device and applied to the interface.'}
            </p>
          </div>
        </section>

        <section className="glass-card settings-theme-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '13px', display: 'grid', placeItems: 'center', color: '#4338ca', background: '#e0e7ff' }}>
            {theme === 'dark' ? <Moon size={21} aria-hidden="true" /> : <Sun size={21} aria-hidden="true" />}
          </div>
          <div>
            <h2 style={{ color: '#0f172a', fontSize: '1.1rem', fontWeight: 750 }}>Appearance</h2>
            <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: '5px' }}>Choose a comfortable display theme for this device.</p>
          </div>
          <label className="theme-toggle-row" htmlFor="settings-theme">
            <span>{theme === 'dark' ? 'Dark mode' : 'Light mode'}</span>
            <input
              id="settings-theme"
              type="checkbox"
              role="switch"
              checked={theme === 'dark'}
              onChange={(event) => onThemeChange(event.target.checked ? 'dark' : 'light')}
            />
            <span className="theme-toggle-track" aria-hidden="true"><span /></span>
          </label>
          <small style={{ color: '#64748b' }}>Your theme preference is saved on this device.</small>
        </section>
      </div>
    </div>
  );
}
