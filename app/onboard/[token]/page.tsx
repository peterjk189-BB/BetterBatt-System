import { createAdminClient } from "@/lib/supabase/admin";
import { findInvite } from "@/lib/onboarding";
import { DEFAULT_SUBCONTRACTOR_AGREEMENT } from "@/lib/subAgreement";
import OnboardingForm from "./OnboardingForm";

export const dynamic = "force-dynamic";

export const metadata = { title: "Subcontractor onboarding - Better Batt Insulation", robots: { index: false, follow: false } };

export default async function OnboardPage({ params }: { params: { token: string } }) {
  const admin = createAdminClient();
  const { invite, state } = await findInvite(admin, params.token);

  if (state !== "ok") {
    const msg =
      state === "submitted"
        ? { h: "Thanks, you're all done", p: "We've received your details and signed agreement. We'll be in touch once they've been reviewed." }
        : state === "expired"
          ? { h: "This link has expired", p: "Please contact Better Batt Insulation and we'll send you a new one." }
          : { h: "This link isn't active", p: "Please contact Better Batt Insulation for a new onboarding link." };
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-5 text-center">
        <img src="/logo.png" alt="Better Batt Insulation" className="mb-6 h-12" />
        <h1 className="text-xl font-bold">{msg.h}</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">{msg.p}</p>
      </main>
    );
  }

  const { data: settings } = await admin.from("company_settings").select("subcontractor_agreement").eq("id", true).maybeSingle();
  const agreement = (settings?.subcontractor_agreement || "").trim() || DEFAULT_SUBCONTRACTOR_AGREEMENT;

  return (
    <OnboardingForm
      token={params.token}
      agreement={agreement}
      prefill={{ name: invite.invitee_name || "", email: invite.invitee_email || "", phone: invite.invitee_phone || "" }}
    />
  );
}
