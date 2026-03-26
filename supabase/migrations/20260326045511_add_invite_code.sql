ALTER TABLE user_invite ADD COLUMN code text UNIQUE;
CREATE INDEX idx_user_invite_code ON user_invite(code);
