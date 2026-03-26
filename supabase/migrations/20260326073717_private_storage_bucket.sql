-- Make photos bucket private — no more unauthenticated public access
UPDATE storage.buckets SET public = false WHERE id = 'photos';

-- Drop the old public read policy
DROP POLICY IF EXISTS "Public read access" ON storage.objects;

-- Users can read only their own photos
CREATE POLICY "Users can read own photos"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'photos' AND (storage.foldername(name))[1] = auth.uid()::text);
