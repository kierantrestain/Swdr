BEGIN;

CREATE TABLE IF NOT EXISTS swdr_team_sessions (
  digest text PRIMARY KEY,
  email text NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS swdr_team_projects (
  id text PRIMARY KEY,
  version integer NOT NULL CHECK (version > 0),
  body jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS swdr_team_grants (
  project_id text NOT NULL REFERENCES swdr_team_projects (id),
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('owner', 'editor', 'reviewer', 'viewer')),
  episode_ids text[],
  PRIMARY KEY (project_id, email)
);

CREATE TABLE IF NOT EXISTS swdr_team_documents (
  project_id text NOT NULL REFERENCES swdr_team_projects (id),
  document_id text NOT NULL,
  episode_id text,
  PRIMARY KEY (project_id, document_id)
);

CREATE TABLE IF NOT EXISTS swdr_team_versions (
  project_id text NOT NULL REFERENCES swdr_team_projects (id),
  version integer NOT NULL,
  body jsonb NOT NULL,
  PRIMARY KEY (project_id, version)
);

CREATE TABLE IF NOT EXISTS swdr_team_operations (
  project_id text NOT NULL REFERENCES swdr_team_projects (id),
  operation_id text NOT NULL,
  email text NOT NULL,
  version integer NOT NULL,
  PRIMARY KEY (project_id, operation_id)
);

CREATE TABLE IF NOT EXISTS swdr_team_notes (
  project_id text NOT NULL REFERENCES swdr_team_projects (id),
  id text NOT NULL,
  document_id text NOT NULL,
  revision_id text NOT NULL,
  block_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('comment', 'suggestion')),
  author text NOT NULL,
  body text NOT NULL,
  original text,
  state text NOT NULL CHECK (state IN ('open', 'resolved', 'accepted', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, id)
);

CREATE TABLE IF NOT EXISTS swdr_team_lines (
  project_id text NOT NULL REFERENCES swdr_team_projects (id),
  document_id text NOT NULL,
  block_id text NOT NULL,
  version integer NOT NULL,
  previous_text text NOT NULL,
  body text NOT NULL,
  author text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, document_id, block_id, version)
);

CREATE TABLE IF NOT EXISTS swdr_team_reviews (
  digest text PRIMARY KEY,
  project_id text NOT NULL REFERENCES swdr_team_projects (id),
  snapshot_id text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);

-- Accounts, invitations and sign-in throttling (added for self-service team accounts).
-- Every statement is idempotent so the whole file can be re-applied to an existing database.

ALTER TABLE swdr_team_sessions ADD COLUMN IF NOT EXISTS method text NOT NULL DEFAULT 'access-key';
ALTER TABLE swdr_team_sessions ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS swdr_team_sessions_email ON swdr_team_sessions (email);
CREATE INDEX IF NOT EXISTS swdr_team_sessions_expiry ON swdr_team_sessions (expires_at);

ALTER TABLE swdr_team_grants ADD COLUMN IF NOT EXISTS added_at timestamptz DEFAULT now();
CREATE INDEX IF NOT EXISTS swdr_team_grants_email ON swdr_team_grants (email);

CREATE TABLE IF NOT EXISTS swdr_team_users (
  email text PRIMARY KEY CHECK (email = lower(email)),
  name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_active_at timestamptz
);

CREATE TABLE IF NOT EXISTS swdr_team_credentials (
  email text PRIMARY KEY REFERENCES swdr_team_users (email) ON DELETE CASCADE,
  scheme text NOT NULL,
  salt bytea NOT NULL,
  hash bytea NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS swdr_team_invitations (
  id text PRIMARY KEY,
  digest text NOT NULL UNIQUE,
  project_id text REFERENCES swdr_team_projects (id),
  email text NOT NULL CHECK (email = lower(email)),
  role text CHECK (role IN ('owner', 'editor', 'reviewer', 'viewer')),
  episode_ids text[],
  invited_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  accepted_by text,
  revoked_at timestamptz,
  CHECK ((project_id IS NULL) = (role IS NULL))
);
CREATE INDEX IF NOT EXISTS swdr_team_invitations_project ON swdr_team_invitations (project_id, email);

CREATE TABLE IF NOT EXISTS swdr_team_login_attempts (
  scope text PRIMARY KEY,
  failures integer NOT NULL DEFAULT 0,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz
);

-- Who is in a project right now and where their cursor is. Rows older than a minute are ignored.
CREATE TABLE IF NOT EXISTS swdr_team_presence (
  project_id text NOT NULL REFERENCES swdr_team_projects (id) ON DELETE CASCADE,
  email text NOT NULL,
  document_id text,
  block_id text,
  cursor_offset integer,
  typing boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, email)
);

-- AI partner requests per account per day, for the daily allowance.
CREATE TABLE IF NOT EXISTS swdr_ai_usage (
  email text NOT NULL,
  day date NOT NULL,
  requests integer NOT NULL DEFAULT 0,
  PRIMARY KEY (email, day)
);

COMMIT;
