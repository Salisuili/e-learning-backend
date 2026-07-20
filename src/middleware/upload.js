const multer = require('multer');
const path = require('path');

/**
 * Multer middleware configured with memory storage.
 * Files are stored in memory (buffer) so they can be uploaded to Supabase Storage.
 * The backend no longer saves files to the local filesystem.
 */

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

// Use memory storage - files will be uploaded to Supabase Storage
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 50 * 1024 * 1024, // 50MB default
  }
});

module.exports = upload;