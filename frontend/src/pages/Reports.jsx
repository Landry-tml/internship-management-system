import React, { useEffect, useState } from 'react';
import { Award, FileText, Loader2, Plus, Sparkles, X, Eye } from 'lucide-react';
import api from '../services/api';
import AiModal from '../components/AiModal';
import SecureFileLink from '../components/SecureFileLink';

const emptyForm = { report_type: 'daily', title: '', content: '', document: null, template: null, school_template_content: '' };

export default function Reports({ user }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [activeAiData, setActiveAiData] = useState(null);
  const [aiModalTitle, setAiModalTitle] = useState('');
  const [feedbackReportId, setFeedbackReportId] = useState(null);
  const [feedbackDraft, setFeedbackDraft] = useState('');
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [reviewingReportId, setReviewingReportId] = useState(null);

  // Set to null by default so every intern report starts automatically closed
  const [viewingReportId, setViewingReportId] = useState(null);

  useEffect(() => { fetchReports(); }, [user]);

  async function fetchReports() {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/reports');
      setReports(response.data.reports || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Unable to load reports.');
    } finally {
      setLoading(false);
    }
  }

  async function handleRunAiReview(report) {
    setReviewingReportId(report.id);
    setError('');
    try {
      const response = await api.post(`/reports/${report.id}/ai-review`);
      const aiReview = response.data?.aiReview || response.data?.review || response.data;
      if (!aiReview || typeof aiReview !== 'object') {
        throw new Error('The AI report review returned an invalid response.');
      }
      setActiveAiData(aiReview);
      setAiModalTitle(`${report.report_type} report review`);
      setAiModalOpen(true);
      await fetchReports();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to review report.');
    } finally {
      setReviewingReportId(null);
    }
  }

  async function handleSaveFeedback(event, reportId) {
    event.preventDefault();
    setSavingFeedback(true);
    setError('');
    try {
      const response = await api.put(`/reports/${reportId}/feedback`, { feedback: feedbackDraft });
      setReports((currentReports) => currentReports.map((report) => report.id === reportId
        ? {
          ...report,
          supervisor_feedback: response.data.feedback,
          supervisor_feedback_by: response.data.feedback_by,
          supervisor_feedback_at: response.data.feedback_at
        }
        : report));
      setFeedbackReportId(null);
      setFeedbackDraft('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save report feedback.');
    } finally {
      setSavingFeedback(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setNotice('');
    try {
      const reportData = new FormData();
      reportData.append('report_type', form.report_type);
      reportData.append('title', form.title);
      if (form.content.trim()) reportData.append('content', form.content.trim());
      if (form.document) reportData.append('document', form.document);
      if (form.report_type === 'final' && form.template) reportData.append('school_template', form.template);
      if (form.report_type === 'final' && form.school_template_content.trim()) {
        reportData.append('school_template_content', form.school_template_content.trim());
      }

      const response = await api.post('/reports', reportData);
      setShowSubmitModal(false);
      setForm(emptyForm);
      if (response.data.aiReview) {
        setActiveAiData(response.data.aiReview);
        setAiModalTitle('Final report AI review');
        setAiModalOpen(true);
      }
      await fetchReports();
      setNotice(response.data.warning || 'Report submitted successfully.');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit report.');
    } finally {
      setSubmitting(false);
    }
  }

  const canReview = user.role === 'supervisor';

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a' }}>
            {user.role === 'supervisor' ? 'Reports & AI Review' : 'Internship Reports'}
          </h1>
          <p style={{ fontSize: '0.88rem', color: '#64748b' }}>
            {user.role === 'supervisor'
              ? 'Review intern reports with AI and write feedback for each report.'
              : 'Daily, weekly, and final academic reports.'}
          </p>
        </div>
        {user.role === 'intern' && <button onClick={() => setShowSubmitModal(true)} className="btn-primary"><Plus size={18} /> Submit report</button>}
      </div>

      {error && <div role="alert" className="glass-card" style={{ padding: '12px 16px', color: '#b91c1c' }}>{error}</div>}
      {notice && <div role="status" className="glass-card" style={{ padding: '12px 16px', color: notice.toLowerCase().includes('saved, but') ? '#92400e' : '#166534' }}>{notice}</div>}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px' }}><Loader2 size={32} className="animate-spin" color="#2563eb" /></div>
      ) : reports.length === 0 ? (
        <div className="glass-card" style={{ padding: '48px', textAlign: 'center', color: '#64748b' }}>No reports submitted yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {reports.map((report) => {
            const document = report.document_url || report.file_url;
            const template = report.school_template_url || report.template_url;
            const isViewing = viewingReportId === report.id;

            return (
              <article key={report.id} className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#eff6ff', color: '#2563eb', display: 'grid', placeItems: 'center' }}><FileText size={22} /></div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>{report.title}</h2>
                        <span className="badge badge-in_progress">{report.report_type} report</span>
                      </div>
                      <p style={{ fontSize: '0.8rem', color: '#64748b' }}>
                        {report.intern_name && `Submitted by ${report.intern_name} · `}
                        {report.submitted_at ? new Date(report.submitted_at).toLocaleDateString() : 'Date unavailable'}
                      </p>
                    </div>
                  </div>
                  {report.ai_score != null && (
                    <button
                      onClick={() => {
                        setActiveAiData({ score: report.ai_score, summary: report.ai_summary, feedback: report.ai_feedback });
                        setAiModalTitle(`${report.report_type} report AI score`);
                        setAiModalOpen(true);
                      }}
                      className="btn-secondary"
                    >
                      <Award size={17} /> AI score: {report.ai_score}/100
                    </button>
                  )}
                </div>

                {report.supervisor_feedback && user.role !== 'supervisor' && (
                  <div style={{ padding: '14px', borderRadius: '10px', background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                    <strong style={{ color: '#166534' }}>Supervisor feedback</strong>
                    <p style={{ marginTop: '6px', color: '#334155', whiteSpace: 'pre-wrap' }}>{report.supervisor_feedback}</p>
                    {report.supervisor_feedback_at && (
                      <span style={{ display: 'block', marginTop: '6px', color: '#64748b', fontSize: '0.75rem' }}>
                        {new Date(report.supervisor_feedback_at).toLocaleString()}
                      </span>
                    )}
                  </div>
                )}

                {user.role === 'supervisor' && (
                  <div style={{ padding: '14px', borderRadius: '10px', background: '#f8fbff', border: '1px solid #dbeafe' }}>
                    {feedbackReportId === report.id ? (
                      <form onSubmit={(event) => handleSaveFeedback(event, report.id)} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <label htmlFor={`report-feedback-${report.id}`} style={{ color: '#0f172a', fontWeight: 700 }}>Feedback for intern</label>
                        <textarea
                          id={`report-feedback-${report.id}`}
                          className="input-field"
                          rows="4"
                          maxLength={10000}
                          required
                          value={feedbackDraft}
                          onChange={(event) => setFeedbackDraft(event.target.value)}
                          placeholder="Write feedback about this report."
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                          <button type="button" onClick={() => setFeedbackReportId(null)} className="btn-secondary" disabled={savingFeedback}>Cancel</button>
                          <button type="submit" className="btn-primary" disabled={savingFeedback || !feedbackDraft.trim()}>
                            {savingFeedback ? <Loader2 size={16} className="animate-spin" /> : 'Save feedback'}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                        <div>
                          <strong style={{ color: '#0f172a' }}>Supervisor feedback</strong>
                          <p style={{ marginTop: '6px', color: '#475569', whiteSpace: 'pre-wrap' }}>
                            {report.supervisor_feedback || 'No feedback has been provided for this report.'}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => {
                            setFeedbackReportId(report.id);
                            setFeedbackDraft(report.supervisor_feedback || '');
                          }}
                        >{report.supervisor_feedback ? 'Edit feedback' : 'Give feedback'}</button>
                      </div>
                    )}
                    {report.supervisor_feedback_at && feedbackReportId !== report.id && (
                      <span style={{ display: 'block', marginTop: '6px', color: '#64748b', fontSize: '0.75rem' }}>
                        Last updated {new Date(report.supervisor_feedback_at).toLocaleString()}
                      </span>
                    )}
                  </div>
                )}

                {/* Open / Close Report Toggle Buttons */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
                  {isViewing ? (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setViewingReportId(null)}
                      style={{ color: '#dc2626', borderColor: '#fca5a5', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    >
                      <X size={16} /> Close report
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setViewingReportId(report.id)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    >
                      <Eye size={16} /> Open report
                    </button>
                  )}

                  {template && <SecureFileLink label="View grading template" url={template} />}
                </div>

                {/* Report Details Container: Visible ONLY when open */}
                {isViewing && (
                  <div style={{ marginTop: '12px', padding: '16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <strong style={{ color: '#0f172a' }}>Report Content & Document Details</strong>
                      <button
                        type="button"
                        onClick={() => setViewingReportId(null)}
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}
                      >
                        <X size={18} /> Close report
                      </button>
                    </div>

                    {/* Report text body */}
                    {report.content && (
                      <div style={{ marginBottom: '16px', padding: '12px', background: '#ffffff', borderRadius: '6px', border: '1px solid #e2e8f0', color: '#334155', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                        {report.content}
                      </div>
                    )}

                    {/* Document viewer / link */}
                    {document ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {document.endsWith('.pdf') ? (
                          <iframe
                            src={document}
                            title={`Report Document - ${report.title}`}
                            style={{ width: '100%', height: '500px', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                          />
                        ) : (
                          <SecureFileLink label="Download or View Report Document" url={document} />
                        )}
                      </div>
                    ) : (
                      !report.content && <p style={{ color: '#64748b', fontSize: '0.88rem' }}>No attached file or text content for this report.</p>
                    )}
                  </div>
                )}

                {report.ai_missing_sections?.length > 0 && <p style={{ color: '#b91c1c' }}><strong>Missing or incomplete sections:</strong> {report.ai_missing_sections.join(', ')}</p>}
                {canReview && report.ai_score == null && (
                  <button disabled={reviewingReportId === report.id} onClick={() => handleRunAiReview(report)} className="btn-secondary" style={{ alignSelf: 'flex-start' }}>
                    {reviewingReportId === report.id ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                    {reviewingReportId === report.id ? 'Reviewing report...' : 'Review report with AI'}
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}

      {showSubmitModal && (
        <div role="presentation" style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '620px', padding: '32px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', marginBottom: '20px' }}>Submit internship report</h2>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="input-group" style={{ marginBottom: 0 }}>
                <label>Report type</label>
                <select className="input-field" value={form.report_type} onChange={(event) => setForm({ ...form, report_type: event.target.value })}>
                  <option value="daily">Daily report</option>
                  <option value="weekly">Weekly report</option>
                  <option value="final">Final academic internship report</option>
                </select>
              </div>
              <div className="input-group" style={{ marginBottom: 0 }}>
                <label>Report title</label>
                <input type="text" className="input-field" required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Example: Week 4 — API development and testing" />
              </div>
              <div className="input-group" style={{ marginBottom: 0 }}>
                <label>Upload report document</label>
                <input type="file" className="input-field" accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" required onChange={(event) => setForm({ ...form, document: event.target.files?.[0] || null })} />
                <small style={{ color: '#64748b' }}>Supported files: PDF, DOCX, or TXT up to 50 MB. Long text-based reports (including 150+ pages) are reviewed in chunks against the school template.</small>
              </div>
              <div className="input-group" style={{ marginBottom: 0 }}>
                <label>Report text for AI scoring (optional)</label>
                <textarea className="input-field" rows="5" value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} placeholder="Example: This week I implemented input validation, added unit tests, and resolved two API bugs. Optional: this text supplements the uploaded report." />
              </div>
              {form.report_type === 'final' && (
                <div className="input-group" style={{ marginBottom: 0 }}>
                  <label>School report template for grading</label>
                  <input type="file" className="input-field" accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" required onChange={(event) => setForm({ ...form, template: event.target.files?.[0] || null })} />
                  <label htmlFor="school-template-text">Template text for AI comparison (optional)</label>
                  <textarea id="school-template-text" className="input-field" rows="4" value={form.school_template_content || ''} onChange={(event) => setForm({ ...form, school_template_content: event.target.value })} placeholder="Example: Include an executive summary, objectives, methodology, outcomes, skills acquired, and conclusion. Optional supplement to the uploaded template." />
                  <span style={{ fontSize: '0.78rem', color: '#64748b' }}>The report is checked section-by-section against the template. Upload text-based PDF, DOCX, or TXT files up to 50 MB; scanned PDFs without selectable text are not supported.</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button type="button" onClick={() => setShowSubmitModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? <Loader2 size={17} className="animate-spin" /> : 'Submit report'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <AiModal isOpen={aiModalOpen} onClose={() => setAiModalOpen(false)} title={aiModalTitle} type="report" data={activeAiData} />
    </div>
  );
}