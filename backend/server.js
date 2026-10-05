const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const authController = require('./controllers/authController');
const passwordResetController = require('./controllers/passwordResetController');
const userController = require('./controllers/userController');
const internshipController = require('./controllers/internshipController');
const applicationController = require('./controllers/applicationController');
const taskController = require('./controllers/taskController');
const reportController = require('./controllers/reportController');
const evaluationController = require('./controllers/evaluationController');
const placementController = require('./controllers/placementController');
const notificationController = require('./controllers/notificationController');
const fileController = require('./controllers/fileController');
const {
    uploadDocuments,
    uploadLargeDocuments,
    uploadTaskSubmission,
    uploadEvaluationSubmission
} = require('./middleware/uploadMiddleware');
const { authenticateToken, authorizeRoles } = require('./middleware/authMiddleware');

const app = express();
const PORT = process.env.PORT || 5050;

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', service: 'Internship Management System Backend', time: new Date() });
});

app.post('/api/auth/verify-email', authController.verifyEmail);
app.post('/api/auth/register', authController.register);
app.post('/api/auth/login', authController.login);
app.post('/api/auth/password-reset/request', passwordResetController.requestPasswordReset);
app.post('/api/auth/password-reset/confirm', passwordResetController.resetPassword);
app.get('/api/auth/me', authenticateToken, authController.getMe);

app.get('/api/users', authenticateToken, authorizeRoles('admin', 'supervisor'), userController.getUsers);
app.put('/api/users/:id/role', authenticateToken, authorizeRoles('admin'), userController.updateUserRole);
app.put('/api/users/:id/status', authenticateToken, authorizeRoles('admin'), userController.updateUserStatus);
app.delete('/api/users/:id', authenticateToken, authorizeRoles('admin'), userController.deleteUser);
app.put('/api/users/profile', authenticateToken, userController.updateProfile);
app.get('/api/organizations', userController.getOrganizations);
app.post('/api/organizations', authenticateToken, authorizeRoles('admin'), userController.createOrganization);

app.get('/api/departments', authenticateToken, authorizeRoles('admin', 'supervisor', 'intern', 'visitor'), userController.getDepartments);
app.post('/api/departments', authenticateToken, authorizeRoles('admin'), userController.createDepartment);
app.post('/api/departments/:departmentId/supervisors', authenticateToken, authorizeRoles('admin'), userController.assignSupervisorToDepartment);
app.put('/api/departments/:id/supervisor', authenticateToken, authorizeRoles('admin'), userController.assignSupervisorToDepartment);
app.delete('/api/departments/:departmentId/supervisors/:supervisorId', authenticateToken, authorizeRoles('admin'), userController.removeSupervisorFromDepartment);

app.get('/api/internships', internshipController.getInternships);
app.get('/api/internships/:id', internshipController.getInternshipById);
app.post('/api/internships', authenticateToken, authorizeRoles('admin'), internshipController.createInternship);
app.get('/api/admin/internships', authenticateToken, authorizeRoles('admin'), internshipController.getManagedInternships);
app.put('/api/internships/:id/status', authenticateToken, authorizeRoles('admin'), internshipController.updateInternshipStatus);
app.delete('/api/internships/:id', authenticateToken, authorizeRoles('admin'), internshipController.deleteInternship);

app.post('/api/applications', authenticateToken, authorizeRoles('intern', 'visitor'), uploadDocuments, applicationController.applyForInternship);
app.get('/api/applications/my', authenticateToken, authorizeRoles('intern', 'visitor'), applicationController.getMyApplications);
app.get('/api/applications', authenticateToken, authorizeRoles('supervisor', 'admin'), applicationController.getAllApplications);
app.put('/api/applications/:id/assign-review', authenticateToken, authorizeRoles('admin'), applicationController.assignApplicationForReview);
app.put('/api/applications/:id/assign-reviewer', authenticateToken, authorizeRoles('admin'), applicationController.assignApplicationForReview);
app.put('/api/applications/:id/status', authenticateToken, authorizeRoles('intern', 'supervisor', 'admin'), applicationController.updateApplicationStatus);

app.get('/api/tasks', authenticateToken, authorizeRoles('intern', 'supervisor', 'admin'), taskController.getTasks);
app.post('/api/tasks', authenticateToken, authorizeRoles('supervisor'), taskController.createTask);
app.put('/api/tasks/:id/submit', authenticateToken, authorizeRoles('intern'), uploadTaskSubmission, taskController.submitTask);
app.put('/api/tasks/:id/progress', authenticateToken, authorizeRoles('intern'), taskController.saveTaskProgress);
app.put('/api/tasks/:id/status', authenticateToken, taskController.updateTaskStatus);

app.get('/api/reports', authenticateToken, authorizeRoles('intern', 'supervisor', 'admin'), reportController.getReports);
app.post('/api/reports', authenticateToken, authorizeRoles('intern'), uploadLargeDocuments, reportController.submitReport);
app.put('/api/reports/:id/feedback', authenticateToken, authorizeRoles('supervisor'), require('./controllers/supervisorFeedbackController').saveReportFeedback);
app.post('/api/reports/:id/ai-review', authenticateToken, authorizeRoles('supervisor'), reportController.triggerAiReview);

app.get('/api/evaluations', authenticateToken, authorizeRoles('intern', 'supervisor', 'admin'), evaluationController.getEvaluations);
app.post('/api/evaluations/ai-evaluate', authenticateToken, authorizeRoles('supervisor'), uploadDocuments, evaluationController.generateAiEvaluation);
app.post('/api/evaluations/:id/submit', authenticateToken, authorizeRoles('intern'), uploadEvaluationSubmission, evaluationController.submitEvaluationExercise);
app.post('/api/evaluations/exercises/:id/submit', authenticateToken, authorizeRoles('intern'), uploadEvaluationSubmission, evaluationController.submitEvaluationExercise);

app.get('/api/placements', authenticateToken, authorizeRoles('admin', 'supervisor', 'intern'), placementController.getPlacements);

app.post('/api/files', authenticateToken, authorizeRoles('intern', 'supervisor', 'admin'), uploadDocuments, fileController.uploadFile);
app.get('/api/files/:id', authenticateToken, fileController.downloadFile);
app.get('/uploads/:filename', authenticateToken, fileController.downloadFileByName);
app.get('/api/notifications', authenticateToken, notificationController.getNotifications);
app.put('/api/notifications/:id/read', authenticateToken, notificationController.markNotificationRead);
app.patch('/api/notifications/:id/read', authenticateToken, notificationController.markNotificationRead);

app.get('/api/analytics', authenticateToken, authorizeRoles('admin', 'supervisor'), require('./controllers/analyticsController').getAnalytics);

app.use((err, req, res, next) => {
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request body exceeds the configured size limit.' });
    if (err.name === 'MulterError') {
        const status = err.code === 'LIMIT_FILE_SIZE' || err.code === 'LIMIT_FIELD_VALUE' ? 413 : 400;
        return res.status(status).json({ error: status === 413 ? 'Upload exceeds the configured size limit.' : 'Invalid file upload.' });
    }
    if (err.message && (err.message.includes('Only matching') || err.message.includes('supported file with a matching extension'))) {
        return res.status(400).json({ error: err.message });
    }
    console.error('Unhandled Server Error:', err.stack);
    return res.status(500).json({ error: 'Internal server error.' });
});

if (require.main === module) {
    require('./scripts/migrate').runMigrations()
        .then(() => {
            app.listen(PORT, () => console.log(`IMS Backend API Server running at http://localhost:${PORT}`));
        })
        .catch((err) => {
            console.error('Database migration failed:', err.message);
            process.exitCode = 1;
        });
}

module.exports = app;

