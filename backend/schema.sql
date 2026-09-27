-- Schéma de la base de suivi d'engraissement (GMQ)

PRAGMA foreign_keys = ON;

-- Exploitants (agriculteurs) : chaque compte possède ses propres animaux
CREATE TABLE IF NOT EXISTS exploitants (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  email            TEXT NOT NULL UNIQUE COLLATE NOCASE,
  mot_de_passe     TEXT,                          -- hash bcrypt ; NULL => compte non connectable
  nom              TEXT,                          -- nom de l'exploitation (optionnel)
  cree_le          TEXT NOT NULL DEFAULT (datetime('now'))
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
