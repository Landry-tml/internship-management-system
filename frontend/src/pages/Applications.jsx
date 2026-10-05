import React, { useEffect, useState } from 'react';
import { FileCheck, Building2, User, Loader2 } from 'lucide-react';
import api from '../services/api';
import SecureFileLink from '../components/SecureFileLink';

export default function Applications({ user }) {
  const [applications, setApplications] = useState([]);
  const [supervisors, setSupervisors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    fetchApplications();
    if (user.role === 'admin') fetchSupervisors();
  }, [user]);

  async function fetchApplications() {
    setLoading(true);
    setError('');
    try {
      const endpoint = ['intern', 'visitor'].includes(user.role) ? '/applications/my' : '/applications';
      const res = await api.get(endpoint);
      setApplications(res.data.applications || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Unable to load applications.');
    } finally {
      setLoading(false);
    }
  }

  async function fetchSupervisors() {
    try {
      const res = await api.get('/users');
      setSupervisors((res.data.users || []).filter((item) => item.role === 'supervisor' && item.is_active !== false && item.is_active !== 0));
    } catch (err) {
      setError(err.response?.data?.error || 'Unable to load supervisors.');
    }
  }

  async function updateStatus(id, status) {
    setBusyId(id);
    setError('');
    try {
      await api.put(`/applications/${id}/status`, { status });
      await fetchApplications();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update application status.');
    } finally {
      setBusyId(null);
    }
  }

  async function assignReviewer(id, supervisorId) {
    if (!supervisorId) return;
    setBusyId(id);
    setError('');
    try {
      await api.put(`/applications/${id}/assign-reviewer`, { supervisor_id: supervisorId });
      await fetchApplications();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to assign a supervisor.');
    } finally {
      setBusyId(null);
    }
  }

  const isReviewer = user.role === 'supervisor' || user.role === 'admin';

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a' }}>
          {user.role === 'intern' ? 'My Applications' : 'Internship Applications'}
        </h1>
        <p style={{ fontSize: '0.88rem', color: '#64748b' }}>
          {user.role === 'intern' ? 'Review each application and its current status.' : 'Review application details and manage the review process.'}
        </p>
      </div>

      {error && <div role="alert" className="glass-card" style={{ padding: '12px 16px', color: '#b91c1c', background: '#fef2f2' }}>{error}</div>}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px' }}><Loader2 size={32} className="animate-spin" color="#2563eb" /></div>
      ) : applications.length === 0 ? (
        <div className="glass-card" style={{ padding: '48px', textAlign: 'center', color: '#64748b' }}>No applications recorded.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {applications.map((app) => {
            const motivation = app.motivation_letter_url || null;
            const cv = app.cv_url || app.resume_file_url || app.resume_url || app.cv;
            const recommendation = app.recommendation_letter_url || app.recommendation_letter;
            return (
              <article key={app.id} className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '20px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#eff6ff', color: '#2563eb', display: 'grid', placeItems: 'center' }}>
                      <FileCheck size={24} />
                    </div>
                    <div>
                      <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', marginBottom: '4px' }}>
                        {app.internship_title || 'Internship application'}
                      </h3>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', fontSize: '0.82rem', color: '#64748b' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Building2 size={14} /> {app.organization_name}</span>
                        {app.intern_name && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><User size={14} /> {app.intern_name} ({app.intern_email})</span>}
                        {app.department_name && <span>{app.department_name}</span>}
                        {(app.start_date || app.end_date) && <span>{app.start_date || '—'} – {app.end_date || '—'}</span>}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <span className={`badge badge-${app.status}`}>{app.status}</span>
                    {user.role === 'supervisor' && ['pending', 'under_review', 'shortlisted'].includes(app.status) && (
                      <>
                        <button disabled={busyId === app.id} onClick={() => updateStatus(app.id, 'accepted')} className="btn-primary" style={{ padding: '7px 14px' }}>
                          Accept
                        </button>
                        <button disabled={busyId === app.id} onClick={() => updateStatus(app.id, 'rejected')} className="btn-secondary" style={{ padding: '7px 14px' }}>
                          Reject
                        </button>
                      </>
                    )}
                    {user.role === 'intern' && ['pending', 'shortlisted', 'under_review'].includes(app.status) && (
                      <button disabled={busyId === app.id} onClick={() => updateStatus(app.id, 'withdrawn')} className="btn-secondary" style={{ padding: '7px 14px' }}>
                        Withdraw
                      </button>
                    )}
                    {user.role === 'admin' && !['accepted', 'rejected', 'withdrawn'].includes(app.status) && (
                      <select
                        aria-label={`Assign reviewer for ${app.internship_title || 'application'}`}
                        className="input-field"
                        value={app.reviewer_id || app.supervisor_id || ''}
                        onChange={(event) => assignReviewer(app.id, event.target.value)}
                        disabled={busyId === app.id}
                        style={{ width: '220px' }}
                      >
                        <option value="">Assign supervisor to review</option>
                        {supervisors.map((supervisor) => <option key={supervisor.id} value={supervisor.id}>{supervisor.name}</option>)}
                      </select>
                    )}
                    {user.role === 'intern' && app.supervisor_name && (
                      <div style={{ flexBasis: '100%', color: '#475569', fontSize: '0.82rem' }}>
                        Assigned supervisor: {app.supervisor_name}
                        {app.supervisor_email ? ` · ${app.supervisor_email}` : ''}
                        {app.supervisor_phone ? ` · ${app.supervisor_phone}` : ''}
                      </div>
                    )}
                  </div>
                </div>

                {isReviewer && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px', borderRadius: '12px', background: '#f8fbff', border: '1px solid #dbeafe' }}>
                    <p style={{ color: '#334155', whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>
                      <strong>Motivation letter:</strong> {app.motivation_text || app.motivation_letter || app.cover_letter || 'See attached letter.'}
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
                      <SecureFileLink label="Motivation letter" url={motivation} />
                      <SecureFileLink label="CV" url={cv} />
                      <SecureFileLink label="Recommendation letter" url={recommendation} />
                    </div>
                    {app.supervisor_name && <p style={{ color: '#475569' }}>Reviewer: {app.supervisor_name}</p>}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
