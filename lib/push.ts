import webpush from "web-push";

export type PushPayload = { title: string; body: string; url?: string; tag?: string };

/** True when the VAPID keys are configured (Vercel env vars). */
export function pushConfigured() {
  return !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

/**
 * Sends a push notification to every device the person has switched notifications on for.
 * Returns how many devices it reached. Devices that have unsubscribed (HTTP 404/410) are removed.
 * `admin` is the service-role Supabase client.
 */
export async function sendPushToUser(admin: any, userId: string, payload: PushPayload): Promise<number> {
  if (!pushConfigured()) return 0;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:peterjk189@gmail.com",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string,
    process.env.VAPID_PRIVATE_KEY as string
  );

  const { data: subs } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", userId);
  if (!subs || subs.length === 0) return 0;

  let delivered = 0;
  await Promise.all(
    (subs as { id: string; endpoint: string; p256dh: string; auth: string }[]).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), {
          TTL: 60 * 60 * 24,
          urgency: "high",
        });
        delivered += 1;
      } catch (err: any) {
        if (err && (err.statusCode === 404 || err.statusCode === 410)) {
          await admin.from("push_subscriptions").delete().eq("id", s.id);
        }
      }
    })
  );
  return delivered;
}
