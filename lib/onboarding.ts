import type { SupabaseClient } from "@supabase/supabase-js";

export type InviteFile = { kind: string; path: string; name: string };

export const FILE_KINDS = ["licence_front", "licence_back", "whitecard", "insurance", "ticket"] as const;
export type FileKind = (typeof FILE_KINDS)[number];

export const FILE_KIND_LABEL: Record<string, string> = {
  licence_front: "Driver's licence (front)",
  licence_back: "Driver's licence (back)",
  whitecard: "White Card",
  insurance: "Public liability certificate",
  ticket: "Other ticket",
};

// attachments.category each kind is filed under when an invite is approved
export const FILE_KIND_CATEGORY: Record<string, string> = {
  licence_front: "Driver's Licence",
  licence_back: "Driver's Licence",
  whitecard: "White Card",
  insurance: "Insurance Certificate",
  ticket: "Other Ticket",
};

export type OnboardingData = {
  contact_name: string;
  company_name: string;
  trading_name: string;
  abn: string;
  gst_registered: boolean;
  address: string;
  postcode: string;
  phone: string;
  email: string;
  whitecard_number: string;
  insurance_insurer: string;
  insurance_policy: string;
  insurance_cover: string;
  insurance_expiry: string;
  bank_account_name: string;
  bank_bsb: string;
  bank_account_number: string;
};

export type InviteState = "ok" | "missing" | "expired" | "cancelled" | "submitted";

/** Looks an invite up by its secret token (service-role client). */
export async function findInvite(admin: SupabaseClient, token: unknown) {
  if (typeof token !== "string" || !/^[0-9a-f-]{36}$/i.test(token)) {
    return { invite: null as any, state: "missing" as InviteState };
  }
  const { data: invite } = await admin.from("subcontractor_invites").select("*").eq("token", token).maybeSingle();
  if (!invite) return { invite: null as any, state: "missing" as InviteState };
  let state: InviteState = "ok";
  if (invite.status === "Cancelled" || invite.status === "Declined") state = "cancelled";
  else if (invite.status !== "Sent") state = "submitted";
  else if (new Date(invite.expires_at).getTime() < Date.now()) state = "expired";
  return { invite, state };
}

export function cleanAbn(s: string) {
  return s.replace(/\s+/g, "");
}
