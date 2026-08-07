# Suivi GMQ — Broutards

Application de suivi d'engraissement de broutards avec calcul automatique du **GMQ** (Gain Moyen Quotidien).

- **Backend** : Node.js + Express + better-sqlite3 (base SQLite)
- **Frontend** : Vue 3 + Vite

## Modèle de données

- **meres** : `id`, `numero` (unique), `nom`
- **broutards** : `numero` (clé primaire), `mere_id` → meres, `debut_engraissement`, `rendement` (%) optionnel
- **pesees** : `id`, `broutard_numero` → broutards, `date`, `poids` (kg), `type` (`vif` ou `carcasse`)

### Poids de carcasse et rendement
La dernière pesée peut être un **poids de carcasse** (sortie d'abattoir), de nature différente d'un poids vif.
Il est converti en **poids vif estimé** avant tout calcul :

> `poids_vif = poids_carcasse / (rendement / 100)`

Le **rendement carcasse** (%) est un défaut global (`RENDEMENT_DEFAULT`, 58 % par défaut), surchargé au
besoin par un rendement propre à chaque broutard (sélecteur 55 / 58 / 60 %).

Le **GMQ** n'est pas stocké : il est calculé à la volée à partir des pesées (carcasse convertie en poids vif) :
`(dernier poids vif − premier poids vif) / nombre de jours`, exprimé en **g/jour** (null si < 2 pesées).

## Démarrage

### 1. Backend
```bash
cd backend
npm install
npm run seed     # (optionnel) données de démonstration
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

## API REST

| Méthode | Route | Description |
|---|---|---|
| GET | `/api/meres` | Liste des mères |
| POST | `/api/meres` | Créer une mère |
| DELETE | `/api/meres/:id` | Supprimer une mère |
| GET | `/api/broutards` | Liste des broutards (avec GMQ) |
| GET | `/api/broutards/:numero` | Détail d'un broutard + pesées |
| POST | `/api/broutards` | Créer un broutard |
| DELETE | `/api/broutards/:numero` | Supprimer un broutard (+ ses pesées) |
| POST | `/api/broutards/:numero/pesees` | Ajouter une pesée |
| DELETE | `/api/pesees/:id` | Supprimer une pesée |
