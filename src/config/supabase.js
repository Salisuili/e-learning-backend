const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl) {
  console.error('SUPABASE_URL is not defined in .env file');
  process.exit(1);
}

if (!supabaseAnonKey) {
  console.error('SUPABASE_ANON_KEY is not defined in .env file');
  process.exit(1);
}

// Anon client - for auth operations (signUp, signInWithPassword, etc.)
// This is the same key used by the frontend
const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: false,
  }
});

// Admin client - for database operations (requires service_role key for full access)
// If service key is not set, it falls back to anon key (respects RLS policies)
let supabaseAdmin;
if (supabaseServiceKey && supabaseServiceKey !== 'your_supabase_service_role_key_here') {
  supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    }
  });
  console.log('✓ Using service_role key for admin database operations');
} else {
  // Fallback to anon key - this means RLS policies must allow the operations
  supabaseAdmin = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    }
  });
  console.log('⚠ Using anon key for database operations (set SUPABASE_SERVICE_KEY for full admin access)');
}

module.exports = { supabaseAnon, supabaseAdmin };