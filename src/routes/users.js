const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/supabase');
const { authenticate, authorize } = require('../middleware/auth');

/**
 * GET /api/users
 * Get all users (admin only)
 */
router.get('/', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { role, status } = req.query;
    let query = supabaseAdmin.from('users').select('*').order('created_at', { ascending: false });

    if (role) {
      query = query.eq('role', role);
    }
    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ users: data || [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/users/pending
 * Get pending users (admin only)
 */
router.get('/pending', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .in('status', ['pending', 'rejected'])
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ users: data || [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/users/:id
 * Get user by ID
 */
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/users/:id/role
 * Update user role (admin only)
 */
router.put('/:id/role', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!['student', 'lecturer', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const { data, error } = await supabaseAdmin
      .from('users')
      .update({ role })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ user: data, message: 'User role updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/users/:id/approve
 * Approve user (admin only)
 */
router.put('/:id/approve', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabaseAdmin
      .from('users')
      .update({
        status: 'approved',
        is_approved: true,
        reviewed_by: req.user.id,
        reviewed_at: new Date().toISOString(),
        rejection_reason: null,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ user: data, message: 'User approved successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/users/:id/reject
 * Reject user (admin only)
 */
router.put('/:id/reject', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const { data, error } = await supabaseAdmin
      .from('users')
      .update({
        status: 'rejected',
        is_approved: false,
        reviewed_by: req.user.id,
        reviewed_at: new Date().toISOString(),
        rejection_reason: reason || 'Account rejected by admin',
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ user: data, message: 'User rejected' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/users/:id
 * Delete user (admin only)
 */
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;

    // Delete from auth
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(id);
    if (authError) {
      return res.status(400).json({ error: authError.message });
    }

    // Delete from database (cascade should handle related records)
    const { error: dbError } = await supabaseAdmin
      .from('users')
      .delete()
      .eq('id', id);

    if (dbError) {
      return res.status(400).json({ error: dbError.message });
    }

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/users/lecturers
 * Get all lecturers (for course assignment)
 */
router.get('/lecturers/list', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('id, full_name, email, department')
      .eq('role', 'lecturer')
      .eq('status', 'approved');

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ lecturers: data || [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;