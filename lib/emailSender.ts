// "Who is sending": the logged-in office user, read from their login (no setup needed).
// Emails still go out from the shared quotes@/accounts@/jobs@ address, but show the person's name,
// replies go to the person, and they get a blind copy.
export type EmailSender = { name: string; email: string };

export async function getEmailSender(supabase: any, user: { id: string; email?: string | null } | null | undefined): Promise<EmailSender | null> {
  const email = (user?.email || "").trim();
  if (!user || !/^\S+@\S+\.\S+$/.test(email)) return null;
  let name = "";
  try {
    const { data } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();
    name = String(data?.full_name || "").trim();
  } catch {
    /* fall back to the email name below */
  }
  if (!name) {
    name = email
      .split("@")[0]
      .split(/[._-]+/)
      .filter(Boolean)
      .map((w) => w[0].toUpperCase() + w.slice(1))
      .join(" ");
  }
  return { name: name.replace(/[<>",;]/g, "").trim() || "Better Batt Insulation", email };
}
