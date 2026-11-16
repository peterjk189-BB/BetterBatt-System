"use client";

import Link from "next/link";
import SubcontractorPanel, { type Attachment, type Subcontractor } from "../SubcontractorPanel";
import MergeBox from "../MergeBox";

export default function SubcontractorDetail({
  subcontractor,
  attachments,
  isAdmin,
  others = [],
}: {
  subcontractor: Subcontractor;
  attachments: Attachment[];
  isAdmin: boolean;
  others?: { id: string; name: string }[];
}) {
  return (
    <div className="max-w-3xl">
      <Link href="/dashboard/subcontractors" className="text-sm text-[var(--muted)] hover:underline">
        &larr; Back to subcontractors
      </Link>
      <div className="mt-2">
        {isAdmin && <MergeBox keepId={subcontractor.id} keepName={subcontractor.name} others={others} />}
        <SubcontractorPanel subcontractor={subcontractor} attachments={attachments} isAdmin={isAdmin} />
      </div>
    </div>
  );
}
