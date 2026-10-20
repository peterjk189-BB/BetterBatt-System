import { brandedEmailHtml, sendEmail, siteUrl } from "@/lib/email";
import { pushConfigured, sendPushToUser } from "@/lib/push";

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Tells every admin and office user (email + app notification) that a quote was accepted.
 * Best-effort: never throws, so it can't block the acceptance itself.
 */
export async function notifyQuoteAccepted(
  admin: any,
  q: { projectId: string; quoteNumber: number; by: string; options?: string[] }
) {
  try {
    const { data: staff } = await admin.from("profiles").select("id, role, full_name").in("role", ["admin", "office"]);
    const emails = new Set<string>();
    const ownerFallback = process.env.OWNER_NOTIFY_EMAIL;
    if (ownerFallback) emails.add(ownerFallback.toLowerCase());
    for (const p of (staff ?? []) as { id: string }[]) {
      const { data: u } = await admin.auth.admin.getUserById(p.id);
      const e = u?.user?.email;
      if (e) emails.add(e.toLowerCase());
    }

    const [{ data: proj }] = await Promise.all([
      admin.from("projects").select("address, suburb, customers(name)").eq("id", q.projectId).single(),
    ]);
    const customer = (proj as any)?.customers?.name || "";
    const site = [(proj as any)?.address, (proj as any)?.suburb].filter(Boolean).join(", ");
    const opts = q.options?.length ? ` with option${q.options.length > 1 ? "s" : ""} ${q.options.join(", ")}` : "";
    const link = `${siteUrl()}/dashboard/quotes/${q.projectId}`;
    const summary = [customer, site].filter(Boolean).join(" · ");

    await Promise.all(
      Array.from(emails).map((to) =>
        sendEmail({
          to,
          subject: `Quote Q${q.quoteNumber} accepted${customer ? " — " + customer : ""}`,
          html: brandedEmailHtml({
            previewText: `${q.by} accepted Q${q.quoteNumber}`,
            heading: `Q${q.quoteNumber} accepted`,
            bodyHtml: `<p style="margin:0 0 8px;">${esc(q.by)} accepted this quote${esc(opts)}.</p>${summary ? `<p style="margin:0;">${esc(summary)}</p>` : ""}`,
            buttonText: "Open quote",
            buttonUrl: link,
          }),
        })
      )
    );

    if (pushConfigured()) {
      await Promise.all(
        ((staff ?? []) as { id: string }[]).map((p) =>
          sendPushToUser(admin, p.id, {
            title: `Quote Q${q.quoteNumber} accepted`,
            body: `${summary || q.by}${opts}`,
            url: `/dashboard/quotes/${q.projectId}`,
            tag: `quote-accepted-${q.projectId}`,
          })
        )
      );
    }
  } catch {
    /* best-effort */
  }
}
