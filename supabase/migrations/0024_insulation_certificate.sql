-- Insulation certificate: issued from an inspection that has PASSed.
--
-- * inspections.certificate: the certificate as last saved — product rows
--   (area, product, R-value) and the issue date — when the office has
--   edited it. Until then the certificate is built fresh from the work
--   order's materials each time it's opened.
-- * company_settings.abn / company_phone: printed in the certificate
--   header; edited on the Settings page.
--
-- Run once in Supabase -> SQL Editor. Safe to re-run.

alter table inspections add column if not exists certificate jsonb;

alter table company_settings add column if not exists abn text;
alter table company_settings add column if not exists company_phone text;

notify pgrst, 'reload schema';
