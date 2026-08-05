-- Ensure a fresh deployment can claim its first AI job without manual model setup.
-- Existing administrator-selected active configurations always take precedence.
INSERT INTO ai_model_config (
    status,
    photo_analysis_model,
    quiz_generation_model,
    word_discovery_model,
    validation_status,
    created_by,
    validated_at,
    activated_at
)
SELECT
    'active',
    'qwen/qwen3.7-flash',
    'qwen/qwen3.7-flash',
    'qwen/qwen3.7-flash',
    'passed',
    'system:migration',
    now(),
    now()
WHERE NOT EXISTS (
    SELECT 1
    FROM ai_model_config
    WHERE status = 'active'
)
ON CONFLICT DO NOTHING;
