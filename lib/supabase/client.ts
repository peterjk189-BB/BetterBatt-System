import { createBrowserClient } from "@supabase/ssr";
import { withAllRows } from "./pagedFetch";

/**
 * Browser-side Supabase client. Respects Row Level Security using the
 * signed-in user's session — safe to use in Client Components.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { fetch: withAllRows((i, n) => fetch(i, n)) } }
  );
}
