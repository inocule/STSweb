-- ============================================================
-- RooME — PostgreSQL Migration (SQLite → Supabase)
-- Run this in Supabase SQL Editor (or psql)
-- ============================================================

-- Drop in reverse dependency order if re-running
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS dorms    CASCADE;
DROP TABLE IF EXISTS users    CASCADE;

-- ─── users ──────────────────────────────────────────────────
CREATE TABLE users (
  id         SERIAL PRIMARY KEY,
  name       TEXT        NOT NULL,
  email      TEXT        NOT NULL UNIQUE,
  password   TEXT        NOT NULL,
  role       TEXT        NOT NULL CHECK (role IN ('student', 'owner')),
  avatar     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── dorms ──────────────────────────────────────────────────
CREATE TABLE dorms (
  id          SERIAL PRIMARY KEY,
  owner_id    INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  description TEXT,
  price       NUMERIC     NOT NULL,
  lat         NUMERIC     NOT NULL,
  lng         NUMERIC     NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'available'
                CHECK (status IN ('available', 'full')),
  amenities   JSONB       NOT NULL DEFAULT '[]',
  image_url   TEXT,
  address     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── messages ───────────────────────────────────────────────
CREATE TABLE messages (
  id          SERIAL PRIMARY KEY,
  dorm_id     INTEGER     REFERENCES dorms(id)    ON DELETE SET NULL,
  sender_id   INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text        TEXT        NOT NULL,
  read        BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Indexes ─────────────────────────────────────────────────
CREATE INDEX idx_dorms_owner    ON dorms    (owner_id);
CREATE INDEX idx_messages_conv  ON messages (sender_id, receiver_id);
CREATE INDEX idx_messages_read  ON messages (receiver_id, read) WHERE read = FALSE;
