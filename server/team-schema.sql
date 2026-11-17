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

COMMIT;
