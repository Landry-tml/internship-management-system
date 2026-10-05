import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Loader2, Send, ExternalLink } from 'lucide-react';
import confetti from 'canvas-confetti';
import api from '../services/api';
import SecureFileLink from '../components/SecureFileLink';

const emptyTask = {
  assignment_type: 'intern',
  placement_id: '',
  intern_id: '',
  department_id: '',
  title: '',
  description: '',
  priority: 'medium',
  deadline: ''
};

export default function Tasks({ user }) {
  const [tasks, setTasks] = useState([]);
  const [placements, setPlacements] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [taskView, setTaskView] = useState('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [newTask, setNewTask] = useState(emptyTask);
  const [submission, setSubmission] = useState({ submission_notes: '', submission_url: '', attachment: null });
  const [submissionMode, setSubmissionMode] = useState('submit');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchTasks();
    if (user.role === 'supervisor') fetchAssignmentOptions();
  }, [user]);

  async function fetchTasks() {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/tasks');
      setTasks(response.data.tasks || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Unable to load tasks.');
    } finally {
      setLoading(false);
    }
  }

  async function fetchAssignmentOptions() {
    try {
      const [placementResponse, departmentResponse] = await Promise.all([
        api.get('/placements'),
        api.get('/departments')
      ]);
      const activePlacements = (placementResponse.data.placements || []).filter((placement) => placement.status === 'active');
      setPlacements(activePlacements);
      const activeDepartmentIds = new Set(activePlacements.map((placement) => String(placement.department_id)));
      setDepartments((departmentResponse.data.departments || []).filter((department) => activeDepartmentIds.has(String(department.id))));
    } catch (err) {
      setError(err.response?.data?.error || 'Unable to load intern and department assignments.');
    }
  }

  const selectedPlacement = useMemo(
    () => placements.find((placement) => String(placement.id) === String(newTask.placement_id)),
    [placements, newTask.placement_id]
  );

  async function handleStatusChange(taskId, status) {
    setBusy(true);
    setError('');
    try {
      await api.put(`/tasks/${taskId}/status`, { status });
      await fetchTasks();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update task status.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/tasks', {
        ...newTask,
        placement_id: newTask.assignment_type === 'intern' ? newTask.placement_id : '',
        intern_id: newTask.assignment_type === 'intern' ? selectedPlacement?.intern_id || newTask.intern_id : '',
        department_id: newTask.department_id
      });
      setShowCreateModal(false);
      setNewTask(emptyTask);
      await fetchTasks();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to assign task.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmitTask(event) {
    event.preventDefault();
    if (!selectedTask) return;
    setBusy(true);
    setError('');
    try {
      if (submissionMode === 'progress') {
        await api.put(`/tasks/${selectedTask.id}/progress`, {
          submission_notes: submission.submission_notes,
          submission_url: submission.submission_url
        });
      } else {
        const data = new FormData();
        data.append('submission_notes', submission.submission_notes);
        if (submission.submission_url.trim()) data.append('submission_url', submission.submission_url.trim());
        if (submission.attachment) data.append('attachment', submission.attachment);
        await api.put(`/tasks/${selectedTask.id}/submit`, data);
        confetti({ particleCount: 70, spread: 60, origin: { y: 0.7 } });
      }
      setShowSubmitModal(false);
      setSelectedTask(null);
      setSubmission({ submission_notes: '', submission_url: '', attachment: null });
      await fetchTasks();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit task.');
    } finally {
      setBusy(false);
    }
  }

  const visibleTasks = user.role === 'supervisor' && taskView === 'assigned'
    ? tasks.filter((task) => Number(task.assigned_by || task.supervisor_id) === Number(user.id))
    : tasks;

  const renderColumn = (status, title, color) => {
    const columnTasks = visibleTasks.filter((task) => task.status === status);
    return (
      <section key={status} className="glass-card" style={{ padding: '20px', flex: 1, minWidth: '280px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #dbeafe', paddingBottom: '12px' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span aria-hidden="true" style={{ width: '10px', height: '10px', borderRadius: '50%', background: color }} />
            {title}
          </h2>
          <span className="badge badge-in_progress">{columnTasks.length}</span>
        </header>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {columnTasks.map((task) => (
            <article key={task.id} style={{ background: '#f8fbff', border: '1px solid #dbeafe', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <span className={`badge badge-${task.priority}`}>{task.priority} priority</span>
                <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Due: {task.deadline ? new Date(task.deadline).toLocaleDateString() : '—'}</span>
              </div>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>{task.title}</h3>
              <p style={{ fontSize: '0.82rem', color: '#475569', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{task.description}</p>
              {(task.intern_name || task.department_name) && (
                <p style={{ fontSize: '0.78rem', color: '#475569' }}>
                  {task.intern_name ? `Intern: ${task.intern_name}` : ''}
                  {task.intern_name && task.department_name ? ' · ' : ''}
                  {task.department_name ? `Department: ${task.department_name}` : ''}
                </p>
              )}
              {task.submission_notes && (
                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', padding: '10px', borderRadius: '8px', fontSize: '0.8rem', color: '#1e3a8a' }}>
                  <strong>{task.status === 'completed' ? 'Completed task details:' : 'Saved progress:'}</strong>
                  <p style={{ marginTop: '4px', whiteSpace: 'pre-wrap' }}>{task.submission_notes}</p>
                  {task.submission_url && <a href={task.submission_url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '6px' }}>Open deliverable <ExternalLink size={14} /></a>}
                  {task.submission_file_id && <div style={{ marginTop: '8px' }}><SecureFileLink label="Open attached deliverable" url={`/api/files/${task.submission_file_id}`} /></div>}
                </div>
              )}
              {user.role === 'intern' && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  {status === 'pending' && (
                    <button disabled={busy} onClick={() => handleStatusChange(task.id, 'in_progress')} className="btn-secondary">
                      Start assigned task
                    </button>
                  )}
                  {status === 'in_progress' && (
                    <>
                      <button
                        onClick={() => {
                          setSelectedTask(task);
                          setSubmission({ submission_notes: task.submission_notes || '', submission_url: task.submission_url || '', attachment: null });
                          setSubmissionMode('progress');
                          setShowSubmitModal(true);
                        }}
                        className="btn-secondary"
                      >Continue task</button>
                      <button
                        onClick={() => {
                          setSelectedTask(task);
                          setSubmission({ submission_notes: task.submission_notes || '', submission_url: task.submission_url || '', attachment: null });
                          setSubmissionMode('submit');
                          setShowSubmitModal(true);
                        }}
                        className="btn-primary"
                        style={{ flex: 1 }}
                      >Submit task <Send size={14} /></button>
                    </>
                  )}
                </div>
              )}
            </article>
          ))}
          {columnTasks.length === 0 && <p style={{ color: '#64748b', fontSize: '0.82rem' }}>No tasks in this column.</p>}
        </div>
      </section>
    );
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a' }}>Internship Task Board</h1>
          <p style={{ fontSize: '0.88rem', color: '#64748b' }}>Monitor task progress and completed work.</p>
        </div>
        {user.role === 'supervisor' && <button onClick={() => setShowCreateModal(true)} className="btn-primary"><Plus size={18} /> Assign task</button>}
      </div>

      {user.role === 'supervisor' && (
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className={taskView === 'all' ? 'btn-primary' : 'btn-secondary'} onClick={() => setTaskView('all')}>Team progress</button>
          <button className={taskView === 'assigned' ? 'btn-primary' : 'btn-secondary'} onClick={() => setTaskView('assigned')}>Tasks I assigned</button>
        </div>
      )}
      {error && <div role="alert" className="glass-card" style={{ padding: '12px 16px', color: '#b91c1c' }}>{error}</div>}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px' }}><Loader2 size={32} className="animate-spin" color="#2563eb" /></div>
      ) : (
        <div className="task-board" style={{ display: 'flex', gap: '20px', overflowX: 'auto', alignItems: 'flex-start', paddingBottom: '16px' }}>
          {renderColumn('pending', 'Pending', '#2563eb')}
          {renderColumn('in_progress', 'In progress', '#3b82f6')}
          {renderColumn('completed', 'Completed tasks', '#1d4ed8')}
        </div>
      )}

      {showCreateModal && (
        <div role="presentation" style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '520px', padding: '32px' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', marginBottom: '20px' }}>Assign task to an intern</h2>
            <form onSubmit={handleCreateSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="input-group" style={{ marginBottom: 0 }}>
                <label>Assignment target</label>
                <select className="input-field" value={newTask.assignment_type} onChange={(event) => setNewTask({ ...newTask, assignment_type: event.target.value, placement_id: '', intern_id: '', department_id: '' })}>
                  <option value="intern">Specific intern</option>
                  <option value="department">Department interns</option>
                </select>
              </div>
              {newTask.assignment_type === 'intern' ? (
              <div className="input-group" style={{ marginBottom: 0 }}>
                <label>Intern</label>
                <select className="input-field" required value={newTask.placement_id} onChange={(event) => setNewTask({ ...newTask, placement_id: event.target.value, intern_id: placements.find((placement) => String(placement.id) === event.target.value)?.intern_id || '' })}>
                  <option value="">Select an intern placement</option>
                  {placements.map((placement) => <option key={placement.id} value={placement.id}>{placement.intern_name} ({placement.intern_email})</option>)}
                </select>
              </div>
              ) : (
                <div className="input-group" style={{ marginBottom: 0 }}>
                <label>Department</label>
                <select className="input-field" required value={newTask.department_id} onChange={(event) => setNewTask({ ...newTask, department_id: event.target.value })}>
                  <option value="">Select a department</option>
                  {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
                </select>
              </div>
              )}
              <div className="input-group" style={{ marginBottom: 0 }}>
                <label>Task title</label>
                <input type="text" className="input-field" required value={newTask.title} onChange={(event) => setNewTask({ ...newTask, title: event.target.value })} placeholder="Example: Build and test the intern onboarding API" />
              </div>
              <div className="input-group" style={{ marginBottom: 0 }}>
                <label>Instructions and requirements</label>
                <textarea className="input-field" rows="3" required value={newTask.description} onChange={(event) => setNewTask({ ...newTask, description: event.target.value })} placeholder="Example: Add POST /onboarding with required-field validation, return clear errors, and include unit tests for valid and invalid requests." />
              </div>
              <div className="responsive-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="input-group" style={{ marginBottom: 0 }}>
                  <label>Priority</label>
                  <select className="input-field" value={newTask.priority} onChange={(event) => setNewTask({ ...newTask, priority: event.target.value })}>
                    <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
                  </select>
                </div>
                <div className="input-group" style={{ marginBottom: 0 }}>
                  <label>Deadline</label>
                  <input type="date" className="input-field" required value={newTask.deadline} onChange={(event) => setNewTask({ ...newTask, deadline: event.target.value })} />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button type="button" onClick={() => setShowCreateModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary" disabled={busy}>Assign task</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showSubmitModal && selectedTask && (
        <div role="presentation" style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '500px', padding: '32px' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', marginBottom: '8px' }}>
              {submissionMode === 'progress' ? 'Continue assigned task' : 'Submit completed task'}
            </h2>
            <p style={{ color: '#475569', marginBottom: '20px' }}>{selectedTask.title}</p>
            <form onSubmit={handleSubmitTask} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="input-group" style={{ marginBottom: 0 }}>
                <label>Completed work summary</label>
                <textarea className="input-field" rows="4" required value={submission.submission_notes} onChange={(event) => setSubmission({ ...submission, submission_notes: event.target.value })} placeholder="Example: Implemented the endpoint, added validation for missing email, and verified 6 passing tests. Remaining: add integration coverage." />
              </div>
              <div className="input-group" style={{ marginBottom: 0 }}>
                <label>Deliverable link (optional)</label>
                <input type="url" className="input-field" value={submission.submission_url} onChange={(event) => setSubmission({ ...submission, submission_url: event.target.value })} placeholder="https://github.com/your-name/project/pull/12" />
              </div>
              {submissionMode === 'submit' && (
                <div className="input-group" style={{ marginBottom: 0 }}>
                  <label htmlFor="task-attachment">Attach task evidence (optional)</label>
                  <input
                    id="task-attachment"
                    type="file"
                    className="input-field"
                    accept=".pdf,.docx,.txt,.png,.jpg,.jpeg,.webp,.gif,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,image/png,image/jpeg,image/webp,image/gif"
                    onChange={(event) => setSubmission({ ...submission, attachment: event.target.files?.[0] || null })}
                  />
                  <small style={{ color: '#64748b' }}>Attach a document, screenshot, or photo (PDF, DOCX, TXT, PNG, JPG, WEBP, or GIF; up to 25 MB).</small>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button type="button" onClick={() => { setShowSubmitModal(false); setSelectedTask(null); }} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary" disabled={busy}>
                  {busy ? <Loader2 size={17} className="animate-spin" /> : submissionMode === 'progress' ? 'Save progress' : 'Submit task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
