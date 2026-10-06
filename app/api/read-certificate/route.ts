import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Reads a certificate of currency (PDF or photo) with Claude and returns the
// insurer, policy number, cover amount and expiry date for the user to confirm.
// Needs ANTHROPIC_API_KEY set in Vercel; without it the page falls back to
// typing the expiry date in by hand.
export const maxDuration = 60;

const PROMPT = `This is a Certificate of Currency for public liability insurance.
Return ONLY a JSON object, no other text, with these keys:
"insurer" (insurance company name or null),
"policy_number" (string or null),
"insured_name" (the insured business/person or null),
"cover_amount" (public/products liability limit as a number in dollars, e.g. 20000000, or null),
"expiry_date" (the policy period END / expiry date as YYYY-MM-DD. Dates are Australian day/month/year. null if you cannot find it).`;

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json({ error: "not_configured" }, { status: 501 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (file.size > 4_000_000) return NextResponse.json({ error: "too_large" }, { status: 413 });

  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  const mediaType = isPdf ? "application/pdf" : file.type || "image/jpeg";
  if (!isPdf && !/^image\/(jpeg|png|gif|webp)$/.test(mediaType)) {
    return NextResponse.json({ error: "unsupported" }, { status: 415 });
  }
  const data = Buffer.from(await file.arrayBuffer()).toString("base64");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
      max_tokens: 400,
      messages: [
        {
          role: "user",
          content: [
            isPdf
              ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
              : { type: "image", source: { type: "base64", media_type: mediaType, data } },
            { type: "text", text: PROMPT },
          ],
        },
      ],
    }),
  });
  if (!res.ok) return NextResponse.json({ error: "read_failed" }, { status: 502 });
  const json: any = await res.json();
  const text: string = json?.content?.find((c: any) => c.type === "text")?.text || "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return NextResponse.json({ error: "read_failed" }, { status: 502 });
  try {
    const o = JSON.parse(match[0]);
    const expiry = typeof o.expiry_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.expiry_date) ? o.expiry_date : null;
    return NextResponse.json({
      insurer: o.insurer || null,
      policy_number: o.policy_number || null,
      insured_name: o.insured_name || null,
      cover_amount: typeof o.cover_amount === "number" ? o.cover_amount : null,
      expiry_date: expiry,
    });
  } catch {
    return NextResponse.json({ error: "read_failed" }, { status: 502 });
  }
}
