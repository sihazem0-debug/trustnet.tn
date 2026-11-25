# TRUST NET 🇹🇳 — Plateforme wholesale de recharge mobile Tunisie

> **Anciennement TuniRecharge** — le site a été transformé en plateforme B2B
> **TRUST NET** (nov. 2026) : deux niveaux de prix gros, gestion des tarifs,
> commandes groupées, rapports, statut opérateurs et nouvelle identité visuelle
> noir / rouge néon / blanc. L'ancien nom ne subsiste que dans ce README
> (notes de migration) et dans les valeurs par défaut techniques
> (fichier `tunirecharge.db`, email admin `admin@tunirecharge.tn`).

Site de recharge mobile **indépendant** : forfaits internet et crédit des
3 opérateurs tunisiens — **Tunisie Télécom, Ooredoo, Orange** — avec
**comptes clients validés par l'admin**, **solde / wallet client**, paiement
**D17 / Flouci / manuel**, recharge rapide sans compte, codes promo,
comparateur, recharge programmée et favoris.

## 🆕 Nouveautés wholesale TRUST NET (v2.0.0)

| Fonction | Détail |
|---|---|
| **Niveaux de prix L1 / L2** | Chaque client est Niveau 1 ou 2 (assigné par l'admin). Chaque forfait a un prix Niveau 1 et un prix Niveau 2 indépendants. **Un client ne voit jamais que son propre niveau** — ni dans l'interface, ni dans l'API. Exemple de démonstration (modifiable dans l'admin) : les trois forfaits **25 Go (30 j)** — TT, Ooredoo Flexi+, Orange Navigui — sont à **25 DT en Niveau 1 et 27 DT en Niveau 2**. Par défaut L1 = prix public, L2 = prix public + 8 %. Changer le niveau d'un client ne modifie jamais ses anciennes commandes (prix figés à l'achat). |
| **Gestion des tarifs** | Admin → Tarifs L1 / L2 : créer / modifier forfaits (opérateur, data, validité, prix L1, prix L2, coût, actif), comparaison entre opérateurs (même data + même validité, prix / Go), **historique des prix** (date, admin, ancien / nouveau prix, motif). |
| **Commande rapide** | Un forfait, un numéro, un paiement — en 1 clic (`POST /api/orders/quick`). |
| **Commande groupée** | Un forfait, plusieurs numéros (un par ligne) : un ordre par numéro, statut individuel par numéro, les numéros invalides n'annulent pas le lot (`POST /api/orders/bulk`, groupe `BG-…`). |
| **Anti-doublons** | `idempotency_key` : renvoyer la même clé renvoie la commande existante **sans créer ni débiter deux fois**. Refus d'une commande identique (même client + forfait + numéro) dans les 5 minutes, sauf `allow_repeat`. |
| **Export Excel (CSV)** | Mes commandes (`GET /api/orders/mine/export`) et toutes les commandes admin (`GET /api/admin/orders/export`) — format CSV compatible Excel (`;`, UTF-8). |
| **Rapports** | Admin → Rapports : ventes totales, par opérateur, par client, réussies / annulées, revenu et profit par jour / semaine / mois, activité clients, **Niveau 1 vs Niveau 2**. Le profit utilise le `cost_price` du forfait (à saisir par l'admin — par défaut = prix public, marge 0). |
| **Statut opérateurs** | Admin → Opérateurs : Disponible / Temporairement indisponible / En maintenance, avec message affiché aux clients (bannière + carte forfait). Une commande vers un opérateur indisponible est refusée (503). **Statut manuel uniquement** — TRUST NET ne prétend jamais à un statut « en ligne » automatique. |
| **Tickets support** | Les clients ouvrent un ticket (sujet, message, code commande) ; l'admin répond et le client est notifié. |
| **Notifications** | Créées sur : création / changement de statut de commande, crédit / débit de solde, approbation de compte, changement de niveau, changement de statut opérateur, réponse à un ticket. |
| **Fournisseurs (futur)** | `src/provider.js` : architecture modulaire. Par défaut, **traitement manuel uniquement** (`provider_status='manual'`). Un fournisseur automatique ne s'activera qu'avec un compte autorisé configuré (`PROVIDER_NAME` + `PROVIDER_API_KEY`) — aucune transaction télécom n'est simulée. Voir `GET /api/admin/providers`. |
| **Identité TRUST NET** | Noir dominant `#050505`, rouge néon `#FF1E2D` (glow), blanc — appliquée partout : landing, connexion/inscription, espace client, admin, forfaits, commandes, solde. Glassmorphism, animations subtiles, mobile-first. |

## 🎨 Style

Style **clair premium, 100 % différent de Trust Net** (qui était noir / néon vert) :
fond off-white `#F6F9FF`, cartes blanches, ombres douces, bleu royal / indigo `#1D4ED8` / `#4F46E5`,
accent orange corail `#FF6B35`. Couleurs opérateurs : TT bleu `#2563EB`, Ooredoo rouge `#E30613`,
Orange orange `#FF7900`. Mobile-first, français primaire + arabe (bouton عربي / Français, RTL).

## ✨ Fonctionnalités

| Fonction | Détail |
|---|---|
| Recharge rapide sans compte | Opérateur → forfait → numéro tunisien (validation `2xxxxxxxx` / `5xxxxxxxx` / `9xxxxxxxx`, 8 chiffres) → paiement → statut `Pending / Processing / Completed / Cancelled` + reçu + lien WhatsApp |
| **Comptes clients avec confirmation admin** | Inscription (nom, téléphone, email, mot de passe) → statut **Pending**. Le client **ne peut pas se connecter** tant que l'admin n'a pas cliqué **Approuver** dans le dashboard. L'admin peut aussi **Refuser**. |
| **Solde / Wallet client** | Chaque client a un solde en DT. L'admin **crédite / débite** le solde (montant + motif obligatoire, historique complet). Le client peut **payer avec son solde** (débit immédiat, commande en `Processing`), demander une recharge de solde (D17/Flouci → l'admin confirme → solde crédité) et voir son historique. Annulation d'une commande payée par solde = **remboursement automatique**. |
| Dashboard client | Solde, dernières recharges, recharge rapide, favoris, **répéter la dernière recharge**, historique solde, notifications |
| Dashboard admin | Stats (ventes du jour, commandes, comptes en attente, solde total clients), gestion des demandes de comptes, gestion des soldes, gestion des commandes (changement de statut), gestion des forfaits (ajouter / modifier prix / désactiver), codes promo, paramètres (WhatsApp, D17, Flouci, annonce) |
| Recherche & filtres | Recherche texte, filtre opérateur / type / budget, tri (prix, data, plus vendus), **comparateur** (jusqu'à 4 forfaits côte à côte) |
| Codes promo | `BIENVENUE10` (−10 %, max 5 DT), `TUNIRECHARGE5` (−5 %, max 3 DT) — créables / activables dans l'admin |
| Recharge programmée | Date/heure future → commande au statut `Scheduled` |
| Suivi public | Suivi d'une commande par son code (`TR-XXXXXX`), sans compte |
| FR / AR | Bascule français ⇄ arabe (RTL) sur toute l'interface |

## 📱 Catalogue (40 forfaits, prix DT TTC)

- **Tunisie Télécom Internet** : 650 Mo 3 DT (7 j), 1.5 Go 6 DT, 4 Go 10 DT, 25 Go 30 DT, 45 Go 50 DT, 60 Go 60 DT, 110 Go 80 DT, 200 Go 100 DT + crédit 5 / 10 / 20 / 50 / 100 DT
- **Ooredoo Flexi / Flexi+** : 220 Mo 1 DT (1 j), 1.25 Go 5 DT, 2.8 Go 10 DT, 6 Go 15 DT, 25 Go 25 DT, 55 Go 50 DT, 75 Go 60 DT, 100 Go 72 DT, 200 Go 100 DT + crédit 5 / 10 / 20 / 50 / 100 DT
- **Orange Navigui** : 1.25 Go 5 DT, 4 Go 10 DT, 6 Go 15 DT, 25 Go 30 DT, 42 Go 46,2 DT, 60 Go 60 DT, 100 Go 72 DT, 200 Go 100 DT + crédit 5 / 10 / 20 / 50 / 100 DT

Chaque forfait : opérateur, type (Internet / Crédit), data, validité, prix, badge (Plus vendu / Promo), image SVG propre à l'opérateur, prix par Go affiché.

### Sources des prix (vérifiées le 24 nov. 2026)

- Tunisie Télécom — grille archivée 4 mai 2026 : 650 Mo 3 DT (7 j) → 200 Go 100 DT (60 j) : https://www.esimcompatibilitychecker.com/fr/blog/esim-tunisie-telecom-2026-prix-achat-activation.html
- Ooredoo — page officielle Flexi+ : 25 Go 25 DT, 55 Go 50 DT, 75 Go 60 DT, 100 Go 72 DT (validités 30/30/60/60 j) : https://www.ooredoo.tn/Personal/en/content/472-flexi — et page Mifi Flexi (25 Go 30 DT, 55 Go 55 DT, 100 Go 72 DT, 200 Go 100 DT / 120 j) : https://www.ooredoo.tn/Personal/fr/content/346-packs-mifi-4g
- Orange — page officielle « Ehdi option » (Navigui) : 1,125 Go 4,5 DT, 4 Go 10 DT, 6 Go 15 DT, 25 Go 30 DT, 42 Go 46,2 DT, 60 Go 60 DT (60 j), 100 Go 72 DT (90 j), 200 Go 100 DT (120 j) : https://www.orange.tn/entreprises/services-pratiques/ehdi-option

> ⚠️ **Écarts à vérifier avant mise en production** (les opérateurs changent leurs grilles et font des promos) :
> - **Orange 1,25 Go** : le site officiel affiche **4,5 DT** (Navigui 1,125 Go) — le catalogue du site utilise **5 DT** comme demandé. Corriger dans l'admin si besoin.
> - **Ooredoo** : les prix 25 Go 25 DT / 55 Go 50 DT sont ceux de **Flexi+ mobile** ; la grille **Flexi Mifi** affiche 25 Go 30 DT / 55 Go 55 DT. Préciser l'offre vendue aux clients.
> - **Tunisie Télécom** : l'app MyTT affiche souvent **−10 % par carte bancaire** (ex. 4 Go à 9 DT au lieu de 10 DT). Le badge « Promo » du 110 Go est indicatif.
> - Les validités des gros forfaits TT (60 Go / 110 Go = 60 j) et Ooredoo 200 Go (120 j) sont des valeurs usuelles, à confirmer.

## 🚀 Installation & lancement

```bash
cd recharge-tn
npm install
cp .env.example .env   # puis remplir : JWT_SECRET, numéros WhatsApp / D17 / Flouci
npm start              # http://localhost:3000
```

- Base SQLite créée automatiquement : `tunirecharge.db` (aucune compilation native, `node:sqlite`).
- `npm run seed` : (ré)initialise la base + le catalogue.
- Node.js **>= 22** requis.

## 🔐 Identifiants par défaut

| Rôle | Email | Mot de passe |
|---|---|---|
| **Admin** | `admin@tunirecharge.tn` | `admin123` |

> ⚠️ **À changer immédiatement** : mot de passe admin (`ADMIN_PASSWORD` dans `.env` avant le premier lancement, ou directement en base ensuite), `JWT_SECRET`, numéros WhatsApp / D17 / Flouci (dans `.env` ou dans **Admin → Paramètres**).

## 💳 Paiement — limitation importante

**D17 / Flouci sont manuels** dans cette version : le client paie sur votre numéro, saisit sa
référence de transaction, et **vous confirmez manuellement** la commande dans l'admin
(`Pending → Processing → Completed`). Il n'y a **pas de vérification automatique** du paiement :
l'activation automatique via API nécessiterait un **compte marchand** (D17 / Flouci / Konnect / Paymee)
et une intégration dédiée. Le paiement par **solde** est lui immédiat et automatique.

## 🗄️ Base de données

Tables : `users` (rôle client/admin, `status` pending/approved/rejected, `balance`),
`plans`, `orders` (statuts Pending/Processing/Completed/Cancelled/Scheduled, `scheduled_for`),
`wallet_tx` (crédit/débit/achat/recharge, motif, admin, statut), `promos`, `favorites`, `settings`.

## 🌐 Déploiement

### Render (recommandé pour démarrer)
1. Créez un **Web Service** Node.js depuis ce dépôt (ou en uploadant le dossier).
2. Build : `npm install` — Start : `npm start`.
3. Variables d'environnement : `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `WHATSAPP_NUMBER`, `D17_NUMBER`, `FLOUCI_NUMBER`, `PORT` (Render l'injecte).
4. **Persistent Disk** obligatoire pour SQLite : montez un disque sur `/data` et définissez `DB_PATH=/data/tunirecharge.db`, sinon la base est perdue à chaque redéploiement.
5. Plan gratuit : le service s'endort après inactivité (premier chargement lent) — passez au plan payant pour un site pro.

### VPS (Ubuntu)
```bash
# Node 22+
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
cd /opt/tunirecharge && npm install --omit=dev
cp .env.example .env && nano .env
# Service systemd + reverse-proxy Nginx + certificat Let's Encrypt (voir notes ci-dessous)
npm start
```
Exemple systemd (`/etc/systemd/system/tunirecharge.service`) : `ExecStart=/usr/bin/node /opt/tunirecharge/server.js`,
`WorkingDirectory=/opt/tunirecharge`, `EnvironmentFile=/opt/tunirecharge/.env`, `Restart=always`.
Nginx : `proxy_pass http://127.0.0.1:3000;` + `certbot --nginx`.

## 📂 Structure

```
recharge-tn/
├── server.js                 # Express : API + fichiers statiques
├── package.json
├── .env.example
├── src/
│   ├── db.js                 # SQLite + catalogue complet (40 forfaits) + seed admin
│   ├── auth.js               # JWT, rôles, validation numéro tunisien
│   └── routes/
│       ├── auth.js           # register (pending) / login / me
│       ├── plans.js          # catalogue, recherche, filtres, comparateur
│       ├── orders.js         # commandes, promo, favoris, suivi, répéter
│       ├── wallet.js         # solde, historique, demande de recharge, notifications
│       └── admin.js          # stats, validation comptes, soldes, commandes, forfaits, promos, paramètres
└── public/
    ├── index.html            # SPA : hero, recharge rapide, catalogue, dashboards
    ├── styles.css            # thème clair premium (bleu royal / indigo / corail)
    ├── js/app.js             # front-end vanilla JS (FR/AR, comparateur, dashboards)
    └── images/               # SVG : logo, tt, ooredoo, orange, data, wallet
```

## ✅ Checklist avant mise en ligne (pour Hazem)

- [ ] Changer le mot de passe admin (`admin123`) et le `JWT_SECRET`
- [ ] Renseigner les **vrais numéros** WhatsApp, D17 et Flouci (Admin → Paramètres)
- [ ] Vérifier / corriger les **prix** (voir « Écarts à vérifier » ci-dessus, surtout Orange 1,25 Go et Ooredoo Flexi vs Flexi+) — **et les prix Niveau 1 / Niveau 2** (Admin → Tarifs L1 / L2 ; les 25 Go sont à 25 / 27 DT en démonstration)
- [ ] Saisir le **coût (`cost_price`) de chaque forfait** dans Tarifs L1 / L2 pour que les rapports de profit soient exacts (par défaut = prix public, profit affiché 0)
- [ ] Assigner chaque client à son **Niveau 1 ou Niveau 2** (Admin → Clients & soldes)
- [ ] Tester le parcours complet : inscription → approbation admin → connexion → crédit solde → achat par solde (Niveau 1 et Niveau 2) → commande groupée → export
- [ ] Sauvegarder `tunirecharge.db` régulièrement (c'est toute la boutique : clients, soldes, commandes). **Sauvegarde pré-wholesale** : `~/workspace/backups/trust-net-pre-wholesale-2026-11-25/` (tarball + DB, sha256 vérifié) — pour revenir en arrière, restaurez ces fichiers.

## 🔌 API — nouveaux endpoints (v2.0.0)

- `GET /api/plans` — prix visible selon le niveau du client connecté (invité = prix public) ; filtres `min_gb`, `max_gb`, `validity_days` en plus des existants. Ne renvoie jamais les deux niveaux ni le coût à un non-admin.
- `GET /api/plans/compare?ids=1,2,3` — prix visible, prix / Go, disponibilité, `validity_mismatch` + avertissement si les validités diffèrent.
- `GET /api/operators` — statut manuel des 3 opérateurs.
- `POST /api/orders/quick` — commande rapide. `POST /api/orders/bulk` — commande groupée (admin : un ordre par numéro).
- `GET /api/orders/mine?status&operator&q&from&to` — historique filtré. `GET /api/orders/mine/export` — CSV.
- `POST /api/tickets`, `GET /api/tickets/mine`, `GET /api/notifications/mine`, `POST /api/notifications/:id/read`.
- Admin : `PUT /api/admin/users/:id/level`, `GET /api/admin/pricing`, `GET /api/admin/pricing/history?plan_id=`, `GET /api/admin/pricing/compare`, `GET/PUT /api/admin/operators`, `GET /api/admin/wallet/transactions`, `GET /api/admin/reports?from&to`, `GET/PUT /api/admin/tickets`, `GET /api/admin/providers`, `GET /api/admin/orders/export`.
- Base : nouvelles tables `price_history`, `operator_status`, `tickets`, `notifications` ; colonnes ajoutées `users.pricing_level`, `plans.price_level1/price_level2/cost_price`, `orders.level_at_order/unit_price/cost_total/idempotency_key/bulk_group_id/provider_status/provider_ref`. Migrations additives uniquement — aucune donnée existante n'est supprimée.
