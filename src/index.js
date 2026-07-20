const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const courseRoutes = require('./routes/courses');
const assignmentRoutes = require('./routes/assignments');
const announcementRoutes = require('./routes/announcements');

const app = express();
const PORT = process.env.PORT || 3001;

// =====================
// Middleware
// =====================

// Security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// CORS - allow frontend connections
app.use(cors({
  origin: '*', // In production, restrict to your frontend domain
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api/', limiter);

// Request logging
app.use(morgan('dev'));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Note: Static file serving for uploads is removed.
// All files are now stored in Supabase Storage and served via signed URLs.
// See the storage service and download endpoints for file access.

// =====================
// API Routes
// =====================
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/announcements', announcementRoutes);

// =====================
// Health Check
// =====================
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// =====================
// Error Handling
// =====================
// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.originalUrl} not found` });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);

  // Multer file size error
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File too large. Maximum size is 50MB.' });
  }

  // Multer file type error
  if (err.message && err.message.includes('File type')) {
    return res.status(400).json({ error: err.message });
  }

  res.status(500).json({ error: 'Internal server error' });
});

// =====================
// Start Server
// =====================
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n========================================`);
  console.log(`  E-Learning API Server`);
  console.log(`  Port: ${PORT}`);
  console.log(`  Host: 0.0.0.0 (accessible from network)`);
  console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`  Supabase: ${process.env.SUPABASE_URL ? 'Connected' : 'Not configured'}`);
  console.log(`========================================\n`);
});
