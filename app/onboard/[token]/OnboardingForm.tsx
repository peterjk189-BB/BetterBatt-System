"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { parseAgreement } from "@/lib/subAgreement";

type Uploaded = { kind: string; path: string; name: string };

const STEPS = ["Business", "Documents", "Insurance", "Banking", "Agreement"];

const input = "mt-1 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2.5 text-base";
const label = "block text-sm font-medium";

function Field({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={label}>{title}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-[var(--muted)]">{hint}</span>}
    </label>
  );
}

// Shrinks phone photos before upload (a 12MP photo is 4-8MB; 1800px JPEG is ~400KB).
async function shrink(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob: Blob | null = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.85));
    return blob || file;
  } catch {
    return file; // e.g. browser can't decode it - send as is
  }
}

function UploadSlot({
  token,
  kind,
  title,
  hint,
  required,
  multiple,
  files,
  onChange,
}: {
  token: string;
  kind: string;
  title: string;
  hint?: string;
  required?: boolean;
  multiple?: boolean;
  files: Uploaded[];
  onChange: (next: Uploaded[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const mine = files.filter((f) => f.kind === kind);

  async function pick(list: FileList | null) {
    if (!list || list.length === 0) return;
    setBusy(true);
    setErr("");
    try {
      const added: Uploaded[] = [];
      for (const file of Array.from(list)) {
        if (file.size > 25 * 1024 * 1024) throw new Error("That file is too large (max 25MB).");
        const body = await shrink(file);
        const isImg = body.type.startsWith("image/");
        const filename = isImg ? file.name.replace(/\.[^.]+$/, "") + ".jpg" : file.name;
        const res = await fetch("/api/onboarding/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, kind, filename }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || "Upload failed");
        const { error } = await createClient()
          .storage.from("attachments")
          .uploadToSignedUrl(j.path, j.token, body, { contentType: isImg ? "image/jpeg" : body.type || "application/pdf" });
        if (error) throw new Error(error.message);
        added.push({ kind, path: j.path, name: file.name });
      }
      // single-file slots replace the previous upload
      onChange(multiple ? [...files, ...added] : [...files.filter((f) => f.kind !== kind), ...added]);
    } catch (e: any) {
      setErr(e?.message || "Upload failed - please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">
            {title} {required && <span className="text-red-600">*</span>}
          </p>
          {hint && <p className="mt-0.5 text-xs text-[var(--muted)]">{hint}</p>}
        </div>
        {mine.length > 0 && !multiple && <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">Uploaded</span>}
      </div>
      {mine.length > 0 && (
        <ul className="mt-2 space-y-1">
          {mine.map((f) => (
            <li key={f.path} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate text-green-800">✓ {f.name}</span>
              <button type="button" onClick={() => onChange(files.filter((x) => x.path !== f.path))} className="shrink-0 text-xs text-red-700 underline">
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <label className="mt-3 block">
        <span className="flex w-full cursor-pointer items-center justify-center rounded-lg border border-dashed border-[var(--border)] bg-[#f7f6f3] px-3 py-3 text-sm font-medium text-accent">
          {busy ? "Uploading..." : mine.length && !multiple ? "Replace photo / file" : multiple && mine.length ? "Add another" : "Take photo or choose file"}
        </span>
        <input
          type="file"
          accept="image/*,application/pdf"
          multiple={multiple}
          disabled={busy}
          className="hidden"
          onChange={(e) => {
            pick(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
      {err && <p className="mt-2 text-sm text-red-700">{err}</p>}
    </div>
  );
}

function SignaturePad({ onChange }: { onChange: (png: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const c = ref.current!;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.clientWidth * ratio;
    c.height = c.clientHeight * ratio;
    const ctx = c.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111418";
  }, []);

  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  function down(e: React.PointerEvent) {
    e.preventDefault();
    ref.current!.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = pos(e);
  }
  function move(e: React.PointerEvent) {
    if (!drawing.current || !last.current) return;
    const p = pos(e);
    const ctx = ref.current!.getContext("2d")!;
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  }
  function up() {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    onChange(ref.current!.toDataURL("image/png"));
  }
  function clear() {
    const c = ref.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    onChange(null);
  }

  return (
    <div>
      <canvas
        ref={ref}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        style={{ touchAction: "none" }}
        className="h-40 w-full rounded-lg border border-[var(--border)] bg-white"
      />
      <div className="mt-1 flex items-center justify-between text-xs text-[var(--muted)]">
        <span>Sign with your finger in the box</span>
        <button type="button" onClick={clear} className="underline">
          Clear
        </button>
      </div>
    </div>
  );
}

export default function OnboardingForm({
  token,
  agreement,
  prefill,
}: {
  token: string;
  agreement: string;
  prefill: { name: string; email: string; phone: string };
}) {
  const [step, setStep] = useState(0);
  const [f, setF] = useState({
    contact_name: prefill.name,
    company_name: "",
    trading_name: "",
    abn: "",
    gst_registered: true,
    address: "",
    postcode: "",
    phone: prefill.phone,
    email: prefill.email,
    whitecard_number: "",
    insurance_insurer: "",
    insurance_policy: "",
    insurance_cover: "",
    insurance_expiry: "",
    bank_account_name: "",
    bank_bsb: "",
    bank_account_number: "",
  });
  const [files, setFiles] = useState<Uploaded[]>([]);
  const [signedName, setSignedName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const top = useRef<HTMLDivElement>(null);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const has = (k: string) => files.some((x) => x.kind === k);

  function validate(s: number): string {
    if (s === 0) {
      if (!f.contact_name.trim()) return "Please enter your full name.";
      if (!f.company_name.trim()) return "Please enter your company name.";
      if (f.abn.replace(/\s/g, "").length !== 11 || !/^\d+$/.test(f.abn.replace(/\s/g, ""))) return "Please enter your 11-digit ABN.";
      if (!f.address.trim()) return "Please enter your business address.";
      if (!f.phone.trim()) return "Please enter your mobile number.";
      if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) return "Please enter a valid email address.";
    }
    if (s === 1) {
      if (!has("licence_front")) return "Please upload the front of your driver's licence.";
      if (!has("whitecard")) return "Please upload a photo of your White Card.";
      if (!f.whitecard_number.trim()) return "Please enter your White Card number.";
    }
    if (s === 2) {
      if (!has("insurance")) return "Please upload your public liability certificate of currency.";
      if (!f.insurance_insurer.trim() || !f.insurance_policy.trim()) return "Please enter the insurer and policy number.";
      if (!f.insurance_expiry) return "Please enter the insurance expiry date.";
    }
    if (s === 3) {
      if (!f.bank_account_name.trim()) return "Please enter the account name.";
      if (f.bank_bsb.replace(/\D/g, "").length !== 6) return "BSB must be 6 digits.";
      if (f.bank_account_number.replace(/\D/g, "").length < 5) return "Please enter your account number.";
    }
    if (s === 4) {
      if (!signedName.trim()) return "Please type your full name to sign.";
      if (!agreed) return "Please tick the box to agree.";
      if (!signature) return "Please sign in the signature box.";
    }
    return "";
  }

  function go(n: number) {
    setStep(n);
    setError("");
    if (n !== 4) setSignature(null); // the signature pad is rebuilt when you come back
    setTimeout(() => top.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  function next() {
    const msg = validate(step);
    if (msg) return setError(msg);
    go(step + 1);
  }

  async function submit() {
    const msg = validate(4);
    if (msg) return setError(msg);
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/onboarding/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, data: f, files, signed_name: signedName, agreed, signature }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Something went wrong");
      setDone(true);
      window.scrollTo({ top: 0 });
    } catch (e: any) {
      setError(e?.message || "Something went wrong - please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-5 text-center">
        <img src="/logo.png" alt="Better Batt Insulation" className="mb-6 h-12" />
        <h1 className="text-xl font-bold">Thanks, you're all done</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          We've received your details and signed agreement, and emailed you a copy. We'll be in touch once they've been reviewed.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-4 pb-16 pt-5">
      <div ref={top} />
      <img src="/logo.png" alt="Better Batt Insulation" className="h-10" />
      <h1 className="mt-4 text-xl font-bold">Subcontractor onboarding</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">Takes about 10 minutes. Have your ABN, White Card, insurance certificate and bank details handy.</p>

      <div className="mt-4 flex gap-1.5">
        {STEPS.map((s, i) => (
          <div key={s} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-accent" : "bg-[#e3e0d8]"}`} />
        ))}
      </div>
      <p className="mt-2 text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
        Step {step + 1} of {STEPS.length} · {STEPS[step]}
      </p>

      <div className="mt-4 space-y-4">
        {step === 0 && (
          <>
            <Field title="Your full name *"><input className={input} value={f.contact_name} onChange={set("contact_name")} autoComplete="name" /></Field>
            <Field title="Company name *"><input className={input} value={f.company_name} onChange={set("company_name")} autoComplete="organization" /></Field>
            <Field title="Trading name" hint="If different to the company name"><input className={input} value={f.trading_name} onChange={set("trading_name")} /></Field>
            <Field title="ABN *"><input className={input} inputMode="numeric" value={f.abn} onChange={set("abn")} placeholder="11 digits" /></Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={f.gst_registered} onChange={(e) => setF({ ...f, gst_registered: e.target.checked })} className="h-5 w-5" />
              Registered for GST
            </label>
            <Field title="Business address *"><input className={input} value={f.address} onChange={set("address")} autoComplete="street-address" /></Field>
            <Field title="Postcode"><input className={input} inputMode="numeric" value={f.postcode} onChange={set("postcode")} autoComplete="postal-code" /></Field>
            <Field title="Mobile *"><input className={input} type="tel" value={f.phone} onChange={set("phone")} autoComplete="tel" /></Field>
            <Field title="Email *"><input className={input} type="email" value={f.email} onChange={set("email")} autoComplete="email" /></Field>
          </>
        )}

        {step === 1 && (
          <>
            <UploadSlot token={token} kind="licence_front" title="Driver's licence - front" required hint="Photo ID. Make sure all text is clear and readable." files={files} onChange={setFiles} />
            <UploadSlot token={token} kind="licence_back" title="Driver's licence - back" files={files} onChange={setFiles} />
            <UploadSlot token={token} kind="whitecard" title="White Card (construction induction)" required files={files} onChange={setFiles} />
            <Field title="White Card number *"><input className={input} value={f.whitecard_number} onChange={set("whitecard_number")} /></Field>
            <UploadSlot token={token} kind="ticket" title="Other tickets or licences" hint="E.g. working at heights, asbestos awareness, EWP. Optional." multiple files={files} onChange={setFiles} />
          </>
        )}

        {step === 2 && (
          <>
            <UploadSlot token={token} kind="insurance" title="Public liability certificate of currency" required hint="Photo or PDF from your insurer." files={files} onChange={setFiles} />
            <Field title="Insurer *"><input className={input} value={f.insurance_insurer} onChange={set("insurance_insurer")} /></Field>
            <Field title="Policy number *"><input className={input} value={f.insurance_policy} onChange={set("insurance_policy")} /></Field>
            <Field title="Cover amount ($)" hint="E.g. 20000000"><input className={input} inputMode="numeric" value={f.insurance_cover} onChange={set("insurance_cover")} /></Field>
            <Field title="Expiry date *"><input className={input} type="date" value={f.insurance_expiry} onChange={set("insurance_expiry")} /></Field>
          </>
        )}

        {step === 3 && (
          <>
            <p className="rounded-lg bg-[#f2f0ec] p-3 text-xs text-[var(--muted)]">Used only to pay your invoices. Stored securely and visible to Better Batt administrators only.</p>
            <Field title="Account name *"><input className={input} value={f.bank_account_name} onChange={set("bank_account_name")} /></Field>
            <Field title="BSB *"><input className={input} inputMode="numeric" value={f.bank_bsb} onChange={set("bank_bsb")} placeholder="123-456" /></Field>
            <Field title="Account number *"><input className={input} inputMode="numeric" value={f.bank_account_number} onChange={set("bank_account_number")} /></Field>
          </>
        )}

        {step === 4 && (
          <>
            <div className="max-h-[50vh] overflow-y-auto rounded-xl border border-[var(--border)] bg-white p-4 text-sm leading-relaxed">
              {parseAgreement(agreement).map((b, i) =>
                b.type === "heading" ? (
                  <h2 key={i} className="mt-3 text-sm font-bold first:mt-0">{b.text}</h2>
                ) : (
                  <p key={i} className="mt-1 whitespace-pre-line text-[#333]">{b.text}</p>
                )
              )}
            </div>
            <p className="text-xs text-[var(--muted)]">Scroll to read the whole agreement before signing.</p>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0" />
              I have read and agree to this working agreement.
            </label>
            <Field title="Type your full name *"><input className={input} value={signedName} onChange={(e) => setSignedName(e.target.value)} /></Field>
            <div>
              <span className={label}>Signature *</span>
              <div className="mt-1"><SignaturePad onChange={setSignature} /></div>
            </div>
          </>
        )}
      </div>

      {error && <p className="mt-4 rounded-lg bg-[#fde8e8] p-3 text-sm text-[#b91c1c]">{error}</p>}

      <div className="mt-6 flex gap-3">
        {step > 0 && (
          <button type="button" onClick={() => go(step - 1)} className="rounded-lg border border-[var(--border)] bg-white px-5 py-3 text-sm font-medium">
            Back
          </button>
        )}
        {step < STEPS.length - 1 ? (
          <button type="button" onClick={next} className="flex-1 rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-white">
            Next
          </button>
        ) : (
          <button type="button" onClick={submit} disabled={submitting} className="flex-1 rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">
            {submitting ? "Submitting..." : "Sign and submit"}
          </button>
        )}
      </div>
    </main>
  );
}
