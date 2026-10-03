-- Company-wide settings, starting with the quote terms & conditions text that
-- gets printed on every quote's print/PDF view. Single-row table (id is
-- always `true`) so there's exactly one settings record for the whole app.

create table if not exists company_settings (
  id boolean primary key default true,
  terms_and_conditions text,
  updated_at timestamptz not null default now(),
  constraint company_settings_singleton check (id)
);

alter table company_settings enable row level security;

-- Any signed-in staff member can read the settings (so the terms render on
-- the print view for whoever opens it).
drop policy if exists "company_settings: staff reads" on company_settings;
create policy "company_settings: staff reads" on company_settings
  for select using (is_staff());

-- Only admins can change them (editing happens via the admin-only Settings
-- page, through the service-role API route).
drop policy if exists "company_settings: admin updates" on company_settings;
create policy "company_settings: admin updates" on company_settings
  for update using (is_admin());

drop policy if exists "company_settings: admin inserts" on company_settings;
create policy "company_settings: admin inserts" on company_settings
  for insert with check (is_admin());

insert into company_settings (id, terms_and_conditions)
values (
  true,
  'Quote validity: This quotation is valid for 3 months from the date of issue shown above. Prices, availability and specifications may change after this period, and the quote may need to be reissued.

Deposit & payment terms: A deposit of 70% of the total quoted amount is payable prior to the commencement of work. The remaining 30% balance is due on completion, unless other terms have been agreed in writing.

Acceptance: Acceptance of this quote, whether in writing, verbally, or by proceeding with the work, constitutes agreement to these terms and conditions.

Variations: Any variation to the scope of work described in this quote may incur additional charges, which will be communicated and agreed before proceeding.

Site access: The customer is responsible for ensuring safe, clear access to the work site. Delays caused by restricted access may incur additional costs.

Materials: All materials supplied remain the property of Better Batt Insulation until paid for in full.

Warranty: Workmanship is carried out in accordance with the manufacturer''s specifications and the relevant Australian Standards. Product warranties are provided by the manufacturer.'
)
on conflict (id) do nothing;
