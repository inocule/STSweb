// routes/dorms.js — CRUD for dorm listings (PostgreSQL async)
const express = require('express');
const { pool } = require('../db/database');
const { authenticate, requireRole } = require('../middleware/authenticate');

const router = express.Router();

// ─── Haversine distance in km ─────────────────────────────────────────────────
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── GET /api/dorms — public, with optional filters ──────────────────────────
router.get('/', async (req, res) => {
  try {
    const { minPrice, maxPrice, amenities, maxDistance, lat, lng, status } = req.query;

    let { rows: dorms } = await pool.query(`
      SELECT d.*, u.name AS owner_name
      FROM dorms d
      JOIN users u ON d.owner_id = u.id
      ORDER BY d.created_at DESC
    `);

    // amenities is already parsed by pg (JSONB → JS array)
    if (minPrice) dorms = dorms.filter(d => d.price >= Number(minPrice));
    if (maxPrice) dorms = dorms.filter(d => d.price <= Number(maxPrice));
    if (status)   dorms = dorms.filter(d => d.status === status);

    if (amenities) {
      const needed = amenities.split(',').map(a => a.trim().toLowerCase());
      dorms = dorms.filter(d =>
        needed.every(n => (d.amenities || []).map(a => a.toLowerCase()).includes(n))
      );
    }

    if (lat && lng && maxDistance) {
      const userLat = Number(lat), userLng = Number(lng), maxKm = Number(maxDistance);
      dorms = dorms
        .map(d => ({ ...d, distance_km: Math.round(haversine(userLat, userLng, Number(d.lat), Number(d.lng)) * 10) / 10 }))
        .filter(d => d.distance_km <= maxKm)
        .sort((a, b) => a.distance_km - b.distance_km);
    }

    res.json(dorms);
  } catch (err) {
    console.error('[dorms/GET /]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET /api/dorms/owner/mine ────────────────────────────────────────────────
// NOTE: must be BEFORE /:id so Express doesn't treat "mine" as an id
router.get('/owner/mine', authenticate, requireRole('owner'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM dorms WHERE owner_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('[dorms/owner/mine]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET /api/dorms/:id ───────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT d.*, u.name AS owner_name, u.email AS owner_email
      FROM dorms d JOIN users u ON d.owner_id = u.id
      WHERE d.id = $1
    `, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Dorm not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[dorms/GET /:id]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST /api/dorms ─────────────────────────────────────────────────────────
router.post('/', authenticate, requireRole('owner'), async (req, res) => {
  try {
    const { name, description, price, lat, lng, amenities, image_url, address } = req.body;
    if (!name || !price || !lat || !lng)
      return res.status(400).json({ error: 'name, price, lat, lng are required' });

    const { rows: [dorm] } = await pool.query(`
      INSERT INTO dorms (owner_id, name, description, price, lat, lng, amenities, image_url, address)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *
    `, [
      req.user.id, name, description || '', price, lat, lng,
      JSON.stringify(amenities || []), image_url || '', address || '',
    ]);
    res.status(201).json(dorm);
  } catch (err) {
    console.error('[dorms/POST /]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── PUT /api/dorms/:id ───────────────────────────────────────────────────────
router.put('/:id', authenticate, requireRole('owner'), async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM dorms WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Dorm not found' });
    if (rows[0].owner_id !== req.user.id) return res.status(403).json({ error: 'Not your listing' });

    const { name, description, price, lat, lng, status, amenities, image_url, address } = req.body;
    const { rows: [updated] } = await pool.query(`
      UPDATE dorms SET
        name        = COALESCE($1,  name),
        description = COALESCE($2,  description),
        price       = COALESCE($3,  price),
        lat         = COALESCE($4,  lat),
        lng         = COALESCE($5,  lng),
        status      = COALESCE($6,  status),
        amenities   = COALESCE($7,  amenities),
        image_url   = COALESCE($8,  image_url),
        address     = COALESCE($9,  address)
      WHERE id = $10
      RETURNING *
    `, [
      name, description, price, lat, lng, status,
      amenities ? JSON.stringify(amenities) : null,
      image_url, address, req.params.id,
    ]);
    res.json(updated);
  } catch (err) {
    console.error('[dorms/PUT /:id]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── DELETE /api/dorms/:id ────────────────────────────────────────────────────
router.delete('/:id', authenticate, requireRole('owner'), async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM dorms WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Dorm not found' });
    if (rows[0].owner_id !== req.user.id) return res.status(403).json({ error: 'Not your listing' });
    await pool.query('DELETE FROM dorms WHERE id = $1', [req.params.id]);
    res.json({ message: 'Dorm deleted' });
  } catch (err) {
    console.error('[dorms/DELETE /:id]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
