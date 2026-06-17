-- Voice-capture audio (v1 feature 1): Supabase Storage, PRIVATE bucket, signed
-- URLs only. A failed transcription must never lose the recording, so the audio
-- is uploaded and attached (owner_type='capture') before transcription is even
-- attempted — this bucket is that durable home.
--
-- Object paths are "<org_id>/<capture_id>/audio.<ext>" and the policies scope
-- every operation to orgs the caller is a member of — the same boundary as the
-- table RLS and the receipts bucket (20260611110000).

INSERT INTO storage.buckets (id, name, public)
VALUES ('voice-captures', 'voice-captures', false)
ON CONFLICT (id) DO NOTHING;

-- storage.objects already has RLS enabled by Supabase. Scope by the first path
-- segment (the org id), mirroring the org_isolation table policies.

CREATE POLICY voice_captures_storage_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'voice-captures'
    AND (storage.foldername(name))[1] IN
      (SELECT org_id::text FROM public.memberships WHERE user_id = (select auth.uid()))
  );

CREATE POLICY voice_captures_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'voice-captures'
    AND (storage.foldername(name))[1] IN
      (SELECT org_id::text FROM public.memberships WHERE user_id = (select auth.uid()))
  );

CREATE POLICY voice_captures_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'voice-captures'
    AND (storage.foldername(name))[1] IN
      (SELECT org_id::text FROM public.memberships WHERE user_id = (select auth.uid()))
  );
