// TRUST NET — intégration fournisseurs (architecture modulaire, prête pour l'avenir).
// AUCUNE transaction télécom n'est simulée : par défaut tout passe par le
// traitement manuel (ManualProvider). Un fournisseur automatique ne s'active
// que si un compte marchand autorisé est configuré (env) ET que son adaptateur
// est implémenté — sinon il reste désactivé et lève 'not configured'.
const { getDb } = require('./db');

const ManualProvider = {
  name: 'manual',
  enabled: true,
  description: 'Traitement manuel par Trust Net — aucune API télécom.',
  async execute(order) {
    // On ne fait que mettre l'ordre en file manuelle : l'admin l'active.
    return { provider_status: 'manual', provider_ref: null, note: 'En attente de traitement manuel par Trust Net.' };
  },
  async verify(order) {
    return { verified: false, note: 'Vérification manuelle uniquement — aucune API fournisseur configurée.' };
  },
};

// Emplacement réservé pour un futur fournisseur autorisé (ex. agrégateur
// tunisien / API opérateur B2B). À implémenter uniquement avec des identifiants
// marchands réels — ne jamais simuler une réponse de succès.
const FutureProvider = {
  name: process.env.PROVIDER_NAME || 'future-provider',
  enabled: Boolean(process.env.PROVIDER_NAME && process.env.PROVIDER_API_KEY),
  description: 'Fournisseur automatique autorisé (non configuré).',
  async execute() { throw new Error('Fournisseur automatique non configuré (PROVIDER_NAME / PROVIDER_API_KEY manquants).'); },
  async verify() { throw new Error('Fournisseur automatique non configuré.'); },
};

const providers = [ManualProvider, FutureProvider];

function getProvider(name) {
  return providers.find(p => p.name === (name || 'manual')) || ManualProvider;
}
function listProviders() {
  return providers.map(p => ({
    name: p.name, enabled: !!p.enabled, description: p.description,
    manual: p.name === 'manual',
  }));
}
/** Enregistre le statut fournisseur d'une commande (manuel par défaut). */
function dispatch(order) {
  const db = getDb();
  const provider = getProvider('manual');
  return provider.execute(order).then(r => {
    db.prepare('UPDATE orders SET provider_status = ?, provider_ref = ? WHERE id = ?')
      .run(r.provider_status, r.provider_ref, order.id);
    return r;
  }).catch(() => ({ provider_status: 'manual', provider_ref: null }));
}

module.exports = { providers, getProvider, listProviders, dispatch, ManualProvider, FutureProvider };
