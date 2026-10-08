-- Subcontractor onboarding: a private link a new subcontractor fills in on
-- their phone (business details, ID, White Card, insurance, banking, signed
-- working agreement). Admin reviews it, then approves to create the
-- subcontractor record. Run once in Supabase -> SQL Editor. Safe to re-run.

create table if not exists subcontractor_invites (
  id uuid primary key default gen_random_uuid(),
  token uuid not null unique default gen_random_uuid(),
  invitee_name text,
  invitee_email text,
  invitee_phone text,
  status text not null default 'Sent'
    check (status in ('Sent', 'Submitted', 'Approved', 'Declined', 'Cancelled')),
  expires_at timestamptz not null default (now() + interval '14 days'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  -- what the subcontractor typed in (business, insurance, banking ...)
  data jsonb,
  -- uploaded documents: [{kind, path, name}]
  files jsonb,
  -- the agreement exactly as they saw and signed it
  agreement_text text,
  signed_name text,
  signed_at timestamptz,
  signed_ip text,
  signature_path text,
  agreement_pdf_path text,
  subcontractor_id uuid references subcontractors(id) on delete set null
);

create index if not exists idx_sub_invites_status on subcontractor_invites (status);

alter table subcontractor_invites enable row level security;
-- Admin only: this table holds ID photos and banking details.
-- The public form never touches it directly; it goes through server routes
-- that look the invite up by its unguessable token.
drop policy if exists "subcontractor_invites: admin full access" on subcontractor_invites;
create policy "subcontractor_invites: admin full access" on subcontractor_invites
  for all using (is_admin()) with check (is_admin());

-- Extra subcontractor details collected by the form.
alter table subcontractors
  add column if not exists trading_name text,
  add column if not exists bank_account_name text,
  add column if not exists bank_bsb text,
  add column if not exists bank_account_number text,
  add column if not exists whitecard_number text,
  add column if not exists agreement_signed_at timestamptz;

-- Editable working agreement text (falls back to the built-in standard text when empty).
alter table company_settings
  add column if not exists subcontractor_agreement text;

alter table attachments drop constraint if exists attachments_category_check;
alter table attachments add constraint attachments_category_check check (
  category in ('Photo', 'SWMS', 'Other document', 'White Card', 'Photo ID', 'Driver''s Licence', 'Profile Photo', 'Site plan', 'Insurance Certificate', 'Other Ticket', 'Signed Agreement')
);

notify pgrst, 'reload schema';
