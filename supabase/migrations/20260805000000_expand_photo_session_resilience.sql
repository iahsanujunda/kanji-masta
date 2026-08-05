-- Durable capture handoff and bounded failure metadata.
-- Keep legacy ERROR rows readable until every deployed writer uses FAILED.

ALTER TABLE photo_session
    ADD COLUMN failure_code text,
    ADD COLUMN attempts integer NOT NULL DEFAULT 0,
    ADD COLUMN client_capture_id uuid;

ALTER TABLE photo_session
    ADD CONSTRAINT photo_session_user_client_capture_unique
    UNIQUE (user_id, client_capture_id);

ALTER TABLE photo_session
    ADD CONSTRAINT photo_session_attempts_nonnegative
    CHECK (attempts >= 0);

ALTER TABLE photo_session
    ADD CONSTRAINT photo_session_failure_code_known
    CHECK (
        failure_code IS NULL OR failure_code IN (
            'dispatch_failed',
            'provider_failed',
            'invalid_response',
            'callback_failed',
            'timed_out',
            'unknown'
        )
    );
