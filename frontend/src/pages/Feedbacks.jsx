import React, { useEffect, useState } from 'react';
import { Loader2, MessageSquare } from 'lucide-react';
import api from '../services/api';

export default function Feedbacks({ user }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [drafts, setDrafts] = useState({});
  const [savingReportId, setSavingReportId] = useState(null);

  useEffect(() => {
    let isCurrent = true;

    async function fetchFeedback() {
      setLoading(true);
      setError('');
      try {
        const response = await api.get('/reports');
        if (!Array.isArray(response.data?.reports)) {
          throw new Error('The reports service returned an invalid response.');
        }
        if (isCurrent) {
          setReports(user.role === 'supervisor'
            ? response.data.reports
            : response.data.reports.filter((report) => report.supervisor_feedback?.trim()));
        }
      } catch (err) {
        if (isCurrent) setError(err.response?.data?.error || err.message || 'Unable to load feedback.');
      } finally {
        if (isCurrent) setLoading(false);
      }
    }

    fetchFeedback();
    return () => { isCurrent = false; };
  }, [user.role]);

  async function saveFeedback(event, reportId) {
    event.preventDefault();
    setSavingReportId(reportId);
    setError('');
    setNotice('');
    try {
      const response = await api.put(`/reports/${reportId}/feedback`, { feedback: drafts[reportId] || '' });
      setReports((current) => current.map((report) => report.id === reportId
        ? {
          ...report,
          supervisor_feedback: response.data.feedback,
          supervisor_feedback_by: response.data.feedback_by,
          supervisor_feedback_at: response.data.feedback_at
        }
        : report));
      setNotice('Feedback saved and the intern was notified.');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save feedback.');
    } finally {
      setSavingReportId(null);
    }
  }

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a' }}>Feedbacks</h1>
        <p style={{ fontSize: '0.88rem', color: '#64748b' }}>
          {user.role === 'supervisor'
            ? 'Review intern reports and send feedback directly to each intern.'
            : 'Comments from your supervisor on submitted internship reports.'}
        </p>
      </div>

      {error && <div role="alert" className="glass-card" style={{ padding: '12px 16px', color: '#b91c1c' }}>{error}</div>}
      {notice && <div role="status" className="glass-card" style={{ padding: '12px 16px', color: '#166534' }}>{notice}</div>}
      {loading ? (
        <div role="status" style={{ textAlign: 'center', padding: '60px' }}>
          <Loader2 size={32} className="animate-spin" color="#2563eb" />
        </div>
      ) : reports.length === 0 ? (
        <div className="glass-card" style={{ padding: '48px', textAlign: 'center', color: '#64748b' }}>
          {user.role === 'supervisor' ? 'No intern reports have been submitted yet.' : 'No supervisor feedback has been provided yet.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {reports.map((report) => (
            <article key={report.id} className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <MessageSquare size={20} color="#2563eb" aria-hidden="true" />
                <div>
                  <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>{report.title}</h2>
                  <p style={{ color: '#64748b', fontSize: '0.8rem' }}>
                    {user.role === 'supervisor' && report.intern_name ? `${report.intern_name} · ` : ''}
                    {report.report_type} report
                    {report.submitted_at ? ` · Submitted ${new Date(report.submitted_at).toLocaleString()}` : ''}
                  </p>
                </div>
              </div>
              {user.role === 'supervisor' ? (
                <>
                  {report.content && <p style={{ color: '#334155', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{report.content}</p>}
                  <form onSubmit={(event) => saveFeedback(event, report.id)} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <label htmlFor={`feedback-${report.id}`} style={{ color: '#0f172a', fontWeight: 700 }}>Feedback for intern</label>
                    <textarea
                      id={`feedback-${report.id}`}
                      className="input-field"
                      rows="4"
                      maxLength={10000}
                      required
                      value={drafts[report.id] ?? report.supervisor_feedback ?? ''}
                      onChange={(event) => setDrafts((current) => ({ ...current, [report.id]: event.target.value }))}
                      placeholder="Write constructive feedback about this report."
                    />
                    <button
                      type="submit"
                      className="btn-primary"
                      disabled={savingReportId === report.id || !(drafts[report.id] ?? report.supervisor_feedback ?? '').trim()}
                      style={{ alignSelf: 'flex-end' }}
                    >
                      {savingReportId === report.id ? 'Saving...' : report.supervisor_feedback ? 'Update feedback' : 'Send feedback'}
                    </button>
                  </form>
                </>
              ) : (
                <p style={{ color: '#334155', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{report.supervisor_feedback}</p>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
