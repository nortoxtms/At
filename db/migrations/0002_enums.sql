-- ONLY HORSES · 0002 · enums (spec §7)

CREATE TYPE role_type AS ENUM (
  'horse_owner','trainer','rider','groom','farrier','veterinarian',
  'equine_therapist','breeder','transporter','instructor','photographer',
  'saddler','ranch_manager','agent');

CREATE TYPE verification_level AS ENUM (
  'none','email_verified','phone_verified','identity_verified',
  'professional_verified','business_verified');

CREATE TYPE horse_sex AS ENUM ('mare','stallion','gelding','filly','colt');

CREATE TYPE horse_status AS ENUM ('active','sold','retired','deceased','archived');

CREATE TYPE listing_type AS ENUM ('sale','lease','half_lease','share','stud','loan');

CREATE TYPE listing_status AS ENUM (
  'draft','pending_review','active','paused','under_offer','sold','expired','rejected','withdrawn');

CREATE TYPE field_visibility AS ENUM ('public','on_request','private');

CREATE TYPE health_record_type AS ENUM (
  'vaccination','deworming','dental','farrier','vet_exam','ppe','surgery',
  'injury','lameness','xray','lab_result','medication','other');

CREATE TYPE job_type AS ENUM ('full_time','part_time','seasonal','contract','internship','working_student');

CREATE TYPE application_status AS ENUM ('submitted','viewed','shortlisted','interview','offered','rejected','withdrawn');

CREATE TYPE org_type AS ENUM ('ranch','stable','riding_school','breeding_farm','clinic','transport_company','retailer','other');

CREATE TYPE org_member_role AS ENUM ('owner','admin','staff');

CREATE TYPE subscription_tier AS ENUM ('free','pro','business');

CREATE TYPE subscription_status AS ENUM ('active','trialing','past_due','canceled','incomplete');

CREATE TYPE moderation_status AS ENUM ('open','in_review','actioned','dismissed');

CREATE TYPE media_type AS ENUM ('image','video','document');

CREATE TYPE media_status AS ENUM ('uploading','processing','ready','failed','removed');

CREATE TYPE grant_status AS ENUM ('requested','granted','denied','revoked','expired');

CREATE TYPE review_subject_type AS ENUM ('user','organization','listing_transaction');

CREATE TYPE notification_channel AS ENUM ('push','email','in_app');
