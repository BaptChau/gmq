-- Schéma de la base de suivi d'engraissement (GMQ)

PRAGMA foreign_keys = ON;

-- Mères : chaque broutard descend d'une mère
CREATE TABLE IF NOT EXISTS meres (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  numero    TEXT NOT NULL UNIQUE,   -- boucle / identifiant de la mère
  nom       TEXT                    -- nom optionnel
);

-- Broutards : le numéro (boucle) est la clé unique
CREATE TABLE IF NOT EXISTS broutards (
  numero               TEXT PRIMARY KEY,           -- boucle du broutard
  mere_id              INTEGER,                    -- FK vers meres
  debut_engraissement  TEXT NOT NULL,              -- date ISO 'YYYY-MM-DD'
  rendement            REAL,                       -- rendement carcasse (%) propre à l'animal ; NULL => défaut global
  cree_le              TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (mere_id) REFERENCES meres(id) ON DELETE SET NULL
);

-- Pesées : rattachées au broutard par son numéro
CREATE TABLE IF NOT EXISTS pesees (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  broutard_numero   TEXT NOT NULL,
  date              TEXT NOT NULL,                 -- date ISO 'YYYY-MM-DD'
  poids             REAL NOT NULL,                 -- en kg (poids vif, ou poids de carcasse si type='carcasse')
  type              TEXT NOT NULL DEFAULT 'vif'    -- 'vif' (pesée sur pied) ou 'carcasse' (sortie d'abattoir)
                      CHECK (type IN ('vif', 'carcasse')),
  FOREIGN KEY (broutard_numero) REFERENCES broutards(numero) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pesees_broutard ON pesees(broutard_numero);
CREATE INDEX IF NOT EXISTS idx_pesees_date ON pesees(broutard_numero, date);
CREATE INDEX IF NOT EXISTS idx_broutards_mere ON broutards(mere_id);
