import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabase = url && serviceRoleKey
  ? createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

export const isSupabaseConfigured = Boolean(supabase);
