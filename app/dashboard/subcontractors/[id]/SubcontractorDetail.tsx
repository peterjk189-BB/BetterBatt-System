"use client";

import Link from "next/link";
import SubcontractorPanel, { type Attachment, type Subcontractor } from "../SubcontractorPanel";

export default function SubcontractorDetail({
  subcontractor,
  attachments,
}: {
  subcontractor: Subcontractor;
  attachments: Attachment[];
}) {
  return (
    <div className="max-w-3xl">
      <Link href="/dashboard/subcontractors" className="text-sm text-[var(--muted)] hover:underline">
        &larr; Back to subcontractors
      </Link>
      <div className="mt-2">
        <SubcontractorPanel subcontractor={subcontractor} attachments={attachments} />
      </div>
    </div>
  );
}
