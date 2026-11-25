// Auth : inscription (statut pending — l'admin doit approuver), connexion, /me
const express = require('express');
const { getDb } = require('../db');
const { signToken, hashPassword, checkPassword, publicUser, requireAuth, normalizeTnPhone } = require('../auth');

const router = express.Router();

// Inscription client -> statut "pending". AUCUN accès tant que l'admin n'approuve pas.
router.post('/register', (req, res) => {
  const { name, phone, email, password } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Le nom est obligatoire.' });
  const cleanPhone = normalizeTnPhone(phone);
  if (!cleanPhone) return res.status(400).json({ error: 'Numéro tunisien invalide (8 chiffres, commence par 2, 5 ou 9).' });
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Email invalide.' });
  if (!password || password.length < 6) return res.status(400).json({ error: 'Mot de passe : 6 caractères minimum.' });
  const db = getDb();
  const exists = db.prepare('SELECT id FROM users WHERE email = ? OR phone = ?').get(email.toLowerCase(), cleanPhone);
  if (exists) return res.status(409).json({ error: 'Un compte existe déjà avec cet email ou ce numéro.' });
  const r = db.prepare('INSERT INTO users (name,phone,email,password_hash,role,status) VALUES (?,?,?,?,?,?)')
    .run(name.trim(), cleanPhone, email.toLowerCase(), hashPassword(password), 'client', 'pending');
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(r.lastInsertRowid);
  res.status(201).json({
    message: 'Inscription reçue. Votre compte est en attente de validation par l\'administrateur. Vous pourrez vous connecter après approbation.',
    user: publicUser(user),
  });
});

// Connexion : pending = connexion autorisée (écran d'attente côté front),
// mais aucun accès catalogue/commandes/solde (gates serveur). Rejected et
// suspended restent bloqués (403).
router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis.' });
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).toLowerCase());
  if (!user || !checkPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Email ou mot de passe incorrect.' });
  }
  if (user.status === 'rejected') {
    return res.status(403).json({ error: 'Votre inscription a été refusée. Contactez-nous sur WhatsApp pour plus d\'informations.', status: 'rejected' });
  }
  if (user.status === 'suspended') {
    return res.status(403).json({ error: 'Votre compte est suspendu. Contactez l\'administrateur pour plus d\'informations.', status: 'suspended' });
  }
  if (user.status === 'pending') {
    return res.json({ token: signToken(user), user: publicUser(user),
      message: 'Votre compte est en attente de validation par l\'administrateur.' });
  }
  res.json({ token: signToken(user), user: publicUser(user) });
});

router.get('/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

module.exports = router;
