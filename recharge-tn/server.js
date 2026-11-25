// TRUST NET — serveur Express (anciennement TuniRecharge)
try { require('dotenv').config(); } catch { /* dotenv optionnel */ }
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDb, getDb } = require('./src/db');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
initDb();

app.get('/api/health', (req, res) => res.json({ ok: true, app: 'TRUST NET', version: '2.0.0' }));

// Config publique (numéros de paiement + WhatsApp, modifiables dans l'admin).
// L'annonce n'est incluse que si announcement_visible = '1'.
app.get('/api/config', (req, res) => {
  const rows = getDb().prepare("SELECT key,value FROM settings WHERE key IN ('whatsapp_number','d17_number','flouci_number','site_name','announcement_fr','announcement_ar','announcement_visible')").all();
  const cfg = Object.fromEntries(rows.map(r => [r.key, r.value]));
  if (cfg.announcement_visible !== '1') { delete cfg.announcement_fr; delete cfg.announcement_ar; }
  delete cfg.announcement_visible;
  res.json({ ...cfg, currency: 'TND' });
});

// Statut des opérateurs (géré manuellement par l'admin — jamais un statut live)
app.get('/api/operators', (req, res) => {
  const rows = getDb().prepare('SELECT operator, status, message, visible, updated_at FROM operator_status ORDER BY operator').all();
  res.json({ operators: rows });
});

app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/plans', require('./src/routes/plans'));
app.use('/api/orders', require('./src/routes/orders'));
app.use('/api/wallet', require('./src/routes/wallet'));
app.use('/api', require('./src/routes/tickets'));
app.use('/api/admin', require('./src/routes/admin'));

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`TRUST NET en ligne sur http://localhost:${PORT}`));
module.exports = app;
