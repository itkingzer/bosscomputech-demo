-- Provision the private evidence-photos bucket through the Storage API before applying these policies.
drop policy if exists "Staff can read evidence photos" on storage.objects;
drop policy if exists "Staff can upload evidence photos" on storage.objects;
drop policy if exists "Staff can delete their evidence photos" on storage.objects;

create policy "Staff can read evidence photos"
on storage.objects for select to authenticated
using (
  bucket_id = 'evidence-photos'
  and (select boss_private.staff_can(array['sales','accounting','finance','prep','frontdesk','onsite','repair','hr']))
);

create policy "Staff can upload evidence photos"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'evidence-photos'
  and (storage.foldername(name))[1] in ('doa','onsite','repair')
  and (select boss_private.staff_can(array['accounting','frontdesk','onsite','repair']))
);

create policy "Staff can delete their evidence photos"
on storage.objects for delete to authenticated
using (
  bucket_id = 'evidence-photos'
  and owner_id = (select auth.uid())::text
  and (select boss_private.staff_can(array['accounting','frontdesk','onsite','repair']))
);
