-- ============================================================================
-- StudentOS — images pasted into notes
--
-- A bucket of their own rather than `attachments`, so that storage itself
-- refuses anything that isn't a PNG, JPEG, WebP or GIF, or is over 5 MB —
-- whatever a client sends. SVG (which can carry script) and HTML never get in.
--
-- Private, like the notes they belong to. The editor shows an image through a
-- short-lived signed URL; the note's Markdown keeps a stable reference
-- (`note-image:<file>`), never a URL that expires.
--
-- Layout, the same convention as 00004:
--   note-images/{user_id}/{uuid}.{ext}
--
-- Files are never changed in place — every paste is a new file — so there is
-- no update policy. Taking an image out of a note leaves its file alone,
-- because restoring an older version of the note brings the image back.
--
-- Idempotent. It was not at first: the policies were bare `create policy`
-- statements, so on a project where this file had been run by hand in the SQL
-- Editor — objects present, but no row in the migration history — `db push`
-- ran it again and stopped at the first policy ("already exists"), blocking
-- every migration after it. Each policy is now dropped if present and
-- recreated, which converges on exactly these definitions either way.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('note-images', 'note-images', false, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

drop policy if exists "note_images_owner_select" on storage.objects;
create policy "note_images_owner_select" on storage.objects
  for select using (
    bucket_id = 'note-images' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "note_images_owner_insert" on storage.objects;
create policy "note_images_owner_insert" on storage.objects
  for insert with check (
    bucket_id = 'note-images' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "note_images_owner_delete" on storage.objects;
create policy "note_images_owner_delete" on storage.objects
  for delete using (
    bucket_id = 'note-images' and (storage.foldername(name))[1] = auth.uid()::text
  );
