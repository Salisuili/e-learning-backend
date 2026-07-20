const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/supabase');
const { authenticate, authorize, requireApproval } = require('../middleware/auth');
const upload = require('../middleware/upload');
const storageService = require('../services/storage');

/**
 * GET /api/courses/available
 * Get all available courses for students to browse (with level/department filtering)
 */
router.get('/available', authenticate, async (req, res) => {
  try {
    const user = req.user;
    const { level, department } = req.query;

    let query = supabaseAdmin
      .from('courses')
      .select('*, lecturer:lecturer_id(full_name, email)')
      .order('created_at', { ascending: false });

    // Filter by level if provided
    if (level) {
      query = query.eq('level', level);
    }

    // Filter by department
    if (department) {
      query = query.eq('department', department);
    } else if (user.department) {
      query = query.eq('department', user.department);
    }

    const { data, error } = await query;

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ courses: data || [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/courses/levels
 * Get distinct levels
 */
router.get('/levels', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('courses')
      .select('level')
      .not('level', 'is', null)
      .order('level', { ascending: true });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    // Get unique levels
    const levels = [...new Set(data.map(c => c.level))];
    res.json({ levels });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/courses/sessions
 * Get distinct sessions
 */
router.get('/sessions', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('courses')
      .select('session')
      .not('session', 'is', null)
      .order('session', { ascending: false });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    const sessions = [...new Set(data.map(c => c.session))];
    res.json({ sessions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/courses
 * Get all courses
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const user = req.user;

    let query = supabaseAdmin
      .from('courses')
      .select('*')
      .order('created_at', { ascending: false });

    // Students: only see courses they're enrolled in
    if (user.role === 'student') {
      // Get enrolled course IDs first
      const { data: enrollments } = await supabaseAdmin
        .from('course_enrollments')
        .select('course_id')
        .eq('student_id', user.id);

      if (!enrollments || enrollments.length === 0) {
        return res.json({ courses: [] });
      }

      const courseIds = enrollments.map(e => e.course_id);
      const { data, error } = await supabaseAdmin
        .from('courses')
        .select('*')
        .in('id', courseIds)
        .order('created_at', { ascending: false });

      if (error) return res.status(400).json({ error: error.message });
      return res.json({ courses: data || [] });
    }

    // Lecturers: only see their own courses
    if (user.role === 'lecturer') {
      query = query.eq('lecturer_id', user.id);
    }

    const { data, error } = await query;

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ courses: data || [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/courses/:id
 * Get course by ID
 */
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabaseAdmin
      .from('courses')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      return res.status(404).json({ error: 'Course not found' });
    }

    res.json({ course: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/courses
 * Create a new course (lecturer or admin)
 */
router.post('/', authenticate, authorize('lecturer', 'admin'), requireApproval, async (req, res) => {
  try {
    const { code, title, description, department, lecturer_id, credits, semester, year, level, session } = req.body;

    if (!code || !title || !department || !lecturer_id) {
      return res.status(400).json({ error: 'Missing required fields: code, title, department, lecturer_id' });
    }

    const courseData = {
      code,
      title,
      description: description || '',
      department,
      lecturer_id,
      credits: credits || 3,
      semester: semester || '',
      year: year || new Date().getFullYear(),
      level: level || '100',
      session: session || '',
      created_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from('courses')
      .insert(courseData)
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.status(201).json({ course: data, message: 'Course created successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/courses/:id
 * Update course
 */
router.put('/:id', authenticate, authorize('lecturer', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const allowedFields = ['code', 'title', 'description', 'department', 'credits', 'semester', 'year', 'level', 'session'];
    const updates = {};

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('courses')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ course: data, message: 'Course updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/courses/:id
 * Delete course
 */
router.delete('/:id', authenticate, authorize('lecturer', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;

    // Verify ownership for lecturers
    if (req.user.role === 'lecturer') {
      const { data: course } = await supabaseAdmin
        .from('courses')
        .select('lecturer_id')
        .eq('id', id)
        .single();

      if (!course || course.lecturer_id !== req.user.id) {
        return res.status(403).json({ error: 'You can only delete your own courses' });
      }
    }

    const { error } = await supabaseAdmin
      .from('courses')
      .delete()
      .eq('id', id);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ message: 'Course deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/courses/:id/enroll
 * Enroll student in a course
 */
router.post('/:id/enroll', authenticate, async (req, res) => {
  try {
    const courseId = req.params.id;
    const studentId = req.user.id;

    // Only students can enroll
    if (req.user.role !== 'student') {
      return res.status(403).json({ error: 'Only students can enroll in courses' });
    }

    // Check if already enrolled
    const { data: existing } = await supabaseAdmin
      .from('course_enrollments')
      .select('id')
      .eq('student_id', studentId)
      .eq('course_id', courseId)
      .maybeSingle();

    if (existing) {
      return res.status(400).json({ error: 'Already enrolled in this course' });
    }

    const { data, error } = await supabaseAdmin
      .from('course_enrollments')
      .insert({
        student_id: studentId,
        course_id: courseId,
        enrolled_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.status(201).json({ enrollment: data, message: 'Enrolled successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/courses/:id/enrollments
 * Get course enrollments (lecturer/admin)
 */
router.get('/:id/enrollments', authenticate, authorize('lecturer', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabaseAdmin
      .from('course_enrollments')
      .select('*, student:student_id(id, email, full_name, identification_number)')
      .eq('course_id', id);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ enrollments: data || [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/courses/:id/materials
 * Upload course material (lecturer/admin)
 */
router.post('/:id/materials', authenticate, authorize('lecturer', 'admin'), upload.single('material'), async (req, res) => {
  try {
    const courseId = req.params.id;

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { title, description } = req.body;

    // Upload file to Supabase Storage
    const storagePath = storageService.generateStoragePath('materials', req.file.originalname, req.user.id);
    const uploadResult = await storageService.uploadFile('materials', storagePath, req.file.buffer, req.file.mimetype);

    const materialData = {
      course_id: courseId,
      title: title || req.file.originalname,
      description: description || '',
      file_url: uploadResult.publicUrl,
      file_name: req.file.originalname,
      file_size: req.file.size,
      file_type: req.file.mimetype,
      storage_path: uploadResult.storagePath,
      uploaded_by: req.user.id,
      uploaded_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from('course_materials')
      .insert(materialData)
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.status(201).json({ material: data, message: 'Material uploaded successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/courses/:id/materials
 * Get course materials
 */
router.get('/:id/materials', authenticate, async (req, res) => {
  try {
    const courseId = req.params.id;

    const { data, error } = await supabaseAdmin
      .from('course_materials')
      .select('*')
      .eq('course_id', courseId)
      .order('uploaded_at', { ascending: false });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ materials: data || [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/courses/materials/:materialId/file
 * Download a course material file via signed URL redirect (browser download)
 */
router.get('/materials/:materialId/file', authenticate, async (req, res) => {
  try {
    const { materialId } = req.params;

    const { data, error } = await supabaseAdmin
      .from('course_materials')
      .select('storage_path, file_name')
      .eq('id', materialId)
      .single();

    if (error || !data || !data.storage_path) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Generate a signed URL that expires in 1 hour
    const signedUrl = await storageService.getSignedUrl('materials', data.storage_path, 3600);

    // Redirect to the signed URL - browser will handle the download
    res.redirect(signedUrl);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/courses/materials/:materialId
 * Delete course material
 */
router.delete('/materials/:materialId', authenticate, authorize('lecturer', 'admin'), async (req, res) => {
  try {
    const { materialId } = req.params;

    const { error } = await supabaseAdmin
      .from('course_materials')
      .delete()
      .eq('id', materialId);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ message: 'Material deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;