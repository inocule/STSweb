// db/database.js — PostgreSQL via pg (replaces better-sqlite3)
// Connection string comes from DATABASE_URL environment variable.
// Uses a connection pool so every async route handler shares safely.

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Render / Supabase both require SSL in production
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// ─── Schema Bootstrap ─────────────────────────────────────────────────────────
// Creates tables only if they don't exist; safe to run on every start.

async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id         SERIAL PRIMARY KEY,
      name       TEXT        NOT NULL,
      email      TEXT        NOT NULL UNIQUE,
      password   TEXT        NOT NULL,
      role       TEXT        NOT NULL CHECK (role IN ('student', 'owner')),
      avatar     TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS dorms (
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

    CREATE TABLE IF NOT EXISTS messages (
      id          SERIAL PRIMARY KEY,
      dorm_id     INTEGER     REFERENCES dorms(id)    ON DELETE SET NULL,
      sender_id   INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      receiver_id INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      text        TEXT        NOT NULL,
      read        BOOLEAN     NOT NULL DEFAULT FALSE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_dorms_owner   ON dorms    (owner_id);
    CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages (sender_id, receiver_id);
    CREATE INDEX IF NOT EXISTS idx_messages_read ON messages (receiver_id, read) WHERE read = FALSE;
  `);
  console.log('✅ Database schema ready');
}

// ─── Seed Demo Data ───────────────────────────────────────────────────────────

async function seedIfEmpty() {
  // Check whether the specific demo accounts already exist
  const { rows } = await pool.query(
    "SELECT COUNT(*)::int AS c FROM users WHERE email IN ('student@roome.ph','owner@roome.ph')"
  );
  if (rows[0].c >= 2) return; // both demo accounts already present

  const hash = await bcrypt.hash('password123', 10);

  // Upsert demo users — safe even if only one account is missing
  await pool.query(
    'INSERT INTO users (name, email, password, role) VALUES ($1,$2,$3,$4) ON CONFLICT (email) DO NOTHING',
    ['Demo Student', 'student@roome.ph', hash, 'student']
  );
  await pool.query(
    'INSERT INTO users (name, email, password, role) VALUES ($1,$2,$3,$4) ON CONFLICT (email) DO NOTHING',
    ['Demo Owner', 'owner@roome.ph', hash, 'owner']
  );

  // Fetch owner ID by email (RETURNING is skipped on DO NOTHING)
  const { rows: [ownerRow] } = await pool.query(
    "SELECT id FROM users WHERE email = 'owner@roome.ph'"
  );
  const owner = ownerRow;

  const dormData = [
    {
      name: 'Campus Heights',
      description: 'Modern dorm with stunning views, just 0.8km from PUP.',
      price: 4000, lat: 14.6015, lng: 120.9830, status: 'available',
      amenities: JSON.stringify(['WiFi', 'Parking']),
      image_url: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?q=80&w=600&auto=format&fit=crop',
      address: 'P. Campa St, Santa Mesa, Manila',
    },
    {
      name: 'The Cozy Place',
      description: 'Quiet and cozy studio-type rooms with full kitchen access.',
      price: 3500, lat: 14.5980, lng: 120.9860, status: 'full',
      amenities: JSON.stringify(['AC', 'Kitchen']),
      image_url: 'https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?q=80&w=600&auto=format&fit=crop',
      address: 'Nagtahan St, Santa Mesa, Manila',
    },
    {
      name: 'Student Haven',
      description: 'Budget-friendly rooms with all essential amenities included.',
      price: 2000, lat: 14.6020, lng: 120.9855, status: 'available',
      amenities: JSON.stringify(['WiFi', 'AC', 'Kitchen']),
      image_url: 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?q=80&w=600&auto=format&fit=crop',
      address: 'Lerma St, Santa Mesa, Manila',
    },
  ];

  for (const d of dormData) {
    await pool.query(
      `INSERT INTO dorms (owner_id, name, description, price, lat, lng, status, amenities, image_url, address)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [owner.id, d.name, d.description, d.price, d.lat, d.lng, d.status, d.amenities, d.image_url, d.address]
    );
  }

  console.log('✅ Seed data inserted (student@roome.ph / owner@roome.ph — password: password123)');
}

// ─── Startup ──────────────────────────────────────────────────────────────────

async function initDb() {
  try {
    await initSchema();
    await seedIfEmpty();
  } catch (err) {
    console.error('❌ Database init failed:');
    console.error('  message :', err.message);
    console.error('  code    :', err.code);
    console.error('  detail  :', err.detail);
    console.error('  stack   :', err.stack);
    process.exit(1);
  }
}

module.exports = { pool, initDb };
