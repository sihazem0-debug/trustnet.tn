// Solde / wallet : consultation, historique, demande de recharge de solde
// (le client paie D17/Flouci puis l'admin confirme et crédite le solde).
const express = require('express');
const { getDb } = require('../db');
const { requireAuth, requireApproved } = require('../auth');

const router = express.Router();

// Solde + historique (client approuvé uniquement)
router.get('/', requireAuth, requireApproved, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT balance FROM users WHERE id = ?').get(req.user.id);
  const tx = db.prepare(`SELECT w.*, u.name AS admin_name FROM wallet_tx w
    LEFT JOIN users u ON u.id = w.admin_id WHERE w.user_id = ? ORDER BY w.created_at DESC LIMIT 100`).all(req.user.id);
  res.json({ balance: user.balance, transactions: tx });
});

// Demande de recharge de solde : le client déclare son paiement D17/Flouci,
// l'admin le confirme dans le dashboard -> solde crédité.
router.post('/topup-request', requireAuth, requireApproved, (req, res) => {
  const { amount, payment_method, payment_ref } = req.body || {};
  const amt = Number(amount);
  const db = getDb();
  const min = Number(db.prepare("SELECT value FROM settings WHERE key='min_topup'").get()?.value || 5);
  if (!amt || amt < min) return res.status(400).json({ error: `Montant minimum de recharge de solde : ${min} DT.` });
  if (!['d17', 'flouci', 'manual'].includes(payment_method)) return res.status(400).json({ error: 'Moyen de paiement invalide.' });
  if (!String(payment_ref || '').trim()) return res.status(400).json({ error: 'Référence de paiement obligatoire.' });
  db.prepare(`INSERT INTO wallet_tx (user_id,amount,kind,reason,admin_id,status)
    VALUES (?,?,?,?,NULL,?)`).run(req.user.id, amt, 'top_up',
    `Demande de recharge solde via ${payment_method.toUpperCase()} — réf: ${String(payment_ref).trim()}`, 'Pending');
  res.status(201).json({ message: 'Demande envoyée. Votre solde sera crédité après confirmation de l\'administrateur.' });
});

// Notifications : table notifications (créées sur commande, solde, opérateur, ticket)
router.get('/notifications', requireAuth, (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(req.user.id);
  const unread = db.prepare('SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND read = 0').get(req.user.id).c;
  res.json({ notifications: rows.map(n => ({ ...n, status: n.message })), unread });
});

module.exports = router;
