import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || join(__dirname, '..', 'gmq.db');

// Rendement carcasse par défaut (%) utilisé quand un broutard n'en a pas de propre.
// Configurable via la variable d'environnement RENDEMENT_DEFAULT.
export const RENDEMENT_DEFAUT = Number(process.env.RENDEMENT_DEFAULT) || 58;

// Valeurs de rendement proposées dans l'interface (sélecteur).
export const RENDEMENTS_AUTORISES = [55, 58, 60];

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// --- Migrations légères pour les bases déjà existantes ---
function tableExiste(table) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));
}
function colonneExiste(table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
}
// Ajoute une colonne si elle n'existe pas encore (ALTER TABLE idempotent).
function ensureColumn(table, column, definition) {
  if (tableExiste(table) && !colonneExiste(table, column))
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
ensureColumn('pesees', 'type', "TEXT NOT NULL DEFAULT 'vif'");
ensureColumn('broutards', 'rendement', 'REAL');

// Email du compte « propriétaire » des données créées avant l'arrivée des comptes.
export const EMAIL_ANCIENNES_DONNEES = '__anciennes-donnees__';

// Passage au multi-exploitant : les anciennes tables (sans exploitant_id) sont
// reconstruites, et les données existantes rattachées à un compte provisoire
// qui sera réclamé à l'inscription (voir server.js, /api/auth/register).
const migrationMultiExploitant = tableExiste('broutards') && !colonneExiste('broutards', 'exploitant_id');
if (migrationMultiExploitant) {
  db.pragma('foreign_keys = OFF');
  db.transaction(() => {
    db.exec(`
      ALTER TABLE pesees RENAME TO pesees_old;
      ALTER TABLE broutards RENAME TO broutards_old;
      ALTER TABLE meres RENAME TO meres_old;
      DROP INDEX IF EXISTS idx_pesees_broutard;
      DROP INDEX IF EXISTS idx_pesees_date;
      DROP INDEX IF EXISTS idx_broutards_mere;
    `);
    db.exec(readFileSync(join(__dirname, '..', 'schema.sql'), 'utf-8'));
    const aDesDonnees =
      db.prepare('SELECT (SELECT COUNT(*) FROM meres_old) + (SELECT COUNT(*) FROM broutards_old) AS n').get().n > 0;
    if (aDesDonnees) {
      const id = db
        .prepare('INSERT INTO exploitants (email, mot_de_passe, nom) VALUES (?, NULL, NULL)')
        .run(EMAIL_ANCIENNES_DONNEES).lastInsertRowid;
      db.prepare('INSERT INTO meres (id, exploitant_id, numero, nom) SELECT id, ?, numero, nom FROM meres_old').run(id);
      db.prepare(
        `INSERT INTO broutards (exploitant_id, numero, mere_id, debut_engraissement, rendement, cree_le)
         SELECT ?, numero, mere_id, debut_engraissement, rendement, cree_le FROM broutards_old`
      ).run(id);
      db.prepare(
        `INSERT INTO pesees (id, exploitant_id, broutard_numero, date, poids, type)
         SELECT id, ?, broutard_numero, date, poids, type FROM pesees_old`
      ).run(id);
    }
    db.exec('DROP TABLE pesees_old; DROP TABLE broutards_old; DROP TABLE meres_old;');
  })();
  db.pragma('foreign_keys = ON');
}

// Initialise le schéma au démarrage (bases neuves)
db.exec(readFileSync(join(__dirname, '..', 'schema.sql'), 'utf-8'));
// Colonnes de gestion de compte ajoutées après coup : les comptes déjà existants restent actifs.
ensureColumn('exploitants', 'statut', "TEXT NOT NULL DEFAULT 'actif' CHECK (statut IN ('en_attente', 'actif', 'gele'))");
ensureColumn('exploitants', 'statut_motif', 'TEXT');
ensureColumn('exploitants', 'statut_maj_le', 'TEXT');
ensureColumn('exploitants', 'jeton_version', 'INTEGER NOT NULL DEFAULT 0');

// Admins : passage de email + mot de passe à identifiant + TOTP. Les admins existants
// gardent leur id (journal intact), avec leur email comme identifiant, et doivent
// être réenrôlés (admin-cli) pour obtenir un secret TOTP.
if (colonneExiste('admins', 'email')) {
  db.pragma('foreign_keys = OFF');
  db.transaction(() => {
    db.exec(`
      CREATE TABLE admins_new (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        identifiant       TEXT NOT NULL UNIQUE COLLATE NOCASE,
        nom               TEXT,
        totp_secret       TEXT,
        totp_dernier_pas  INTEGER NOT NULL DEFAULT -1,
        jeton_version     INTEGER NOT NULL DEFAULT 0,
        cree_le           TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO admins_new (id, identifiant, nom, jeton_version, cree_le)
        SELECT id, LOWER(email), nom, jeton_version + 1, cree_le FROM admins;
      DROP TABLE admins;
      ALTER TABLE admins_new RENAME TO admins;
    `);
  })();
  db.pragma('foreign_keys = ON');
}

// Enrôlement TOTP depuis le navigateur (première connexion avec un code d'activation)
ensureColumn('admins', 'totp_secret_attente', 'TEXT');
ensureColumn('admins', 'activation_hash', 'TEXT');
ensureColumn('admins', 'activation_expire', 'TEXT');

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_admin_journal_exploitant ON admin_journal(exploitant_id);
  CREATE INDEX IF NOT EXISTS idx_pesees_broutard ON pesees(exploitant_id, broutard_numero, date);
  CREATE INDEX IF NOT EXISTS idx_broutards_mere ON broutards(mere_id);
`);

/**
 * Rendement carcasse (%) applicable à un broutard : le sien s'il est défini,
 * sinon le défaut global.
 * @param {number} exploitantId
 * @param {string} numero
 * @returns {number}
 */
export function rendementDuBroutard(exploitantId, numero) {
  const row = db
    .prepare('SELECT rendement FROM broutards WHERE exploitant_id = ? AND numero = ?')
    .get(exploitantId, numero);
  return row && row.rendement != null ? row.rendement : RENDEMENT_DEFAUT;
}

/**
 * Convertit un poids de carcasse en poids vif estimé.
 * poids_vif = poids_carcasse / (rendement / 100)
 * @param {number} poidsCarcasse
 * @param {number} rendementPct
 * @returns {number}
 */
export function carcasseVersVif(poidsCarcasse, rendementPct) {
  return poidsCarcasse / (rendementPct / 100);
}

/**
 * Calcule le GMQ (Gain Moyen Quotidien) d'un broutard à partir de ses pesées.
 * Les pesées de type 'carcasse' sont converties en poids vif estimé avant le calcul,
 * pour rester comparables aux pesées sur pied.
 * GMQ = (dernier poids vif - premier poids vif) / nombre de jours, exprimé en g/jour.
 * Retourne null si moins de 2 pesées ou si l'intervalle est nul.
 * @param {number} exploitantId
 * @param {string} numero
 */
export function calculerGmq(exploitantId, numero) {
  const pesees = db
    .prepare(
      'SELECT date, poids, type FROM pesees WHERE exploitant_id = ? AND broutard_numero = ? ORDER BY date ASC, id ASC'
    )
    .all(exploitantId, numero);

  const rendement = rendementDuBroutard(exploitantId, numero);

  // Point de mesure avec poids vif (converti si carcasse)
  const points = pesees.map((p) => ({
    date: p.date,
    poids: p.poids,
    type: p.type,
    poids_vif: p.type === 'carcasse' ? Math.round(carcasseVersVif(p.poids, rendement)) : p.poids,
  }));

  // Infos carcasse (dernière pesée de type carcasse, s'il y en a une)
  const carcasse = [...points].reverse().find((p) => p.type === 'carcasse') || null;

  const base = {
    nb_pesees: points.length,
    rendement,
    poids_carcasse: carcasse ? carcasse.poids : null,
    poids_vif_estime: carcasse ? carcasse.poids_vif : null,
    a_carcasse: Boolean(carcasse),
    premier: points[0] || null,
    dernier: points[points.length - 1] || null,
  };

  if (points.length < 2) return { ...base, gmq_g_jour: null };

  const premier = points[0];
  const dernier = points[points.length - 1];
  const jours = (new Date(dernier.date) - new Date(premier.date)) / (1000 * 60 * 60 * 24);
  if (jours <= 0) return { ...base, gmq_g_jour: null };

  const gainKg = dernier.poids_vif - premier.poids_vif;
  const gmq_g_jour = Math.round((gainKg / jours) * 1000); // kg/jour -> g/jour

  return { ...base, gmq_g_jour };
}

export default db;
