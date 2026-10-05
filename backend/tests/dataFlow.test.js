const fs = require('fs');
const os = require('os');
const path = require('path');
const bcrypt = require('bcryptjs');

jest.mock('../config/db', () => ({
    query: jest.fn(),
    getConnection: jest.fn()
}));
jest.mock('../services/accessControl', () => ({
    canReviewApplication: jest.fn().mockResolvedValue(true),
    canAccessPlacement: jest.fn().mockResolvedValue(true)
}));
jest.mock('../services/aiService', () => ({
    extractDocumentText: jest.fn(),
    generateEvaluationExercise: jest.fn(),
    scoreEvaluationExercise: jest.fn()
}));
jest.mock('../services/notifications', () => ({
    notify: jest.fn().mockResolvedValue(undefined),
    notifyMany: jest.fn().mockResolvedValue(undefined)
}));
jest.mock('../utils/validation', () => ({
    isSafeExternalUrl: jest.fn(() => true)
}));
jest.mock('../services/emailCheckService', () => ({
    verifyRealEmail: jest.fn()
}));

const pool = require('../config/db');
const { canReviewApplication, canAccessPlacement } = require('../services/accessControl');
const { scoreEvaluationExercise } = require('../services/aiService');
const { notify, notifyMany } = require('../services/notifications');
const { verifyRealEmail } = require('../services/emailCheckService');
const { getAnalytics } = require('../controllers/analyticsController');
const { getPlacements } = require('../controllers/placementController');
const { applyForInternship, updateApplicationStatus } = require('../controllers/applicationController');
const { login, register } = require('../controllers/authController');
const { removeSupervisorFromDepartment, updateProfile } = require('../controllers/userController');
const { saveReportFeedback } = require('../controllers/supervisorFeedbackController');
const { submitReport } = require('../controllers/reportController');
const { updateTaskStatus, saveTaskProgress, submitTask } = require('../controllers/taskController');
const { submitEvaluationExercise } = require('../controllers/evaluationController');

function response() {
    return {
        statusCode: 200,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        }
    };
}

describe('application and placement data flow', () => {
    let uploadDirectory;

    beforeEach(() => {
        pool.query.mockReset();
        pool.getConnection.mockReset();
        canReviewApplication.mockReset().mockResolvedValue(true);
        canAccessPlacement.mockReset().mockResolvedValue(true);
        scoreEvaluationExercise.mockReset().mockResolvedValue({ score: 91, feedback: 'Good evidence.', question_feedback: [] });
        notify.mockReset().mockResolvedValue(undefined);
        notifyMany.mockReset().mockResolvedValue(undefined);
        verifyRealEmail.mockReset();
    });

    afterEach(() => {
        if (uploadDirectory) {
            fs.rmSync(uploadDirectory, { recursive: true, force: true });
            uploadDirectory = null;
        }
    });

    it('counts all intern accounts in administrator analytics, not only placed interns', async () => {
        pool.query.mockImplementation(async (sql) => {
            const query = String(sql).replace(/\s+/g, ' ');
            if (query.includes('COUNT(*) AS total_users FROM users')) return [[{ total_users: 12 }]];
            if (query.includes("COUNT(*) AS total_interns FROM users WHERE role = 'intern'")) return [[{ total_interns: 7 }]];
            if (query.includes('COUNT(*) AS total_supervisors')) return [[{ total_supervisors: 3 }]];
            if (query.includes('COUNT(*) AS total_organizations')) return [[{ total_organizations: 4 }]];
            if (query.includes('COUNT(*) AS total_internships')) return [[{ total_internships: 6 }]];
            if (query.includes('COUNT(*) AS total_applications')) return [[{ total_applications: 8 }]];
            if (query.includes('COUNT(*) AS total_placements')) return [[{ total_placements: 5 }]];
            if (query.includes('COUNT(*) AS total_tasks')) return [[{ total_tasks: 9 }]];
            if (query.includes('COUNT(*) AS completed_tasks')) return [[{ completed_tasks: 2 }]];
            if (query.includes('avg_evaluation_score')) return [[{ avg_evaluation_score: 4 }]];
            return [[]];
        });

        const res = response();
        await getAnalytics({ user: { id: 1, role: 'admin' } }, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.metrics).toMatchObject({ total_users: 12, total_interns: 7 });
        expect(pool.query.mock.calls.some(([sql]) =>
            String(sql).includes("COUNT(*) AS total_interns FROM users WHERE role = 'intern'")
        )).toBe(true);
    });

    it('includes department-assigned active placements in a supervisor placement list', async () => {
        const placement = { id: 4, intern_id: 10, status: 'active', department_id: 2 };
        pool.query.mockResolvedValue([[placement]]);
        const res = response();

        await getPlacements({ user: { id: 3, role: 'supervisor' } }, res);

        expect(res.body.placements).toEqual([placement]);
        const [sql, params] = pool.query.mock.calls[0];
        expect(String(sql)).toContain('COALESCE(p.department_id, i.department_id) = (SELECT department_id FROM users WHERE id = ?)');
        expect(String(sql)).toContain('p.created_at');
        expect(params).toEqual([3, 3, 3]);
    });

    it('submits an application without a recommendation letter', async () => {
        uploadDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ims-application-'));
        const motivationPath = path.join(uploadDirectory, 'motivation.pdf');
        const cvPath = path.join(uploadDirectory, 'cv.pdf');
        fs.writeFileSync(motivationPath, '%PDF motivation');
        fs.writeFileSync(cvPath, '%PDF cv');
        let fileId = 30;
        pool.query.mockImplementation(async (sql) => {
            const query = String(sql);
            if (query.includes('SELECT id, status, department_id FROM internships')) {
                return [[{ id: 5, status: 'open', department_id: null }]];
            }
            if (query.includes('SELECT id FROM departments WHERE id = ?')) return [[{ id: 2 }]];
            if (query.includes('SELECT id FROM applications')) return [[]];
            if (query.includes('INSERT INTO uploaded_files')) return [{ insertId: fileId++ }];
            if (query.includes('INSERT INTO applications')) return [{ insertId: 55 }];
            if (query.includes('SELECT supervisor_id AS id FROM department_supervisors')) return [[]];
            if (query.includes('SELECT id FROM users WHERE role = "supervisor"')) return [[]];
            if (query.includes('SELECT id FROM users WHERE role = "admin"')) return [[]];
            throw new Error(`Unexpected query: ${query}`);
        });
        const req = {
            body: { internship_id: 5, department_id: '2', start_date: '2026-02-01', end_date: '2026-04-26' },
            files: {
                motivation_letter: [{ path: motivationPath, filename: 'motivation.pdf', originalname: 'motivation.pdf', mimetype: 'application/pdf', size: 15 }],
                cv: [{ path: cvPath, filename: 'cv.pdf', originalname: 'cv.pdf', mimetype: 'application/pdf', size: 7 }]
            },
            user: { id: 10, role: 'intern' }
        };
        const res = response();

        await applyForInternship(req, res);

        expect(res.statusCode).toBe(201);
        const [insertSql, insertParams] = pool.query.mock.calls.find(([sql]) =>
            String(sql).includes('INSERT INTO applications')
        );
        expect(String(insertSql)).toContain('recommendation_file_id');
        expect(String(insertSql)).toContain('department_id');
        expect(insertParams[2]).toBe('2');
        expect(insertParams[7]).toBeNull();
    });

    it('creates an active placement with the accepted application dates', async () => {
        const application = {
            id: 8,
            intern_id: 10,
            internship_id: 5,
            department_id: 9,
            supervisor_id: 3,
            duration_weeks: 12,
            start_date: '2026-02-01',
            end_date: '2026-04-26',
            status: 'pending'
        };
        pool.query.mockResolvedValue([[application]]);
        const connection = {
            beginTransaction: jest.fn().mockResolvedValue(undefined),
            commit: jest.fn().mockResolvedValue(undefined),
            rollback: jest.fn().mockResolvedValue(undefined),
            release: jest.fn(),
            query: jest.fn(async (sql) => {
                const query = String(sql);
                if (query.includes('SELECT id FROM placements')) return [[]];
                if (query.includes('SELECT duration_weeks, department_id FROM internships')) return [[{ duration_weeks: 16, department_id: 2 }]];
                return [{ affectedRows: 1, insertId: 90 }];
            })
        };
        pool.getConnection.mockResolvedValue(connection);
        const res = response();

        await updateApplicationStatus({
            body: { status: 'accepted' },
            params: { id: '8' },
            user: { id: 3, role: 'supervisor' }
        }, res);

        expect(res.statusCode).toBe(200);
        const [placementSql, placementParams] = connection.query.mock.calls.find(([sql]) =>
            String(sql).includes('INSERT INTO placements')
        );
        expect(String(placementSql)).toContain("'active'");
        expect(placementParams).toEqual([10, 3, 5, 9, '2026-02-01', '2026-04-26', '2026-02-01', 12]);
        expect(connection.commit).toHaveBeenCalled();
    });

    it('allows a department supervisor to accept an application without prior admin assignment', async () => {
        pool.query.mockResolvedValueOnce([[
            {
                id: 9,
                intern_id: 11,
                internship_id: 6,
                department_id: 4,
                supervisor_id: null,
                duration_weeks: 8,
                start_date: '2026-03-01',
                end_date: '2026-04-26',
                status: 'pending'
            }
        ]]);
        const connection = {
            beginTransaction: jest.fn().mockResolvedValue(undefined),
            commit: jest.fn().mockResolvedValue(undefined),
            rollback: jest.fn().mockResolvedValue(undefined),
            release: jest.fn(),
            query: jest.fn(async (sql) => {
                const query = String(sql);
                if (query.includes('SELECT id FROM placements')) return [[]];
                if (query.includes('SELECT duration_weeks, department_id FROM internships')) {
                    return [[{ duration_weeks: 8, department_id: 2 }]];
                }
                return [{ affectedRows: 1 }];
            })
        };
        pool.getConnection.mockResolvedValue(connection);
        const res = response();

        await updateApplicationStatus({
            body: { status: 'accepted' },
            params: { id: '9' },
            user: { id: 7, role: 'supervisor' }
        }, res);

        expect(res.statusCode).toBe(200);
        expect(connection.query.mock.calls[0][1]).toEqual(['accepted', 7, '9']);
        const [, placementParams] = connection.query.mock.calls.find(([sql]) =>
            String(sql).includes('INSERT INTO placements')
        );
        expect(placementParams[1]).toBe(7);
        expect(connection.commit).toHaveBeenCalled();
    });

    it('notifies department supervisors when an intern submits a report', async () => {
        pool.query.mockImplementation(async (sql) => {
            const query = String(sql).replace(/\s+/g, ' ');
            if (query.includes('INSERT INTO reports')) return [{ insertId: 14 }];
            if (query.includes('SELECT p.intern_id, p.supervisor_id')) {
                return [[{ intern_id: 10, supervisor_id: null, intern_name: 'Test Intern', department_id: 2 }]];
            }
            if (query.includes('SELECT ds.supervisor_id AS id')) return [[{ id: 3 }]];
            if (query.includes('SELECT id FROM users WHERE role = "supervisor"')) return [[{ id: 4 }]];
            if (query.includes('SELECT id FROM users WHERE role = "admin"')) return [[{ id: 1 }]];
            throw new Error(`Unexpected query: ${query}`);
        });
        const res = response();

        await submitReport({
            body: {
                placement_id: '6',
                report_type: 'weekly',
                title: 'Week one',
                content: 'Completed orientation and reviewed the project.'
            },
            files: {},
            user: { id: 10, role: 'intern' }
        }, res);

        expect(res.statusCode).toBe(201);
        expect(notifyMany).toHaveBeenCalledWith(
            [null, 3, 4, 1],
            'report_submitted',
            'Test Intern submitted a weekly report.',
            'report',
            14
        );
    });

    it('does not perform external email verification during password sign-in', async () => {
        const password = 'correct horse battery staple';
        const hash = await bcrypt.hash(password, 4);
        pool.query.mockResolvedValue([[
            { id: 10, name: 'Intern', email: 'intern@example.edu', role: 'intern', is_active: 1, password: hash }
        ]]);
        const res = response();

        await login({ body: { email: ' INTERN@example.edu ', password } }, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.token).toBeTruthy();
        expect(verifyRealEmail).not.toHaveBeenCalled();
        expect(pool.query).toHaveBeenCalledWith('SELECT * FROM users WHERE email = ?', ['intern@example.edu']);
    });

    it('does not accept demo passwords or plaintext stored passwords', async () => {
        const hash = await bcrypt.hash('real-user-password', 4);
        pool.query.mockResolvedValueOnce([[
            { id: 10, name: 'Intern', email: 'intern@example.edu', role: 'intern', is_active: 1, password: hash }
        ]]);
        const wrongPasswordResponse = response();

        await login({ body: { email: 'intern@example.edu', password: 'password123' } }, wrongPasswordResponse);

        expect(wrongPasswordResponse.statusCode).toBe(401);

        pool.query.mockResolvedValueOnce([[
            { id: 11, name: 'Legacy User', email: 'legacy@example.edu', role: 'intern', is_active: 1, password: 'plaintext-password' }
        ]]);
        const plaintextResponse = response();

        await login({ body: { email: 'legacy@example.edu', password: 'plaintext-password' } }, plaintextResponse);

        expect(plaintextResponse.statusCode).toBe(401);
    });

    it('allows supervisor signup without granting admin privileges', async () => {
        verifyRealEmail.mockResolvedValue({ isValid: true, domain: 'example.edu', reason: 'Verified.' });
        pool.query
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([{ insertId: 22 }]);
        const res = response();

        await register({
            body: {
                name: 'New Supervisor',
                email: 'supervisor@example.edu',
                password: 'a-strong-password',
                role: 'supervisor'
            }
        }, res);

        expect(res.statusCode).toBe(201);
        expect(res.body.user).toMatchObject({ id: 22, role: 'supervisor' });
        expect(pool.query.mock.calls[1][0]).toContain('INSERT INTO users');
        expect(pool.query.mock.calls[1][1][3]).toBe('supervisor');
        expect(res.body.user.role).not.toBe('admin');
    });

    it('preserves another department assignment when removing a supervisor from one department', async () => {
        pool.query
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockResolvedValueOnce([[{ department_id: 8 }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }]);
        const res = response();

        await removeSupervisorFromDepartment({
            params: { departmentId: '2', supervisorId: '3' }
        }, res);

        expect(res.statusCode).toBe(200);
        expect(pool.query.mock.calls[2][1]).toEqual([8, 3, 2]);
    });

    it('updates only the authenticated user profile and returns the saved profile', async () => {
        pool.query
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockResolvedValueOnce([[
                { id: 3, name: 'Supervisor Updated', email: 'supervisor@example.edu', role: 'supervisor', phone: '555-0101', bio: 'New profile', avatar: null }
            ]]);
        const res = response();

        await updateProfile({
            body: { name: ' Supervisor Updated ', phone: '555-0101', bio: 'New profile' },
            user: { id: 3, role: 'supervisor' }
        }, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.user).toMatchObject({ id: 3, name: 'Supervisor Updated' });
        expect(pool.query.mock.calls[0][1][4]).toBe(3);
    });

    it('rejects invalid profile fields before issuing an update', async () => {
        const res = response();

        await updateProfile({
            body: { name: '  ' },
            user: { id: 3, role: 'supervisor' }
        }, res);

        expect(res.statusCode).toBe(400);
        expect(pool.query).not.toHaveBeenCalled();
    });

    it('saves supervisor feedback only for an accessible report', async () => {
        pool.query
            .mockResolvedValueOnce([[{ id: 14, placement_id: 6, intern_id: 10 }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }]);
        const res = response();

        await saveReportFeedback({
            params: { id: '14' },
            body: { feedback: '  Strong analysis; clarify the conclusion.  ' },
            user: { id: 3, role: 'supervisor' }
        }, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.feedback).toBe('Strong analysis; clarify the conclusion.');
        expect(canAccessPlacement).toHaveBeenCalledWith({ id: 3, role: 'supervisor' }, 6);
        expect(pool.query.mock.calls[1][1]).toEqual(['Strong analysis; clarify the conclusion.', 3, 14]);
        expect(notify).toHaveBeenCalledWith(10, 'report_feedback', expect.any(String), 'report', 14);
    });

    it('does not save feedback for reports outside the supervisor access scope', async () => {
        pool.query.mockResolvedValueOnce([[{ id: 14, placement_id: 6, intern_id: 10 }]]);
        canAccessPlacement.mockResolvedValue(false);
        const res = response();

        await saveReportFeedback({
            params: { id: '14' },
            body: { feedback: 'Private report comments.' },
            user: { id: 3, role: 'supervisor' }
        }, res);

        expect(res.statusCode).toBe(403);
        expect(pool.query).toHaveBeenCalledTimes(1);
    });

    it('allows an intern to start only their own pending task', async () => {
        pool.query
            .mockResolvedValueOnce([[{ id: 40, placement_id: 6, status: 'pending', intern_id: 10 }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }]);
        const res = response();

        await updateTaskStatus({
            params: { id: '40' },
            body: { status: 'in_progress' },
            user: { id: 10, role: 'intern' }
        }, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe('in_progress');
        expect(pool.query.mock.calls[1][0]).toContain("SET status = 'in_progress'");
    });

    it('saves progress without completing an in-progress task', async () => {
        pool.query
            .mockResolvedValueOnce([[{ id: 40, status: 'in_progress', intern_id: 10 }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }]);
        const res = response();

        await saveTaskProgress({
            params: { id: '40' },
            body: { submission_notes: 'Built the first component.', submission_url: '' },
            user: { id: 10, role: 'intern' }
        }, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe('in_progress');
        expect(pool.query.mock.calls[1][1]).toEqual(['Built the first component.', '', '40']);
    });

    it('requires a task to be started before submitting it as completed', async () => {
        pool.query.mockResolvedValueOnce([[
            { id: 40, status: 'pending', intern_id: 10, supervisor_id: 3 }
        ]]);
        const res = response();

        await submitTask({
            params: { id: '40' },
            body: { submission_notes: 'Finished.' },
            user: { id: 10, role: 'intern' }
        }, res);

        expect(res.statusCode).toBe(409);
        expect(pool.query).toHaveBeenCalledTimes(1);
    });

    it('accepts an optional image attachment when submitting a task', async () => {
        uploadDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ims-task-'));
        const imagePath = path.join(uploadDirectory, 'evidence.png');
        fs.writeFileSync(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]));
        pool.query.mockImplementation(async (sql) => {
            const query = String(sql);
            if (query.includes('SELECT t.id, t.status, p.intern_id, p.supervisor_id')) {
                return [[{ id: 40, status: 'in_progress', intern_id: 10, supervisor_id: 3 }]];
            }
            if (query.includes('INSERT INTO uploaded_files')) return [{ insertId: 78 }];
            if (query.includes('UPDATE tasks SET submission_notes')) return [{ affectedRows: 1 }];
            if (query.includes('SELECT id FROM users WHERE role = "admin"')) return [[]];
            throw new Error(`Unexpected query: ${query}`);
        });
        const res = response();

        await submitTask({
            params: { id: '40' },
            body: { submission_notes: 'Completed the interface.' },
            files: {
                attachment: [{
                    path: imagePath,
                    filename: 'evidence.png',
                    originalname: 'evidence.png',
                    mimetype: 'image/png',
                    size: 12
                }]
            },
            user: { id: 10, role: 'intern' }
        }, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.attachment.file_id).toBe(78);
        expect(pool.query.mock.calls.find(([sql]) => String(sql).includes('UPDATE tasks SET submission_notes'))[1][2]).toBe(78);
    });

    it('scores an intern evaluation with uploaded image evidence and saves a secure file reference', async () => {
        uploadDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ims-evaluation-'));
        const imagePath = path.join(uploadDirectory, 'prototype.png');
        fs.writeFileSync(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]));
        pool.query.mockImplementation(async (sql) => {
            const query = String(sql);
            if (query.includes('SELECT id FROM users WHERE role = "admin"')) return [[]];
            throw new Error(`Unexpected pool query: ${query}`);
        });
        pool.query.mockResolvedValueOnce([[
            {
                id: 21,
                placement_id: 6,
                intern_id: 10,
                supervisor_id: 3,
                status: 'pending',
                questions_json: JSON.stringify({ questions: [{ question: 'Explain the prototype.' }], tasks: [] })
            }
        ]]);
        const connection = {
            beginTransaction: jest.fn().mockResolvedValue(undefined),
            commit: jest.fn().mockResolvedValue(undefined),
            rollback: jest.fn().mockResolvedValue(undefined),
            release: jest.fn(),
            query: jest.fn(async (sql) => {
                if (String(sql).includes('INSERT INTO uploaded_files')) return [{ insertId: 88 }];
                if (String(sql).includes("UPDATE evaluation_exercises SET status = 'reviewed'")) return [{ affectedRows: 1 }];
                throw new Error(`Unexpected connection query: ${sql}`);
            })
        };
        pool.getConnection.mockResolvedValue(connection);
        const res = response();

        await submitEvaluationExercise({
            params: { id: '21' },
            body: { submission: 'The prototype implements the requested workflow.', links: 'https://example.test/demo' },
            files: {
                attachments: [{
                    path: imagePath,
                    filename: 'prototype.png',
                    originalname: 'prototype.png',
                    mimetype: 'image/png',
                    size: 12
                }]
            },
            user: { id: 10, role: 'intern' }
        }, res);

        expect(res.statusCode).toBe(200);
        expect(scoreEvaluationExercise).toHaveBeenCalledWith(
            [{ question: 'Explain the prototype.' }],
            [],
            expect.objectContaining({ links: ['https://example.test/demo'] }),
            [expect.objectContaining({ mime_type: 'image/png' })]
        );
        const savedJson = JSON.parse(connection.query.mock.calls.find(([sql]) =>
            String(sql).includes("UPDATE evaluation_exercises SET status = 'reviewed'")
        )[1][2]);
        expect(savedJson.attachments).toEqual([{
            file_id: 88,
            name: 'prototype.png',
            mime_type: 'image/png'
        }]);
    });
});
