const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const uploadDirectory = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(uploadDirectory, { recursive: true });

const documentTypes = new Map([
    ['application/pdf', '.pdf'],
    ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.docx'],
    ['text/plain', '.txt']
]);

const submissionMediaTypes = new Map([
    ...documentTypes,
    ['image/jpeg', ['.jpg', '.jpeg']],
    ['image/png', '.png'],
    ['image/webp', '.webp'],
    ['image/gif', '.gif']
]);
const storageExtensions = new Map([
    ...documentTypes,
    ['image/jpeg', '.jpg'],
    ['image/png', '.png'],
    ['image/webp', '.webp'],
    ['image/gif', '.gif']
]);

const storage = multer.diskStorage({
    destination: (req, file, callback) => callback(null, uploadDirectory),
    filename: (req, file, callback) => callback(null, `${crypto.randomUUID()}${storageExtensions.get(file.mimetype) || '.bin'}`)
});

function createUpload(maxFileSize, types) {
    return multer({
        storage,
        limits: { fileSize: maxFileSize, files: 5, fields: 20, fieldSize: 1024 * 1024 },
        fileFilter: (req, file, callback) => {
            const extension = path.extname(file.originalname).toLowerCase();
            const allowedExtensions = types.get(file.mimetype);
            if (!allowedExtensions || !(Array.isArray(allowedExtensions)
                ? allowedExtensions.includes(extension)
                : allowedExtensions === extension)) {
                return callback(new Error('Upload a supported file with a matching extension.'));
            }
            callback(null, true);
        }
    });
}

const upload = createUpload(5 * 1024 * 1024, documentTypes);

const uploadDocuments = upload.fields([
    { name: 'document', maxCount: 1 },
    { name: 'documents', maxCount: 5 },
    { name: 'file', maxCount: 1 },
    { name: 'school_template', maxCount: 1 },
    { name: 'template_document', maxCount: 1 },
    { name: 'motivation_letter', maxCount: 1 },
    { name: 'cv', maxCount: 1 },
    { name: 'recommendation_letter', maxCount: 1 }
]);

const uploadLargeDocuments = createUpload(50 * 1024 * 1024, documentTypes).fields([
    { name: 'document', maxCount: 1 },
    { name: 'documents', maxCount: 5 },
    { name: 'file', maxCount: 1 },
    { name: 'school_template', maxCount: 1 },
    { name: 'template_document', maxCount: 1 }
]);

const uploadTaskSubmission = createUpload(25 * 1024 * 1024, submissionMediaTypes)
    .fields([{ name: 'attachment', maxCount: 1 }]);

const uploadEvaluationSubmission = createUpload(15 * 1024 * 1024, submissionMediaTypes)
    .fields([{ name: 'attachments', maxCount: 5 }]);

module.exports = {
    upload,
    uploadDocuments,
    uploadLargeDocuments,
    uploadTaskSubmission,
    uploadEvaluationSubmission,
    uploadDirectory
};
