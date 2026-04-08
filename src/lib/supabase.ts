import { createClient } from '@supabase/supabase-js';

// External Supabase database: lhaqqqatdztuijgdfdcf.supabase.co
const SUPABASE_URL     = 'https://lhaqqqatdztuijgdfdcf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxoYXFxcWF0ZHp0dWlqZ2RmZGNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1OTkxMTksImV4cCI6MjA5MTE3NTExOX0.Z3MV96PflYqwoexwsoi7ma4yAO3og1juWWu9YWviLbU';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
