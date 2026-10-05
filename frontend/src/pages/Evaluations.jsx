import React, { useEffect, useMemo, useState } from 'react';
import { Award, Loader2, Sparkles, Send } from 'lucide-react';
import api from '../services/api';
import AiModal from '../components/AiModal';
import SecureFileLink from '../components/SecureFileLink';

function displayContent(...values) {
  const value = values.find((item) => item !== undefined && item !== null && item !== '');
  if (Array.isArray(value)) return value.map((item) => typeof item === 'string' ? item : JSON.stringify(item)).join('\n');
  if (value && typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value || 'Evaluation instructions are not available.');
}

export default function Evaluations({ user }) {
  const [evaluations, setEvaluations] = useState([]);
  const [placements, setPlacements] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [optionsError, setOptionsError] = useState('');
  const [showFormModal, setShowFormModal] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [selectedEvaluation, setSelectedEvaluation] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [activeAiData, setActiveAiData] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ placement_id: '', department_id: '', document: null, uploaded_doc_text: '' });
  const [submission, setSubmission] = useState('');
  const [submissionLinks, setSubmissionLinks] = useState('');
  const [submissionFiles, setSubmissionFiles] = useState([]);

  useEffect(() => {
    fetchEvaluations();
    if (user.role === 'supervisor') fetchAssignmentOptions();
  }, [user.id, user.role]);

  async function fetchEvaluations() {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/evaluations');
      if (!Array.isArray(response.data?.evaluations) || !Array.isArray(response.data?.exercises)) {
        throw new Error('The evaluations service returned an invalid response.');
      }
      const savedEvaluations = response.data.evaluations;
      const exercises = (response.data.exercises || []).map((exercise) => {
        const questions = typeof exercise.questions_json === 'string'
          ? JSON.parse(exercise.questions_json)
          : exercise.questions_json;
        const submissionData = typeof exercise.submission_json === 'string'
          ? JSON.parse(exercise.submission_json)
          : exercise.submission_json;
        return {
          ...exercise,
          ...questions,
          questions: questions?.questions || questions,
          tasks: questions?.tasks || [],
          performance_score: exercise.score,
          submission: submissionData?.submission || submissionData,
          submission_links: submissionData?.links || [],
          submission_attachments: submissionData?.attachments || [],
          ai_evaluation_summary: exercise.feedback,
          document_url: exercise.source_file_id ? `/api/files/${exercise.source_file_id}` : null
        };
      });
      setEvaluations([...savedEvaluations, ...exercises]);
    } catch (err) {
      setError(err.response?.data?.error || 'Unable to load evaluations.');
    } finally {
      setLoading(false);
    }
  }

  async function fetchAssignmentOptions() {
    setLoadingOptions(true);
    setOptionsError('');
    try {
      const [placementResponse, departmentResponse] = await Promise.all([
        api.get('/placements'),
        api.get('/departments')
      ]);
      const placementList = placementResponse.data?.placements;
      const departmentList = departmentResponse.data?.departments;
      if (!Array.isArray(placementList) || !Array.isArray(departmentList)) {
        throw new Error('The placement or department service returned an invalid response.');
      }
      const activePlacements = placementList.filter((placement) =>
        placement.status === 'active' && placement.id != null && placement.intern_id != null
      );
      setPlacements(activePlacements);
      const knownDepartments = new Map(
        departmentList.filter((department) => department.id != null)
          .map((department) => [String(department.id), department])
      );
      activePlacements.forEach((placement) => {
        if (placement.department_id != null && !knownDepartments.has(String(placement.department_id))) {
          knownDepartments.set(String(placement.department_id), {
            id: placement.department_id,
            name: placement.department_name || `Department ${placement.department_id}`
          });
        }
      });
      const options = Array.from(knownDepartments.values()).sort((left, right) =>
        String(left.name).localeCompare(String(right.name))
      );
      if (activePlacements.some((placement) => placement.department_id == null)) {
        options.push({ id: 'unassigned', name: 'Unassigned department' });
      }
      setDepartments(options);
    } catch (err) {
      setOptionsError(err.response?.data?.error || err.message || 'Unable to load intern and department information.');
    } finally {
      setLoadingOptions(false);
    }
  }

  const departmentPlacements = useMemo(
    () => placements.filter((placement) => form.department_id === 'unassigned'
      ? placement.department_id == null
      : String(placement.department_id) === String(form.department_id)),
    [placements, form.department_id]
  );

  async function handleGenerateEvaluation(event) {
    event.preventDefault();
    if (!form.placement_id || !form.document) {
      setError('Choose an active intern placement and upload course or task notes.');
      return;
    }
    setGenerating(true);
    setError('');
    try {
      const data = new FormData();
      data.append('placement_id', form.placement_id);
      if (form.department_id !== 'unassigned') data.append('department_id', form.department_id);
      data.append('document', form.document);
      if (form.uploaded_doc_text.trim()) data.append('uploaded_doc_text', form.uploaded_doc_text.trim());
      const response = await api.post('/evaluations/ai-evaluate', data);
      if (!response.data?.evaluation) throw new Error('The AI evaluation service returned an invalid response.');
      setShowFormModal(false);
      setForm({ placement_id: '', department_id: '', document: null, uploaded_doc_text: '' });
      setActiveAiData(response.data.evaluation);
      setAiModalOpen(true);
      await fetchEvaluations();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate evaluation questions.');
    } finally {
      setGenerating(false);
    }
  }

  async function handleSubmitEvaluation(event) {
    event.preventDefault();
    if (!selectedEvaluation) return;
    setSubmitting(true);
    setError('');
    try {
      const data = new FormData();
      data.append('submission', submission);
      if (submissionLinks.trim()) data.append('links', submissionLinks.trim());
      submissionFiles.forEach((file) => data.append('attachments', file));
      await api.post(`/evaluations/${selectedEvaluation.id}/submit`, data);
      setShowSubmitModal(false);
      setSelectedEvaluation(null);
      setSubmission('');
      setSubmissionLinks('');
      setSubmissionFiles([]);
      await fetchEvaluations();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit evaluation.');
    } finally {
      setSubmitting(false);
    }
  }

  const canGenerate = user.role === 'supervisor';
  const canComplete = (evaluation) => user.role === 'intern' &&
    ['pending', 'assigned'].includes(evaluation.status) &&
    evaluation.performance_score == null;

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a' }}>
            {user.role === 'admin' ? 'Intern Evaluation Scores' : 'Intern Evaluations'}
          </h1>
          <p style={{ fontSize: '0.88rem', color: '#64748b' }}>
            {user.role === 'admin' ? 'View scores assigned to completed intern evaluations.' : 'Evaluation assignments, submissions, and scores.'}
          </p>
        </div>
        {canGenerate && <button onClick={() => setShowFormModal(true)} className="btn-primary"><Sparkles size={18} /> Create AI evaluation</button>}
      </div>

      {error && <div role="alert" className="glass-card" style={{ padding: '12px 16px', color: '#b91c1c' }}>{error}</div>}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px' }}><Loader2 size={32} className="animate-spin" color="#2563eb" /></div>
      ) : evaluations.length === 0 ? (
        <div className="glass-card" style={{ padding: '48px', textAlign: 'center', color: '#64748b' }}>No evaluations available.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {evaluations.map((evaluation) => (
            <article key={evaluation.id} className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div aria-hidden="true" style={{ width: '46px', height: '46px', borderRadius: '50%', background: '#dbeafe', color: '#1d4ed8', display: 'grid', placeItems: 'center', fontWeight: 800 }}>
                    {evaluation.intern_name?.trim()?.charAt(0)?.toUpperCase() || 'I'}
                  </div>
                  <div>
                    <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>{evaluation.intern_name || 'Intern'}{evaluation.department_name ? ` · ${evaluation.department_name}` : ''}</h2>
                    <p style={{ fontSize: '0.82rem', color: '#64748b' }}>{evaluation.internship_title || 'Internship evaluation'}{evaluation.created_at ? ` · ${new Date(evaluation.created_at).toLocaleDateString()}` : ''}</p>
                  </div>
                </div>
                {evaluation.performance_score != null && (
                  <div style={{ padding: '8px 16px', borderRadius: '24px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800 }}>
                    <Award size={18} /> {evaluation.performance_score}/100
                  </div>
                )}
              </div>

              {user.role === 'admin' ? (
                <p style={{ color: '#64748b', fontSize: '0.84rem' }}>
                  {evaluation.performance_score == null ? 'Awaiting supervisor score.' : 'Evaluation score recorded.'}
                </p>
              ) : (
                <>
              <div style={{ padding: '16px', borderRadius: '12px', background: '#f8fbff', border: '1px solid #dbeafe' }}>
                <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e3a8a', marginBottom: '8px' }}>Evaluation questions and tasks</h3>
                <p style={{ whiteSpace: 'pre-wrap', color: '#334155', lineHeight: 1.6 }}>
                  {displayContent(evaluation.questions, evaluation.evaluation_questions, evaluation.ai_evaluation_summary, evaluation.task_description)}
                </p>
                {evaluation.document_url && <div style={{ marginTop: '10px' }}><SecureFileLink label="View source notes" url={evaluation.document_url} /></div>}
                {Array.isArray(evaluation.tasks) && evaluation.tasks.length > 0 && (
                  <ul style={{ marginTop: '10px', paddingLeft: '20px', color: '#334155' }}>
                    {evaluation.tasks.map((task, index) => <li key={`${task.title || 'task'}-${index}`}><strong>{task.title}</strong>{task.description ? `: ${task.description}` : ''}</li>)}
                  </ul>
                )}
              </div>

              {evaluation.submission && <p style={{ color: '#334155', whiteSpace: 'pre-wrap' }}><strong>Intern submission:</strong> {displayContent(evaluation.submission)}</p>}
              {evaluation.submission_links?.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <strong style={{ color: '#334155' }}>Submitted links</strong>
                  {evaluation.submission_links.map((link, index) => (
                    <a key={`${link}-${index}`} href={link} target="_blank" rel="noreferrer">{link}</a>
                  ))}
                </div>
              )}
              {evaluation.submission_attachments?.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {evaluation.submission_attachments.map((attachment) => (
                    <SecureFileLink key={attachment.file_id} label={`Open ${attachment.name}`} url={`/api/files/${attachment.file_id}`} />
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {canComplete(evaluation) && <button onClick={() => { setSelectedEvaluation(evaluation); setShowSubmitModal(true); }} className="btn-primary"><Send size={15} /> Complete evaluation</button>}
                {evaluation.performance_score != null && <button onClick={() => { setActiveAiData(evaluation); setAiModalOpen(true); }} className="btn-secondary">View score details</button>}
              </div>
                </>
              )}
            </article>
          ))}
        </div>
      )}

      {showFormModal && (
        <div role="presentation" style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div className="glass-card evaluation-generator-dialog" style={{ width: '100%', maxWidth: '600px', padding: '32px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', marginBottom: '20px' }}>Generate AI Intern Evaluation</h2>
            <form onSubmit={handleGenerateEvaluation} className="evaluation-generator-form" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {optionsError && (
                  <div role="alert" style={{ color: '#b91c1c', background: '#fef2f2', borderRadius: '10px', padding: '12px' }}>
                    <p>{optionsError}</p>
                    <button type="button" className="btn-secondary" onClick={fetchAssignmentOptions} disabled={loadingOptions} style={{ marginTop: '8px' }}>
                      {loadingOptions ? 'Loading placements...' : 'Retry loading placements'}
                    </button>
                  </div>
                )}
              <div className="input-group" style={{ marginBottom: 0 }}>
                  <label>Department</label>
                  <select className="input-field" required value={form.department_id} onChange={(event) => setForm({ ...form, department_id: event.target.value, placement_id: '' })} disabled={loadingOptions || departments.length === 0} style={{ color: '#0f172a', backgroundColor: '#fff' }}>
                    <option value="">Select department</option>
                    {departments.map((department) => <option key={department.id} value={department.id} style={{ color: '#0f172a', backgroundColor: '#fff' }}>{department.name}</option>)}
                </select>
                  {loadingOptions && <small style={{ color: '#64748b' }}>Loading departments and active placements...</small>}
                  {!loadingOptions && !optionsError && departments.length === 0 && <small style={{ color: '#64748b' }}>No active intern placements are available. Accept an application and assign the placement to a supervisor first.</small>}
                </div>
                <div className="input-group" style={{ marginBottom: 0 }}>
                  <label>Intern</label>
                  <select className="input-field" required value={form.placement_id} onChange={(event) => setForm({ ...form, placement_id: event.target.value })} disabled={!form.department_id || loadingOptions} style={{ color: '#0f172a', backgroundColor: '#fff' }}>
                    <option value="">Select intern</option>
                    {departmentPlacements.map((placement) => (
                      <option key={placement.id} value={placement.id} style={{ color: '#0f172a', backgroundColor: '#fff' }}>
                        {placement.intern_name || `Intern #${placement.intern_id}`}{placement.intern_email ? ` (${placement.intern_email})` : ''}
                      </option>
                    ))}
                  </select>
                {form.department_id && departmentPlacements.length === 0 && (
                  <small style={{ color: '#64748b' }}>No active interns are available in this department.</small>
                )}
              </div>
              {error && <div role="alert" style={{ color: '#b91c1c', background: '#fef2f2', borderRadius: '10px', padding: '12px' }}>{error}</div>}
              <div className="input-group" style={{ marginBottom: 0 }}>
                <label>Course notes or task description</label>
                <input type="file" className="input-field" accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" required onChange={(event) => setForm({ ...form, document: event.target.files?.[0] || null })} />
                <small style={{ color: '#64748b' }}>Example: a PDF with course topics, weekly learning objectives, or a task brief. Text-based PDF, DOCX, or TXT files work best.</small>
              </div>
              <div className="input-group" style={{ marginBottom: 0 }}>
                <label>Additional course/task text for the AI (optional)</label>
                <textarea className="input-field" rows="3" value={form.uploaded_doc_text} onChange={(event) => setForm({ ...form, uploaded_doc_text: event.target.value })} placeholder="Example: Focus on REST API design, input validation, and unit testing. This text supplements the uploaded file." />
              </div>
              <p style={{ fontSize: '0.82rem', color: '#64748b' }}>The uploaded document is sent securely to the assessment service for text extraction. It will create questions and practical tasks for the selected intern.</p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button type="button" onClick={() => setShowFormModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary" disabled={generating}>{generating ? <Loader2 size={17} className="animate-spin" /> : 'Generate evaluation'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showSubmitModal && selectedEvaluation && (
        <div role="presentation" style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '600px', padding: '32px' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', marginBottom: '8px' }}>Submit completed evaluation</h2>
            <p style={{ color: '#475569', marginBottom: '16px', whiteSpace: 'pre-wrap' }}>{displayContent(selectedEvaluation.questions, selectedEvaluation.evaluation_questions, selectedEvaluation.ai_evaluation_summary, selectedEvaluation.task_description)}</p>
            <form onSubmit={handleSubmitEvaluation} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="input-group" style={{ marginBottom: 0 }}>
                <label>Your answers and completed work</label>
                <textarea className="input-field" rows="8" required value={submission} onChange={(event) => setSubmission(event.target.value)} placeholder="Example: 1. I validated each required field and returned a 400 response for invalid input. 2. I added unit tests for valid and invalid requests. Practical task: See the linked implementation and test results." />
              </div>
              <div className="input-group" style={{ marginBottom: 0 }}>
                <label htmlFor="evaluation-links">Links to your work (optional)</label>
                <textarea
                id="evaluation-links"
                className="input-field"
                rows="3"
                value={submissionLinks}
                onChange={(event) => setSubmissionLinks(event.target.value)}
                placeholder={'Paste one HTTP or HTTPS link per line, for example:\nhttps://github.com/student/project/pull/12'}
                />
                <small style={{ color: '#64748b' }}>Links are included for reference; the AI scorer does not open external websites.</small>
              </div>
              <div className="input-group" style={{ marginBottom: 0 }}>
                <label htmlFor="evaluation-attachments">Upload work evidence (optional)</label>
                <input
                id="evaluation-attachments"
                type="file"
                className="input-field"
                multiple
                accept=".pdf,.docx,.txt,.png,.jpg,.jpeg,.webp,.gif,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,image/png,image/jpeg,image/webp,image/gif"
                onChange={(event) => setSubmissionFiles(Array.from(event.target.files || []))}
                />
                <small style={{ color: '#64748b' }}>Upload up to five documents or images (15 MB each; 15 MB combined). Documents are extracted and images are provided to the AI scorer.</small>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button type="button" onClick={() => setShowSubmitModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? <Loader2 size={17} className="animate-spin" /> : 'Submit for scoring'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <AiModal isOpen={aiModalOpen} onClose={() => setAiModalOpen(false)} title="Intern evaluation score" type="evaluation" data={activeAiData} />
    </div>
  );
}
