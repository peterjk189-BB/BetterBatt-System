import Link from "next/link";

// The invoice PDF inside the app, with a way back (a bare PDF tab has no back button in the installed app).
export default function InvoicePdfPage({ params }: { params: { id: string } }) {
  return (
    <div className="flex h-[calc(100vh-6rem)] min-h-[32rem] flex-col">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Link href={`/dashboard/invoices/${params.id}`} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:border-accent">
          &larr; Back to invoice
        </Link>
        <a href={`/api/invoices/pdf?id=${params.id}`} target="_blank" rel="noreferrer" className="text-sm text-[var(--muted)] hover:underline">
          Open the PDF on its own
        </a>
      </div>
      <iframe src={`/api/invoices/pdf?id=${params.id}`} title="Invoice PDF" className="w-full flex-1 rounded-xl border border-[var(--border)] bg-white" />
    </div>
  );
}
