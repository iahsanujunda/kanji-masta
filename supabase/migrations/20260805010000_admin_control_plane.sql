-- Durable Admin job control and versioned model configuration.

ALTER TABLE photo_session DROP CONSTRAINT IF EXISTS photo_session_failure_code_known;
ALTER TABLE photo_session
    ADD CONSTRAINT photo_session_failure_code_known
    CHECK (
        failure_code IS NULL OR failure_code IN (
            'dispatch_failed',
            'provider_failed',
            'invalid_response',
            'callback_failed',
            'timed_out',
            'admin_stopped',
            'source_missing',
            'unknown'
        )
    );

CREATE TABLE job_attempt (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type text NOT NULL CHECK (job_type IN ('photo_analysis', 'quiz_generation')),
    job_id uuid NOT NULL,
    attempt_number integer NOT NULL CHECK (attempt_number > 0),
    status text NOT NULL CHECK (status IN ('pending', 'processing', 'done', 'failed')),
    trigger text NOT NULL CHECK (trigger IN ('initial', 'platform_retry', 'admin_rerun', 'reconciler')),
    model_config_version bigint,
    model_id text,
    failure_code text,
    started_at timestamptz,
    finished_at timestamptz,
    created_by text NOT NULL DEFAULT 'system',
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (job_type, job_id, attempt_number)
);

CREATE INDEX idx_job_attempt_job_history
    ON job_attempt (job_type, job_id, attempt_number DESC);
CREATE INDEX idx_job_attempt_active
    ON job_attempt (job_type, created_at)
    WHERE status IN ('pending', 'processing');

CREATE TABLE ai_model_config (
    version bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    status text NOT NULL CHECK (status IN ('draft', 'active', 'superseded', 'rejected')),
    photo_analysis_model text NOT NULL,
    quiz_generation_model text NOT NULL,
    word_discovery_model text NOT NULL,
    validation_status text NOT NULL DEFAULT 'pending'
        CHECK (validation_status IN ('pending', 'passed', 'failed')),
    failure_code text,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    validated_at timestamptz,
    activated_at timestamptz
);

CREATE UNIQUE INDEX idx_ai_model_config_one_active
    ON ai_model_config ((true))
    WHERE status = 'active';

ALTER TABLE job_attempt
    ADD CONSTRAINT job_attempt_model_config_fkey
    FOREIGN KEY (model_config_version) REFERENCES ai_model_config(version);
CREATE INDEX idx_job_attempt_model_config
    ON job_attempt (model_config_version)
    WHERE model_config_version IS NOT NULL;

ALTER TABLE job_attempt ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_model_config ENABLE ROW LEVEL SECURITY;

INSERT INTO job_attempt (
    job_type, job_id, attempt_number, status, trigger, failure_code,
    started_at, finished_at, created_at
)
SELECT
    'photo_analysis',
    id,
    GREATEST(attempts, 1),
    CASE
        WHEN status IN ('DONE', 'INGESTED') THEN 'done'
        WHEN status IN ('FAILED', 'ERROR') THEN 'failed'
        ELSE 'processing'
    END,
    'initial',
    failure_code,
    created_at,
    CASE WHEN status IN ('DONE', 'INGESTED', 'FAILED', 'ERROR') THEN updated_at END,
    created_at
FROM photo_session
ON CONFLICT (job_type, job_id, attempt_number) DO NOTHING;

INSERT INTO job_attempt (
    job_type, job_id, attempt_number, status, trigger,
    started_at, finished_at, created_at
)
SELECT
    'quiz_generation',
    id,
    GREATEST(attempts, 1),
    lower(status::text),
    'initial',
    created_at,
    CASE WHEN status IN ('DONE', 'FAILED') THEN updated_at END,
    created_at
FROM quiz_generation_job
ON CONFLICT (job_type, job_id, attempt_number) DO NOTHING;
