-- Enable RLS on all tables.
-- The backend connects as postgres (bypasses RLS).
-- These policies protect against direct PostgREST/client access.

-- Master tables: read-only for authenticated users
ALTER TABLE kanji_master ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read kanji_master"
  ON kanji_master FOR SELECT TO authenticated USING (true);

ALTER TABLE word_master ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read word_master"
  ON word_master FOR SELECT TO authenticated USING (true);

-- User-scoped tables: users can only access their own rows
ALTER TABLE user_kanji ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own user_kanji"
  ON user_kanji FOR ALL TO authenticated
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

ALTER TABLE user_words ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own user_words"
  ON user_words FOR ALL TO authenticated
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own user_settings"
  ON user_settings FOR ALL TO authenticated
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

ALTER TABLE photo_session ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own photo_session"
  ON photo_session FOR ALL TO authenticated
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

-- Quiz tables: global quizzes (user_id IS NULL) readable by all, personal by owner
ALTER TABLE quiz_bank ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read global quizzes"
  ON quiz_bank FOR SELECT TO authenticated
  USING (user_id IS NULL OR user_id = auth.uid()::text);

ALTER TABLE quiz_distractor ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read global distractors"
  ON quiz_distractor FOR SELECT TO authenticated
  USING (user_id IS NULL OR user_id = auth.uid()::text);

ALTER TABLE quiz_serve ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own quiz_serve"
  ON quiz_serve FOR ALL TO authenticated
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

ALTER TABLE quiz_slot ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own quiz_slot"
  ON quiz_slot FOR ALL TO authenticated
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

ALTER TABLE quiz_generation_job ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own quiz_generation_job"
  ON quiz_generation_job FOR SELECT TO authenticated
  USING (user_id = auth.uid()::text);

ALTER TABLE challenge_session ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own challenge_session"
  ON challenge_session FOR ALL TO authenticated
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

ALTER TABLE user_invite ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own invite"
  ON user_invite FOR SELECT TO authenticated
  USING (email = auth.email());
