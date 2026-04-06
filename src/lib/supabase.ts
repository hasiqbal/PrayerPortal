import { createClient } from '@supabase/supabase-js';

// This project's OnSpace Cloud backend (adhkar_groups table lives here)
// Uses env vars auto-injected by OnSpace platform
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
