INSERT INTO user_settings (user_id, onboarding_complete)
SELECT user_id, true
FROM (
    SELECT user_id FROM user_kanji
    UNION
    SELECT user_id FROM user_words
) AS users_with_collection
ON CONFLICT (user_id) DO UPDATE
SET onboarding_complete = true
WHERE NOT user_settings.onboarding_complete;
