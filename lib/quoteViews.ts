import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { recordAlert } from "@/lib/alerts";

// Link-preview and security scanners that fetch a link without a person opening it.
const BOT = /bot|crawl|spider|preview|scanner|prefetch|facebookexternalhit|slurp|google-?image|googleother|microsoft office|safelinks|skypeuripreview|whatsapp|curl|python|node-fetch|axios|headless|lighthouse|vercel/i;

/**
 * Records that a customer opened the public quote page: first and last time, and a running count.
 * Skips logged-in staff, known bots/scanners and anything within a minute of the email being sent.
 * Raises one alert the first time the customer opens each emailed copy. Best-effort: never throws, and
 * does nothing until migration 0083 is run.
 */
export async function recordQuoteView(admin: any, project: any) {
  try {
    if (!("view_count" in project)) return; // migration 0083 not run yet
    const ua = headers().get("user-agent") || "";
    if (!ua || BOT.test(ua)) return;

    // Our own staff checking the link aren't the customer.
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (data?.user) return;

    const now = new Date();
    const emailedAt = project.emailed_at ? new Date(project.emailed_at) : null;
    if (emailedAt && now.getTime() - emailedAt.getTime() < 60_000) return;

    const previous = project.last_viewed_at ? new Date(project.last_viewed_at) : null;
    const firstSinceEmail = !previous || (emailedAt && previous < emailedAt);

    await admin
      .from("projects")
      .update({
        first_viewed_at: project.first_viewed_at || now.toISOString(),
        last_viewed_at: now.toISOString(),
        view_count: (Number(project.view_count) || 0) + 1,
      })
      .eq("id", project.id);

    if (firstSinceEmail) {
      const customer = project.customers?.name || "";
      const site = [project.address, project.suburb].filter(Boolean).join(", ");
      await recordAlert(admin, {
        kind: "quote_viewed",
        title: `Quote Q${project.quote_number} opened`,
        body: [customer, site].filter(Boolean).join(" · ") || null,
        path: `/dashboard/quotes/${project.id}`,
        dedupeKey: `quote-viewed:${project.id}:${project.emailed_at || "x"}`,
      });
    }
  } catch {
    /* never block the customer's page */
  }
}
