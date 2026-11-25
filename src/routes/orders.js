// Commandes : clients APPROUVÉS uniquement (TRUST NET wholesale privé).
// Aucune commande invité. Prix par niveau (L1/L2), commande rapide, commande
// groupée, prévention des doublons (idempotency_key + fenêtre 5 min),
// export CSV, statut fournisseur 'manual' (aucune activation simulée).
const express = require('express');
const { getDb, addNotification } = require('../db');
const { requireAuth, requireApproved, normalizeTnPhone } = require('../auth');

const router = express.Router();
const PAYMENTS = ['wallet', 'd17', 'flouci', 'manual'];
const STATUSES = ['Pending', 'Processing', 'Completed', 'Failed', 'Cancelled', 'Scheduled'];

function orderCode() {
  return 'TR-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
}
function bulkGroupId() {
  return 'BG-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
}

function applyPromo(db, code, price) {
  if (!code) return { discount: 0, code: '' };
  const promo = db.prepare('SELECT * FROM promos WHERE code = ? AND active = 1').get(String(code).trim().toUpperCase());
  if (!promo) return { error: 'Code promo invalide ou expiré.' };
  if (promo.expires_at && new Date(promo.expires_at) < new Date()) return { error: 'Code promo expiré.' };
  const discount = Math.min(price * (promo.percent / 100), promo.max_discount || Infinity);
  return { discount: Math.round(discount * 1000) / 1000, code: promo.code };
}

/** Prix applicable : niveau du client approuvé. Le prix envoyé par le
 *  client est TOUJOURS ignoré (calcul serveur). */
function resolvePrice(plan, user) {
  const lvl = user && user.pricing_level === 2 ? 2 : 1;
  const p = lvl === 2 ? (plan.price_level2 ?? plan.price) : (plan.price_level1 ?? plan.price);
  return { unit: p, level: lvl };
}

function orderWithPlan(db, code) {
  return db.prepare(`SELECT o.*, p.name_fr AS plan_name, p.operator, p.data_label, p.type
    FROM orders o JOIN plans p ON p.id = o.plan_id WHERE o.code = ?`).get(code);
}

function err(status, message) { const e = new Error(message); e.status = status; return e; }

/** Création d'une commande (transaction). Lance une erreur {status,message}. */
function createOrderInternal(db, opts) {
  const { user, plan, phone, payment_method, payment_ref, promo_code, scheduled_for, note,
    idempotency_key, bulk_group_id, allow_repeat } = opts;

  // Doublon par clé d'idempotence : on renvoie la commande existante, sans
  // créer ni débiter une seconde fois.
  if (idempotency_key) {
    const existing = db.prepare(`SELECT o.*, p.name_fr AS plan_name, p.operator, p.data_label, p.type
      FROM orders o JOIN plans p ON p.id = o.plan_id WHERE o.idempotency_key = ?`).get(idempotency_key);
    if (existing) { existing.duplicate = true; return existing; }
  }
  // Doublon récent (même client + même forfait + même numéro < 5 min).
  if (!allow_repeat) {
    const dup = db.prepare(`SELECT code FROM orders WHERE user_id = ? AND plan_id = ? AND phone = ? AND status != 'Cancelled' AND created_at >= datetime('now','-5 minutes') ORDER BY id DESC LIMIT 1`).get(user.id, plan.id, phone);
    if (dup) throw err(409, `Commande identique déjà créée il y a moins de 5 minutes (${dup.code}). Utilisez « Répéter » ou attendez.`);
  }

  const { unit, level } = resolvePrice(plan, user);
  const promo = applyPromo(db, promo_code, unit);
  if (promo.error) throw err(400, promo.error);
  const total = Math.round((unit - promo.discount) * 1000) / 1000;
  const cost_total = Math.round(((plan.cost_price ?? plan.price)) * 1000) / 1000;

  let scheduled = null;
  if (scheduled_for) {
    const d = new Date(scheduled_for);
    if (isNaN(d) || d <= new Date()) throw err(400, 'Date de recharge programmée invalide (doit être dans le futur).');
    scheduled = d.toISOString();
  }
  const code = orderCode();
  const status = scheduled ? 'Scheduled' : (payment_method === 'wallet' ? 'Processing' : 'Pending');

  try {
    db.exec('BEGIN');
    if (payment_method === 'wallet') {
      const fresh = db.prepare('SELECT balance FROM users WHERE id = ?').get(user.id);
      if (fresh.balance < total) { db.exec('ROLLBACK'); throw err(400, `Solde insuffisant (${fresh.balance} DT). Rechargez votre solde ou choisissez D17 / Flouci.`); }
      db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(total, user.id);
    }
    const r = db.prepare(`INSERT INTO orders (code,user_id,plan_id,phone,payment_method,payment_ref,promo_code,discount,total,status,scheduled_for,note,level_at_order,unit_price,cost_total,idempotency_key,bulk_group_id,provider_status,provider_ref)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(code, user.id, plan.id, phone, payment_method, String(payment_ref || '').trim(),
        promo.code, promo.discount, total, status, scheduled, String(note || '').slice(0, 200),
        level, unit, cost_total, idempotency_key || null, bulk_group_id || null, 'manual', null);
    if (payment_method === 'wallet') {
      db.prepare(`INSERT INTO wallet_tx (user_id,amount,kind,reason,order_id,status) VALUES (?,?,?,?,?,?)`)
        .run(user.id, -total, 'purchase', `Achat ${plan.name_fr} — ${phone}`, r.lastInsertRowid, 'Completed');
    }
    db.exec('COMMIT');
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch {}
    if (e.status) throw e;
    if (String(e.message || '').includes('UNIQUE constraint failed: orders.idempotency_key')) {
      const existing = db.prepare(`SELECT o.*, p.name_fr AS plan_name, p.operator, p.data_label, p.type FROM orders o JOIN plans p ON p.id = o.plan_id WHERE o.idempotency_key = ?`).get(idempotency_key);
      if (existing) { existing.duplicate = true; return existing; }
    }
    throw err(500, 'Erreur lors de la création de la commande.');
  }
  const order = orderWithPlan(db, code);
  addNotification(db, user.id, 'order', code, `Commande ${code} créée — ${plan.name_fr} (${phone}) : ${order.total} DT — statut ${order.status}.`);
  return order;
}

function checkOperatorAvailable(db, operator) {
  const st = db.prepare('SELECT * FROM operator_status WHERE operator = ?').get(operator);
  if (st && st.status !== 'available') {
    throw err(503, st.message || `Opérateur ${operator} temporairement indisponible.`);
  }
}

function validateOrderInput(db, body, user) {
  const { plan_id, phone, payment_method, payment_ref } = body || {};
  const plan = db.prepare('SELECT * FROM plans WHERE id = ? AND active = 1').get(plan_id);
  if (!plan) throw err(404, 'Forfait introuvable ou indisponible.');
  checkOperatorAvailable(db, plan.operator);
  const cleanPhone = normalizeTnPhone(phone);
  if (!cleanPhone) throw err(400, 'Numéro tunisien invalide (8 chiffres, commence par 2, 5 ou 9).');
  if (!PAYMENTS.includes(payment_method)) throw err(400, 'Moyen de paiement invalide.');
  if (payment_method === 'wallet' && !user) throw err(401, 'Connectez-vous pour payer avec votre solde.');
  if ((payment_method === 'd17' || payment_method === 'flouci') && !String(payment_ref || '').trim()) {
    throw err(400, 'Référence de paiement obligatoire (numéro de transaction D17 / Flouci).');
  }
  return { plan, cleanPhone };
}

// Vérifier un code promo sans commander (client approuvé uniquement)
router.post('/promo-check', requireAuth, requireApproved, (req, res) => {
  const { code, price } = req.body || {};
  const db = getDb();
  const r = applyPromo(db, code, Number(price) || 0);
  if (r.error) return res.status(400).json({ error: r.error });
  res.json({ code: r.code, discount: r.discount, total: Math.max(0, (Number(price) || 0) - r.discount) });
});

// Créer une commande (client approuvé uniquement)
router.post('/', requireAuth, requireApproved, (req, res) => {
  const db = getDb();
  const user = req.user;
  try {
    const { plan, cleanPhone } = validateOrderInput(db, req.body, user);
    const { promo_code, scheduled_for, note, idempotency_key, allow_repeat } = req.body || {};
    const order = createOrderInternal(db, {
      user, plan, phone: cleanPhone, payment_method: req.body.payment_method,
      payment_ref: req.body.payment_ref, promo_code, scheduled_for, note, idempotency_key, allow_repeat: !!allow_repeat,
    });
    const wa = db.prepare("SELECT value FROM settings WHERE key = 'whatsapp_number'").get();
    res.status(order.duplicate ? 200 : 201).json({ message: order.duplicate ? 'Commande déjà créée (doublon ignoré).' : (order.status === 'Scheduled' ? 'Recharge programmée.' : 'Commande créée.'), duplicate: !!order.duplicate, order, whatsapp_number: wa?.value || '' });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// Commande rapide : un forfait, un numéro, un paiement (client approuvé).
router.post('/quick', requireAuth, requireApproved, (req, res) => {
  const db = getDb();
  const user = req.user;
  try {
    const { plan, cleanPhone } = validateOrderInput(db, req.body, user);
    const { promo_code, scheduled_for, idempotency_key, allow_repeat } = req.body || {};
    const order = createOrderInternal(db, {
      user, plan, phone: cleanPhone, payment_method: req.body.payment_method,
      payment_ref: req.body.payment_ref, promo_code, scheduled_for, idempotency_key, allow_repeat: !!allow_repeat,
    });
    res.status(order.duplicate ? 200 : 201).json({ message: order.duplicate ? 'Commande déjà créée (doublon ignoré).' : 'Commande rapide créée.', duplicate: !!order.duplicate, order });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// Commande groupée : un forfait, plusieurs numéros — un ordre par numéro,
// statut individuel par numéro, les numéros invalides n'annulent pas le lot.
router.post('/bulk', requireAuth, requireApproved, (req, res) => {
  const db = getDb();
  const { plan_id, phones, payment_method, payment_ref, promo_code, idempotency_key } = req.body || {};
  const plan = db.prepare('SELECT * FROM plans WHERE id = ? AND active = 1').get(plan_id);
  if (!plan) return res.status(404).json({ error: 'Forfait introuvable ou indisponible.' });
  try { checkOperatorAvailable(db, plan.operator); } catch (e) { return res.status(e.status || 500).json({ error: e.message }); }
  if (!Array.isArray(phones) || !phones.length) return res.status(400).json({ error: 'Liste de numéros vide (un numéro par ligne).' });
  if (phones.length > 100) return res.status(400).json({ error: 'Maximum 100 numéros par commande groupée.' });
  if (!PAYMENTS.includes(payment_method)) return res.status(400).json({ error: 'Moyen de paiement invalide.' });
  if ((payment_method === 'd17' || payment_method === 'flouci') && !String(payment_ref || '').trim()) {
    return res.status(400).json({ error: 'Référence de paiement obligatoire (numéro de transaction D17 / Flouci).' });
  }
  const groupId = idempotency_key ? 'BG-' + String(idempotency_key).slice(0, 40) : bulkGroupId();
  const already = db.prepare('SELECT code, phone FROM orders WHERE bulk_group_id = ?').all(groupId);
  if (already.length) {
    return res.json({ duplicate: true, bulk_group_id: groupId, results: already.map(o => ({ phone: o.phone, ok: true, code: o.code })), succeeded: already.length, failed: 0, total: 0 });
  }
  // Vérification du solde total avant de commencer (paiement par solde).
  const { unit } = resolvePrice(plan, req.user);
  const promo = applyPromo(db, promo_code, unit);
  if (promo.error) return res.status(400).json({ error: promo.error });
  const perOrder = Math.round((unit - promo.discount) * 1000) / 1000;
  const validPhones = phones.map(p => normalizeTnPhone(p)).filter(Boolean);
  if (payment_method === 'wallet') {
    const fresh = db.prepare('SELECT balance FROM users WHERE id = ?').get(req.user.id);
    if (fresh.balance < perOrder * validPhones.length) {
      return res.status(400).json({ error: `Solde insuffisant (${fresh.balance} DT) pour ${validPhones.length} recharge(s) à ${perOrder} DT.` });
    }
  }
  const results = [];
  let total = 0;
  for (const raw of phones) {
    const cleanPhone = normalizeTnPhone(raw);
    if (!cleanPhone) { results.push({ phone: String(raw), ok: false, error: 'Numéro tunisien invalide (8 chiffres, commence par 2, 5 ou 9).' }); continue; }
    try {
      const order = createOrderInternal(db, {
        user: req.user, plan, phone: cleanPhone, payment_method,
        payment_ref, promo_code, bulk_group_id: groupId,
        idempotency_key: groupId + ':' + cleanPhone, allow_repeat: true,
      });
      total = Math.round((total + order.total) * 1000) / 1000;
      results.push({ phone: cleanPhone, ok: true, code: order.code, total: order.total });
    } catch (e) { results.push({ phone: cleanPhone, ok: false, error: e.message }); }
  }
  const succeeded = results.filter(r => r.ok).length;
  res.status(201).json({ bulk_group_id: groupId, results, succeeded, failed: results.length - succeeded, total });
});

// Suivi par code — authentifié, propriétaire ou admin uniquement
router.get('/track/:code', requireAuth, (req, res) => {
  const o = getDb().prepare(`SELECT o.*, p.name_fr AS plan_name, p.operator, p.data_label, p.type, p.image
    FROM orders o JOIN plans p ON p.id = o.plan_id WHERE o.code = ?`).get(req.params.code.toUpperCase());
  if (!o) return res.status(404).json({ error: 'Commande introuvable. Vérifiez le code (ex. TR-XXXXXX).' });
  if (req.user.role !== 'admin' && o.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Cette commande ne vous appartient pas.' });
  }
  res.json({ order: o });
});

function mineQuery(req) {
  const { status, operator, q, from, to } = req.query;
  let sql = `SELECT o.*, p.name_fr AS plan_name, p.operator, p.data_label, p.type, p.image
    FROM orders o JOIN plans p ON p.id = o.plan_id WHERE o.user_id = ?`;
  const params = [req.user.id];
  if (status && STATUSES.includes(status)) { sql += ' AND o.status = ?'; params.push(status); }
  if (operator && ['tt', 'ooredoo', 'orange'].includes(operator)) { sql += ' AND p.operator = ?'; params.push(operator); }
  if (q) { sql += ' AND (o.code LIKE ? OR o.phone LIKE ? OR p.name_fr LIKE ?)'; params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (from) { sql += ' AND date(o.created_at) >= ?'; params.push(from); }
  if (to) { sql += ' AND date(o.created_at) <= ?'; params.push(to); }
  sql += ' ORDER BY o.created_at DESC LIMIT 200';
  return { sql, params };
}

function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function ordersCsv(rows) {
  const header = ['Code', 'Date', 'Forfait', 'Operateur', 'Numero', 'Niveau', 'Prix unitaire', 'Remise', 'Total', 'Cout', 'Paiement', 'Statut', 'Motif', 'Groupe'];
  const lines = [header.join(';')];
  for (const o of rows) {
    lines.push([o.code, o.created_at, o.plan_name, o.operator, o.phone, o.level_at_order || '',
      o.unit_price ?? o.total, o.discount || 0, o.total, o.cost_total ?? '', o.payment_method, o.status, o.failure_reason || '', o.bulk_group_id || ''].map(csvEscape).join(';'));
  }
  return '\uFEFF' + lines.join('\r\n');
}

// Mes commandes (client approuvé) + filtres
router.get('/mine', requireAuth, requireApproved, (req, res) => {
  const { sql, params } = mineQuery(req);
  res.json({ orders: getDb().prepare(sql).all(...params) });
});
router.get('/mine/export', requireAuth, requireApproved, (req, res) => {
  const { sql, params } = mineQuery(req);
  const rows = getDb().prepare(sql).all(...params);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="trust-net-mes-commandes.csv"');
  res.send(ordersCsv(rows));
});

// Répéter une commande — au prix du niveau ACTUEL, nouveau code.
router.post('/:id/repeat', requireAuth, requireApproved, (req, res) => {
  const db = getDb();
  const old = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!old) return res.status(404).json({ error: 'Commande introuvable.' });
  const plan = db.prepare('SELECT * FROM plans WHERE id = ? AND active = 1').get(old.plan_id);
  if (!plan) return res.status(400).json({ error: 'Ce forfait n\'est plus disponible.' });
  try {
    checkOperatorAvailable(db, plan.operator);
    const { unit, level } = resolvePrice(plan, req.user);
    const code = orderCode();
    const cost_total = Math.round(((plan.cost_price ?? plan.price)) * 1000) / 1000;
    db.prepare(`INSERT INTO orders (code,user_id,plan_id,phone,payment_method,payment_ref,total,status,level_at_order,unit_price,cost_total,provider_status)
      VALUES (?,?,?,?,?,?,?, 'Pending', ?, ?, ?, 'manual')`)
      .run(code, req.user.id, plan.id, old.phone, 'manual', '', unit, level, unit, cost_total);
    const order = orderWithPlan(db, code);
    addNotification(db, req.user.id, 'order', code, `Commande répétée ${code} — ${plan.name_fr} (${old.phone}) : ${unit} DT.`);
    res.status(201).json({ message: 'Commande répétée. Choisissez le paiement pour la valider.', code, order });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// Favoris (client approuvé)
router.get('/favorites', requireAuth, requireApproved, (req, res) => {
  const rows = getDb().prepare(`SELECT f.*, p.name_fr AS plan_name, p.operator, p.data_label, p.type, p.price, p.image
    FROM favorites f JOIN plans p ON p.id = f.plan_id WHERE f.user_id = ? ORDER BY f.created_at DESC`).all(req.user.id);
  res.json({ favorites: rows });
});
router.post('/favorites', requireAuth, requireApproved, (req, res) => {
  const { plan_id, phone } = req.body || {};
  const db = getDb();
  const plan = db.prepare('SELECT id FROM plans WHERE id = ? AND active = 1').get(plan_id);
  if (!plan) return res.status(404).json({ error: 'Forfait introuvable.' });
  const cleanPhone = phone ? normalizeTnPhone(phone) : '';
  if (phone && !cleanPhone) return res.status(400).json({ error: 'Numéro tunisien invalide.' });
  try {
    db.prepare('INSERT INTO favorites (user_id,plan_id,phone) VALUES (?,?,?)').run(req.user.id, plan.id, cleanPhone || '');
  } catch { return res.status(409).json({ error: 'Déjà dans vos favoris.' }); }
  res.status(201).json({ message: 'Ajouté aux favoris.' });
});
router.delete('/favorites/:id', requireAuth, requireApproved, (req, res) => {
  getDb().prepare('DELETE FROM favorites WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ message: 'Favori supprimé.' });
});

module.exports = router;
module.exports._ordersCsv = ordersCsv;
