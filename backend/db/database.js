// db/database.js — SQLite setup with better-sqlite3 (synchronous, zero config)
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'roome.db'));

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── Schema ────────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    email      TEXT NOT NULL UNIQUE,
    password   TEXT NOT NULL,
    role       TEXT NOT NULL CHECK(role IN ('student','owner')),
    avatar     TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS dorms (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    description TEXT,
    price       REAL NOT NULL,
    lat         REAL NOT NULL,
    lng         REAL NOT NULL,
    status      TEXT NOT NULL DEFAULT 'available' CHECK(status IN ('available','full')),
    amenities   TEXT DEFAULT '[]',
    image_url   TEXT,
    address     TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS messages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    dorm_id     INTEGER REFERENCES dorms(id) ON DELETE SET NULL,
    sender_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text        TEXT NOT NULL,
    read        INTEGER DEFAULT 0,
    created_at  TEXT DEFAULT (datetime('now'))
  );
`);

// ─── Seed demo data if empty ──────────────────────────────────────────────────
const bcrypt = require('bcryptjs');

const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get();
if (userCount.c === 0) {
  const hash = bcrypt.hashSync('password123', 10);

  db.prepare(`INSERT INTO users (name, email, password, role) VALUES (?,?,?,?)`).run(
    'Demo Student', 'student@roome.ph', hash, 'student'
  );
  const owner = db.prepare(`INSERT INTO users (name, email, password, role) VALUES (?,?,?,?)`).run(
    'Demo Owner', 'owner@roome.ph', hash, 'owner'
  );

  const dormData = [
    {
      owner_id: owner.lastInsertRowid,
      name: 'Campus Heights',
      description: 'Modern dorm with stunning views, just 0.8km from PUP.',
      price: 4000,
      lat: 14.6015, lng: 120.9830,
      status: 'available',
      amenities: JSON.stringify(['WiFi','Parking']),
      image_url: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?q=80&w=600&auto=format&fit=crop',
      address: 'P. Campa St, Santa Mesa, Manila'
    },
    {
      owner_id: owner.lastInsertRowid,
      name: 'The Cozy Place',
      description: 'Quiet and cozy studio-type rooms with full kitchen access.',
      price: 3500,
      lat: 14.5980, lng: 120.9860,
      status: 'full',
      amenities: JSON.stringify(['AC','Kitchen']),
      image_url: 'https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?q=80&w=600&auto=format&fit=crop',
      address: 'Nagtahan St, Santa Mesa, Manila'
    },
    {
      owner_id: owner.lastInsertRowid,
      name: 'Student Haven',
      description: 'Budget-friendly rooms with all essential amenities included.',
      price: 2000,
      lat: 14.6020, lng: 120.9855,
      status: 'available',
      amenities: JSON.stringify(['WiFi','AC','Kitchen']),
      image_url: 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?q=80&w=600&auto=format&fit=crop',
      address: 'Lerma St, Santa Mesa, Manila'
    }
  ];

  const insertDorm = db.prepare(`
    INSERT INTO dorms (owner_id, name, description, price, lat, lng, status, amenities, image_url, address)
    VALUES (@owner_id,@name,@description,@price,@lat,@lng,@status,@amenities,@image_url,@address)
  `);
  dormData.forEach(d => insertDorm.run(d));

  console.log('✅ Seed data inserted (student@roome.ph / owner@roome.ph — password: password123)');
}

module.exports = db;
