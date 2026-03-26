ALTER TABLE photo_session ADD COLUMN status text NOT NULL DEFAULT 'PROCESSING';

-- Backfill: sessions with raw_ai_response are done
UPDATE photo_session SET status = 'DONE' WHERE raw_ai_response IS NOT NULL AND raw_ai_response != '';
