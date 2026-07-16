const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/supabase');
const { authenticate, authorize, requireApproval } = require('../middleware/auth');

/**
 * GET /api/announcements
 * Get all announcements (admin)
 */
router.get('/', authenticate, authorize('admin', 'lecturer'), async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('announcements')
      .select('*, posted_by:posted_by(full_name, email)')
      .order('is_pinned', { ascending: false })
      .order('posted_at', { ascending: false });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ announcements: data || [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/announcements/course/:courseId
 * Get announcements for a course
 */
router.get('/course/:courseId', authenticate, async (req, res) => {
  try {
    const { courseId } = req.params;

    const { data, error } = await supabaseAdmin
      .from('announcements')
      .select('*')
      .eq('course_id', courseId)
      .order('is_pinned', { ascending: false })
      .order('posted_at', { ascending: false });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ announcements: data || [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/announcements/department/:department
 * Get department announcements
 */
router.get('/department/:department', authenticate, async (req, res) => {
  try {
    const { department } = req.params;

    const { data, error } = await supabaseAdmin
      .from('announcements')
      .select('*')
      .eq('department', department)
      .is('course_id', null)
      .order('is_pinned', { ascending: false })
      .order('posted_at', { ascending: false });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ announcements: data || [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/announcements
 * Create an announcement (lecturer/admin)
 */
router.post('/', authenticate, authorize('lecturer', 'admin'), requireApproval, async (req, res) => {
  try {
    const { course_id, department, title, content, priority, is_pinned } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }

    const announcementData = {
      course_id: course_id || null,
      department: department || null,
      title,
      content,
      posted_by: req.user.id,
      posted_at: new Date().toISOString(),
      priority: priority || 'medium',
      is_pinned: is_pinned || false,
    };

    const { data, error } = await supabaseAdmin
      .from('announcements')
      .insert(announcementData)
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.status(201).json({ announcement: data, message: 'Announcement created successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/announcements/:id
 * Update announcement
 */
router.put('/:id', authenticate, authorize('lecturer', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const allowedFields = ['title', 'content', 'priority', 'is_pinned'];
    const updates = {};

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    const { data, error } = await supabaseAdmin
      .from('announcements')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ announcement: data, message: 'Announcement updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/announcements/:id
 * Delete announcement
 */
router.delete('/:id', authenticate, authorize('lecturer', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabaseAdmin
      .from('announcements')
      .delete()
      .eq('id', id);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ message: 'Announcement deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/announcements/:id/pin
 * Pin/unpin announcement
 */
router.put('/:id/pin', authenticate, authorize('lecturer', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { is_pinned } = req.body;

    const { error } = await supabaseAdmin
      .from('announcements')
      .update({ is_pinned: !!is_pinned })
      .eq('id', id);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ message: is_pinned ? 'Announcement pinned' : 'Announcement unpinned' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;