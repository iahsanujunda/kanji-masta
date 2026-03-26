-- =============================================================================
-- Add created_at / updated_at to all tables + auto-update trigger
-- =============================================================================

-- 1. Trigger function (reusable)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 2. Add missing columns
-- =============================================================================

-- Tables missing BOTH created_at AND updated_at
ALTER TABLE kanji_master
    ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
    ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE quiz_serve
    ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
    ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
UPDATE quiz_serve SET created_at = answered_at;

ALTER TABLE challenge_session
    ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
    ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
UPDATE challenge_session SET created_at = triggered_at;

-- Tables missing updated_at only
ALTER TABLE word_master      ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
UPDATE word_master SET updated_at = created_at;

ALTER TABLE user_kanji       ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
UPDATE user_kanji SET updated_at = created_at;

ALTER TABLE photo_session    ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
UPDATE photo_session SET updated_at = created_at;

ALTER TABLE quiz_bank        ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
UPDATE quiz_bank SET updated_at = created_at;

ALTER TABLE quiz_distractor  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
UPDATE quiz_distractor SET updated_at = created_at;

ALTER TABLE quiz_slot        ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
UPDATE quiz_slot SET updated_at = created_at;

ALTER TABLE quiz_generation_job ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
UPDATE quiz_generation_job SET updated_at = created_at;

ALTER TABLE user_words       ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
UPDATE user_words SET updated_at = created_at;

ALTER TABLE user_cost        ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
UPDATE user_cost SET updated_at = created_at;

ALTER TABLE user_invite      ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
UPDATE user_invite SET updated_at = created_at;

-- Table missing created_at only
ALTER TABLE user_settings    ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
UPDATE user_settings SET created_at = updated_at;

-- =============================================================================
-- 3. Auto-update triggers on all tables
-- =============================================================================
CREATE TRIGGER trg_kanji_master_updated_at        BEFORE UPDATE ON kanji_master        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_word_master_updated_at          BEFORE UPDATE ON word_master          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_user_kanji_updated_at           BEFORE UPDATE ON user_kanji           FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_photo_session_updated_at        BEFORE UPDATE ON photo_session        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_quiz_bank_updated_at            BEFORE UPDATE ON quiz_bank            FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_quiz_distractor_updated_at      BEFORE UPDATE ON quiz_distractor      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_quiz_slot_updated_at            BEFORE UPDATE ON quiz_slot            FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_quiz_serve_updated_at           BEFORE UPDATE ON quiz_serve           FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_quiz_generation_job_updated_at  BEFORE UPDATE ON quiz_generation_job  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_user_words_updated_at           BEFORE UPDATE ON user_words           FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_challenge_session_updated_at    BEFORE UPDATE ON challenge_session    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_user_settings_updated_at        BEFORE UPDATE ON user_settings        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_user_cost_updated_at            BEFORE UPDATE ON user_cost            FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_user_invite_updated_at          BEFORE UPDATE ON user_invite          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
