// routes/messages.js — Message history REST endpoints (PostgreSQL async)
const express = require('express');
const { pool } = require('../db/database');
const { authenticate } = require('../middleware/authenticate');

const router = express.Router();

// GET /api/messages/conversations
router.get('/conversations', authenticate, async (req, res) => {
  try {
    const uid = req.user.id;
    const { rows } = await pool.query(`
      SELECT
        CASE WHEN m.sender_id = $1 THEN m.receiver_id ELSE m.sender_id END AS other_id,
        u.name  AS other_name,
        d.id    AS dorm_id,
        d.name  AS dorm_name,
        d.image_url AS dorm_image,
        m.text  AS last_message,
        m.created_at AS last_time,
        SUM(CASE WHEN m.read = FALSE AND m.receiver_id = $2 THEN 1 ELSE 0 END)::int AS unread
      FROM messages m
      JOIN users u ON u.id = (CASE WHEN m.sender_id = $3 THEN m.receiver_id ELSE m.sender_id END)
      LEFT JOIN dorms d ON d.id = m.dorm_id
      WHERE m.sender_id = $4 OR m.receiver_id = $5
      GROUP BY other_id, u.name, dorm_id, d.name, d.image_url, m.text, m.created_at
      ORDER BY last_time DESC
    `, [uid, uid, uid, uid, uid]);
    res.json(rows);
  } catch (err) {
    console.error('[messages/conversations]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/messages/:userId?dormId=X
router.get('/:userId', authenticate, async (req, res) => {
  try {
    const { dormId } = req.query;
    const myId    = req.user.id;
    const otherId = Number(req.params.userId);

    let messages;
    if (dormId) {
      const { rows } = await pool.query(`
        SELECT m.*, u.name AS sender_name
        FROM messages m JOIN users u ON u.id = m.sender_id
        WHERE dorm_id = $1
          AND ((sender_id = $2 AND receiver_id = $3) OR (sender_id = $3 AND receiver_id = $2))
        ORDER BY created_at ASC
      `, [dormId, myId, otherId]);
      messages = rows;
    } else {
      const { rows } = await pool.query(`
        SELECT m.*, u.name AS sender_name
        FROM messages m JOIN users u ON u.id = m.sender_id
        WHERE (sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1)
        ORDER BY created_at ASC
      `, [myId, otherId]);
      messages = rows;
    }

    // Mark as read
    await pool.query(
      'UPDATE messages SET read = TRUE WHERE receiver_id = $1 AND sender_id = $2',
      [myId, otherId]
    );

    res.json(messages);
  } catch (err) {
    console.error('[messages/GET /:userId]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/messages
router.post('/', authenticate, async (req, res) => {
  try {
    const { receiver_id, dorm_id, text } = req.body;
    if (!receiver_id || !text)
      return res.status(400).json({ error: 'receiver_id and text required' });

    const { rows: [message] } = await pool.query(`
      WITH ins AS (
        INSERT INTO messages (sender_id, receiver_id, dorm_id, text)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      )
      SELECT ins.*, u.name AS sender_name
      FROM ins JOIN users u ON u.id = ins.sender_id
    `, [req.user.id, receiver_id, dorm_id || null, text]);

    res.status(201).json(message);
  } catch (err) {
    console.error('[messages/POST /]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
