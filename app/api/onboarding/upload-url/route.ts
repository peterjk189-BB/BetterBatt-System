import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findInvite, FILE_KINDS } from "@/lib/onboarding";

export const runtime = "nodejs";

// Public: hands the onboarding form a one-off signed URL so a phone photo can go
// straight to private storage (bypassing the serverless body-size limit).
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const admin = createAdminClient();
  const { invite, state } = await findInvite(admin, body.token);
  if (state !== "ok") return NextResponse.json({ error: "This link is no longer active" }, { status: 400 });

  const kind = String(body.kind || "");
  if (!(FILE_KINDS as readonly string[]).includes(kind)) {
    return NextResponse.json({ error: "Unknown file type" }, { status: 400 });
  }
  const ext = String(body.filename || "").split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  if (!["jpg", "jpeg", "png", "webp", "heic", "heif", "pdf"].includes(ext)) {
    return NextResponse.json({ error: "Please upload a photo or PDF" }, { status: 400 });
  }
  const path = `onboarding/${invite.id}/${kind}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const { data, error } = await admin.storage.from("attachments").createSignedUploadUrl(path);
  if (error || !data) return NextResponse.json({ error: error?.message || "Could not start upload" }, { status: 400 });
  return NextResponse.json({ path, token: data.token });
}
