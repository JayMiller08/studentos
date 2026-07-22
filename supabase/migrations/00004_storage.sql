-- ============================================================================
-- StudentOS — storage buckets & policies
-- Layout convention: every object path starts with the owner's user id:
--   avatars/{user_id}/avatar.png
--   attachments/{user_id}/{assignment_id}/{filename}
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 2097152, array['image/png', 'image/jpeg', 'image/webp']),
  ('attachments', 'attachments', false, 10485760, null)
on conflict (id) do nothing;

-- Avatars: public read, owner-scoped writes.
create policy "avatars_public_read" on storage.objects
  for select using (bucket_id = 'avatars');

create policy "avatars_owner_insert" on storage.objects
  for insert with check (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_owner_update" on storage.objects
  for update using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_owner_delete" on storage.objects
  for delete using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Attachments: fully owner-scoped (read + write).
create policy "attachments_owner_select" on storage.objects
  for select using (
    bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "attachments_owner_insert" on storage.objects
  for insert with check (
    bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "attachments_owner_delete" on storage.objects
  for delete using (
    bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text
  );
