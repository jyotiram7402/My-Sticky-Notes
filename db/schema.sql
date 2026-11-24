-- My Sticky Notes database schema (Supabase Postgres).
-- You don't need to run this by hand: the app runs the same statements on the first API call
-- (once per server instance). Keep it in sync with SCHEMA_STATEMENTS in lib/db.ts.
-- To create the table yourself, paste this into Supabase → SQL Editor and run it.

CREATE TABLE IF NOT EXISTS notes (
  id uuid PRIMARY KEY,
  title text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  color text NOT NULL DEFAULT 'yellow',
  text_color text NOT NULL DEFAULT 'dark',
  folder text,
  icon text,
  due_at timestamptz,
  pinned boolean NOT NULL DEFAULT false,
  done boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notes_updated_at_idx ON notes (updated_at DESC);

-- Supabase publishes tables in "public" through its REST API. Row level security with no policies
-- keeps Supabase's public API keys away from the notes; the app's server connects as the table owner.
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

-- Passcode attempts, used to slow down guessing. The address is stored as a keyed hash, never as is.
CREATE TABLE IF NOT EXISTS login_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ip_hash text NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS login_attempts_attempted_at_idx ON login_attempts (attempted_at);

ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;
