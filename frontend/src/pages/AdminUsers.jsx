import React, { useState, useEffect } from 'react';
import { Users, Building2, Plus, Loader2, Trash2 } from 'lucide-react';
import api from '../services/api';
import '../admin-layout.css';

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyUser, setBusyUser] = useState(null);
  const [busyDepartmentAction, setBusyDepartmentAction] = useState('');
  const [newDepartment, setNewDepartment] = useState('');
  const [selectedSupervisorByDepartment, setSelectedSupervisorByDepartment] = useState({});

  // New Organization Modal
  const [showOrgModal, setShowOrgModal] = useState(false);
  const [newOrg, setNewOrg] = useState({
    name: '',
    industry: 'Software & AI',
    description: '',
    website: '',
    location: 'San Francisco, CA'
  });

  useEffect(() => {
    fetchUsersAndOrgs();
  }, []);

  async function fetchUsersAndOrgs() {
    const results = await Promise.allSettled([
        api.get('/users'),
        api.get('/organizations'),
        api.get('/departments')
    ]);
    const [usersResult, organizationsResult, departmentsResult] = results;
    if (usersResult.status === 'fulfilled') setUsers(usersResult.value.data.users || []);
    if (organizationsResult.status === 'fulfilled') setOrganizations(organizationsResult.value.data.organizations || []);
    if (departmentsResult.status === 'fulfilled') setDepartments(departmentsResult.value.data.departments || []);
    const failed = results.find((result) => result.status === 'rejected');
    setError(failed?.status === 'rejected' ? failed.reason?.response?.data?.error || 'Some administration data could not be loaded.' : '');
    setLoading(false);
  }

  const handleRoleChange = async (userId, role) => {
    try {
      await api.put(`/users/${userId}/role`, { role });
      fetchUsersAndOrgs();
    } catch (err) {
      alert('Failed to update user role.');
    }
  };

  const handleCreateOrg = async (e) => {
    e.preventDefault();
    try {
      await api.post('/organizations', newOrg);
      setShowOrgModal(false);
      setNewOrg({ name: '', industry: 'Software & AI', description: '', website: '', location: 'San Francisco, CA' });
      fetchUsersAndOrgs();
    } catch (err) {
      alert('Failed to create organization.');
    }
  };

  const handleUserStatus = async (userId, status) => {
    setBusyUser(userId);
    setError('');
    try {
      await api.put(`/users/${userId}/status`, { status });
      await fetchUsersAndOrgs();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update user status.');
    } finally {
      setBusyUser(null);
    }
  };

  const handleDeleteUser = async (user) => {
    if (!window.confirm(`Delete the account for ${user.name}?`)) return;
    setBusyUser(user.id);
    setError('');
    try {
      await api.delete(`/users/${user.id}`);
      await fetchUsersAndOrgs();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete user.');
    } finally {
      setBusyUser(null);
    }
  };

  const handleCreateDepartment = async (event) => {
    event.preventDefault();
    const name = newDepartment.trim();
    if (!name) return;
    setError('');
    try {
      await api.post('/departments', { name });
      setNewDepartment('');
      await fetchUsersAndOrgs();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create department.');
    }
  };

  const handleAssignSupervisor = async (departmentId) => {
    const supervisorId = selectedSupervisorByDepartment[departmentId];
    if (!supervisorId) return;
    const actionKey = `${departmentId}:add`;
    setBusyDepartmentAction(actionKey);
    setError('');
    try {
      await api.put(`/departments/${departmentId}/supervisor`, { supervisor_id: supervisorId });
      setSelectedSupervisorByDepartment((selection) => ({ ...selection, [departmentId]: '' }));
      await fetchUsersAndOrgs();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to assign department supervisor.');
    } finally {
      setBusyDepartmentAction('');
    }
  };

  const handleRemoveSupervisor = async (departmentId, supervisorId) => {
    const actionKey = `${departmentId}:${supervisorId}`;
    setBusyDepartmentAction(actionKey);
    setError('');
    try {
      await api.delete(`/departments/${departmentId}/supervisors/${supervisorId}`);
      await fetchUsersAndOrgs();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to remove department supervisor.');
    } finally {
      setBusyDepartmentAction('');
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#fff' }}>
            System User & Organization Management
          </h1>
          <p style={{ fontSize: '0.88rem', color: '#94a3b8' }}>
            Manage user authorization privileges, system roles, and partner organizations.
          </p>
        </div>

        <button onClick={() => setShowOrgModal(true)} className="btn-primary">
          <Plus size={18} /> Add Partner Organization
        </button>
      </div>

      {error && <div role="alert" className="glass-card" style={{ padding: '12px 16px', color: '#b91c1c' }}>{error}</div>}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px' }}>
          <Loader2 size={32} className="animate-spin" color="#6366f1" />
        </div>
      ) : (
        <div className="admin-management-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: '24px', alignItems: 'start', minWidth: 0 }}>
          
          {/* USERS TABLE */}
          <div className="glass-card admin-directory-card" style={{ padding: '24px', minWidth: 0 }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Users size={18} color="#6366f1" /> System Users Directory
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {users.map(u => (
                <div key={u.id} className="admin-user-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', minWidth: 0, background: '#f8fbff', padding: '12px 16px', borderRadius: '12px', border: '1px solid #dbeafe' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: '1 1 180px' }}>
                    <div aria-hidden="true" style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#dbeafe', color: '#1d4ed8', display: 'grid', placeItems: 'center', fontWeight: 800 }}>
                      {u.name?.trim()?.charAt(0)?.toUpperCase() || 'U'}
                    </div>
                    <div style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                      <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>{u.name}</h4>
                      <span style={{ fontSize: '0.78rem', color: '#64748b' }}>{u.email}</span>
                      <span className={`badge badge-${u.is_active === false || u.is_active === 0 ? 'suspended' : 'active'}`} style={{ marginTop: '4px' }}>
                        {u.is_active === false || u.is_active === 0 ? 'suspended' : 'active'}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end', minWidth: 0, maxWidth: '100%' }}>
                    <select className="input-field" value={u.role} onChange={(e) => handleRoleChange(u.id, e.target.value)} style={{ padding: '6px 12px', fontSize: '0.78rem', width: '130px', color: '#0f172a', backgroundColor: '#fff' }}>
                      <option value="visitor" style={{ color: '#0f172a', backgroundColor: '#fff' }}>Visitor</option><option value="intern" style={{ color: '#0f172a', backgroundColor: '#fff' }}>Intern</option><option value="supervisor" style={{ color: '#0f172a', backgroundColor: '#fff' }}>Supervisor</option><option value="admin" style={{ color: '#0f172a', backgroundColor: '#fff' }}>Admin</option>
                    </select>
                    <div style={{ display: 'flex', gap: '5px' }}>
                      <button disabled={busyUser === u.id} onClick={() => handleUserStatus(u.id, u.is_active === false || u.is_active === 0 ? 'active' : 'suspended')} className="btn-secondary" style={{ padding: '5px 8px', fontSize: '0.72rem' }}>
                        {u.is_active === false || u.is_active === 0 ? 'Activate' : 'Suspend'}
                      </button>
                      <button disabled={busyUser === u.id} onClick={() => handleDeleteUser(u)} className="btn-secondary" aria-label={`Delete ${u.name}`} style={{ padding: '5px 8px', color: '#b91c1c' }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-card" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', marginBottom: '16px' }}>Departments and supervisors</h3>
            <form onSubmit={handleCreateDepartment} style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <input aria-label="New department name" className="input-field" value={newDepartment} onChange={(event) => setNewDepartment(event.target.value)} placeholder="Department name" required />
              <button type="submit" className="btn-primary" aria-label="Create department"><Plus size={16} /></button>
            </form>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {departments.map((department) => (
                <div key={department.id} style={{ padding: '12px', borderRadius: '10px', background: '#f8fbff', border: '1px solid #dbeafe' }}>
                  <strong style={{ color: '#0f172a', display: 'block', marginBottom: '8px' }}>{department.name}</strong>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
                    {(department.supervisor_ids ? String(department.supervisor_ids).split(',') : []).map((supervisorId) => {
                      const supervisor = users.find((item) => String(item.id) === supervisorId);
                      if (!supervisor) return null;
                      return (
                        <span key={supervisorId} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '5px 8px', borderRadius: '999px', background: '#dbeafe', color: '#1e3a8a', fontSize: '0.78rem' }}>
                          {supervisor.name}
                          <button
                            type="button"
                            onClick={() => handleRemoveSupervisor(department.id, supervisorId)}
                            disabled={busyDepartmentAction === `${department.id}:${supervisorId}`}
                            aria-label={`Remove ${supervisor.name} from ${department.name}`}
                            style={{ border: 0, background: 'transparent', color: '#1e3a8a', cursor: 'pointer', fontWeight: 800 }}
                          >×</button>
                        </span>
                      );
                    })}
                    {!department.supervisor_ids && <span style={{ color: '#64748b', fontSize: '0.8rem' }}>No supervisors assigned.</span>}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <select
                      aria-label={`Add supervisor to ${department.name}`}
                      className="input-field"
                      value={selectedSupervisorByDepartment[department.id] || ''}
                      onChange={(event) => setSelectedSupervisorByDepartment((selection) => ({
                        ...selection,
                        [department.id]: event.target.value
                      }))}
                      style={{ color: '#0f172a', backgroundColor: '#fff' }}
                    >
                      <option value="">Select supervisor</option>
                      {users.filter((item) => item.role === 'supervisor' && item.is_active !== false && item.is_active !== 0 &&
                        !(department.supervisor_ids ? String(department.supervisor_ids).split(',') : []).includes(String(item.id))).map((supervisor) => (
                        <option key={supervisor.id} value={supervisor.id}>{supervisor.name}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => handleAssignSupervisor(department.id)}
                      disabled={!selectedSupervisorByDepartment[department.id] || busyDepartmentAction === `${department.id}:add`}
                      className="btn-primary"
                    >Assign</button>
                  </div>
                </div>
              ))}
              {departments.length === 0 && <p style={{ color: '#64748b', fontSize: '0.85rem' }}>No departments added.</p>}
            </div>
          </div>

          {/* ORGANIZATIONS LIST */}
          <div className="glass-card" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Building2 size={18} color="#38bdf8" /> Partner Organizations
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {organizations.map(o => (
                <div key={o.id} style={{ background: '#fff', padding: '14px', borderRadius: '12px', border: '1px solid #dbeafe', boxShadow: '0 4px 14px rgba(15,23,42,0.08)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
                    <img src={o.logo} alt={o.name} style={{ width: '36px', height: '36px', borderRadius: '8px', objectFit: 'cover' }} />
                    <div>
                      <h4 style={{ fontSize: '0.92rem', fontWeight: 700, color: '#0f172a' }}>{o.name}</h4>
                      <span style={{ fontSize: '0.75rem', color: '#0369a1' }}>{o.industry}{o.location ? ` · ${o.location}` : ''}</span>
                    </div>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: '#475569' }}>{o.description}</p>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}

      {/* NEW ORGANIZATION MODAL */}
      {showOrgModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(5,8,18,0.85)', backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px'
        }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '500px', padding: '32px' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff', marginBottom: '20px' }}>
              Add Partner Organization
            </h3>

            <form onSubmit={handleCreateOrg} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="input-group" style={{ marginBottom: 0 }}>
                <label>Organization Name</label>
                <input
                  type="text" className="input-field" required
                  value={newOrg.name} onChange={(e) => setNewOrg({ ...newOrg, name: e.target.value })}
                  placeholder="e.g. OpenAI Labs"
                />
              </div>

              <div className="input-group" style={{ marginBottom: 0 }}>
                <label>Industry</label>
                <input
                  type="text" className="input-field" required
                  value={newOrg.industry} onChange={(e) => setNewOrg({ ...newOrg, industry: e.target.value })}
                />
              </div>

              <div className="input-group" style={{ marginBottom: 0 }}>
                <label>Description</label>
                <textarea
                  className="input-field" rows="3"
                  value={newOrg.description} onChange={(e) => setNewOrg({ ...newOrg, description: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '12px' }}>
                <button type="button" onClick={() => setShowOrgModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary">Create Organization</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
