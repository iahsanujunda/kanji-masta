-- =============================================================================
-- RPC: accept_invite_for_user — single source of truth for invite acceptance
-- =============================================================================
-- Called by the auth.users trigger on email confirmation, and can also be
-- called directly from the backend as a fallback.

CREATE OR REPLACE FUNCTION accept_invite_for_user(p_email varchar, p_user_id text)
RETURNS void AS $$
BEGIN
    -- Accept matching pending invite
    UPDATE user_invite
    SET status = 'ACCEPTED', accepted_at = now()
    WHERE email = p_email AND status = 'PENDING';

    -- Create settings row with defaults if not exists
    INSERT INTO user_settings (user_id)
    VALUES (p_user_id)
    ON CONFLICT (user_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
