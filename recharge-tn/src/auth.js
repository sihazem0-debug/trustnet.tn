// TuniRecharge — auth JWT + rôles
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { getDb } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'tunirecharge-dev-secret-change-me';
const JWT_EXPIRES = '7d';

function signToken(user) {
  return jwt.sign({ id: user.id, email: user.email, role: user.role, status: user.status, v: user.token_version || 0 }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}
function hashPassword(pw) { return bcrypt.hashSync(pw, 10); }
function checkPassword(pw, hash) { return bcrypt.compareSync(pw, hash); }

function publicUser(u) {
  if (!u) return null;
  return { id: u.id, name: u.name, phone: u.phone, email: u.email, role: u.role, status: u.status, balance: u.balance, pricing_level: u.pricing_level || 1, created_at: u.created_at };
}

function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Non connecté. Veuillez vous connecter.' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = getDb().prepare('SELECT * FROM users WHERE id = ?').get(payload.id);
    if (!user) return res.status(401).json({ error: 'Compte introuvable.' });
    // Session coupée sur rejet / suspension : token_version incrémenté.
    const tokenV = payload.v === undefined || payload.v === null ? 0 : payload.v;
    if (tokenV !== (user.token_version || 0)) {
      return res.status(401).json({ error: 'Session révoquée. Veuillez vous reconnecter.' });
    }
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Session expirée. Veuillez vous reconnecter.' });
  }
}

function requireApproved(req, res, next) {
  if (req.user.status !== 'approved') {
    return res.status(403).json({ error: 'Compte en attente de validation par l\'administrateur.' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Accès administrateur requis.' });
  next();
}

/** Numéro tunisien : 8 chiffres, commence par 2, 5 ou 9. Accepte +216 / 216 / espaces. */
function normalizeTnPhone(raw) {
  if (!raw) return null;
  const d = String(raw).replace(/[\s.\-()]/g, '').replace(/^\+?216/, '');
  return /^[259]\d{7}$/.test(d) ? d : null;
}

module.exports = { signToken, hashPassword, checkPassword, publicUser, requireAuth, requireApproved, requireAdmin, normalizeTnPhone };
