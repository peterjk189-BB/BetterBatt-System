import { createClient } from "@/lib/supabase/server";

type Status = "ok" | "schema-missing" | "connection-failed" | "env-missing";

async function checkConnection(): Promise<{ status: Status; detail: string }> {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return {
      status: "env-missing",
      detail: "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set.",
    };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.from("customers").select("id", { count: "exact", head: true });

    if (error) {
      // 42P01 = undefined_table — the migration hasn't been run yet.
      if (error.code === "42P01") {
        return { status: "schema-missing", detail: error.message };
      }
      return { status: "connection-failed", detail: error.message };
    }

    return { status: "ok", detail: "Connected to Supabase and the schema is in place." };
  } catch (err) {
    return {
      status: "connection-failed",
      detail: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

const COPY: Record<Status, { title: string; body: string; tone: string }> = {
  ok: {
    title: "Foundation is live",
    body: "Next.js is deployed, and it can reach the Supabase database and read the schema. Phase 1 checkpoint: passed.",
    tone: "border-green-300 bg-green-50 text-green-900",
  },
  "schema-missing": {
    title: "Connected — schema not created yet",
    body: "The app can reach your Supabase project, but the database tables haven't been created yet. Run the migration in supabase/migrations/0001_init.sql via the Supabase SQL Editor, then reload this page.",
    tone: "border-amber-300 bg-amber-50 text-amber-900",
  },
  "connection-failed": {
    title: "Could not connect to Supabase",
    body: "The app has Supabase credentials but the connection failed. Double-check the Project URL and anon key in Vercel's environment variables.",
    tone: "border-red-300 bg-red-50 text-red-900",
  },
  "env-missing": {
    title: "Supabase environment variables missing",
    body: "Add NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY in Vercel Project Settings -> Environment Variables, then redeploy.",
    tone: "border-red-300 bg-red-50 text-red-900",
  },
};

export default async function Home() {
  const { status, detail } = await checkConnection();
  const copy = COPY[status];

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <div>
        <p className="font-mono text-xs uppercase tracking-wide text-accent">
          Coverage &middot; Phase 1
        </p>
        <h1 className="mt-2 text-3xl font-bold">Foundation deploy</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          This is the empty shell that proves code, database, and hosting are wired
          together, before any real screens are built on top.
        </p>
      </div>

      <div className={`rounded-xl border p-5 ${copy.tone}`}>
        <p className="font-semibold">{copy.title}</p>
        <p className="mt-1 text-sm">{copy.body}</p>
        <p className="mt-3 font-mono text-xs opacity-70">{detail}</p>
      </div>

      <ol className="list-decimal space-y-1 pl-5 text-sm text-[var(--muted)]">
        <li>Scaffold Next.js project connected to Supabase &mdash; done</li>
        <li>Database schema (supabase/migrations/0001_init.sql) &mdash; run once in Supabase SQL Editor</li>
        <li>Auth roles (admin / installer) &mdash; created by the migration</li>
        <li>Empty shell deployed to Vercel &mdash; this page</li>
      </ol>
    </main>
  );
}
