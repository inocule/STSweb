// routes/messages.js — Message history REST endpoints
const express = require('express');
const db = require('../db/database');
const { authenticate } = require('../middleware/authenticate');

const router = express.Router();

// GET /api/messages/conversations — list all unique conversations for current user
router.get('/conversations', authenticate, (req, res) => {
  const uid = req.user.id;
  const conversations = db.prepare(`
    SELECT
      CASE WHEN m.sender_id = ? THEN m.receiver_id ELSE m.sender_id END AS other_id,
      u.name AS other_name,
      d.id AS dorm_id,
      d.name AS dorm_name,
      d.image_url AS dorm_image,
      m.text AS last_message,
      m.created_at AS last_time,
      SUM(CASE WHEN m.read = 0 AND m.receiver_id = ? THEN 1 ELSE 0 END) AS unread
    FROM messages m
    JOIN users u ON u.id = (CASE WHEN m.sender_id = ? THEN m.receiver_id ELSE m.sender_id END)
    LEFT JOIN dorms d ON d.id = m.dorm_id
    WHERE m.sender_id = ? OR m.receiver_id = ?
    GROUP BY other_id, dorm_id
    ORDER BY last_time DESC
  `).all(uid, uid, uid, uid, uid);
  res.json(conversations);
});

// GET /api/messages/:userId?dormId=X — message history with a user about a dorm
router.get('/:userId', authenticate, (req, res) => {
  const { dormId } = req.query;
  const myId = req.user.id;
  const otherId = Number(req.params.userId);

  let messages;
  if (dormId) {
    messages = db.prepare(`
      SELECT m.*, u.name as sender_name
      FROM messages m JOIN users u ON u.id = m.sender_id
      WHERE dorm_id = ?
        AND ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))
      ORDER BY created_at ASC
    `).all(dormId, myId, otherId, otherId, myId);
  } else {
    messages = db.prepare(`
      SELECT m.*, u.name as sender_name
      FROM messages m JOIN users u ON u.id = m.sender_id
      WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
      ORDER BY created_at ASC
    `).all(myId, otherId, otherId, myId);
  }

  // Mark as read
  db.prepare(`
    UPDATE messages SET read = 1
    WHERE receiver_id = ? AND sender_id = ?
  `).run(myId, otherId);

  res.json(messages);
});

// POST /api/messages — send a REST message (fallback when WebSocket unavailable)
router.post('/', authenticate, (req, res) => {
  const { receiver_id, dorm_id, text } = req.body;
  if (!receiver_id || !text) return res.status(400).json({ error: 'receiver_id and text required' });

  const result = db.prepare(
    'INSERT INTO messages (sender_id, receiver_id, dorm_id, text) VALUES (?,?,?,?)'
  ).run(req.user.id, receiver_id, dorm_id || null, text);

  const message = db.prepare(`
    SELECT m.*, u.name as sender_name FROM messages m
    JOIN users u ON u.id = m.sender_id WHERE m.id = ?
  `).get(result.lastInsertRowid);

  res.status(201).json(message);
});

module.exports = router;
