import { createClient } from '@supabase/supabase-js';

// External Supabase database: lhaqqqatdztuijgdfdcf.supabase.co
const SUPABASE_URL      = 'https://lhaqqqatdztuijgdfdcf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxoYXFxcWF0ZHp0dWlqZ2RmZGNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1OTkxMTksImV4cCI6MjA5MTE3NTExOX0.Z3MV96PflYqwoexwsoi7ma4yAO3og1juWWu9YWviLbU';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxoYXFxcWF0ZHp0dWlqZ2RmZGNmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTU5OTExOSwiZXhwIjoyMDkxMTc1MTE5fQ.Dlt1Dkkh7WzUPLOVh1JgNU7h6u3m1PyttSlHuNxho4w';

/** Standard client — uses anon key + user JWT after login */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Admin client — uses service role key, bypasses all RLS.
 * Use ONLY for portal_users management and admin-only operations.
 * Never expose to end users / mobile app.
 */
export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
