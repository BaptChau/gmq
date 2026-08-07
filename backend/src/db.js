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

// Initialise le schéma au démarrage (bases neuves)
const schema = readFileSync(join(__dirname, '..', 'schema.sql'), 'utf-8');
db.exec(schema);

// --- Migrations légères pour les bases déjà existantes ---
// Ajoute une colonne si elle n'existe pas encore (ALTER TABLE idempotent).
function ensureColumn(table, column, definition) {
  const exists = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
  if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
ensureColumn('pesees', 'type', "TEXT NOT NULL DEFAULT 'vif'");
ensureColumn('broutards', 'rendement', 'REAL');

/**
 * Rendement carcasse (%) applicable à un broutard : le sien s'il est défini,
 * sinon le défaut global.
 * @param {string} numero
 * @returns {number}
 */
export function rendementDuBroutard(numero) {
  const row = db.prepare('SELECT rendement FROM broutards WHERE numero = ?').get(numero);
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
 * @param {string} numero
 */
export function calculerGmq(numero) {
  const pesees = db
    .prepare('SELECT date, poids, type FROM pesees WHERE broutard_numero = ? ORDER BY date ASC, id ASC')
    .all(numero);

  const rendement = rendementDuBroutard(numero);

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
