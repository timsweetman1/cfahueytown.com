CREATE SCHEMA IF NOT EXISTS orientation;
CREATE TABLE IF NOT EXISTS orientation.accounts (
  email text PRIMARY KEY, manager boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true, password_hash text, invite_hash text,
  invite_expires timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS orientation.sessions (
  token_hash text PRIMARY KEY, email text NOT NULL REFERENCES orientation.accounts(email), expires timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS orientation_session_email ON orientation.sessions(email);
CREATE TABLE IF NOT EXISTS orientation.limits (
  bucket text PRIMARY KEY, count integer NOT NULL, expires timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS orientation.files (
  name text PRIMARY KEY, bytes bytea NOT NULL
);
CREATE TABLE IF NOT EXISTS orientation.release (version text PRIMARY KEY, ready_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS orientation.activity (
  email text NOT NULL, version text NOT NULL, request_id uuid NOT NULL, step integer NOT NULL,
  passed boolean NOT NULL, response text NOT NULL, at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(email,version,request_id)
);
CREATE INDEX IF NOT EXISTS orientation_cursor ON orientation.activity(email,version,step) WHERE passed;

CREATE TABLE IF NOT EXISTS orientation.completion_alerts (
  id uuid PRIMARY KEY, email text NOT NULL, version text NOT NULL,
  completed_at timestamptz NOT NULL, sent_at timestamptz,
  UNIQUE (email, version)
);
INSERT INTO orientation.completion_alerts(id,email,version,completed_at)
  SELECT DISTINCT ON (email,version) request_id,email,version,at
  FROM orientation.activity WHERE version='2026-11-16.1' AND step=60 AND passed
  ORDER BY email,version,at,request_id ON CONFLICT DO NOTHING;
