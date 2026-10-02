# Suivi GMQ — Broutards

Application de suivi d'engraissement de broutards avec calcul automatique du **GMQ** (Gain Moyen Quotidien).

- **Backend** : Node.js + Express + better-sqlite3 (base SQLite)
- **Frontend** : Vue 3 + Vite

## Modèle de données

- **exploitants** : `id`, `email` (unique), `mot_de_passe` (hash bcrypt), `nom`
- **meres** : `id`, `exploitant_id` → exploitants, `numero` (unique par exploitant), `nom`
- **broutards** : clé primaire `(exploitant_id, numero)`, `mere_id` → meres, `debut_engraissement`, `rendement` (%) optionnel
- **pesees** : `id`, `(exploitant_id, broutard_numero)` → broutards, `date`, `poids` (kg), `type` (`vif` ou `carcasse`)

### Comptes exploitants
Chaque agriculteur crée son compte (email + mot de passe) et ne voit que ses propres animaux.
Un broutard est identifié par **son numéro et l'exploitant** : deux exploitants peuvent donc avoir
un animal portant le même numéro. L'authentification se fait par jeton JWT (`Authorization: Bearer …`).

Un nouveau compte est **en attente** tant qu'un administrateur ne l'a pas validé depuis le back-office ;
un compte **gelé** ne peut plus se connecter (ses sessions ouvertes sont refusées immédiatement).

Lors de la mise à jour d'une base existante, les données déjà présentes sont rattachées au compte
qui s'inscrit avec l'email `ANCIENNES_DONNEES_EMAIL` (ou, à défaut, au premier compte inscrit).

### Poids de carcasse et rendement
La dernière pesée peut être un **poids de carcasse** (sortie d'abattoir), de nature différente d'un poids vif.
Il est converti en **poids vif estimé** avant tout calcul :

> `poids_vif = poids_carcasse / (rendement / 100)`

Le **rendement carcasse** (%) est un défaut global (`RENDEMENT_DEFAULT`, 58 % par défaut), surchargé au
besoin par un rendement propre à chaque broutard (sélecteur 55 / 58 / 60 %).

Le **GMQ** n'est pas stocké : il est calculé à la volée à partir des pesées (carcasse convertie en poids vif) :
`(dernier poids vif − premier poids vif) / nombre de jours`, exprimé en **g/jour** (null si < 2 pesées).

## Back-office (`backof.<domaine>`)

Interface d'administration séparée de l'appli exploitant (`frontend/admin.html`, `frontend/src/admin/`) :
- validation des nouveaux comptes, gel / réactivation (avec motif) ;
- changement du mot de passe d'un exploitant (ses sessions en cours sont fermées) ;
- saisie de l'abonnement (formule, statut, dates) — socle de la future gestion des abonnements ;
- historique des actions de chaque admin (`admin_journal`).

Les admins sont des comptes distincts (table `admins`) avec leurs propres jetons : un jeton exploitant
n'ouvre pas le back-office et inversement. Pour créer un admin (ou réinitialiser son mot de passe) :

```bash
cd backend && npm run admin -- vous@exemple.fr "Votre nom"         # en local
docker compose exec backend node src/admin-cli.js vous@exemple.fr   # en production
```

Le mot de passe (10 caractères minimum) est demandé au clavier.

**Routage** : nginx sert le back-office quand l'hôte commence par `backof.`, et l'appli exploitant sinon.
Les routes `/api/admin/*` ne répondent **que** sur le sous-domaine `backof.` (404 sur le domaine principal).
Côté Caddy, il suffit de router le sous-domaine vers le même conteneur :

```
backof.mon-domaine.fr {
    reverse_proxy gmq-frontend:80
}
```

En dev : `http://localhost:5173/admin.html`.

### Abonnements (préparation)
`backend/src/abonnements.js` contient les formules (`FORMULES`, à adapter), la validation, et un
middleware `abonnementRequis` (réponse 402) **pas encore branché**. Les colonnes `fournisseur*`
de la table `abonnements` sont prévues pour un futur paiement en ligne (ex. Stripe).

## Démarrage

### 1. Backend
```bash
cd backend
npm install
npm run seed     # (optionnel) données de démonstration — compte demo@gmq.fr / demo123
npm run dev      # http://localhost:3000
```

### 2. Frontend
```bash
cd frontend
npm install
npm run dev      # http://localhost:5173
```

Le frontend proxifie automatiquement `/api` vers le backend (port 3000).

## Déploiement Docker (production)

Chaque service a son `Dockerfile` (multi-stage, exécuté sans privilèges), et `docker-compose.yml` orchestre l'ensemble.

```bash
cp .env.example .env      # puis adaptez les valeurs (voir ci-dessous)
docker compose up -d --build
# Application accessible sur http://localhost:8080
```

Architecture des conteneurs :
- **frontend** (nginx) : sert l'app Vue compilée et proxifie `/api` vers le backend. Seul service exposé publiquement (port `FRONTEND_PORT`, défaut 8080).
- **backend** (Node) : API Express, non exposée directement — accessible uniquement via nginx. La base SQLite est stockée dans un **volume Docker persistant** (`gmq-data`) monté sur `/data`, donc conservée entre les redémarrages.

### Sûreté pour la production
- **Secrets hors image** : toute la configuration passe par des variables d'environnement (`.env`), jamais codée en dur ni committée (`.env` est dans `.gitignore`, seul `.env.example` est versionné).
- **Conteneurs non-root** : le backend tourne sous l'utilisateur `node`, `no-new-privileges` activé sur les deux services.
- **Healthchecks** : le backend expose `/health` ; le frontend attend que le backend soit `healthy` avant de démarrer (`depends_on: condition: service_healthy`).
- **CORS restreignable** : `CORS_ORIGIN` limite les origines autorisées en production.
- **Persistance** : la base vit dans un volume nommé, pas dans l'image (rien n'est perdu au rebuild).
- **Redémarrage automatique** : `restart: unless-stopped`.

> En production, placez un reverse-proxy TLS (Traefik, Caddy, nginx) devant le service frontend pour le HTTPS, et renseignez `CORS_ORIGIN` avec l'URL publique.

### Variables d'environnement (`.env`)
| Variable | Rôle | Défaut |
|---|---|---|
| `FRONTEND_PORT` | Port public du frontend | `8080` |
| `CORS_ORIGIN` | Origines autorisées (CORS), séparées par des virgules | vide (tout autorisé) |
| `JWT_SECRET` | Secret de signature des sessions — **obligatoire** | — |
| `JWT_EXPIRES_IN` | Durée d'une session | `7d` |
| `ADMIN_JWT_EXPIRES_IN` | Durée d'une session du back-office | `8h` |
| `ANCIENNES_DONNEES_EMAIL` | Compte qui récupère les données antérieures aux comptes | vide (premier inscrit) |

## API REST

Toutes les routes sauf `/api/auth/register`, `/api/auth/login` et `/api/config` exigent un jeton.

| Méthode | Route | Description |
|---|---|---|
| POST | `/api/auth/register` | Créer un compte exploitant (`email`, `mot_de_passe`, `nom`) → jeton |
| POST | `/api/auth/login` | Se connecter → jeton |
| GET | `/api/auth/me` | Compte connecté |
| POST | `/api/admin/login` | Connexion admin → jeton admin |
| GET | `/api/admin/exploitants?statut=&q=` | Liste des exploitants (+ abonnement) |
| GET | `/api/admin/exploitants/:id` | Détail + historique |
| PATCH | `/api/admin/exploitants/:id/statut` | `{ statut: en_attente\|actif\|gele, motif }` |
| PUT | `/api/admin/exploitants/:id/mot-de-passe` | `{ mot_de_passe }` |
| GET | `/api/admin/abonnements/formules` | Formules et statuts d'abonnement |
| PUT / DELETE | `/api/admin/exploitants/:id/abonnement` | Créer / modifier / supprimer l'abonnement |
| GET | `/api/admin/journal` | Journal des actions admin |
| GET | `/api/meres` | Liste des mères |
| POST | `/api/meres` | Créer une mère |
| DELETE | `/api/meres/:id` | Supprimer une mère |
| GET | `/api/broutards` | Liste des broutards (avec GMQ) |
| GET | `/api/broutards/:numero` | Détail d'un broutard + pesées |
| POST | `/api/broutards` | Créer un broutard |
| DELETE | `/api/broutards/:numero` | Supprimer un broutard (+ ses pesées) |
| POST | `/api/broutards/:numero/pesees` | Ajouter une pesée |
| DELETE | `/api/pesees/:id` | Supprimer une pesée |
