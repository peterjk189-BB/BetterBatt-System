import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, siteUrl, brandedEmailHtml } from "@/lib/email";
import { findInvite, cleanAbn, type InviteFile } from "@/lib/onboarding";
import { DEFAULT_SUBCONTRACTOR_AGREEMENT } from "@/lib/subAgreement";
import { buildAgreementPdf } from "@/lib/agreementPdf";

export const runtime = "nodejs";
export const maxDuration = 30;

const str = (v: unknown, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const admin = createAdminClient();
  const { invite, state } = await findInvite(admin, body.token);
  if (state === "submitted") return NextResponse.json({ ok: true, already: true });
  if (state !== "ok") return NextResponse.json({ error: "This link is no longer active" }, { status: 400 });

  const d = body.data || {};
  const data = {
    contact_name: str(d.contact_name),
    company_name: str(d.company_name),
    trading_name: str(d.trading_name),
    abn: cleanAbn(str(d.abn, 20)),
    gst_registered: !!d.gst_registered,
    address: str(d.address, 400),
    postcode: str(d.postcode, 10),
    phone: str(d.phone, 30),
    email: str(d.email, 200),
    whitecard_number: str(d.whitecard_number, 40),
    insurance_insurer: str(d.insurance_insurer),
    insurance_policy: str(d.insurance_policy, 60),
    insurance_cover: str(d.insurance_cover, 20),
    insurance_expiry: str(d.insurance_expiry, 10),
    bank_account_name: str(d.bank_account_name),
    bank_bsb: str(d.bank_bsb, 10).replace(/[^0-9-]/g, ""),
    bank_account_number: str(d.bank_account_number, 20).replace(/[^0-9]/g, ""),
  };

  const missing: string[] = [];
  if (!data.contact_name) missing.push("your name");
  if (!data.company_name) missing.push("company name");
  if (!/^\d{11}$/.test(data.abn)) missing.push("a valid 11-digit ABN");
  if (!data.address) missing.push("address");
  if (!data.phone) missing.push("mobile number");
  if (!data.email) missing.push("email");
  if (!data.whitecard_number) missing.push("White Card number");
  if (!data.insurance_insurer || !data.insurance_policy || !/^\d{4}-\d{2}-\d{2}$/.test(data.insurance_expiry)) {
    missing.push("insurance details");
  }
  if (!data.bank_account_name || data.bank_bsb.replace(/-/g, "").length !== 6 || data.bank_account_number.length < 5) {
    missing.push("valid banking details");
  }
  const signedName = str(body.signed_name);
  if (!signedName) missing.push("your typed name to sign");
  if (!body.agreed) missing.push("agreement tick box");
  const sig = typeof body.signature === "string" && body.signature.startsWith("data:image/png;base64,") ? body.signature : null;
  if (!sig || sig.length > 400_000) missing.push("your signature");

  // Uploaded files: only accept paths that belong to this invite.
  const files: InviteFile[] = (Array.isArray(body.files) ? body.files : [])
    .filter((f: any) => f && typeof f.path === "string" && f.path.startsWith(`onboarding/${invite.id}/`) && !f.path.includes(".."))
    .slice(0, 12)
    .map((f: any) => ({ kind: str(f.kind, 30), path: f.path, name: str(f.name, 120) || "file" }));
  const has = (k: string) => files.some((f) => f.kind === k);
  if (!has("licence_front")) missing.push("driver's licence photo");
  if (!has("whitecard")) missing.push("White Card photo");
  if (!has("insurance")) missing.push("insurance certificate");

  if (missing.length) {
    return NextResponse.json({ error: `Please complete: ${missing.join(", ")}.` }, { status: 400 });
  }

  const forwardedFor = req.headers.get("x-forwarded-for");
  const ip = forwardedFor ? forwardedFor.split(",")[0].trim() : null;
  const signedAt = new Date();

  const { data: settings } = await admin.from("company_settings").select("subcontractor_agreement").eq("id", true).maybeSingle();
  const agreementText = (settings?.subcontractor_agreement || "").trim() || DEFAULT_SUBCONTRACTOR_AGREEMENT;

  // Store the signature image and the signed PDF.
  const sigBuf = Buffer.from(sig!.split(",")[1], "base64");
  const signaturePath = `onboarding/${invite.id}/signature.png`;
  await admin.storage.from("attachments").upload(signaturePath, sigBuf, { contentType: "image/png", upsert: true });

  let pdfBytes: Uint8Array | null = null;
  let pdfPath: string | null = null;
  try {
    pdfBytes = await buildAgreementPdf({
      agreementText,
      companyName: data.company_name,
      tradingName: data.trading_name || null,
      abn: data.abn,
      signedName,
      signedAt,
      signedIp: ip,
      signaturePng: sig,
    });
    pdfPath = `onboarding/${invite.id}/signed-agreement.pdf`;
    await admin.storage.from("attachments").upload(pdfPath, pdfBytes, { contentType: "application/pdf", upsert: true });
  } catch (e) {
    console.error("agreement pdf failed", e);
    pdfBytes = null;
    pdfPath = null;
  }

  const { error } = await admin
    .from("subcontractor_invites")
    .update({
      status: "Submitted",
      submitted_at: signedAt.toISOString(),
      data,
      files,
      agreement_text: agreementText,
      signed_name: signedName,
      signed_at: signedAt.toISOString(),
      signed_ip: ip,
      signature_path: signaturePath,
      agreement_pdf_path: pdfPath,
    })
    .eq("id", invite.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Best-effort emails - the submission is already saved.
  const attachments = pdfBytes
    ? [{ filename: "Better Batt - signed subcontractor agreement.pdf", content: Buffer.from(pdfBytes).toString("base64") }]
    : undefined;
  const notifyEmail = process.env.OWNER_NOTIFY_EMAIL || "peterjk189@gmail.com";
  await sendEmail({
    to: notifyEmail,
    subject: `New subcontractor application: ${data.company_name}`,
    html: brandedEmailHtml({
      heading: "New subcontractor application",
      bodyHtml: `<p>${esc(data.contact_name)} (${esc(data.company_name)}) has filled in the onboarding form and signed the working agreement. Review the documents and approve to add them as a subcontractor.</p>`,
      buttonText: "Review application",
      buttonUrl: `${siteUrl()}/dashboard/subcontractors`,
    }),
    attachments,
  });
  await sendEmail({
    to: data.email,
    subject: "Better Batt Insulation - your signed working agreement",
    html: brandedEmailHtml({
      heading: "Thanks, we've got your details",
      bodyHtml: `<p>Hi ${esc(data.contact_name.split(" ")[0])},</p><p>Thanks for completing your onboarding. A copy of the working agreement you signed is attached for your records. We'll review your documents and be in touch.</p>`,
    }),
    attachments,
  });

  return NextResponse.json({ ok: true });
}
