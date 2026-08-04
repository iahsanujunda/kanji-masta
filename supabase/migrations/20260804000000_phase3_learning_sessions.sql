CREATE TYPE quiz_slot_status AS ENUM ('ACTIVE', 'COMPLETED', 'ABANDONED', 'EXPIRED');
CREATE TYPE session_card_type AS ENUM ('INTRODUCTION', 'QUIZ');
CREATE TYPE session_card_status AS ENUM ('PENDING', 'COMPLETED', 'DROPPED');
CREATE TYPE introduction_kind AS ENUM ('NEW', 'REINTRODUCTION');

ALTER TABLE user_words
    ADD COLUMN introduced_at timestamptz,
    ADD COLUMN consecutive_failures integer NOT NULL DEFAULT 0
        CHECK (consecutive_failures >= 0);

UPDATE user_words
SET introduced_at = created_at
WHERE familiarity > 0;

ALTER TABLE quiz_slot
    ADD COLUMN status quiz_slot_status NOT NULL DEFAULT 'ACTIVE',
    ADD COLUMN version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
    ADD COLUMN completed_at timestamptz;

UPDATE quiz_slot
SET status = CASE
        WHEN completed >= allowance THEN 'COMPLETED'::quiz_slot_status
        WHEN slot_end <= now() THEN 'EXPIRED'::quiz_slot_status
        ELSE 'ACTIVE'::quiz_slot_status
    END,
    completed_at = CASE
        WHEN completed >= allowance THEN COALESCE(updated_at, slot_end)
        ELSE NULL
    END;

WITH ranked_active AS (
    SELECT id,
           row_number() OVER (PARTITION BY user_id ORDER BY slot_end DESC, created_at DESC, id) AS rank
    FROM quiz_slot
    WHERE status = 'ACTIVE'
)
UPDATE quiz_slot slot
SET status = 'EXPIRED'
FROM ranked_active ranked
WHERE slot.id = ranked.id
  AND ranked.rank > 1;

CREATE UNIQUE INDEX idx_quiz_slot_one_active_per_user
    ON quiz_slot (user_id)
    WHERE status = 'ACTIVE';

CREATE TABLE quiz_session_card (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slot_id             uuid NOT NULL REFERENCES quiz_slot(id) ON DELETE CASCADE,
    user_id             text NOT NULL,
    position            integer NOT NULL CHECK (position >= 0),
    card_type           session_card_type NOT NULL,
    status              session_card_status NOT NULL DEFAULT 'PENDING',
    user_word_id        uuid NOT NULL REFERENCES user_words(id),
    quiz_id             uuid REFERENCES quiz_bank(id),
    distractor_set_id   uuid REFERENCES quiz_distractor(id),
    learning_step       integer CHECK (learning_step IN (1, 2)),
    introduction_kind   introduction_kind,
    options             text[] NOT NULL DEFAULT '{}',
    submission_id       uuid UNIQUE,
    created_at          timestamptz NOT NULL DEFAULT now(),
    completed_at        timestamptz,
    UNIQUE (slot_id, position),
    CHECK (
        (card_type = 'INTRODUCTION' AND quiz_id IS NULL AND learning_step IS NULL AND introduction_kind IS NOT NULL)
        OR
        (card_type = 'QUIZ' AND quiz_id IS NOT NULL AND introduction_kind IS NULL)
    )
);

CREATE INDEX idx_quiz_session_card_slot_id ON quiz_session_card (slot_id);
CREATE INDEX idx_quiz_session_card_user_word_id ON quiz_session_card (user_word_id);
CREATE INDEX idx_quiz_session_card_quiz_id ON quiz_session_card (quiz_id) WHERE quiz_id IS NOT NULL;
CREATE INDEX idx_quiz_session_card_distractor_id ON quiz_session_card (distractor_set_id) WHERE distractor_set_id IS NOT NULL;
CREATE INDEX idx_quiz_session_card_pending
    ON quiz_session_card (slot_id, position)
    WHERE status = 'PENDING';

ALTER TABLE quiz_serve
    ALTER COLUMN distractor_set_id DROP NOT NULL,
    ADD COLUMN session_card_id uuid REFERENCES quiz_session_card(id),
    ADD COLUMN submission_id uuid UNIQUE,
    ADD COLUMN answered_in_ms integer CHECK (answered_in_ms >= 0);

CREATE INDEX idx_quiz_serve_session_card_id
    ON quiz_serve (session_card_id)
    WHERE session_card_id IS NOT NULL;

ALTER TABLE quiz_session_card ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can access own quiz session cards"
    ON quiz_session_card
    FOR ALL
    TO authenticated
    USING (auth.uid()::text = user_id)
    WITH CHECK (auth.uid()::text = user_id);
