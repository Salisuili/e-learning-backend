const { supabaseAdmin } = require('../config/supabase');
const path = require('path');

/**
 * Supabase Storage Service
 * Handles all file operations: upload, download (signed URLs), and delete
 */
class StorageService {
  /**
   * Upload a file to Supabase Storage
   * @param {string} bucket - Storage bucket name (avatars, documents, materials, submissions, assignments)
   * @param {Buffer|Uint8Array|ArrayBuffer|string|Blob} fileBuffer - File content
   * @param {string} storagePath - Full path within bucket (e.g., "materials/userId/timestamp-filename.pdf")
   * @param {string} contentType - MIME type of the file
   * @returns {Promise<{storagePath: string, publicUrl: string}>}
   */
  async uploadFile(bucket, storagePath, fileBuffer, contentType) {
    const { data, error } = await supabaseAdmin
      .storage
      .from(bucket)
      .upload(storagePath, fileBuffer, {
        contentType,
        upsert: true,
      });

    if (error) {
      throw new Error(`Supabase Storage upload failed: ${error.message}`);
    }

    // Generate a public URL (for display/preview, not for secure download)
    const { data: urlData } = supabaseAdmin
      .storage
      .from(bucket)
      .getPublicUrl(storagePath);

    return {
      storagePath,
      publicUrl: urlData.publicUrl,
    };
  }

  /**
   * Generate a signed URL for secure file download
   * The user must be authenticated via JWT to call endpoints that use this
   * @param {string} bucket - Storage bucket name
   * @param {string} storagePath - Path within bucket
   * @param {number} expiresIn - URL expiry time in seconds (default: 1 hour)
   * @returns {Promise<string>} - Signed URL
   */
  async getSignedUrl(bucket, storagePath, expiresIn = 3600) {
    if (!storagePath) {
      throw new Error('Storage path is required');
    }

    const { data, error } = await supabaseAdmin
      .storage
      .from(bucket)
      .createSignedUrl(storagePath, expiresIn);

    if (error) {
      throw new Error(`Failed to generate signed URL: ${error.message}`);
    }

    return data.signedUrl;
  }

  /**
   * Delete a file from Supabase Storage
   * @param {string} bucket - Storage bucket name
   * @param {string} storagePath - Path within bucket
   */
  async deleteFile(bucket, storagePath) {
    if (!storagePath) return;

    const { error } = await supabaseAdmin
      .storage
      .from(bucket)
      .remove([storagePath]);

    if (error) {
      console.error(`Failed to delete file from ${bucket}/${storagePath}:`, error.message);
    }
  }

  /**
   * Generate a unique storage path for a file
   * @param {string} bucket - Storage bucket name
   * @param {string} originalName - Original file name
   * @param {string} userId - User ID for folder organization
   * @returns {string} - Unique storage path
   */
  generateStoragePath(bucket, originalName, userId) {
    const timestamp = Date.now();
    const random = Math.round(Math.random() * 1E9);
    const ext = path.extname(originalName) || '';
    const safeName = originalName
      .replace(ext, '')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .substring(0, 50);
    return `${bucket}/${userId}/${timestamp}-${random}-${safeName}${ext}`;
  }
}

module.exports = new StorageService();