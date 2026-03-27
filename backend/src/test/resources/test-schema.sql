-- Iteration 3.1: Initial schema migrated from Firebase Data Connect
-- Source: dataconnect/schema/schema.gql

-- =============================================================================
-- Enums
-- =============================================================================

CREATE TYPE quiz_type AS ENUM (
    'MEANING_RECALL',
    'READING_RECOGNITION',
    'REVERSE_READING',
    'BOLD_WORD_MEANING',
    'FILL_IN_THE_BLANK'
);

CREATE TYPE user_kanji_status AS ENUM ('FAMILIAR', 'LEARNING');
CREATE TYPE job_type AS ENUM ('INITIAL', 'REGEN');
CREATE TYPE job_status AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED');
CREATE TYPE distractor_trigger AS ENUM ('INITIAL', 'MILESTONE', 'SERVE_COUNT');
CREATE TYPE word_source AS ENUM ('PHOTO', 'QUIZ', 'CHALLENGE', 'DISCOVERY');
CREATE TYPE invite_status AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED');

-- =============================================================================
-- Tables
-- =============================================================================

-- Seeded from kanjidic2, read-only at runtime
CREATE TABLE kanji_master (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    character   text NOT NULL UNIQUE,
    onyomi      text[] NOT NULL DEFAULT '{}',
    kunyomi     text[] NOT NULL DEFAULT '{}',
    meanings    text[] NOT NULL DEFAULT '{}',
    frequency   integer,
    jlpt        integer
);

CREATE INDEX idx_kanji_master_jlpt ON kanji_master (jlpt);
CREATE INDEX idx_kanji_master_frequency ON kanji_master (frequency);

-- Shared canonical word list
CREATE TABLE word_master (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    word        text NOT NULL UNIQUE,
    reading     text NOT NULL,
    meanings    text[] NOT NULL DEFAULT '{}',
    kanji_ids   uuid[] NOT NULL DEFAULT '{}',
    frequency   integer,
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- Per-user kanji tracking
CREATE TABLE user_kanji (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         text NOT NULL,
    kanji_id        uuid NOT NULL REFERENCES kanji_master(id),
    status          user_kanji_status NOT NULL,
    familiarity     integer NOT NULL DEFAULT 0,
    current_tier    quiz_type NOT NULL DEFAULT 'MEANING_RECALL',
    next_review     timestamptz,
    source_photo_id uuid,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, kanji_id)
);

CREATE INDEX idx_user_kanji_user_id ON user_kanji (user_id);

-- Photo analysis sessions
CREATE TABLE photo_session (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             text NOT NULL,
    image_url           text,
    raw_ai_response     text,
    status              text NOT NULL DEFAULT 'PROCESSING',
    cost_microdollars   bigint,
    created_at          timestamptz NOT NULL DEFAULT now()
);

-- Stable quiz content — user_id NULL = global shared
CREATE TABLE quiz_bank (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         text,
    kanji_id        uuid NOT NULL REFERENCES kanji_master(id),
    word_id         uuid NOT NULL REFERENCES word_master(id),
    quiz_type       quiz_type NOT NULL,
    prompt          text NOT NULL,
    furigana        text,
    target          text NOT NULL,
    answer          text NOT NULL,
    explanation     text,
    served_count    integer NOT NULL DEFAULT 0,
    served_at       timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_quiz_bank_word_id ON quiz_bank (word_id);
CREATE INDEX idx_quiz_bank_user_id ON quiz_bank (user_id);
CREATE INDEX idx_quiz_bank_kanji_id ON quiz_bank (kanji_id);

-- Versioned distractor sets — user_id NULL = global shared
CREATE TABLE quiz_distractor (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_id                     uuid NOT NULL REFERENCES quiz_bank(id),
    user_id                     text,
    distractors                 text[] NOT NULL DEFAULT '{}',
    generation                  integer NOT NULL,
    trigger                     distractor_trigger NOT NULL,
    familiarity_at_generation   integer NOT NULL,
    served_at                   timestamptz,
    created_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_quiz_distractor_quiz_id ON quiz_distractor (quiz_id);

-- Quiz time slots
CREATE TABLE quiz_slot (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     text NOT NULL,
    slot_start  timestamptz NOT NULL,
    slot_end    timestamptz NOT NULL,
    started_at  timestamptz,
    completed   integer NOT NULL DEFAULT 0,
    allowance   integer NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_quiz_slot_user_slot ON quiz_slot (user_id, slot_end DESC);

-- Full answer history
CREATE TABLE quiz_serve (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_id                     uuid NOT NULL REFERENCES quiz_bank(id),
    distractor_set_id           uuid NOT NULL REFERENCES quiz_distractor(id),
    slot_id                     uuid NOT NULL REFERENCES quiz_slot(id),
    user_id                     text NOT NULL,
    word_familiarity_at_serve   integer NOT NULL,
    correct                     boolean NOT NULL,
    answered_at                 timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_quiz_serve_slot_id ON quiz_serve (slot_id);

-- Background job queue for quiz generation
CREATE TABLE quiz_generation_job (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             text NOT NULL,
    kanji_id            uuid NOT NULL REFERENCES kanji_master(id),
    word_master_id      uuid REFERENCES word_master(id),
    quiz_id             uuid REFERENCES quiz_bank(id),
    job_type            job_type NOT NULL DEFAULT 'INITIAL',
    trigger             text,
    status              job_status NOT NULL DEFAULT 'PENDING',
    attempts            integer NOT NULL DEFAULT 0,
    cost_microdollars   bigint,
    created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_quiz_gen_job_user_status ON quiz_generation_job (user_id, status);

-- Per-user word tracking
CREATE TABLE user_words (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 text NOT NULL,
    word_master_id          uuid NOT NULL REFERENCES word_master(id),
    kanji_ids               uuid[] NOT NULL DEFAULT '{}',
    source                  word_source NOT NULL DEFAULT 'PHOTO',
    familiarity             integer NOT NULL DEFAULT 0,
    current_tier            quiz_type NOT NULL DEFAULT 'MEANING_RECALL',
    next_review             timestamptz,
    discovered_via_kanji_id uuid,
    unlocked                boolean NOT NULL DEFAULT false,
    created_at              timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, word_master_id)
);

CREATE INDEX idx_user_words_user_id ON user_words (user_id);

-- Milestone challenges
CREATE TABLE challenge_session (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         text NOT NULL,
    milestone       integer NOT NULL,
    triggered_at    timestamptz NOT NULL,
    completed_at    timestamptz,
    score           integer
);

-- Per-user settings, PK on user_id
CREATE TABLE user_settings (
    user_id                 text PRIMARY KEY,
    quiz_allowance_per_slot integer NOT NULL DEFAULT 5,
    slot_duration_hours     integer NOT NULL DEFAULT 6,
    timezone                text NOT NULL DEFAULT 'Asia/Tokyo',
    onboarding_complete     boolean NOT NULL DEFAULT false,
    updated_at              timestamptz NOT NULL DEFAULT now()
);

-- Dedicated cost tracking
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

-- Invite-only access
CREATE TABLE user_invite (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code        text UNIQUE,
    email       text NOT NULL UNIQUE,
    invited_by  text NOT NULL,
    status      invite_status NOT NULL DEFAULT 'PENDING',
    created_at  timestamptz NOT NULL DEFAULT now(),
    accepted_at timestamptz
);

-- RPC: accept invite and create user settings (called by auth trigger + backend)
CREATE OR REPLACE FUNCTION accept_invite_for_user(p_email varchar, p_user_id text)
RETURNS void AS $$
BEGIN
    UPDATE user_invite
    SET status = 'ACCEPTED', accepted_at = now()
    WHERE email = p_email AND status = 'PENDING';

    INSERT INTO user_settings (user_id)
    VALUES (p_user_id)
    ON CONFLICT (user_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql;
