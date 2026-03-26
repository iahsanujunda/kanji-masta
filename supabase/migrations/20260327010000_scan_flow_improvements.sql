-- =============================================================================
-- Scan flow improvements: storage_path + index for recent scans
-- =============================================================================

-- Permanent Supabase Storage path (signed URLs in image_url expire after 10min)
ALTER TABLE photo_session ADD COLUMN storage_path text;

-- Backfill from existing signed URLs: extract path after /photos/
UPDATE photo_session
SET storage_path = regexp_replace(image_url, '^.*/photos/([^?]+).*$', '\1')
WHERE image_url IS NOT NULL AND image_url LIKE '%/photos/%';

-- Index for efficient "recent scans" query
CREATE INDEX idx_photo_session_user_status ON photo_session (user_id, status);
