import React, { useState, useEffect } from 'react';
import { BarChart3, Users, Building2, Award, Download, CheckCircle2, Loader2, FileText } from 'lucide-react';
import api from '../services/api';
import '../admin-layout.css';

export default function Analytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchAnalytics() {
      setError('');
      try {
        const res = await api.get('/analytics');
        if (!res.data?.metrics || !Array.isArray(res.data.placements)) {
          throw new Error('The analytics service returned an invalid response.');
        }
        setData(res.data);
      } catch (err) {
        setError(err.response?.data?.error || err.message || 'Unable to load system analytics.');
      } finally {
        setLoading(false);
      }
    }

    fetchAnalytics();
  }, []);

  const handleExportCSV = () => {
    if (!data || !data.placements) return;

    const headers = ['Placement ID', 'Intern Name', 'Intern Email', 'Supervisor Name', 'Internship Title', 'Organization', 'Status'];
    const rows = data.placements.map(p => [
      p.id, p.intern_name, p.intern_email, p.supervisor_name, p.internship_title, p.organization_name, p.status
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `ims_system_placements_report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px' }}>
        <Loader2 size={32} className="animate-spin" color="#6366f1" />
      </div>
    );
  }

  const m = data?.metrics || {};

  return (
    <div className="animate-fade-in analytics-page" style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      
      <div className="analytics-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#fff' }}>
            Institutional Reports & Analytics
          </h1>
          <p style={{ fontSize: '0.88rem', color: '#94a3b8' }}>
            System-wide metrics on internship participation, placement completion rates, and average AI performance scores.
          </p>
        </div>

        <button onClick={handleExportCSV} className="btn-primary">
          <Download size={18} /> Export Placements CSV
        </button>
      </div>

      {error && <div role="alert" className="glass-card" style={{ padding: '12px 16px', color: '#b91c1c', background: '#fef2f2' }}>{error}</div>}

      {/* Metrics Banner */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        <div className="glass-card" style={{ padding: '20px' }}>
          <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 700 }}>Total Registered Users</span>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fff', marginTop: '6px' }}>{m.total_users ?? 0}</h2>
          <span style={{ fontSize: '0.75rem', color: '#38bdf8' }}>{m.total_interns ?? 0} Interns | {m.total_supervisors ?? 0} Supervisors</span>
        </div>

        <div className="glass-card" style={{ padding: '20px' }}>
          <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 700 }}>Total Organizations</span>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fff', marginTop: '6px' }}>{m.total_organizations ?? 0}</h2>
          <span style={{ fontSize: '0.75rem', color: '#818cf8' }}>Partner Industry Labs</span>
        </div>

        <div className="glass-card" style={{ padding: '20px' }}>
          <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 700 }}>Active Placements</span>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fff', marginTop: '6px' }}>{m.total_placements ?? 0}</h2>
          <span style={{ fontSize: '0.75rem', color: '#34d399' }}>From {m.total_applications ?? 0} Applications</span>
        </div>

        <div className="glass-card" style={{ padding: '20px' }}>
          <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 700 }}>Avg Performance Score</span>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#a855f7', marginTop: '6px' }}>{m.avg_evaluation_score ?? 0}/100</h2>
          <span style={{ fontSize: '0.75rem', color: '#c084fc' }}>Gemini AI Evaluated</span>
        </div>
      </div>

      {/* Placement Data Table */}
      <div className="glass-card analytics-table-card" style={{ padding: '24px', background: '#fff', border: '1px solid #cbd5e1', boxShadow: '0 12px 28px rgba(15,23,42,0.12)' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', marginBottom: '16px' }}>
          Active Internship Placements Directory
        </h3>

        <div className="responsive-table-scroll" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: '760px', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.92rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8' }}>
                <th scope="col" style={{ padding: '14px 12px', color: '#334155', background: '#f1f5f9', fontWeight: 800 }}>Intern Name</th>
                <th scope="col" style={{ padding: '14px 12px', color: '#334155', background: '#f1f5f9', fontWeight: 800 }}>Internship Title</th>
                <th scope="col" style={{ padding: '14px 12px', color: '#334155', background: '#f1f5f9', fontWeight: 800 }}>Organization</th>
                <th scope="col" style={{ padding: '14px 12px', color: '#334155', background: '#f1f5f9', fontWeight: 800 }}>Supervisor</th>
                <th scope="col" style={{ padding: '14px 12px', color: '#334155', background: '#f1f5f9', fontWeight: 800 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {data?.placements?.map((p, index) => (
                <tr key={p.id} style={{ borderBottom: '1px solid #e2e8f0', background: index % 2 ? '#f8fafc' : '#fff', color: '#0f172a' }}>
                  <td style={{ padding: '14px 12px', fontWeight: 800, color: '#0f172a' }}>
                    {p.intern_name || '—'}
                    {p.intern_email && <><br /><small style={{ display: 'inline-block', marginTop: '3px', color: '#334155', fontSize: '0.82rem', fontWeight: 600 }}>{p.intern_email}</small></>}
                  </td>
                  <td style={{ padding: '14px 12px', color: '#1e3a8a', fontWeight: 700 }}>{p.internship_title || '—'}</td>
                  <td style={{ padding: '14px 12px', color: '#0f172a', fontWeight: 650 }}>{p.organization_name || '—'}</td>
                  <td style={{ padding: '14px 12px', color: '#334155', fontWeight: 600 }}>{p.supervisor_name || '—'}</td>
                  <td style={{ padding: '14px 12px' }}>
                    <span className={`badge badge-${p.status}`}>{p.status}</span>
                  </td>
                </tr>
              ))}
              {data?.placements?.length === 0 && (
                <tr><td colSpan="5" style={{ padding: '24px', color: '#475569', textAlign: 'center', fontWeight: 600 }}>No active placements found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
