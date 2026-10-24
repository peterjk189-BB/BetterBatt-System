// Shown instantly while a dashboard page loads its data, so a click on a tab responds straight away.
export default function Loading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="h-7 w-48 rounded bg-[var(--border)]" />
      <div className="mt-3 h-4 w-80 max-w-full rounded bg-[var(--border)] opacity-70" />
      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <div className="h-20 rounded-xl bg-[var(--border)] opacity-60" />
        <div className="h-20 rounded-xl bg-[var(--border)] opacity-60" />
        <div className="h-20 rounded-xl bg-[var(--border)] opacity-60" />
      </div>
      <div className="mt-6 h-64 rounded-xl bg-[var(--border)] opacity-40" />
    </div>
  );
}
