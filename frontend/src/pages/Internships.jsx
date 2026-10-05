import React, { useState, useEffect } from 'react';
import { Search, Plus, MapPin, DollarSign, Building2, Loader2, Send } from 'lucide-react';
import api from '../services/api';

export default function Internships({ user }) {
  const [internships, setInternships] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [departmentsError, setDepartmentsError] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  // Modals
  const [showPostModal, setShowPostModal] = useState(false);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState(null);

  // Form states
  const [applicationFiles, setApplicationFiles] = useState({
    motivation_letter: null,
    cv: null,
    recommendation_letter: null,
    department_id: '',
    start_date: '',
    end_date: ''
  });
  const [submittingApp, setSubmittingApp] = useState(false);
  const [appMessage, setAppMessage] = useState('');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const [postForm, setPostForm] = useState({
    organization_id: 1,
    title: '',
    description: '',
    requirements: '',
    location: '',
    type: 'Onsite',
    stipend: 'FCFA 50,000/month'
  });

  useEffect(() => {
    fetchInternships();
    fetchOrganizations();
  }, [search, typeFilter]);

  useEffect(() => {
    if (user?.role === 'intern') fetchDepartments();
  }, [user?.role]);

  async function fetchDepartments() {
    setDepartmentsError('');
    try {
      const response = await api.get('/departments');
      if (!Array.isArray(response.data?.departments)) {
        throw new Error('The departments service returned an invalid response.');
      }
      setDepartments(response.data.departments);
    } catch (err) {
      setDepartmentsError(err.response?.data?.error || err.message || 'Unable to load departments.');
    }
  }

  async function fetchInternships() {
    try {
      const res = await api.get(user?.role === 'admin' ? '/admin/internships' : '/internships', {
        params: { search, type: typeFilter, include_suspended: user.role === 'admin' }
      });
      setInternships(res.data.internships || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Unable to load internship opportunities.');
    } finally {
      setLoading(false);
    }
  }

  async function fetchOrganizations() {
    try {
      const res = await api.get('/organizations');
      setOrganizations(res.data.organizations || []);
    } catch (err) {
      console.error('Fetch organizations error:', err);
    }
  }

  const handleApplySubmit = async (e) => {
    e.preventDefault();
    setSubmittingApp(true);
    setAppMessage('');

    try {
      const application = new FormData();
      application.append('internship_id', selectedPosition.id);
      application.append('department_id', applicationFiles.department_id);
      application.append('start_date', applicationFiles.start_date);
      application.append('end_date', applicationFiles.end_date);
      application.append('motivation_letter', applicationFiles.motivation_letter);
      application.append('cv', applicationFiles.cv);
      if (applicationFiles.recommendation_letter) {
        application.append('recommendation_letter', applicationFiles.recommendation_letter);
      }
      await api.post('/applications', application);
      setAppMessage('Application submitted successfully.');
      setTimeout(() => {
        setShowApplyModal(false);
        setApplicationFiles({ motivation_letter: null, cv: null, recommendation_letter: null, department_id: '', start_date: '', end_date: '' });
        setAppMessage('');
      }, 1500);
    } catch (err) {
      setAppMessage(err.response?.data?.error || 'Failed to submit application.');
    } finally {
      setSubmittingApp(false);
    }
  };

  const handlePostSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/internships', postForm);
      setShowPostModal(false);
      fetchInternships();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to post internship.');
    }
  };

  const handleInternshipStatus = async (item) => {
    setBusyId(item.id);
    setError('');
    try {
      await api.put(`/internships/${item.id}/status`, { status: item.status === 'suspended' ? 'open' : 'suspended' });
      await fetchInternships();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update internship status.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteInternship = async (item) => {
    if (!window.confirm(`Delete "${item.title}"?`)) return;
    setBusyId(item.id);
    setError('');
    try {
      await api.delete(`/internships/${item.id}`);
      await fetchInternships();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete internship.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Header Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '1.55rem', fontWeight: 800, color: '#111827' }}>
            Internships
          </h1>
          <p style={{ fontSize: '0.88rem', color: '#64748b' }}>
            {user.role === 'admin'
              ? 'Post opportunities and manage their availability.'
              : user.role === 'supervisor'
                ? 'Browse internship opportunities and review assigned applicants.'
                : 'Browse and apply for verified internship placements across partner organizations.'}
          </p>
        </div>

        {user?.role === 'admin' && (
          <button onClick={() => setShowPostModal(true)} className="btn-primary">
            <Plus size={18} /> Post New Opportunity
          </button>
        )}
      </div>

      {error && <div role="alert" className="glass-card" style={{ padding: '12px 16px', color: '#b91c1c' }}>{error}</div>}

      {/* Filter Bar */}
      <div className="glass-card internship-filters" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '240px', position: 'relative' }}>
          <Search size={18} color="#94a3b8" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            className="input-field"
            placeholder="Search by title, technology, or company..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: '42px', width: '100%' }}
          />
        </div>

        <select
          className="input-field internship-type-filter"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          style={{ width: '160px' }}
        >
          <option value="" style={{ background: '#0f172a' }}>All Workplace Types</option>
          <option value="Hybrid" style={{ background: '#0f172a' }}>Hybrid</option>
          <option value="Remote" style={{ background: '#0f172a' }}>Remote</option>
          <option value="On-Site" style={{ background: '#0f172a' }}>On-Site</option>
        </select>
      </div>

      {/* Internship Cards Grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px' }}>
          <Loader2 size={32} className="animate-spin" color="#6366f1" />
        </div>
      ) : internships.length === 0 ? (
        <div className="glass-card" style={{ padding: '48px', textAlign: 'center', color: '#94a3b8' }}>
          No internship positions found matching your search query.
        </div>
      ) : (
        <div className="internship-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))', gap: '24px' }}>
          {internships.map((item) => (
            <article key={item.id} className="glass-card internship-card">
              <div>
                <div className="internship-card-company">
                  <span><Building2 size={15} aria-hidden="true" /> {item.organization_name}</span>
                  <span className={`badge ${item.status === 'suspended' ? 'badge-rejected' : 'badge-in_progress'}`}>
                    {item.status === 'suspended' ? 'Suspended' : item.type || 'Internship'}
                  </span>
                </div>

                <h2 className="internship-card-title">
                  {item.title}
                </h2>

                <p className="internship-card-description">
                  {item.description}
                </p>
              </div>

              <div className="internship-card-footer">
                <div className="internship-card-meta">
                  <span><MapPin size={14} aria-hidden="true" /> {item.location}</span>
                  <strong>{item.stipend}</strong>
                </div>

                {user?.role === 'intern' && item.status !== 'suspended' && (
                  <button
                    onClick={() => {
                      setSelectedPosition(item);
                      setApplicationFiles((current) => ({ ...current, department_id: '' }));
                      setAppMessage('');
                      setShowApplyModal(true);
                    }}
                    className="btn-primary"
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    Apply Now
                  </button>
                )}
                {user?.role === 'admin' && (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button disabled={busyId === item.id} onClick={() => handleInternshipStatus(item)} className="btn-secondary" style={{ flex: 1, justifyContent: 'center' }}>
                      {item.status === 'suspended' ? 'Activate' : 'Suspend'}
                    </button>
                    <button disabled={busyId === item.id} onClick={() => handleDeleteInternship(item)} className="btn-secondary" style={{ flex: 1, justifyContent: 'center', color: '#b91c1c' }}>
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {/* APPLY MODAL */}
      {showApplyModal && selectedPosition && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(5,8,18,0.85)', backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px'
        }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '540px', padding: '32px' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff', marginBottom: '6px' }}>
              Apply for {selectedPosition.title}
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#38bdf8', marginBottom: '20px' }}>
              Organization: {selectedPosition.organization_name}
            </p>

            {appMessage && (
              <div style={{ background: 'rgba(16,185,129,0.15)', color: '#34d399', padding: '12px', borderRadius: '10px', fontSize: '0.85rem', marginBottom: '16px' }}>
                {appMessage}
              </div>
            )}

            <form onSubmit={handleApplySubmit} className="internship-application-form" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="input-group" style={{ marginBottom: 0 }}>
                <label htmlFor="application-department">Department</label>
                <select
                  id="application-department"
                  className="input-field"
                  required
                  value={applicationFiles.department_id}
                  onChange={(event) => setApplicationFiles({ ...applicationFiles, department_id: event.target.value })}
                >
                  <option value="">Select your department</option>
                  {departments.map((department) => (
                    <option key={department.id} value={department.id}>{department.name}</option>
                  ))}
                </select>
                {departmentsError && (
                  <small role="alert" style={{ color: '#b91c1c' }}>
                    {departmentsError}{' '}
                    <button type="button" onClick={fetchDepartments} style={{ color: '#1d4ed8', textDecoration: 'underline' }}>Retry</button>
                  </small>
                )}
                {departments.length === 0 && <small style={{ color: '#b91c1c' }}>No departments are available. Please contact an administrator.</small>}
              </div>
              <div className="input-group" style={{ marginBottom: 0 }}>
                <label>Motivation letter</label>
                <input type="file" className="input-field" accept=".pdf,.docx,.txt" required onChange={(e) => setApplicationFiles({ ...applicationFiles, motivation_letter: e.target.files?.[0] || null })} />
              </div>
              <div className="input-group" style={{ marginBottom: 0 }}>
                <label>Curriculum vitae (CV)</label>
                <input type="file" className="input-field" accept=".pdf,.docx,.txt" required onChange={(e) => setApplicationFiles({ ...applicationFiles, cv: e.target.files?.[0] || null })} />
              </div>
              <div className="input-group" style={{ marginBottom: 0 }}>
                <label>Recommendation letter (optional)</label>
                <input type="file" className="input-field" accept=".pdf,.docx,.txt" onChange={(e) => setApplicationFiles({ ...applicationFiles, recommendation_letter: e.target.files?.[0] || null })} />
              </div>
              <div className="responsive-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="input-group" style={{ marginBottom: 0 }}>
                  <label>Internship start date</label>
                  <input type="date" className="input-field" required value={applicationFiles.start_date} onChange={(e) => setApplicationFiles({ ...applicationFiles, start_date: e.target.value })} />
                </div>
                <div className="input-group" style={{ marginBottom: 0 }}>
                  <label>Internship end date</label>
                  <input type="date" className="input-field" required min={applicationFiles.start_date || undefined} value={applicationFiles.end_date} onChange={(e) => setApplicationFiles({ ...applicationFiles, end_date: e.target.value })} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '12px' }}>
                <button type="button" onClick={() => setShowApplyModal(false)} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={submittingApp}>
                  {submittingApp ? <Loader2 size={18} className="animate-spin" /> : <>Submit Application <Send size={16} /></>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* POST INTERNSHIP MODAL */}
      {showPostModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(5,8,18,0.85)', backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px'
        }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '600px', padding: '32px' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff', marginBottom: '20px' }}>
              Post New Internship Opportunity
            </h3>
            <form onSubmit={handlePostSubmit} className="internship-post-form" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="input-group" style={{ marginBottom: 0 }}>
                <label>Host Organization</label>
                <select
                  className="input-field"
                  value={postForm.organization_id}
                  onChange={(e) => setPostForm({ ...postForm, organization_id: e.target.value })}
                >
                  {organizations.map(o => (
                    <option key={o.id} value={o.id} style={{ background: '#0f172a' }}>{o.name} ({o.industry})</option>
                  ))}
                </select>
              </div>

              <div className="input-group" style={{ marginBottom: 0 }}>
                <label>Position Title</label>
                <input
                  type="text" className="input-field" required
                  value={postForm.title} onChange={(e) => setPostForm({ ...postForm, title: e.target.value })}
                  placeholder="e.g. AI & Full-Stack Engineering Intern"
                />
              </div>

              <div className="input-group" style={{ marginBottom: 0 }}>
                <label>Job Description & Responsibilities</label>
                <textarea
                  className="input-field" rows="3" required
                  value={postForm.description} onChange={(e) => setPostForm({ ...postForm, description: e.target.value })}
                />
              </div>

              <div className="responsive-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="input-group" style={{ marginBottom: 0 }}>
                  <label>Location</label>
                  <input
                    type="text" className="input-field" required
                    value={postForm.location} onChange={(e) => setPostForm({ ...postForm, location: e.target.value })}
                  />
                </div>
                <div className="input-group" style={{ marginBottom: 0 }}>
                  <label>Stipend Rate</label>
                  <input
                    type="text" className="input-field" required
                    value={postForm.stipend} onChange={(e) => setPostForm({ ...postForm, stipend: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '12px' }}>
                <button type="button" onClick={() => setShowPostModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary">Publish Opportunity</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
