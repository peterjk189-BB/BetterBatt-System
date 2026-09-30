alter table attachments
  drop constraint if exists attachments_category_check;

alter table attachments
  add constraint attachments_category_check check (
    category in (
      'Photo', 'SWMS', 'Other document',
      'White Card', 'Photo ID', 'Driver''s Licence', 'Profile Photo'
    )
  );
