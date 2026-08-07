-- Give each required capture task its own durable provider attempt while retaining
-- job_id as the photo-session aggregate key used by the Admin control plane.

ALTER TABLE job_attempt
    ADD COLUMN task_id uuid REFERENCES photo_session_task(id) ON DELETE CASCADE;

UPDATE job_attempt attempt
SET task_id = task.id
FROM photo_session_task task
WHERE attempt.job_type = 'photo_analysis'
  AND attempt.job_id = task.photo_session_id
  AND task.task_type = 'VISUAL_ANALYSIS'
  AND attempt.task_id IS NULL;

CREATE INDEX idx_job_attempt_capture_task_history
    ON job_attempt (task_id, attempt_number DESC)
    WHERE task_id IS NOT NULL;

CREATE UNIQUE INDEX idx_job_attempt_capture_task_active
    ON job_attempt (task_id)
    WHERE task_id IS NOT NULL AND status IN ('pending', 'processing');
