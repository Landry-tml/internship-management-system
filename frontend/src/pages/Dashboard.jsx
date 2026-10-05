import React, { useEffect, useState } from 'react';
import { Award, Briefcase, CalendarDays, CheckCircle2, ClipboardList, FileCheck2, Sparkles, Users } from 'lucide-react';
import api from '../services/api';

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function calendarDay(value) {
  const dateValue = value instanceof Date && !Number.isNaN(value.getTime())
    ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
    : String(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateValue);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    return null;
  }
  return timestamp;
}

function displayDate(value) {
  const day = value ? calendarDay(value) : null;
  return day == null ? 'Not set' : new Date(day).toLocaleDateString('en-GB', { timeZone: 'UTC' });
}

export default function Dashboard({ user, setActiveTab }) {
  const [stats, setStats] = useState({ internships: null, applications: null, tasks: null, evaluations: null });
  const [placements, setPlacements] = useState([]);
  const [dashboardError, setDashboardError] = useState('');
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => {
    let isCurrent = true;

    async function fetchDashboardStats() {
      setDashboardError('');
      const requests = [
        api.get('/internships'),
        user.role === 'intern' ? api.get('/applications/my') : api.get('/applications'),
        api.get('/tasks'),
        api.get('/evaluations'),
        ['intern', 'supervisor'].includes(user.role) ? api.get('/placements') : Promise.resolve(null)
      ];
      const [internshipsResult, applicationsResult, tasksResult, evaluationsResult, placementsResult] =
        await Promise.allSettled(requests);

      if (!isCurrent) return;

      const results = [internshipsResult, applicationsResult, tasksResult, evaluationsResult];
      const failedResult = results.find((result) => result.status === 'rejected');
      if (failedResult) {
        setDashboardError(failedResult.reason?.response?.data?.error || 'Some dashboard totals could not be loaded.');
      }

      const countList = (result, property) => result.status === 'fulfilled' &&
        Array.isArray(result.value.data?.[property])
        ? result.value.data[property].length
        : null;
      const evaluations = evaluationsResult.status === 'fulfilled' &&
        Array.isArray(evaluationsResult.value.data?.evaluations)
        ? evaluationsResult.value.data.evaluations
        : null;
      const exercises = evaluationsResult.status === 'fulfilled' &&
        Array.isArray(evaluationsResult.value.data?.exercises)
        ? evaluationsResult.value.data.exercises
        : null;
      if (results.every((result) => result.status === 'fulfilled') &&
          (countList(internshipsResult, 'internships') == null ||
           countList(applicationsResult, 'applications') == null ||
           countList(tasksResult, 'tasks') == null ||
           evaluations == null || exercises == null)) {
        setDashboardError('A dashboard service returned an invalid response.');
      }
      const scoredEvaluations = evaluations && exercises
        ? [...evaluations, ...exercises].filter((evaluation) =>
          evaluation.performance_score != null || evaluation.score != null
        ).length
        : null;

      setStats({
        internships: countList(internshipsResult, 'internships'),
        applications: countList(applicationsResult, 'applications'),
        tasks: countList(tasksResult, 'tasks'),
        evaluations: scoredEvaluations
      });

      if (placementsResult.status === 'fulfilled' && placementsResult.value) {
        const placementList = placementsResult.value.data?.placements;
        if (Array.isArray(placementList)) {
          setPlacements(placementList);
        } else {
          setDashboardError('The placements service returned an invalid response.');
        }
      } else if (placementsResult.status === 'rejected') {
        setDashboardError(placementsResult.reason?.response?.data?.error || 'Unable to load internship placements.');
      }
    }

    if (user) fetchDashboardStats();
    return () => { isCurrent = false; };
  }, [user]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setClock(new Date()), 60000);
    return () => window.clearInterval(intervalId);
  }, []);

  const activePlacement = placements.find((placement) => ['active', 'in_progress'].includes(placement.status));
  const today = Date.UTC(clock.getFullYear(), clock.getMonth(), clock.getDate());
  const start = activePlacement?.start_date ? calendarDay(activePlacement.start_date) : null;
  const end = activePlacement?.end_date ? calendarDay(activePlacement.end_date) : null;
  const totalDays = start != null && end != null ? Math.max(1, Math.floor((end - start) / DAY_IN_MS) + 1) : null;
  const completedDays = start != null && end != null
    ? Math.min(totalDays, Math.max(0, Math.floor((Math.min(today, end) - start) / DAY_IN_MS) + (today >= start ? 1 : 0)))
    : null;
  const remainingDays = totalDays != null && completedDays != null ? Math.max(0, totalDays - completedDays) : null;
  const progress = totalDays && completedDays != null ? Math.round((completedDays / totalDays) * 100) : 0;

  const isIntern = user.role === 'intern';
  const isSupervisor = user.role === 'supervisor';
  const statsCards = [
    {
      label: 'Available Internships',
      value: stats.internships,
      note: 'Active positions',
      icon: Briefcase
    },
    {
      label: isIntern ? 'My Applications' : 'Total Applications',
      value: stats.applications,
      note: isIntern ? 'Submitted & tracked' : 'Submitted & tracked',
      icon: FileCheck2
    },
    {
      label: 'Assigned Tasks',
      value: stats.tasks,
      note: 'Kanban task items',
      icon: ClipboardList
    },
    {
      label: 'Evaluations',
      value: stats.evaluations,
      note: 'Graded evaluations',
      icon: Award
    }
  ];

  const supervisorPlacements = placements.filter((placement) =>
    ['active', 'in_progress'].includes(placement.status)
  );

  return (
    <div className="dashboard-page animate-fade-in">
      <section className="dashboard-welcome">
        <div>
          <div className="dashboard-eyebrow">{user.role} dashboard</div>
          <h1>Welcome back, {user.name}</h1>
          <p>
            {isIntern
              ? 'Keep track of your internship, applications, tasks, and evaluations.'
              : isSupervisor
                ? 'Review intern applications, assign department-aware milestone tasks, and evaluate performance.'
                : 'Monitor opportunities, applications, tasks, and internship activity.'}
          </p>
        </div>
        {isIntern && (
          <button type="button" onClick={() => setActiveTab('internships')} className="btn-primary dashboard-welcome-action">
            <Briefcase size={16} aria-hidden="true" />
            Browse Internships
          </button>
        )}
        {isSupervisor && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            <button type="button" onClick={() => setActiveTab('evaluations')} className="btn-primary dashboard-welcome-action">
              <Sparkles size={16} aria-hidden="true" />
              Generate AI Evaluation
            </button>
          </div>
        )}
      </section>

      {dashboardError && (
        <div role="alert" className="glass-card" style={{ padding: '12px 16px', color: '#b91c1c' }}>
          {dashboardError}
        </div>
      )}

      {isIntern && (
        <section className="glass-card duration-card" aria-labelledby="internship-duration-heading">
          <div className="duration-title" id="internship-duration-heading">
            <CalendarDays size={17} aria-hidden="true" />
            <span>Internship duration tracker</span>
          </div>
          {activePlacement ? (
            <>
              <div className="duration-position">{activePlacement.internship_title || 'Current internship'}</div>
              <div className="duration-metrics">
                <div className="duration-metric">
                  <div className="duration-metric-label">Days completed</div>
                  <div className="duration-metric-value">
                    {completedDays ?? '—'} <small>{totalDays != null ? `/ ${totalDays} days` : 'days'}</small>
                  </div>
                </div>
                <div className="duration-metric">
                  <div className="duration-metric-label">Days remaining</div>
                  <div className="duration-metric-value">{remainingDays ?? '—'} <small>days</small></div>
                </div>
                <div className="duration-metric">
                  <div className="duration-metric-label">Completion</div>
                  <div className="duration-metric-value is-green">{progress}%</div>
                </div>
              </div>
              <div className="duration-dates">
                <span>Start: {displayDate(activePlacement.start_date)}</span>
                <span>End: {displayDate(activePlacement.end_date)}</span>
              </div>
              {activePlacement.organization_name && (
                <p style={{ marginTop: '8px', color: '#64748b', fontSize: '0.8rem' }}>
                  Organization: {activePlacement.organization_name}
                </p>
              )}
              <div
                className="duration-progress"
                role="progressbar"
                aria-label="Internship completion"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
              >
                <div className="duration-progress-fill" style={{ width: `${progress}%` }} />
              </div>
              {activePlacement.supervisor_name && (
                <p style={{ marginTop: '12px', color: '#64748b', fontSize: '0.8rem' }}>
                  Supervisor: <strong>{activePlacement.supervisor_name}</strong>
                  {activePlacement.supervisor_email && <> · <a href={`mailto:${activePlacement.supervisor_email}`}>{activePlacement.supervisor_email}</a></>}
                  {activePlacement.supervisor_phone && <> · <a href={`tel:${activePlacement.supervisor_phone}`}>{activePlacement.supervisor_phone}</a></>}
                </p>
              )}
            </>
          ) : (
            <div style={{ paddingTop: '14px', color: '#64748b', fontSize: '0.88rem' }}>
              No active internship yet. The tracker will start when an application is accepted.
            </div>
          )}
        </section>
      )}

      <section className="dashboard-stats" aria-label="Dashboard summary">
        {statsCards.map(({ label, value, note, icon: Icon }) => (
          <article className="glass-card dashboard-stat" key={label}>
            <div className="dashboard-stat-heading">
              <span>{label}</span>
              <Icon className="dashboard-stat-icon" size={19} aria-hidden="true" />
            </div>
            <div className="dashboard-stat-value">{value ?? '—'}</div>
            <div className="dashboard-stat-note">{note}</div>
          </article>
        ))}
      </section>

      {isSupervisor && supervisorPlacements.length > 0 && (
        <section className="glass-card dashboard-team">
          <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
            <Users size={19} color="#2563eb" aria-hidden="true" />
            <h2 style={{ color: '#111827', fontSize: '1rem', fontWeight: 800 }}>Interns you supervise</h2>
          </div>
          <div className="dashboard-team-grid">
            {supervisorPlacements.map((placement) => (
              <article className="dashboard-team-member" key={placement.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
                  <strong style={{ color: '#111827', fontSize: '0.86rem' }}>{placement.intern_name || 'Intern'}</strong>
                  <CheckCircle2 size={16} color="#16a34a" aria-hidden="true" />
                </div>
                <p style={{ marginTop: '5px', color: '#64748b', fontSize: '0.75rem' }}>
                  {placement.department_name || placement.internship_title || 'Active placement'}
                  {placement.organization_name ? ` · ${placement.organization_name}` : ''}
                  {placement.intern_email ? ` · ${placement.intern_email}` : ''}
                  {placement.intern_phone ? ` · ${placement.intern_phone}` : ''}
                </p>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
