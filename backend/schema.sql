-- Schéma de la base de suivi d'engraissement (GMQ)

PRAGMA foreign_keys = ON;

-- Exploitants (agriculteurs) : chaque compte possède ses propres animaux
CREATE TABLE IF NOT EXISTS exploitants (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  email            TEXT NOT NULL UNIQUE COLLATE NOCASE,
  mot_de_passe     TEXT,                          -- hash bcrypt ; NULL => compte non connectable
  nom              TEXT,                          -- nom de l'exploitation (optionnel)
  statut           TEXT NOT NULL DEFAULT 'en_attente'   -- validé par un admin avant de pouvoir se connecter
                     CHECK (statut IN ('en_attente', 'actif', 'gele')),
  statut_motif     TEXT,                          -- raison du gel (affichée à l'admin)
  statut_maj_le    TEXT,
  jeton_version    INTEGER NOT NULL DEFAULT 0,    -- incrémenté pour invalider les sessions en cours
  cree_le          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Administrateurs du back-office (comptes distincts des exploitants).
-- Connexion par identifiant + code TOTP d'une application d'authentification.
CREATE TABLE IF NOT EXISTS admins (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  identifiant       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  nom               TEXT,
  totp_secret       TEXT,                         -- secret base32 ; NULL => pas encore enrôlé
  totp_dernier_pas  INTEGER NOT NULL DEFAULT -1,  -- dernier pas TOTP utilisé (un code ne sert qu'une fois)
  totp_secret_attente TEXT,                       -- secret proposé pendant l'enrôlement, en attente de confirmation
  activation_hash   TEXT,                         -- SHA-256 du code d'activation de première connexion
  activation_expire TEXT,                         -- date d'expiration du code d'activation
  jeton_version     INTEGER NOT NULL DEFAULT 0,
  cree_le           TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Abonnement d'un exploitant (préparation de la future gestion des abonnements).
-- Une ligne par exploitant ; pas de ligne => aucun abonnement.
CREATE TABLE IF NOT EXISTS abonnements (
  exploitant_id              INTEGER PRIMARY KEY,
  formule                    TEXT NOT NULL,       -- code de formule (voir FORMULES dans abonnements.js)
  statut                     TEXT NOT NULL DEFAULT 'essai'
                               CHECK (statut IN ('essai', 'actif', 'impaye', 'annule', 'expire')),
  debut                      TEXT,                -- date ISO 'YYYY-MM-DD'
  fin                        TEXT,                -- date ISO ; NULL => sans échéance
  fournisseur                TEXT,                -- ex. 'stripe' (paiement en ligne, plus tard)
  fournisseur_client_id      TEXT,                -- identifiant client chez le fournisseur
  fournisseur_abonnement_id  TEXT,                -- identifiant d'abonnement chez le fournisseur
  notes                      TEXT,
  maj_le                     TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (exploitant_id) REFERENCES exploitants(id) ON DELETE CASCADE
);

-- Journal des actions effectuées depuis le back-office
CREATE TABLE IF NOT EXISTS admin_journal (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id       INTEGER,
  action         TEXT NOT NULL,
  exploitant_id  INTEGER,
  details        TEXT,                            -- JSON
  cree_le        TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE SET NULL,
  FOREIGN KEY (exploitant_id) REFERENCES exploitants(id) ON DELETE SET NULL
);

-- Mères : chaque broutard descend d'une mère.
-- Le numéro est unique par exploitant (deux exploitants peuvent avoir le même numéro).
CREATE TABLE IF NOT EXISTS meres (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  exploitant_id  INTEGER NOT NULL,
  numero         TEXT NOT NULL,                   -- boucle / identifiant de la mère
  nom            TEXT,                            -- nom optionnel
  UNIQUE (exploitant_id, numero),
  FOREIGN KEY (exploitant_id) REFERENCES exploitants(id) ON DELETE CASCADE
);

-- Broutards : identifiés par (exploitant, numéro de boucle)
CREATE TABLE IF NOT EXISTS broutards (
  exploitant_id        INTEGER NOT NULL,
  numero               TEXT NOT NULL,              -- boucle du broutard
  mere_id              INTEGER,                    -- FK vers meres
  debut_engraissement  TEXT NOT NULL,              -- date ISO 'YYYY-MM-DD'
  rendement            REAL,                       -- rendement carcasse (%) propre à l'animal ; NULL => défaut global
  cree_le              TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (exploitant_id, numero),
  FOREIGN KEY (exploitant_id) REFERENCES exploitants(id) ON DELETE CASCADE,
  FOREIGN KEY (mere_id) REFERENCES meres(id) ON DELETE SET NULL
);

-- Pesées : rattachées au broutard par (exploitant, numéro)
CREATE TABLE IF NOT EXISTS pesees (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  exploitant_id     INTEGER NOT NULL,
  broutard_numero   TEXT NOT NULL,
  date              TEXT NOT NULL,                 -- date ISO 'YYYY-MM-DD'
  poids             REAL NOT NULL,                 -- en kg (poids vif, ou poids de carcasse si type='carcasse')
  type              TEXT NOT NULL DEFAULT 'vif'    -- 'vif' (pesée sur pied) ou 'carcasse' (sortie d'abattoir)
                      CHECK (type IN ('vif', 'carcasse')),
  FOREIGN KEY (exploitant_id, broutard_numero)
    REFERENCES broutards(exploitant_id, numero) ON DELETE CASCADE ON UPDATE CASCADE
);
