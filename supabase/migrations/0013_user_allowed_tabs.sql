-- Lets an admin pick exactly which dashboard tabs an individual user can see,
-- instead of (or on top of) their admin/office/installer role.
--
-- null = "use the default tab set for this user's role" (unchanged behaviour).
-- An actual array (even an empty one, meaning "no tabs") overrides the role
-- default. This is a UI/navigation-level control only — it does not change
-- what the database itself allows: admin/office still have full data access
-- via is_staff()/is_admin(), and installers (subcontractors) are still
-- restricted by RLS to only their own work orders no matter what's ticked
-- here. That split is intentional: it's what lets a subcontractor safely be
-- given just the "Work Orders" tab and still only ever see their own jobs.
alter table profiles
  add column if not exists allowed_tabs text[];
