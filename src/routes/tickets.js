// Tickets support + notifications (client + admin)
const express = require('express');
const { getDb, addNotification } = require('../db');
const { requireAuth, requireAdmin } = require('../auth');

const router = express.Router();

// ---- Tickets client ----
router.post('/tickets', requireAuth, (req, res) => {
  const { subject, message, order_code } = req.body || {};
  if (!String(subject || '').trim() || !String(message || '').trim()) {
    return res.status(400).json({ error: 'Sujet et message obligatoires.' });
  }
  const db = getDb();
  const r = db.prepare(`INSERT INTO tickets (user_id,subject,message,order_code) VALUES (?,?,?,?)`)
    .run(req.user.id, String(subject).trim().slice(0, 200), String(message).trim().slice(0, 2000), String(order_code || '').trim().toUpperCase());
  res.status(201).json({ message: 'Ticket envoyé. Notre équipe vous répondra rapidement.', id: r.lastInsertRowid });
});
router.get('/tickets/mine', requireAuth, (req, res) => {
  const rows = getDb().prepare('SELECT * FROM tickets WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(req.user.id);
  res.json({ tickets: rows });
});

// ---- Notifications client ----
router.get('/notifications/mine', requireAuth, (req, res) => {
  const rows = getDb().prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(req.user.id);
  const unread = getDb().prepare('SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND read = 0').get(req.user.id).c;
  res.json({ notifications: rows, unread });
});
router.post('/notifications/:id/read', requireAuth, (req, res) => {
  getDb().prepare('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});
router.post('/notifications/read-all', requireAuth, (req, res) => {
  getDb().prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(req.user.id);
  res.json({ ok: true });
});

module.exports = router;
