-- User-facing scan activity acknowledgement state and efficient terminal-update lookup.

CREATE TABLE user_photo_activity_state (
    user_id text PRIMARY KEY,
    seen_through timestamptz NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Do not turn historical scans into unread notifications when this feature ships.
INSERT INTO user_photo_activity_state (user_id, seen_through)
SELECT user_id, now()
FROM photo_session
GROUP BY user_id;

CREATE INDEX idx_photo_session_user_terminal_updated
    ON photo_session (user_id, updated_at DESC)
    WHERE status IN ('DONE', 'FAILED', 'ERROR');

ALTER TABLE user_photo_activity_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own photo activity state"
    ON user_photo_activity_state FOR ALL TO authenticated
    USING (user_id = auth.uid()::text)
    WITH CHECK (user_id = auth.uid()::text);

CREATE TRIGGER trg_user_photo_activity_state_updated_at
    BEFORE UPDATE ON user_photo_activity_state
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
