const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/supabase');
const { authenticate, authorize, requireApproval } = require('../middleware/auth');
const upload = require('../middleware/upload');
const storageService = require('../services/storage');

/**
 * GET /api/assignments/course/:courseId
 * Get assignments for a course
 */
router.get('/course/:courseId', authenticate, async (req, res) => {
  try {
    const { courseId } = req.params;

    const { data, error } = await supabaseAdmin
      .from('assignments')
      .select('*')
      .eq('course_id', courseId)
      .order('due_date', { ascending: true });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ assignments: data || [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/assignments/:id
 * Get assignment by ID
 */
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabaseAdmin
      .from('assignments')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    res.json({ assignment: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/assignments/course/:courseId
 * Create assignment (lecturer/admin)
 */
router.post('/course/:courseId', authenticate, authorize('lecturer', 'admin'), requireApproval, upload.single('assignment_file'), async (req, res) => {
  try {
    const { courseId } = req.params;
    const { title, description, due_date, max_score } = req.body;

    if (!title || !due_date) {
      return res.status(400).json({ error: 'Missing required fields: title, due_date' });
    }

    const assignmentData = {
      course_id: courseId,
      title,
      description: description || '',
      due_date: new Date(due_date).toISOString(),
      max_score: max_score || 100,
      created_by: req.user.id,
      created_at: new Date().toISOString(),
    };

    if (req.file) {
      const storagePath = storageService.generateStoragePath('assignment-submissions', req.file.originalname, req.user.id);
      const uploadResult = await storageService.uploadFile('assignment-submissions', storagePath, req.file.buffer, req.file.mimetype);
      assignmentData.assignment_file_url = uploadResult.publicUrl;
      assignmentData.assignment_file_name = req.file.originalname;
      assignmentData.assignment_storage_path = uploadResult.storagePath;
    }

    const { data, error } = await supabaseAdmin
      .from('assignments')
      .insert(assignmentData)
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.status(201).json({ assignment: data, message: 'Assignment created successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/assignments/:id/file
 * Download an assignment file via signed URL redirect (browser download)
 */
router.get('/:id/file', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabaseAdmin
      .from('assignments')
      .select('assignment_storage_path, assignment_file_name')
      .eq('id', id)
      .single();

    if (error || !data || !data.assignment_storage_path) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Generate a signed URL that expires in 1 hour
    const signedUrl = await storageService.getSignedUrl('assignments', data.assignment_storage_path, 3600);

    // Redirect to the signed URL - browser will handle the download
    res.redirect(signedUrl);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/assignments/:id
 * Update assignment
 */
router.put('/:id', authenticate, authorize('lecturer', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const allowedFields = ['title', 'description', 'due_date', 'max_score'];
    const updates = {};

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = field === 'due_date' ? new Date(req.body[field]).toISOString() : req.body[field];
      }
    });

    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('assignments')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ assignment: data, message: 'Assignment updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/assignments/:id
 * Delete assignment
 */
router.delete('/:id', authenticate, authorize('lecturer', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabaseAdmin
      .from('assignments')
      .delete()
      .eq('id', id);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ message: 'Assignment deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/assignments/:id/submit
 * Submit assignment (student)
 */
router.post('/:id/submit', authenticate, authorize('student'), upload.single('submission'), async (req, res) => {
  try {
    const assignmentId = req.params.id;
    const studentId = req.user.id;

    // Check if already submitted
    const { data: existing } = await supabaseAdmin
      .from('assignment_submissions')
      .select('id')
      .eq('assignment_id', assignmentId)
      .eq('student_id', studentId)
      .maybeSingle();

    if (existing) {
      return res.status(400).json({ error: 'You have already submitted this assignment' });
    }

    const submissionData = {
      assignment_id: assignmentId,
      student_id: studentId,
      submission_text: req.body.submission_text || '',
      submitted_at: new Date().toISOString(),
    };

    if (req.file) {
      const storagePath = storageService.generateStoragePath('submissions', req.file.originalname, studentId);
      const uploadResult = await storageService.uploadFile('submissions', storagePath, req.file.buffer, req.file.mimetype);
      submissionData.submission_file_url = uploadResult.publicUrl;
      submissionData.submission_file_name = req.file.originalname;
      submissionData.submission_storage_path = uploadResult.storagePath;
    }

    const { data, error } = await supabaseAdmin
      .from('assignment_submissions')
      .insert(submissionData)
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.status(201).json({ submission: data, message: 'Assignment submitted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/assignments/:id/submissions
 * Get all submissions for an assignment (lecturer/admin)
 */
router.get('/:id/submissions', authenticate, authorize('lecturer', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabaseAdmin
      .from('assignment_submissions')
      .select('*, student:student_id(id, email, full_name, identification_number)')
      .eq('assignment_id', id)
      .order('submitted_at', { ascending: false });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ submissions: data || [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/assignments/:id/my-submission
 * Get student's own submission
 */
router.get('/:id/my-submission', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const studentId = req.user.id;

    const { data, error } = await supabaseAdmin
      .from('assignment_submissions')
      .select('*')
      .eq('assignment_id', id)
      .eq('student_id', studentId)
      .maybeSingle();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ submission: data || null });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/assignments/submissions/:submissionId/grade
 * Grade a submission (lecturer/admin)
 */
router.put('/submissions/:submissionId/grade', authenticate, authorize('lecturer', 'admin'), async (req, res) => {
  try {
    const { submissionId } = req.params;
    const { score, feedback } = req.body;

    if (score === undefined || score === null) {
      return res.status(400).json({ error: 'Score is required' });
    }

    const { data, error } = await supabaseAdmin
      .from('assignment_submissions')
      .update({
        score,
        feedback: feedback || '',
        graded_at: new Date().toISOString(),
      })
      .eq('id', submissionId)
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ submission: data, message: 'Submission graded successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/assignments/submissions/:submissionId/file
 * Generate a signed URL for secure download and redirect the browser
 */
router.get('/submissions/:submissionId/file', authenticate, async (req, res) => {
  try {
    const { submissionId } = req.params;
    
    const { data, error } = await supabaseAdmin
      .from('assignment_submissions')
      .select('submission_storage_path, submission_file_name')
      .eq('id', submissionId)
      .single();
    
    if (error || !data || !data.submission_storage_path) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Generate a signed URL that expires in 1 hour
    const signedUrl = await storageService.getSignedUrl('submissions', data.submission_storage_path, 3600);
    
    // Redirect to the signed URL - browser will handle the download
    res.redirect(signedUrl);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
