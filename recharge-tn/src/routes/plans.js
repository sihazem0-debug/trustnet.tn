// Forfaits : catalogue PRIVÉ (TRUST NET wholesale).
// Accès réservé aux clients approuvés (leur propre niveau de prix uniquement)
// et aux admins (tous les prix + coût). Invités, pending, rejected et
// suspended -> 403. Aucun prix public n'est jamais exposé ici.
const express = require('express');
const { getDb } = require('../db');
const { requireApproved } = require('../auth');

const router = express.Router();
const OPERATORS = {
  tt: { name: 'Tunisie Télécom', short: 'TT', color: '#2563EB' },
  ooredoo: { name: 'Ooredoo', short: 'Ooredoo', color: '#E30613' },
  orange: { name: 'Orange', short: 'Orange', color: '#FF7900' },
};

// Admin OU client approuvé. Invités (sans token), pending, rejected et
// suspended sont refusés avec 403 (accès réservé — pas de catalogue public).
function requireCatalogue(req, res, next) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) {
    return res.status(403).json({ error: 'Accès réservé aux clients approuvés. Connectez-vous ou créez un compte.' });
  }
  const jwt = require('jsonwebtoken');
  let payload;
  try { payload = jwt.verify(h.slice(7), process.env.JWT_SECRET || 'tunirecharge-dev-secret-change-me'); }
  catch { return res.status(403).json({ error: 'Accès réservé aux clients approuvés. Connectez-vous ou créez un compte.' }); }
  const u = getDb().prepare('SELECT * FROM users WHERE id = ?').get(payload.id);
  if (!u) return res.status(403).json({ error: 'Accès réservé aux clients approuvés.' });
  const tokenV = payload.v === undefined || payload.v === null ? 0 : payload.v;
  if (tokenV !== (u.token_version || 0)) {
    return res.status(401).json({ error: 'Session révoquée. Veuillez vous reconnecter.' });
  }
  req.user = u;
  if (u.role === 'admin') return next();
  return requireApproved(req, res, next);
}

function viewerOf(req) {
  const u = req.user;
  if (u.role === 'admin') return { role: 'admin', level: null, user: u };
  return { role: 'client', level: (u.pricing_level === 2 ? 2 : 1), user: u };
}

function levelPrice(plan, viewer) {
  if (viewer.role === 'admin') return plan.price;
  return viewer.level === 2 ? (plan.price_level2 ?? plan.price) : (plan.price_level1 ?? plan.price);
}

function pricePerGb(plan, price) {
  if (!plan.data_mb || plan.data_mb <= 0) return null;
  return Math.round((price / (plan.data_mb / 1024)) * 1000) / 1000;
}

function planRow(p, viewer) {
  const price = levelPrice(p, viewer);
  const row = {
    id: p.id, operator: p.operator, type: p.type,
    name_fr: p.name_fr, name_ar: p.name_ar,
    data_label: p.data_label, data_mb: p.data_mb,
    validity_days: p.validity_days,
    price, // <- SEUL prix visible pour un client : celui de son niveau
    old_price: p.old_price, badge: p.badge, image: p.image,
    active: p.active, featured: p.featured, sort_order: p.sort_order,
    operator_name: OPERATORS[p.operator]?.name || p.operator,
    operator_color: OPERATORS[p.operator]?.color || '#FF1E2D',
    price_per_gb: pricePerGb(p, price),
  };
  if (viewer.role === 'client') row.pricing_level = viewer.level;
  if (viewer.role === 'admin') {
    row.price_level1 = p.price_level1; row.price_level2 = p.price_level2;
    row.cost_price = p.cost_price; row.public_price = p.price;
  }
  return row;
}

function operatorStatusMap(db) {
  const rows = db.prepare('SELECT * FROM operator_status').all();
  const map = {};
  for (const r of rows) map[r.operator] = { status: r.status, message: r.message, updated_at: r.updated_at, visible: r.visible ?? 1 };
  return map;
}

// GET /api/plans — catalogue privé
router.get('/', requireCatalogue, (req, res) => {
  const { operator, type, q, min, max, sort, featured, min_gb, max_gb, validity_days } = req.query;
  const db = getDb();
  const viewer = viewerOf(req);
  // Colonne de prix utilisée pour filtres/tri : celle du niveau du client.
  const priceCol = viewer.role === 'admin' ? 'price'
    : viewer.level === 2 ? 'COALESCE(price_level2, price)' : 'COALESCE(price_level1, price)';
  let sql = 'SELECT * FROM plans WHERE active = 1';
  const params = [];
  if (operator) {
    const ops = String(operator).split(',').map(s => s.trim()).filter(s => OPERATORS[s]);
    if (ops.length) { sql += ` AND operator IN (${ops.map(() => '?').join(',')})`; params.push(...ops); }
  }
  if (type && ['Internet', 'Crédit', 'Mixte'].includes(type)) { sql += ' AND type = ?'; params.push(type); }
  if (q) { sql += ' AND (name_fr LIKE ? OR name_ar LIKE ? OR data_label LIKE ?)'; params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (min !== undefined && min !== '') { sql += ` AND ${priceCol} >= ?`; params.push(Number(min)); }
  if (max !== undefined && max !== '') { sql += ` AND ${priceCol} <= ?`; params.push(Number(max)); }
  if (min_gb !== undefined && min_gb !== '') { sql += ' AND data_mb >= ?'; params.push(Number(min_gb) * 1024); }
  if (max_gb !== undefined && max_gb !== '') { sql += ' AND data_mb <= ?'; params.push(Number(max_gb) * 1024); }
  if (validity_days !== undefined && validity_days !== '') { sql += ' AND validity_days = ?'; params.push(Number(validity_days)); }
  if (featured === '1') sql += ' AND featured = 1';
  const sorts = { price_asc: `${priceCol} ASC`, price_desc: `${priceCol} DESC`, data_desc: 'data_mb DESC', popular: 'featured DESC, price ASC' };
  sql += ' ORDER BY ' + (sorts[sort] || 'sort_order ASC');
  const statuses = operatorStatusMap(db);
  res.json({
    operators: OPERATORS,
    operator_status: statuses,
    pricing_level: viewer.role === 'client' ? viewer.level : null,
    plans: db.prepare(sql).all(...params).map(p => ({ ...planRow(p, viewer), operator_status: statuses[p.operator]?.status || 'available' })),
  });
});

// Comparateur : GET /api/plans/compare?ids=1,2,3 (max 4)
router.get('/compare', requireCatalogue, (req, res) => {
  const ids = String(req.query.ids || '').split(',').map(Number).filter(Boolean).slice(0, 4);
  if (!ids.length) return res.status(400).json({ error: 'Aucun forfait à comparer.' });
  const db = getDb();
  const viewer = viewerOf(req);
  const statuses = operatorStatusMap(db);
  const rows = db.prepare(`SELECT * FROM plans WHERE id IN (${ids.map(() => '?').join(',')}) AND active = 1`).all(...ids);
  const byId = new Map(rows.map(r => [r.id, r]));
  const plans = ids.map(id => byId.get(id)).filter(Boolean).map(p => ({
    ...planRow(p, viewer),
    operator_status: statuses[p.operator]?.status || 'available',
    availability: (statuses[p.operator]?.status || 'available') === 'available' ? 'Disponible' : (statuses[p.operator]?.message || 'Indisponible'),
  }));
  const validities = [...new Set(plans.map(p => p.validity_days))];
  const validity_mismatch = validities.length > 1;
  res.json({
    plans,
    validity_mismatch,
    warning: validity_mismatch
      ? 'Attention : ces forfaits n\'ont pas la même durée de validité — ils ne sont pas directement comparables (prix par Go et durée différents).'
      : null,
  });
});

router.get('/:id', requireCatalogue, (req, res) => {
  const viewer = viewerOf(req);
  const p = getDb().prepare('SELECT * FROM plans WHERE id = ? AND active = 1').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Forfait introuvable.' });
  res.json({ plan: planRow(p, viewer) });
});

module.exports = router;
