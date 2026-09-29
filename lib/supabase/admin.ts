import { createClient } from "@supabase/supabase-js";

/**
 * Admin client using the service_role key — bypasses Row Level Security.
 * SERVER-ONLY. Never import this from a Client Component, and never send
 * SUPABASE_SERVICE_ROLE_KEY to the browser. Use for trusted backend
 * operations only (e.g. one-off migration scripts, admin API routes that
 * have already checked the caller's role themselves).
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
