-- Capture-specific word discovery with deterministic lexical identity.

ALTER TABLE job_attempt
    DROP CONSTRAINT job_attempt_job_type_check,
    ADD CONSTRAINT job_attempt_job_type_check
        CHECK (job_type IN ('photo_analysis', 'quiz_generation', 'capture_word_discovery'));

ALTER TABLE word_master
    ADD COLUMN normalized_lemma text,
    ADD COLUMN normalized_reading text;

UPDATE word_master
SET normalized_lemma = btrim(word),
    normalized_reading = btrim(reading);

ALTER TABLE word_master
    ALTER COLUMN normalized_lemma SET NOT NULL,
    ALTER COLUMN normalized_reading SET NOT NULL,
    DROP CONSTRAINT word_master_word_key,
    ADD CONSTRAINT word_master_normalized_identity_key
        UNIQUE (normalized_lemma, normalized_reading);

-- Compatibility guard for legacy/test insert paths. Application writes provide
-- fully normalized values; this trigger prevents omitted values from violating
-- the new invariant while those callers are migrated.
CREATE FUNCTION set_word_master_normalized_identity()
RETURNS trigger AS $$
BEGIN
    IF NEW.normalized_lemma IS NULL OR NEW.normalized_lemma = '' THEN
        NEW.normalized_lemma := btrim(NEW.word);
    END IF;
    IF NEW.normalized_reading IS NULL OR NEW.normalized_reading = '' THEN
        NEW.normalized_reading := btrim(NEW.reading);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_word_master_normalized_identity
    BEFORE INSERT OR UPDATE OF word, reading, normalized_lemma, normalized_reading
    ON word_master
    FOR EACH ROW EXECUTE FUNCTION set_word_master_normalized_identity();

CREATE TABLE photo_session_word (
    id uuid PRIMARY KEY,
    photo_session_id uuid NOT NULL REFERENCES photo_session(id) ON DELETE CASCADE,
    surface_text text NOT NULL,
    lemma text NOT NULL,
    normalized_lemma text NOT NULL,
    reading text NOT NULL,
    normalized_reading text NOT NULL,
    meaning text NOT NULL,
    first_seen_order integer NOT NULL CHECK (first_seen_order >= 0),
    kanji_ids uuid[] NOT NULL DEFAULT '{}',
    word_master_id uuid REFERENCES word_master(id),
    pipeline_version integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT photo_session_word_identity_key UNIQUE (
        photo_session_id,
        normalized_lemma,
        normalized_reading,
        pipeline_version
    )
);

CREATE INDEX idx_photo_session_word_capture_order
    ON photo_session_word (photo_session_id, pipeline_version, first_seen_order, id);

CREATE INDEX idx_photo_session_word_master
    ON photo_session_word (word_master_id)
    WHERE word_master_id IS NOT NULL;

CREATE INDEX idx_photo_session_word_identity
    ON photo_session_word (normalized_lemma, normalized_reading);

ALTER TABLE photo_session_word ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own captured words" ON photo_session_word
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM photo_session
        WHERE photo_session.id = photo_session_word.photo_session_id
          AND photo_session.user_id = auth.uid()::text
    ));

CREATE TRIGGER trg_photo_session_word_updated_at
    BEFORE UPDATE ON photo_session_word
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
