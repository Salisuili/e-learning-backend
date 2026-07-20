const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { supabaseAnon, supabaseAdmin } = require('../config/supabase');
const { authenticate } = require('../middleware/auth');
const upload = require('../middleware/upload');
const storageService = require('../services/storage');

/**
 * POST /api/auth/register
 * Register a new user
 */
router.post('/register', upload.single('document'), async (req, res) => {
  try {
    const { email, password, full_name, role, department, identification_number } = req.body;

    if (!email || !password || !full_name || !role || !department) {
      return res.status(400).json({ error: 'Missing required fields: email, password, full_name, role, department' });
    }

    if (!['student', 'lecturer', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be student, lecturer, or admin' });
    }

    // Create auth user via Supabase
    const { data: authData, error: authError } = await supabaseAnon.auth.signUp({
      email,
      password,
    });

    if (authError) {
      return res.status(400).json({ error: authError.message });
    }

    if (!authData.user) {
      return res.status(400).json({ error: 'Registration failed. User was not created.' });
    }

    // For non-admin roles, set status to pending
    const isAdmin = role === 'admin';
    const newUser = {
      id: authData.user.id,
      email,
      full_name,
      role,
      department,
      status: isAdmin ? 'approved' : 'pending',
      is_approved: isAdmin,
      identification_number: identification_number || null,
      created_at: new Date().toISOString(),
    };

    // If a document file was uploaded, upload to Supabase Storage
    if (req.file) {
      const storagePath = storageService.generateStoragePath('documents', req.file.originalname, authData.user.id);
      const uploadResult = await storageService.uploadFile('documents', storagePath, req.file.buffer, req.file.mimetype);
      newUser.document_url = uploadResult.publicUrl;
      newUser.document_file_name = req.file.originalname;
      newUser.document_storage_path = uploadResult.storagePath;
    }

    // Create user profile in database
    const { data: userData, error: dbError } = await supabaseAdmin
      .from('users')
      .insert(newUser)
      .select()
      .single();

    if (dbError) {
      // Rollback: delete the auth user if DB insert fails
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return res.status(400).json({ error: dbError.message });
    }

    res.status(201).json({
      message: isAdmin 
        ? 'Admin registered successfully' 
        : 'Registration successful. Please wait for admin approval.',
      user: userData,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/auth/login
 * Login with email and password
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Authenticate with Supabase
    const { data: authData, error: authError } = await supabaseAnon.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      return res.status(401).json({ error: authError.message });
    }

    // Get user profile
    const { data: userData, error: dbError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    if (dbError || !userData) {
      return res.status(404).json({ error: 'User profile not found. Please contact admin.' });
    }

    res.json({
      user: userData,
      session: {
        access_token: authData.session.access_token,
        refresh_token: authData.session.refresh_token,
        expires_in: authData.session.expires_in,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/auth/logout
 * Logout user
 */
router.post('/logout', authenticate, async (req, res) => {
  try {
    const { error } = await supabaseAnon.auth.signOut();
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/auth/me
 * Get current authenticated user
 */
router.get('/me', authenticate, async (req, res) => {
  res.json({ user: req.user });
});

/**
 * PUT /api/auth/profile
 * Update user profile
 */
router.put('/profile', authenticate, upload.single('avatar'), async (req, res) => {
  try {
    const updates = {};
    const allowedFields = ['full_name', 'department', 'identification_number'];

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    if (req.file) {
      const storagePath = storageService.generateStoragePath('avatars', req.file.originalname, req.user.id);
      const uploadResult = await storageService.uploadFile('avatars', storagePath, req.file.buffer, req.file.mimetype);
      updates.avatar_url = uploadResult.publicUrl;
      updates.avatar_storage_path = uploadResult.storagePath;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const { data, error } = await supabaseAdmin
      .from('users')
      .update(updates)
      .eq('id', req.user.id)
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ user: data, message: 'Profile updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/auth/reset-password
 * Request password reset
 */
router.post('/reset-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const { error } = await supabaseAnon.auth.resetPasswordForEmail(email);
    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ message: 'Password reset email sent' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/auth/update-password
 * Update password (authenticated)
 */
router.put('/update-password', authenticate, async (req, res) => {
  try {
    const { new_password } = req.body;
    if (!new_password || new_password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(req.user.id, {
      password: new_password,
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;