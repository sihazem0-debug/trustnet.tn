// TuniRecharge — SQLite (node:sqlite, natif Node >= 22, aucune compilation native)
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'tunirecharge.db');
let db;

// ---------------------------------------------------------------------------
// Catalogue — prix en DT TTC, relevés nov. 2026 (voir README § Sources).
// Validités : TT 650 Mo = 7 j ; Ooredoo Flexi+ 25/55 Go = 30 j, 75/100 Go = 60 j,
// 200 Go = 120 j ; Orange Navigui 60 Go = 60 j, 100 Go = 90 j, 200 Go = 120 j.
// ---------------------------------------------------------------------------
const PLANS = [
  // ---- Tunisie Télécom — Internet ----
  { operator: 'tt', type: 'Internet', name_fr: 'Forfait 650 Mo', name_ar: 'باقة 650 ميغا', data_label: '650 Mo', data_mb: 650, validity_days: 7, price: 3, badge: '', image: '/images/tt.svg', featured: 0 },
  { operator: 'tt', type: 'Internet', name_fr: 'Forfait 1.5 Go', name_ar: 'باقة 1.5 جيغا', data_label: '1.5 Go', data_mb: 1536, validity_days: 30, price: 6, badge: '', image: '/images/tt.svg', featured: 0 },
  { operator: 'tt', type: 'Internet', name_fr: 'Forfait 4 Go', name_ar: 'باقة 4 جيغا', data_label: '4 Go', data_mb: 4096, validity_days: 30, price: 10, badge: 'Plus vendu', image: '/images/tt.svg', featured: 1 },
  { operator: 'tt', type: 'Internet', name_fr: 'Forfait 25 Go', name_ar: 'باقة 25 جيغا', data_label: '25 Go', data_mb: 25600, validity_days: 30, price: 30, badge: 'Plus vendu', image: '/images/tt.svg', featured: 1 },
  { operator: 'tt', type: 'Internet', name_fr: 'Forfait 45 Go', name_ar: 'باقة 45 جيغا', data_label: '45 Go', data_mb: 46080, validity_days: 30, price: 50, badge: '', image: '/images/tt.svg', featured: 0 },
  { operator: 'tt', type: 'Internet', name_fr: 'Forfait 60 Go', name_ar: 'باقة 60 جيغا', data_label: '60 Go', data_mb: 61440, validity_days: 60, price: 60, badge: '', image: '/images/tt.svg', featured: 0 },
  { operator: 'tt', type: 'Internet', name_fr: 'Forfait 110 Go', name_ar: 'باقة 110 جيغا', data_label: '110 Go', data_mb: 112640, validity_days: 60, price: 80, badge: 'Promo', image: '/images/tt.svg', featured: 0 },
  { operator: 'tt', type: 'Internet', name_fr: 'Forfait 200 Go', name_ar: 'باقة 200 جيغا', data_label: '200 Go', data_mb: 204800, validity_days: 60, price: 100, badge: '', image: '/images/tt.svg', featured: 0 },
  // ---- Tunisie Télécom — Crédit ----
  ...[5, 10, 20, 50, 100].map(p => ({ operator: 'tt', type: 'Crédit', name_fr: `Crédit ${p} DT`, name_ar: `رصيد ${p} د.ت`, data_label: `${p} DT`, data_mb: 0, validity_days: 0, price: p, badge: '', image: '/images/tt.svg', featured: 0 })),

  // ---- Ooredoo — Flexi / Flexi+ Internet ----
  { operator: 'ooredoo', type: 'Internet', name_fr: 'Flexi 220 Mo', name_ar: 'فليكسي 220 ميغا', data_label: '220 Mo', data_mb: 220, validity_days: 1, price: 1, badge: '', image: '/images/ooredoo.svg', featured: 0 },
  { operator: 'ooredoo', type: 'Internet', name_fr: 'Flexi 1.25 Go', name_ar: 'فليكسي 1.25 جيغا', data_label: '1.25 Go', data_mb: 1280, validity_days: 30, price: 5, badge: '', image: '/images/ooredoo.svg', featured: 0 },
  { operator: 'ooredoo', type: 'Internet', name_fr: 'Flexi 2.8 Go', name_ar: 'فليكسي 2.8 جيغا', data_label: '2.8 Go', data_mb: 2867, validity_days: 30, price: 10, badge: 'Plus vendu', image: '/images/ooredoo.svg', featured: 1 },
  { operator: 'ooredoo', type: 'Internet', name_fr: 'Flexi 6 Go', name_ar: 'فليكسي 6 جيغا', data_label: '6 Go', data_mb: 6144, validity_days: 30, price: 15, badge: '', image: '/images/ooredoo.svg', featured: 0 },
  { operator: 'ooredoo', type: 'Internet', name_fr: 'Flexi+ 25 Go', name_ar: 'فليكسي+ 25 جيغا', data_label: '25 Go', data_mb: 25600, validity_days: 30, price: 25, badge: 'Plus vendu', image: '/images/ooredoo.svg', featured: 1 },
  { operator: 'ooredoo', type: 'Internet', name_fr: 'Flexi+ 55 Go', name_ar: 'فليكسي+ 55 جيغا', data_label: '55 Go', data_mb: 56320, validity_days: 30, price: 50, badge: '', image: '/images/ooredoo.svg', featured: 0 },
  { operator: 'ooredoo', type: 'Internet', name_fr: 'Flexi+ 75 Go', name_ar: 'فليكسي+ 75 جيغا', data_label: '75 Go', data_mb: 76800, validity_days: 60, price: 60, badge: 'Promo', image: '/images/ooredoo.svg', featured: 0 },
  { operator: 'ooredoo', type: 'Internet', name_fr: 'Flexi+ 100 Go', name_ar: 'فليكسي+ 100 جيغا', data_label: '100 Go', data_mb: 102400, validity_days: 60, price: 72, badge: '', image: '/images/ooredoo.svg', featured: 0 },
  { operator: 'ooredoo', type: 'Internet', name_fr: 'Flexi 200 Go', name_ar: 'فليكسي 200 جيغا', data_label: '200 Go', data_mb: 204800, validity_days: 120, price: 100, badge: '', image: '/images/ooredoo.svg', featured: 0 },
  // ---- Ooredoo — Crédit ----
  ...[5, 10, 20, 50, 100].map(p => ({ operator: 'ooredoo', type: 'Crédit', name_fr: `Crédit ${p} DT`, name_ar: `رصيد ${p} د.ت`, data_label: `${p} DT`, data_mb: 0, validity_days: 0, price: p, badge: '', image: '/images/ooredoo.svg', featured: 0 })),

  // ---- Orange — Navigui Internet ----
  { operator: 'orange', type: 'Internet', name_fr: 'Navigui 1.25 Go', name_ar: 'نافيغي 1.25 جيغا', data_label: '1.25 Go', data_mb: 1280, validity_days: 30, price: 5, badge: '', image: '/images/orange.svg', featured: 0 },
  { operator: 'orange', type: 'Internet', name_fr: 'Navigui 4 Go', name_ar: 'نافيغي 4 جيغا', data_label: '4 Go', data_mb: 4096, validity_days: 30, price: 10, badge: 'Plus vendu', image: '/images/orange.svg', featured: 1 },
  { operator: 'orange', type: 'Internet', name_fr: 'Navigui 6 Go', name_ar: 'نافيغي 6 جيغا', data_label: '6 Go', data_mb: 6144, validity_days: 30, price: 15, badge: '', image: '/images/orange.svg', featured: 0 },
  { operator: 'orange', type: 'Internet', name_fr: 'Navigui 25 Go', name_ar: 'نافيغي 25 جيغا', data_label: '25 Go', data_mb: 25600, validity_days: 30, price: 30, badge: 'Plus vendu', image: '/images/orange.svg', featured: 1 },
  { operator: 'orange', type: 'Internet', name_fr: 'Navigui 42 Go', name_ar: 'نافيغي 42 جيغا', data_label: '42 Go', data_mb: 43008, validity_days: 30, price: 46.2, badge: '', image: '/images/orange.svg', featured: 0 },
  { operator: 'orange', type: 'Internet', name_fr: 'Navigui 60 Go', name_ar: 'نافيغي 60 جيغا', data_label: '60 Go', data_mb: 61440, validity_days: 60, price: 60, badge: '', image: '/images/orange.svg', featured: 0 },
  { operator: 'orange', type: 'Internet', name_fr: 'Navigui 100 Go', name_ar: 'نافيغي 100 جيغا', data_label: '100 Go', data_mb: 102400, validity_days: 90, price: 72, badge: 'Promo', image: '/images/orange.svg', featured: 0 },
  { operator: 'orange', type: 'Internet', name_fr: 'Navigui 200 Go', name_ar: 'نافيغي 200 جيغا', data_label: '200 Go', data_mb: 204800, validity_days: 120, price: 100, badge: '', image: '/images/orange.svg', featured: 0 },
  // ---- Orange — Crédit ----
  ...[5, 10, 20, 50, 100].map(p => ({ operator: 'orange', type: 'Crédit', name_fr: `Crédit ${p} DT`, name_ar: `رصيد ${p} د.ت`, data_label: `${p} DT`, data_mb: 0, validity_days: 0, price: p, badge: '', image: '/images/orange.svg', featured: 0 })),
];

const PROMOS = [
  { code: 'BIENVENUE10', percent: 10, max_discount: 5, description_fr: '10% de remise, max 5 DT — première commande', active: 1 },
  { code: 'TUNIRECHARGE5', percent: 5, max_discount: 3, description_fr: '5% de remise, max 3 DT', active: 1 },
];

function initDb() {
  db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'client',
      status TEXT NOT NULL DEFAULT 'pending',
      balance REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operator TEXT NOT NULL, type TEXT NOT NULL,
      name_fr TEXT NOT NULL, name_ar TEXT NOT NULL,
      data_label TEXT NOT NULL, data_mb INTEGER NOT NULL DEFAULT 0,
      validity_days INTEGER NOT NULL DEFAULT 0,
      price REAL NOT NULL, old_price REAL,
      badge TEXT NOT NULL DEFAULT '', image TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1, featured INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      user_id INTEGER REFERENCES users(id),
      plan_id INTEGER NOT NULL REFERENCES plans(id),
      phone TEXT NOT NULL,
      payment_method TEXT NOT NULL,
      payment_ref TEXT NOT NULL DEFAULT '',
      promo_code TEXT NOT NULL DEFAULT '',
      discount REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'Pending',
      scheduled_for TEXT,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS wallet_tx (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      amount REAL NOT NULL,
      kind TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      order_id INTEGER REFERENCES orders(id),
      admin_id INTEGER REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'Completed',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS promos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE, percent REAL NOT NULL,
      max_discount REAL NOT NULL DEFAULT 0,
      description_fr TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      expires_at TEXT
    );
    CREATE TABLE IF NOT EXISTS favorites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      plan_id INTEGER NOT NULL REFERENCES plans(id),
      phone TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, plan_id, phone)
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS price_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id INTEGER NOT NULL REFERENCES plans(id),
      admin_id INTEGER REFERENCES users(id),
      old_level1 REAL, new_level1 REAL,
      old_level2 REAL, new_level2 REAL,
      reason TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS operator_status (
      operator TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'available',
      message TEXT NOT NULL DEFAULT '',
      updated_by INTEGER REFERENCES users(id),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      source TEXT NOT NULL DEFAULT 'admin'
    );
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      subject TEXT NOT NULL, message TEXT NOT NULL,
      order_code TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open',
      admin_reply TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      kind TEXT NOT NULL DEFAULT 'info',
      ref TEXT NOT NULL DEFAULT '',
      message TEXT NOT NULL DEFAULT '',
      read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id INTEGER REFERENCES users(id),
      action TEXT NOT NULL,
      target_type TEXT NOT NULL DEFAULT '',
      target_id INTEGER,
      details TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // --- Migration TRUST NET wholesale (additive only, jamais de DROP) ---
  const addColumn = (table, col, def) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
    if (!cols.includes(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
  };
  addColumn('users', 'pricing_level', "INTEGER NOT NULL DEFAULT 1");
  addColumn('users', 'token_version', 'INTEGER NOT NULL DEFAULT 0');
  addColumn('orders', 'failure_reason', 'TEXT');
  addColumn('operator_status', 'visible', 'INTEGER NOT NULL DEFAULT 1');
  addColumn('plans', 'price_level1', 'REAL');
  addColumn('plans', 'price_level2', 'REAL');
  addColumn('plans', 'cost_price', 'REAL');
  addColumn('orders', 'level_at_order', 'INTEGER');
  addColumn('orders', 'unit_price', 'REAL');
  addColumn('orders', 'cost_total', 'REAL');
  addColumn('orders', 'idempotency_key', 'TEXT');
  addColumn('orders', 'bulk_group_id', 'TEXT');
  addColumn('orders', 'provider_status', "TEXT NOT NULL DEFAULT 'manual'");
  addColumn('orders', 'provider_ref', 'TEXT');
  try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idempotency ON orders(idempotency_key) WHERE idempotency_key IS NOT NULL'); } catch {}

  // Seed plans (une seule fois)
  const planCount = db.prepare('SELECT COUNT(*) c FROM plans').get().c;
  if (planCount === 0) {
    const ins = db.prepare(`INSERT INTO plans (operator,type,name_fr,name_ar,data_label,data_mb,validity_days,price,badge,image,featured,sort_order)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
    PLANS.forEach((p, i) => ins.run(p.operator, p.type, p.name_fr, p.name_ar, p.data_label, p.data_mb, p.validity_days, p.price, p.badge, p.image, p.featured, i));
  }
  // Backfill niveaux de prix — APRÈS le seed (sinon la table est vide sur
  // une base neuve) : L1 = prix public actuel, L2 = +8% (arrondi),
  // coût = prix public par défaut (marge 0 — l'admin saisit le vrai coût).
  // COALESCE : ne touche jamais un prix déjà défini par l'admin.
  db.prepare(`UPDATE plans SET price_level1 = COALESCE(price_level1, price) WHERE price_level1 IS NULL`).run();
  db.prepare(`UPDATE plans SET price_level2 = COALESCE(price_level2, ROUND(price * 1.08 * 100) / 100) WHERE price_level2 IS NULL`).run();
  db.prepare(`UPDATE plans SET cost_price = COALESCE(cost_price, price) WHERE cost_price IS NULL`).run();
  db.prepare(`UPDATE users SET pricing_level = 1 WHERE pricing_level IS NULL OR pricing_level NOT IN (1, 2)`).run();
  // Exemple du cahier des charges : les trois forfaits 25 Go (30 j) à L1 = 25 DT / L2 = 27 DT.
  // Une seule fois : seulement si les prix sont encore les valeurs par défaut
  // issues du backfill (un prix modifié par l'admin n'est jamais écrasé).
  db.prepare(`UPDATE plans SET price_level1 = 25, price_level2 = 27
    WHERE type = 'Internet' AND data_mb = 25600 AND validity_days = 30
    AND operator IN ('tt','ooredoo','orange')
    AND price_level1 = price AND price_level2 = ROUND(price * 1.08 * 100) / 100`).run();
  // Statut opérateurs — géré manuellement par l'admin, jamais une prétention d'API live.
  const opIns = db.prepare(`INSERT OR IGNORE INTO operator_status (operator,status,message,source) VALUES (?,?,?, 'admin')`);
  for (const op of ['tt', 'ooredoo', 'orange']) opIns.run(op, 'available', 'Traitement manuel par Trust Net');
  // Rebranding : le nom du site devient TRUST NET (ancien nom conservé nulle part dans l'UI).
  db.prepare(`UPDATE settings SET value = 'TRUST NET' WHERE key = 'site_name' AND value = 'TuniRecharge'`).run();
  // Seed promos
  const promoCount = db.prepare('SELECT COUNT(*) c FROM promos').get().c;
  if (promoCount === 0) {
    const ins = db.prepare('INSERT INTO promos (code,percent,max_discount,description_fr,active) VALUES (?,?,?,?,?)');
    PROMOS.forEach(p => ins.run(p.code, p.percent, p.max_discount, p.description_fr, p.active));
  }
  // Seed settings
  const defaults = {
    whatsapp_number: process.env.WHATSAPP_NUMBER || '216XXXXXXXX',
    d17_number: process.env.D17_NUMBER || '216XXXXXXXX',
    flouci_number: process.env.FLOUCI_NUMBER || '216XXXXXXXX',
    site_name: 'TRUST NET',
    min_topup: '5',
    announcement_fr: 'Recharge instantanée — Tunisie Télécom, Ooredoo et Orange. Paiement D17, Flouci ou par solde.',
    announcement_ar: 'تعبئة فورية — تونس تيليكوم، أوريدو وأورانج. الدفع عبر D17 أو Flouci أو بالرصيد.',
    announcement_visible: '1',
  };
  const setIns = db.prepare('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)');
  Object.entries(defaults).forEach(([k, v]) => setIns.run(k, v));

  // Seed admin (approuvé d'office). Mot de passe à changer immédiatement.
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@tunirecharge.tn';
  const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
  if (!existing) {
    const hash = bcrypt.hashSync(adminPass, 10);
    db.prepare(`INSERT INTO users (name,phone,email,password_hash,role,status,balance)
      VALUES (?,?,?,?, 'admin','approved',0)`)
      .run('Administrateur', '00000000', adminEmail, hash);
  }
  return db;
}

function getDb() { if (!db) return initDb(); return db; }

/** Crée une notification client (ne jamais faire échouer l'opération appelante). */
function addNotification(dbConn, userId, kind, ref, message) {
  if (!userId) return;
  try {
    dbConn.prepare(`INSERT INTO notifications (user_id,kind,ref,message) VALUES (?,?,?,?)`)
      .run(userId, kind || 'info', String(ref || ''), String(message || '').slice(0, 500));
  } catch {}
}

/** Enregistre une action admin dans le journal d'audit (ne jamais faire échouer l'opération appelante). */
function recordAudit(dbConn, adminId, action, targetType, targetId, details) {
  if (!dbConn) return;
  try {
    dbConn.prepare(`INSERT INTO audit_log (admin_id,action,target_type,target_id,details) VALUES (?,?,?,?,?)`)
      .run(adminId || null, String(action || ''), String(targetType || ''), targetId == null ? null : Number(targetId), String(details || '').slice(0, 1000));
  } catch {}
}

module.exports = { initDb, getDb, PLANS, addNotification, recordAudit };
