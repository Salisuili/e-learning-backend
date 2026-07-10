const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure upload directories exist
const createDirIfNotExist = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const uploadDir = path.resolve(__dirname, '../../uploads');
const avatarsDir = path.join(uploadDir, 'avatars');
const documentsDir = path.join(uploadDir, 'documents');
const materialsDir = path.join(uploadDir, 'materials');
const submissionsDir = path.join(uploadDir, 'submissions');

[uploadDir, avatarsDir, documentsDir, materialsDir, submissionsDir].forEach(createDirIfNotExist);

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let destDir = uploadDir;

    // Determine destination based on file type/field
    if (req.baseUrl.includes('auth') || file.fieldname === 'avatar') {
      destDir = avatarsDir;
    } else if (file.fieldname === 'document' || file.fieldname === 'identification_document') {
      destDir = documentsDir;
    } else if (file.fieldname === 'material' || file.fieldname === 'course_material') {
      destDir = materialsDir;
    } else if (file.fieldname === 'submission' || file.fieldname === 'assignment_file') {
      destDir = submissionsDir;
    }

    cb(null, destDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  }
});

// File filter - allow common document types
const fileFilter = (req, file, cb) => {
  const allowedMimes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'application/zip',
    'application/x-rar-compressed',
    'video/mp4',
    'video/mpeg',
    'video/webm',
    'audio/mpeg',
    'audio/mp3',
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} is not allowed`), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 50 * 1024 * 1024, // 50MB default
  }
});

module.exports = upload;