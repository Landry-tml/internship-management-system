import React, { useState, useEffect } from 'react';
import { ArrowRight, CheckCircle, AlertCircle, GraduationCap, Loader2 } from 'lucide-react';
import api from '../services/api';

export default function Register({ onRegisterSuccess, onSwitchToLogin, onSwitchToHome }) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'intern',
    phone: '',
    bio: ''
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [verifyingEmail, setVerifyingEmail] = useState(false);
  const [emailStatus, setEmailStatus] = useState(null);

  useEffect(() => {
    if (!formData.email || formData.email.trim().length < 5 || !formData.email.includes('@')) {
      setEmailStatus(null);
      return;
    }

    const timer = setTimeout(async () => {
      setVerifyingEmail(true);
      try {
        const res = await api.post('/auth/verify-email', { email: formData.email });
        setEmailStatus(res.data);
      } catch (err) {
        setEmailStatus({ isValid: false, reason: 'Failed email validation service.' });
      } finally {
        setVerifyingEmail(false);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [formData.email]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (emailStatus && !emailStatus.isValid) {
      setError(`Email Check Failed: ${emailStatus.reason}`);
      return;
    }

    setLoading(true);

    try {
      const response = await api.post('/auth/register', formData);
      const { user, token } = response.data;
      localStorage.setItem('ims_token', token);
      localStorage.setItem('ims_user', JSON.stringify(user));
      onRegisterSuccess(user);
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-page register-page">
      <div className="glass-card register-card animate-fade-in">
        <header className="register-heading">
          <span className="register-brand-mark"><GraduationCap size={23} /></span>
          <h1>Create Account</h1>
          <p>Register to access the Internship Management System</p>
        </header>

        {error && (
          <div style={{ background: 'rgba(244,63,94,0.15)', border: '1px solid rgba(244,63,94,0.3)', color: '#f87171', padding: '12px', borderRadius: '12px', fontSize: '0.85rem', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={18} /> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="register-form">
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label>Full Name</label>
            <input
              type="text"
              className="input-field"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Full name"
              required
              style={{ width: '100%' }}
            />
          </div>

          <div className="input-group" style={{ marginBottom: 0 }}>
            <label>Real Email Address</label>
            <input
              type="email"
              className="input-field"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="name@university.edu"
              required
              style={{ width: '100%' }}
            />
            <div style={{ marginTop: '4px', minHeight: '20px' }}>
              {verifyingEmail ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#a5b4fc' }}>
                  <Loader2 size={14} className="animate-spin" />                   Verifying email domain...
                </div>
              ) : emailStatus ? (
                emailStatus.isValid ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#34d399', fontWeight: 600 }}>
                    <CheckCircle size={14} /> {emailStatus.reason}
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#f87171', fontWeight: 600 }}>
                    <AlertCircle size={14} /> {emailStatus.reason}
                  </div>
                )
              ) : null}
            </div>
          </div>

          <div className="input-group" style={{ marginBottom: 0 }}>
            <label>Password</label>
            <input
              type="password"
              className="input-field"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              placeholder="Enter a password"
              required
              style={{ width: '100%' }}
            />
          </div>

          <div className="responsive-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="input-group" style={{ marginBottom: 0 }}>
              <label>Role</label>
              <select
                className="input-field"
                style={{ color: '#0f172a', backgroundColor: '#fff' }}
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              >
                <option value="intern" style={{ color: '#0f172a', backgroundColor: '#fff' }}>Intern Student</option>
                <option value="visitor" style={{ color: '#0f172a', backgroundColor: '#fff' }}>Visitor / Applicant</option>
                <option value="supervisor" style={{ color: '#0f172a', backgroundColor: '#fff' }}>Supervisor</option>
              </select>
            </div>

            <div className="input-group" style={{ marginBottom: 0 }}>
              <label>Phone Number</label>
              <input
                type="text"
                className="input-field"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="Phone number"
                style={{ width: '100%' }}
              />
            </div>
          </div>

          <button type="submit" className="btn-primary register-submit" disabled={loading}>
            {loading ? <><Loader2 size={18} className="animate-spin" /> Creating account...</> : <>Create Account <ArrowRight size={17} /></>}
          </button>
        </form>

        <div className="auth-switch">
          <p>
            Already have an account?{' '}
            <button type="button" onClick={onSwitchToLogin}>
              Sign In
            </button>
            {onSwitchToHome && (
              <>
                {' · '}
                <button type="button" onClick={onSwitchToHome}>Back to Home</button>
              </>
            )}
          </p>
        </div>
      </div>
    </main>
  );
}
