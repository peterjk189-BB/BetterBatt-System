import { createClient } from "@supabase/supabase-js";
import { withAllRows } from "./pagedFetch";

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
    {
      auth: { autoRefreshToken: false, persistSession: false },
      // Next.js caches fetch() responses by default, which made pages built from this client (e.g. the customer quote link)
      // keep showing old data after an edit. Always read fresh.
      global: { fetch: withAllRows((input, init) => fetch(input, { ...init, cache: "no-store" })) },
    }
  );
}
