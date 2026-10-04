import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail as sendBrandedEmail, brandedEmailHtml } from "@/lib/email";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return null;
  return user;
}

export async function POST(req: Request) {
  const caller = await requireAdmin();
  if (!caller) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body = await req.json();
  const email = (body.email || "").trim();
  const fullName = (body.full_name || "").trim();
  const role = ["admin", "office", "installer"].includes(body.role) ? body.role : "installer";
  const subcontractorId = body.subcontractor_id || null;
  // Default behaviour (unset or true) sends the usual Supabase invite email.
  // Pass send_email: false to create the account immediately instead, with
  // an admin-set temporary password and no email sent — e.g. for test
  // accounts, or to set up an installer's login before they start.
  const sendEmail = body.send_email !== false;
  const password = typeof body.password === "string" ? body.password : "";

  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }
  if (!sendEmail && password.length < 6) {
    return NextResponse.json({ error: "Temporary password must be at least 6 characters" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Without an explicit redirectTo, Supabase sends the invite link to the
  // project's "Site URL" in Auth settings — which defaults to localhost and
  // leaves the invited person stuck on "can't reach this page". Point it at
  // this deployment's set-password page instead.
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`) ||
    (process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`) ||
    "http://localhost:3000";

  let newUserId: string;
  let newUserEmail: string;
  let emailWarning: string | undefined;

  if (sendEmail) {
    // When Resend is set up, send our own branded invite email rather than
    // Supabase's plain default one — generateLink creates the account (same
    // as inviteUserByEmail) but hands us the action link to send ourselves
    // instead of Supabase emailing it.
    if (process.env.RESEND_API_KEY) {
      const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
        type: "invite",
        email,
        options: { data: { full_name: fullName }, redirectTo: `${siteUrl}/set-password` },
      });
      if (linkError || !linkData?.user) {
        return NextResponse.json({ error: linkError?.message || "Failed to invite user" }, { status: 400 });
      }
      newUserId = linkData.user.id;
      newUserEmail = linkData.user.email || email;

      const actionLink = linkData.properties?.action_link;
      const sent = actionLink
        ? await sendBrandedEmail({
            to: newUserEmail,
            subject: "You're invited to Better Batt System",
            html: brandedEmailHtml({
              previewText: "Set your password to get started on Better Batt System.",
              heading: `Welcome${fullName ? ", " + fullName : ""}`,
              bodyHtml: `<p>You've been added as a user on the Better Batt System. Click below to set your password and sign in.</p>`,
              buttonText: "Set your password",
              buttonUrl: actionLink,
            }),
          })
        : { ok: false as const, error: "No invite link was returned" };

      if (!sent.ok) {
        // Account's created either way — just the email didn't go out. Say
        // so rather than pretending it worked; the admin can retry with
        // the "Send invite" button on the Users list.
        emailWarning = `Account created, but the invite email failed to send (${sent.error}). Use "Send invite" on the Users list to try again.`;
      }
    } else {
      const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
        data: { full_name: fullName },
        redirectTo: `${siteUrl}/set-password`,
      });
      if (inviteError || !invited?.user) {
        return NextResponse.json({ error: inviteError?.message || "Failed to invite user" }, { status: 400 });
      }
      newUserId = invited.user.id;
      newUserEmail = invited.user.email || email;
    }
  } else {
    // Creates the account outright with the password the admin set here —
    // email_confirm: true means it's ready to log in immediately, and
    // Supabase sends nothing.
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (createError || !created?.user) {
      return NextResponse.json({ error: createError?.message || "Failed to create user" }, { status: 400 });
    }
    newUserId = created.user.id;
    newUserEmail = created.user.email || email;
  }

  // The handle_new_user trigger creates a default profile row (role: installer,
  // no subcontractor link) — upsert here to apply the role/link chosen in the form.
  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: newUserId,
      full_name: fullName || null,
      role,
      subcontractor_id: subcontractorId,
    },
    { onConflict: "id" }
  );

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, id: newUserId, email: newUserEmail, emailed: sendEmail, warning: emailWarning });
}
