-- Claim fencing and idempotent result/cost writes for the consolidated Kotlin worker.
-- All columns are nullable so the currently deployed Python worker and backend remain
-- compatible throughout the Cloud Run cutover window.

ALTER TABLE job_attempt
    ADD COLUMN claim_token uuid,
    ADD COLUMN lease_until timestamptz,
    ADD COLUMN claimed_by text;

ALTER TABLE job_attempt
    ADD CONSTRAINT job_attempt_claim_fields_together
    CHECK (
        (claim_token IS NULL AND lease_until IS NULL AND claimed_by IS NULL)
        OR
        (claim_token IS NOT NULL AND lease_until IS NOT NULL AND claimed_by IS NOT NULL)
    );

CREATE UNIQUE INDEX idx_job_attempt_one_active_per_job
    ON job_attempt (job_type, job_id)
    WHERE status IN ('pending', 'processing');

CREATE UNIQUE INDEX idx_job_attempt_claim_token
    ON job_attempt (claim_token)
    WHERE claim_token IS NOT NULL;

CREATE INDEX idx_job_attempt_expired_lease
    ON job_attempt (lease_until)
    WHERE status = 'processing' AND lease_until IS NOT NULL;

CREATE INDEX idx_quiz_generation_job_pending
    ON quiz_generation_job (created_at, id)
    WHERE status = 'PENDING';

ALTER TABLE quiz_bank
    ADD COLUMN source_attempt_id uuid REFERENCES job_attempt(id),
    ADD COLUMN source_item_index integer;

ALTER TABLE quiz_bank
    ADD CONSTRAINT quiz_bank_source_item_non_negative
    CHECK (source_item_index IS NULL OR source_item_index >= 0),
    ADD CONSTRAINT quiz_bank_source_fields_together
    CHECK (
        (source_attempt_id IS NULL AND source_item_index IS NULL)
        OR
        (source_attempt_id IS NOT NULL AND source_item_index IS NOT NULL)
    );

CREATE UNIQUE INDEX idx_quiz_bank_attempt_item
    ON quiz_bank (source_attempt_id, source_item_index);

ALTER TABLE user_cost
    ADD COLUMN job_attempt_id uuid REFERENCES job_attempt(id);

CREATE UNIQUE INDEX idx_user_cost_job_attempt
    ON user_cost (job_attempt_id);
