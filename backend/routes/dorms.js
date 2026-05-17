// routes/dorms.js — CRUD for dorm listings + Haversine distance filtering
const express = require('express');
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/authenticate');

const router = express.Router();

// Haversine distance in km
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

// Parse amenities JSON from DB row
function parseDorm(dorm) {
  return {
    ...dorm,
    amenities: typeof dorm.amenities === 'string' ? JSON.parse(dorm.amenities) : dorm.amenities
  };
}

// GET /api/dorms — public, with optional filters
router.get('/', (req, res) => {
  const { minPrice, maxPrice, amenities, maxDistance, lat, lng, status } = req.query;

  let dorms = db.prepare(`
    SELECT d.*, u.name as owner_name
    FROM dorms d
    JOIN users u ON d.owner_id = u.id
    ORDER BY d.created_at DESC
  `).all().map(parseDorm);

  // Filter by price
  if (minPrice) dorms = dorms.filter(d => d.price >= Number(minPrice));
  if (maxPrice) dorms = dorms.filter(d => d.price <= Number(maxPrice));

  // Filter by status
  if (status) dorms = dorms.filter(d => d.status === status);

  // Filter by amenities (comma-separated)
  if (amenities) {
    const needed = amenities.split(',').map(a => a.trim().toLowerCase());
    dorms = dorms.filter(d =>
      needed.every(n => d.amenities.map(a => a.toLowerCase()).includes(n))
    );
  }

  // Filter by distance from user location
  if (lat && lng && maxDistance) {
    const userLat = Number(lat);
    const userLng = Number(lng);
    const maxKm = Number(maxDistance);
    dorms = dorms.map(d => ({
      ...d,
      distance_km: Math.round(haversine(userLat, userLng, d.lat, d.lng) * 10) / 10
    })).filter(d => d.distance_km <= maxKm)
      .sort((a, b) => a.distance_km - b.distance_km);
  }

  res.json(dorms);
});

// GET /api/dorms/:id — single dorm
router.get('/:id', (req, res) => {
  const dorm = db.prepare(`
    SELECT d.*, u.name as owner_name, u.email as owner_email
    FROM dorms d JOIN users u ON d.owner_id = u.id
    WHERE d.id = ?
  `).get(req.params.id);
  if (!dorm) return res.status(404).json({ error: 'Dorm not found' });
  res.json(parseDorm(dorm));
});

// POST /api/dorms — owner only
router.post('/', authenticate, requireRole('owner'), (req, res) => {
  const { name, description, price, lat, lng, amenities, image_url, address } = req.body;
  if (!name || !price || !lat || !lng) {
    return res.status(400).json({ error: 'name, price, lat, lng are required' });
  }
  const result = db.prepare(`
    INSERT INTO dorms (owner_id, name, description, price, lat, lng, amenities, image_url, address)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(
    req.user.id, name, description || '', price, lat, lng,
    JSON.stringify(amenities || []), image_url || '', address || ''
  );
  const dorm = db.prepare('SELECT * FROM dorms WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(parseDorm(dorm));
});

// PUT /api/dorms/:id — owner only (must own the dorm)
router.put('/:id', authenticate, requireRole('owner'), (req, res) => {
  const dorm = db.prepare('SELECT * FROM dorms WHERE id = ?').get(req.params.id);
  if (!dorm) return res.status(404).json({ error: 'Dorm not found' });
  if (dorm.owner_id !== req.user.id) return res.status(403).json({ error: 'Not your listing' });

  const { name, description, price, lat, lng, status, amenities, image_url, address } = req.body;
  db.prepare(`
    UPDATE dorms SET
      name=COALESCE(?,name), description=COALESCE(?,description),
      price=COALESCE(?,price), lat=COALESCE(?,lat), lng=COALESCE(?,lng),
      status=COALESCE(?,status), amenities=COALESCE(?,amenities),
      image_url=COALESCE(?,image_url), address=COALESCE(?,address)
    WHERE id=?
  `).run(
    name, description, price, lat, lng, status,
    amenities ? JSON.stringify(amenities) : null,
    image_url, address, req.params.id
  );
  res.json(parseDorm(db.prepare('SELECT * FROM dorms WHERE id = ?').get(req.params.id)));
});

// DELETE /api/dorms/:id — owner only
router.delete('/:id', authenticate, requireRole('owner'), (req, res) => {
  const dorm = db.prepare('SELECT * FROM dorms WHERE id = ?').get(req.params.id);
  if (!dorm) return res.status(404).json({ error: 'Dorm not found' });
  if (dorm.owner_id !== req.user.id) return res.status(403).json({ error: 'Not your listing' });
  db.prepare('DELETE FROM dorms WHERE id = ?').run(req.params.id);
  res.json({ message: 'Dorm deleted' });
});

// GET /api/dorms/owner/mine — owner's own listings
router.get('/owner/mine', authenticate, requireRole('owner'), (req, res) => {
  const dorms = db.prepare('SELECT * FROM dorms WHERE owner_id = ? ORDER BY created_at DESC')
    .all(req.user.id).map(parseDorm);
  res.json(dorms);
});

module.exports = router;
