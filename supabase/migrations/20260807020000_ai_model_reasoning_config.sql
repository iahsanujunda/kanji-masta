-- Version reasoning effort with each workload model so attempts can replay the exact AI configuration.

ALTER TABLE ai_model_config
    ADD COLUMN photo_analysis_reasoning text NOT NULL DEFAULT 'medium',
    ADD COLUMN translation_reasoning text NOT NULL DEFAULT 'medium',
    ADD COLUMN quiz_generation_reasoning text NOT NULL DEFAULT 'high',
    ADD COLUMN word_discovery_reasoning text NOT NULL DEFAULT 'medium';

ALTER TABLE ai_model_config
    ADD CONSTRAINT ai_model_config_photo_analysis_reasoning_known
        CHECK (photo_analysis_reasoning IN ('none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max')),
    ADD CONSTRAINT ai_model_config_translation_reasoning_known
        CHECK (translation_reasoning IN ('none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max')),
    ADD CONSTRAINT ai_model_config_quiz_generation_reasoning_known
        CHECK (quiz_generation_reasoning IN ('none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max')),
    ADD CONSTRAINT ai_model_config_word_discovery_reasoning_known
        CHECK (word_discovery_reasoning IN ('none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'));
