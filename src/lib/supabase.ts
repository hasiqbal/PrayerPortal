import { createClient } from '@supabase/supabase-js';

// ── Primary database: OnSpace Cloud (erwtsmhykudttxbeerwt)
// These env vars are automatically injected by OnSpace — do NOT hardcode.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('[supabase] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing from environment.');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
