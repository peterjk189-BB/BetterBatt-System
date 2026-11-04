/** Tap/click to ring a number (opens the phone app on a phone/iPad, FaceTime or your softphone on a computer). */
export function telHref(phone: string) {
  const p = phone.trim().replace(/[^\d+]/g, "");
  return p ? `tel:${p}` : "";
}

/** Small "Call" link to sit beside a phone-number box. Shows nothing until a number is typed. */
export default function CallLink({ phone, className = "" }: { phone: string | null | undefined; className?: string }) {
  const href = phone ? telHref(phone) : "";
  if (!href) return null;
  return (
    <a href={href} onClick={(e) => e.stopPropagation()} className={`whitespace-nowrap text-xs font-semibold text-accent hover:underline ${className}`}>
      📞 Call
    </a>
  );
}

/** The number itself as a link, for read-only displays. */
export function PhoneLink({ phone, className = "" }: { phone: string | null | undefined; className?: string }) {
  const href = phone ? telHref(phone) : "";
  if (!href) return <>{phone ?? ""}</>;
  return (
    <a href={href} onClick={(e) => e.stopPropagation()} className={`text-accent hover:underline ${className}`}>
      {phone}
    </a>
  );
}
