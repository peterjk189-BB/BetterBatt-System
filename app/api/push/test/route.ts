import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushConfigured, sendPushToUser } from "@/lib/push";

// Sends a test notification to the signed-in person's own devices (used right after they switch notifications on).
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!pushConfigured()) return NextResponse.json({ ok: false, error: "Push keys are not set on the server" });
  const sent = await sendPushToUser(createAdminClient(), user.id, {
    title: "Notifications are on",
    body: "You'll get an alert here when a site visit is booked for you.",
    url: "/dashboard/site-visits",
    tag: "push-test",
  });
  return NextResponse.json({ ok: true, sent });
}
