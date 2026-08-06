-- Phase 3.2: retained captures, normalized kanji, and durable capture tasks.

ALTER TABLE ai_model_config ADD COLUMN translation_model text;
UPDATE ai_model_config SET translation_model = word_discovery_model WHERE translation_model IS NULL;
ALTER TABLE ai_model_config ALTER COLUMN translation_model SET DEFAULT 'qwen/qwen3.7-flash';
ALTER TABLE ai_model_config ALTER COLUMN translation_model SET NOT NULL;

ALTER TABLE photo_session
    ADD COLUMN processing_status text NOT NULL DEFAULT 'PROCESSING'
        CHECK (processing_status IN ('PROCESSING', 'READY', 'NEEDS_ATTENTION')),
    ADD COLUMN pipeline_version integer NOT NULL DEFAULT 2,
    ADD COLUMN full_text text,
    ADD COLUMN translation text,
    ADD COLUMN translation_language text NOT NULL DEFAULT 'en',
    ADD COLUMN thumbnail_path text,
    ADD COLUMN captured_kanji_coverage real,
    ADD COLUMN ready_at timestamptz,
    ADD COLUMN selection_completed_at timestamptz,
    ADD COLUMN last_revisited_at timestamptz;

-- Existing sessions deliberately remain without normalized capture content. New
-- jobs publish these fields atomically; no historical AI payload backfill runs.
UPDATE photo_session
SET processing_status = CASE
    WHEN status IN ('FAILED', 'ERROR') THEN 'NEEDS_ATTENTION'
    WHEN status IN ('DONE', 'INGESTED') THEN 'READY'
    ELSE 'PROCESSING'
END;

CREATE TABLE photo_session_task (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    photo_session_id uuid NOT NULL REFERENCES photo_session(id) ON DELETE CASCADE,
    task_type text NOT NULL CHECK (task_type IN ('VISUAL_ANALYSIS', 'TRANSLATION', 'CAPTURE_WORD_DISCOVERY')),
    status text NOT NULL CHECK (status IN ('BLOCKED', 'PENDING', 'PROCESSING', 'DONE', 'FAILED')),
    required_for_ready boolean NOT NULL,
    pipeline_version integer NOT NULL,
    result_json jsonb,
    failure_code text,
    lease_until timestamptz,
    claimed_by text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz,
    UNIQUE (photo_session_id, task_type, pipeline_version)
);

CREATE INDEX idx_photo_session_task_claim
    ON photo_session_task (status, created_at)
    WHERE status IN ('PENDING', 'PROCESSING');

CREATE TABLE photo_session_kanji (
    photo_session_id uuid NOT NULL REFERENCES photo_session(id) ON DELETE CASCADE,
    kanji_master_id uuid NOT NULL REFERENCES kanji_master(id),
    first_seen_order integer NOT NULL CHECK (first_seen_order >= 0),
    recommendation_rank integer NOT NULL CHECK (recommendation_rank >= 0),
    why_useful text,
    excluded_at timestamptz,
    pipeline_version integer NOT NULL DEFAULT 2,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (photo_session_id, kanji_master_id)
);

CREATE INDEX idx_photo_session_kanji_rank
    ON photo_session_kanji (photo_session_id, recommendation_rank, first_seen_order);

CREATE TABLE photo_session_kanji_decision (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    photo_session_id uuid NOT NULL REFERENCES photo_session(id) ON DELETE CASCADE,
    kanji_master_id uuid NOT NULL REFERENCES kanji_master(id),
    batch_id uuid NOT NULL,
    decision text NOT NULL CHECK (decision IN ('LEARNING', 'FAMILIAR', 'EXCLUDED_FALSE_POSITIVE', 'RESTORED')),
    decision_source text NOT NULL CHECK (decision_source IN ('INITIAL', 'REVISIT')),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_photo_session_kanji_decision_history
    ON photo_session_kanji_decision (photo_session_id, kanji_master_id, created_at DESC);

ALTER TABLE photo_session_task ENABLE ROW LEVEL SECURITY;
ALTER TABLE photo_session_kanji ENABLE ROW LEVEL SECURITY;
ALTER TABLE photo_session_kanji_decision ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own photo tasks" ON photo_session_task
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM photo_session
        WHERE photo_session.id = photo_session_task.photo_session_id
          AND photo_session.user_id = auth.uid()::text
    ));

CREATE POLICY "Users can read own photo kanji" ON photo_session_kanji
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM photo_session
        WHERE photo_session.id = photo_session_kanji.photo_session_id
          AND photo_session.user_id = auth.uid()::text
    ));

CREATE POLICY "Users can read own photo kanji decisions" ON photo_session_kanji_decision
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM photo_session
        WHERE photo_session.id = photo_session_kanji_decision.photo_session_id
          AND photo_session.user_id = auth.uid()::text
    ));

CREATE TRIGGER trg_photo_session_task_updated_at
    BEFORE UPDATE ON photo_session_task
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_photo_session_kanji_updated_at
    BEFORE UPDATE ON photo_session_kanji
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
