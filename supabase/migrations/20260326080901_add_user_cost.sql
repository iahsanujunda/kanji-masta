-- Dedicated cost tracking table
CREATE TABLE user_cost (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           text NOT NULL,
    operation_type    text NOT NULL,
    operation_id      uuid,
    cost_microdollars bigint NOT NULL,
    created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_cost_user_id ON user_cost(user_id);
CREATE INDEX idx_user_cost_created_at ON user_cost(created_at);

-- Backfill from existing cost data
INSERT INTO user_cost (user_id, operation_type, operation_id, cost_microdollars, created_at)
SELECT user_id, 'PHOTO_ANALYSIS', id, cost_microdollars, created_at
FROM photo_session
WHERE cost_microdollars IS NOT NULL AND cost_microdollars > 0;

INSERT INTO user_cost (user_id, operation_type, operation_id, cost_microdollars, created_at)
SELECT user_id, 'QUIZ_GENERATION', id, cost_microdollars, created_at
FROM quiz_generation_job
WHERE cost_microdollars IS NOT NULL AND cost_microdollars > 0;
