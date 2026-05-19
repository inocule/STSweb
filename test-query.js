require('dotenv').config();
const { pool } = require('./backend/db/database');

const uid = 1;

pool.query(`
      SELECT
        other_id,
        u.name          AS other_name,
        d.id            AS dorm_id,
        d.name          AS dorm_name,
        d.image_url     AS dorm_image,
        last_message,
        last_time,
        SUM(CASE WHEN m2.read = FALSE AND m2.receiver_id = $1 THEN 1 ELSE 0 END)::int AS unread
      FROM (
        -- One row per conversation partner: the most recent message exchanged
        SELECT DISTINCT ON (LEAST(sender_id, receiver_id), GREATEST(sender_id, receiver_id))
          CASE WHEN sender_id = $2 THEN receiver_id ELSE sender_id END AS other_id,
          dorm_id,
          text        AS last_message,
          created_at  AS last_time
        FROM messages
        WHERE sender_id = $3 OR receiver_id = $4
        ORDER BY LEAST(sender_id, receiver_id),
                 GREATEST(sender_id, receiver_id),
                 created_at DESC
      ) conv
      JOIN users u ON u.id = conv.other_id
      LEFT JOIN dorms d ON d.id = conv.dorm_id
      -- Re-join all messages for this thread to count unread
      JOIN messages m2
        ON (m2.sender_id = $5 OR m2.receiver_id = $6)
        AND (CASE WHEN m2.sender_id = $7 THEN m2.receiver_id ELSE m2.sender_id END) = conv.other_id
      GROUP BY other_id, u.name, d.id, d.name, d.image_url, last_message, last_time
      ORDER BY last_time DESC
`, [uid, uid, uid, uid, uid, uid, uid])
  .then(res => console.log(res.rows))
  .catch(err => console.error("QUERY ERROR:", err.message))
  .finally(() => pool.end());
