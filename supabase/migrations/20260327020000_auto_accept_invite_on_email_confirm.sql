-- =============================================================================
-- RPC: accept_invite_for_user — single source of truth for invite acceptance
-- =============================================================================
-- Called by the auth.users trigger on email confirmation, and can also be
-- called directly from the backend as a fallback.

CREATE OR REPLACE FUNCTION accept_invite_for_user(p_email text, p_user_id text)
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

-- =============================================================================
-- Trigger: auto-call on email confirmation in Supabase auth
-- =============================================================================

CREATE OR REPLACE FUNCTION handle_email_confirmed()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL THEN
        PERFORM accept_invite_for_user(NEW.email, NEW.id::text);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_email_confirmed
    AFTER UPDATE ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_email_confirmed();
