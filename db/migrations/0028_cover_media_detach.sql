-- ONLY HORSES · 0028 · a horse keeps its record when its media goes
--
-- Same family as 0027, one step further down: `media` cascades from
-- `profiles`, so deleting an account deletes its media, and
-- `horses.cover_media_id` then blocked the delete with RESTRICT.
--
-- The cover is a pointer, not part of the record. When the image goes the
-- horse loses its cover photo and keeps everything that matters — identity,
-- health, ownership history (§24.14).

ALTER TABLE horses DROP CONSTRAINT horses_cover_media_id_fkey;
ALTER TABLE horses ADD CONSTRAINT horses_cover_media_id_fkey
  FOREIGN KEY (cover_media_id) REFERENCES media(id) ON DELETE SET NULL;

ALTER TABLE horse_competition_results DROP CONSTRAINT horse_competition_results_proof_media_id_fkey;
ALTER TABLE horse_competition_results ADD CONSTRAINT horse_competition_results_proof_media_id_fkey
  FOREIGN KEY (proof_media_id) REFERENCES media(id) ON DELETE SET NULL;

ALTER TABLE job_applications DROP CONSTRAINT job_applications_cv_media_id_fkey;
ALTER TABLE job_applications ADD CONSTRAINT job_applications_cv_media_id_fkey
  FOREIGN KEY (cv_media_id) REFERENCES media(id) ON DELETE SET NULL;

ALTER TABLE job_applications DROP CONSTRAINT job_applications_video_media_id_fkey;
ALTER TABLE job_applications ADD CONSTRAINT job_applications_video_media_id_fkey
  FOREIGN KEY (video_media_id) REFERENCES media(id) ON DELETE SET NULL;
