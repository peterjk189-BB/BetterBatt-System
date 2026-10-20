import { brandedEmailHtml, sendEmail } from "@/lib/email";
import { pushConfigured, sendPushToUser } from "@/lib/push";

/**
 * Emails + app-notifies every admin and office user. Best-effort: never throws.
 * Used for office alerts (quote accepted, SWMS started/completed, ...).
 */
export async function notifyStaff(
  admin: any,
  m: {
    subject: string;
    heading: string;
    previewText?: string;
    bodyHtml: string;
    buttonText: string;
    url: string; // absolute link for the email button
    path: string; // in-app path for the push notification
    pushTitle: string;
    pushBody: string;
    tag: string;
  }
) {
  try {
    const { data: staff } = await admin.from("profiles").select("id").in("role", ["admin", "office"]);
    const emails = new Set<string>();
    if (process.env.OWNER_NOTIFY_EMAIL) emails.add(process.env.OWNER_NOTIFY_EMAIL.toLowerCase());
    for (const p of (staff ?? []) as { id: string }[]) {
      const { data: u } = await admin.auth.admin.getUserById(p.id);
      if (u?.user?.email) emails.add(u.user.email.toLowerCase());
    }
    await Promise.all(
      Array.from(emails).map((to) =>
        sendEmail({
          to,
          subject: m.subject,
          html: brandedEmailHtml({
            previewText: m.previewText,
            heading: m.heading,
            bodyHtml: m.bodyHtml,
            buttonText: m.buttonText,
            buttonUrl: m.url,
          }),
        })
      )
    );
    if (pushConfigured()) {
      await Promise.all(
        ((staff ?? []) as { id: string }[]).map((p) =>
          sendPushToUser(admin, p.id, { title: m.pushTitle, body: m.pushBody, url: m.path, tag: m.tag })
        )
      );
    }
  } catch {
    /* best-effort */
  }
}
