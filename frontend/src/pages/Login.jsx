import React, { useState } from 'react';
import { AlertCircle, ArrowRight, Eye, EyeOff, GraduationCap, LockKeyhole, Mail, Loader2 } from 'lucide-react';
import api from '../services/api';

export default function Login({ onLoginSuccess, onSwitchToRegister, onSwitchToHome }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [forgotPassword, setForgotPassword] = useState(false);
  const [resetCodeSent, setResetCodeSent] = useState(false);
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (!forgotPassword) {
        const response = await api.post('/auth/login', { email, password });
        const { user, token } = response.data;
        localStorage.setItem('ims_token', token);
        localStorage.setItem('ims_user', JSON.stringify(user));
        onLoginSuccess(user);
      } else if (!resetCodeSent) {
        const response = await api.post('/auth/password-reset/request', { email });
        setResetCodeSent(true);
        if (response.data?.devCode) {
          setResetCode(response.data.devCode);
        }
        setSuccess(response.data?.message || 'If an account exists for this email, a password reset code will be sent shortly.');
      } else {
        const response = await api.post('/auth/password-reset/confirm', {
          email,
          code: resetCode,
          password: newPassword
        });
        setForgotPassword(false);
        setResetCodeSent(false);
        setResetCode('');
        setNewPassword('');
        setPassword('');
        setSuccess(response.data?.message || 'Password reset successfully. Sign in with your new password.');
      }
    } catch (err) {
      setError(err.response?.data?.error || (forgotPassword
        ? 'Password reset failed. Check your information and try again.'
        : 'Login failed. Please check your credentials.'));
    } finally {
      setLoading(false);
    }
  };

  const switchToForgotPassword = () => {
    setForgotPassword(true);
    setResetCodeSent(false);
    setError('');
    setSuccess('');
  };

  const returnToLogin = () => {
    setForgotPassword(false);
    setResetCodeSent(false);
    setResetCode('');
    setNewPassword('');
    setError('');
    setSuccess('');
  };

  return (
    <main className="auth-page login-page">
      <div className="login-card animate-fade-in">
        <section className="login-hero">
          <div className="login-hero-content">
            <div className="login-brand">
              <span className="login-brand-mark"><GraduationCap size={22} /></span>
              <span>IMS</span>
            </div>
            <h1>Internship Management System</h1>
            <p>
              Connecting interns, supervisors, and academic institutions for placement tracking,
              milestone task management, and automated AI evaluations.
            </p>
          </div>
        </section>

        <section className="login-form-panel">
          <div className="login-form-inner">
            <header className="login-heading">
              <span className="auth-eyebrow">Secure access</span>
              <h2>{forgotPassword ? (resetCodeSent ? 'Reset Your Password' : 'Forgot Password?') : 'Sign In to Dashboard'}</h2>
              <p>{forgotPassword
                ? resetCodeSent
                  ? 'Enter the six-digit code sent to your email and choose a new password.'
                  : 'Enter your account email and we’ll send you a password reset code.'
                : 'Enter your registered credentials to access your account.'}</p>
            </header>

            {success && <div role="status" className="auth-success">{success}</div>}
            {error && (
              <div role="alert" className="auth-error">
                <AlertCircle size={17} aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="login-form">
              <div className="input-group">
                <label htmlFor="login-email">Email Address</label>
                <div className="auth-input-wrap">
                  <Mail size={17} aria-hidden="true" />
                  <input
                    id="login-email"
                    type="email"
                    className="input-field auth-input"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="name@organization.com"
                    autoComplete="username"
                    readOnly={forgotPassword && resetCodeSent}
                    required
                  />
                </div>
              </div>

              {!forgotPassword && (
              <div className="input-group">
                <label htmlFor="login-password">Password</label>
                <div className="auth-input-wrap">
                  <LockKeyhole size={17} aria-hidden="true" />
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    className="input-field auth-input"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    className="password-visibility"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword((visible) => !visible)}
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>
              )}

              {forgotPassword && resetCodeSent && (
                <>
                  <div className="input-group">
                    <label htmlFor="reset-code">Password reset code</label>
                    <input
                      id="reset-code"
                      type="text"
                      className="input-field auth-input"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      value={resetCode}
                      onChange={(event) => setResetCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="Enter 6-digit code"
                      required
                    />
                  </div>
                  <div className="input-group">
                    <label htmlFor="new-password">New password</label>
                    <input
                      id="new-password"
                      type="password"
                      className="input-field auth-input"
                      autoComplete="new-password"
                      minLength={8}
                      maxLength={128}
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      placeholder="Choose a new password"
                      required
                    />
                  </div>
                </>
              )}

              {!forgotPassword && (
                <button type="button" className="auth-forgot-link" onClick={switchToForgotPassword}>
                  Forgot password?
                </button>
              )}

              <button type="submit" className="btn-primary login-submit" disabled={loading}>
                {loading
                  ? <><Loader2 size={17} className="animate-spin" /> {forgotPassword ? resetCodeSent ? 'Resetting password...' : 'Sending code...' : 'Signing in...'}</>
                  : forgotPassword
                    ? resetCodeSent ? <>Reset Password <ArrowRight size={17} /></> : <>Send Reset Code <ArrowRight size={17} /></>
                    : <>Sign In <ArrowRight size={17} /></>}
              </button>
            </form>

            <p className="auth-switch">
              {forgotPassword ? (
                <button type="button" onClick={returnToLogin}>Back to Sign In</button>
              ) : (
                <>
                  Don&apos;t have an account?{' '}
                  <button type="button" onClick={onSwitchToRegister}>Create Account</button>
                </>
              )}
              {!forgotPassword && onSwitchToHome && (
                <>
                  {' · '}
                  <button type="button" onClick={onSwitchToHome}>Back to Home</button>
                </>
              )}
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
