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

## Site de présentation (`landing.<domaine>`)

Pages statiques (HTML + CSS, sans JavaScript) dans `frontend/landing/` :
- `/` : accueil ;
- `/fonctionnement` : guide pas à pas ;
- `/gmq` : le GMQ expliqué avec un exemple.

L'en-tête et le pied de page communs sont dans `frontend/landing/partiels/`, insérés au build par un
petit plugin Vite (`vite.config.js`). Les styles partagés avec l'application sont dans `frontend/src/tokens.css`.

nginx sert ces pages quand l'hôte commence par `landing.`. Les liens `/connexion` et `/inscription`
redirigent vers l'application sur le domaine principal (`/?inscription` ouvre directement la création de compte).
**Mise en ligne** (le site est public et ouvert aux moteurs de recherche) :
1. DNS : un enregistrement `A` (et `AAAA` si IPv6) pour `landing.mon-domaine.fr` vers l'IP du serveur.
2. Caddy : ajouter le bloc de `deploy/Caddyfile.exemple` au Caddyfile de `~/proxy`, puis recharger Caddy.
3. Reconstruire le frontend : `docker compose up -d --build`.
4. Vérifier depuis l'extérieur : `curl -I https://landing.mon-domaine.fr/` doit répondre `200`.
5. Déclarer le site dans Google Search Console et y soumettre `https://landing.mon-domaine.fr/sitemap.xml`.

Référencement : `landing.*` sert `robots.txt` (tout autorisé) et `sitemap.xml`, générés par nginx à partir
du domaine demandé (rien à configurer). Les anciennes adresses en `.html` redirigent vers les adresses propres.
L'application, elle, n'est pas indexée (`robots.txt` « Disallow » et en-tête `X-Robots-Tag: noindex`).

En dev : http://landing.localhost:5173 (le serveur Vite reproduit le même routage).

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
| `ANCIENNES_DONNEES_EMAIL` | Compte qui récupère les données antérieures aux comptes | vide (premier inscrit) |

## API REST

Toutes les routes sauf `/api/auth/register`, `/api/auth/login` et `/api/config` exigent un jeton.

| Méthode | Route | Description |
|---|---|---|
| POST | `/api/auth/register` | Créer un compte exploitant (`email`, `mot_de_passe`, `nom`) → jeton |
| POST | `/api/auth/login` | Se connecter → jeton |
| GET | `/api/auth/me` | Compte connecté |
| GET | `/api/meres` | Liste des mères |
| POST | `/api/meres` | Créer une mère |
| DELETE | `/api/meres/:id` | Supprimer une mère |
| GET | `/api/broutards` | Liste des broutards (avec GMQ) |
| GET | `/api/broutards/:numero` | Détail d'un broutard + pesées |
| POST | `/api/broutards` | Créer un broutard |
| DELETE | `/api/broutards/:numero` | Supprimer un broutard (+ ses pesées) |
| POST | `/api/broutards/:numero/pesees` | Ajouter une pesée |
| DELETE | `/api/pesees/:id` | Supprimer une pesée |
