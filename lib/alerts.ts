/**
 * Saves an alert to the Alerts inbox (shown to office/admin and, optionally, specific people).
 * Best-effort: never throws, and quietly does nothing before migration 0066 is run.
 * `dedupeKey` makes it safe to call twice for the same event.
 * `admin` is the service-role Supabase client.
 */
export async function recordAlert(
  admin: any,
  a: {
    kind: string;
    title: string;
    body?: string | null;
    path?: string | null;
    dedupeKey: string;
    /** People (besides the office) who should see it, e.g. the person a visit is assigned to. */
    forUsers?: string[];
    /** The person who caused it — they don't get the pop-up for their own action. */
    actor?: string | null;
  }
) {
  try {
    await admin.from("alerts").upsert(
      {
        kind: a.kind,
        title: a.title,
        body: a.body ?? null,
        path: a.path ?? null,
        dedupe_key: a.dedupeKey,
        for_staff: true,
        for_users: (a.forUsers ?? []).filter(Boolean),
        actor: a.actor ?? null,
      },
      { onConflict: "dedupe_key", ignoreDuplicates: true }
    );
  } catch {
    /* best-effort */
  }
}
