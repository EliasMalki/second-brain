-- Receipt photos (BUILD_SPEC §2d, §10): Supabase Storage, PRIVATE bucket,
-- signed URLs only. Object paths are "<org_id>/<receipt_id>/<filename>" and
-- the policies scope every operation to orgs the caller is a member of —
-- the same boundary as the table RLS.

INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', false)
ON CONFLICT (id) DO NOTHING;

-- storage.objects already has RLS enabled by Supabase. Scope by the first
-- path segment (the org id), mirroring the org_isolation table policies.

CREATE POLICY receipts_storage_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] IN
      (SELECT org_id::text FROM public.memberships WHERE user_id = (select auth.uid()))
  );

CREATE POLICY receipts_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] IN
      (SELECT org_id::text FROM public.memberships WHERE user_id = (select auth.uid()))
  );

CREATE POLICY receipts_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] IN
      (SELECT org_id::text FROM public.memberships WHERE user_id = (select auth.uid()))
  );
