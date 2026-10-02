// Gestion des abonnements — socle pour la future fonctionnalité.
// Pour l'instant les abonnements sont saisis à la main depuis le back-office et
// n'empêchent pas encore l'accès à l'application (voir abonnementRequis).
import db from './db.js';

// Formules proposées. À adapter (libellés, prix) quand l'offre sera définie.
export const FORMULES = [
  { code: 'gratuit', libelle: 'Gratuit' },
  { code: 'standard', libelle: 'Standard' },
  { code: 'pro', libelle: 'Pro' },
];

export const STATUTS_ABONNEMENT = ['essai', 'actif', 'impaye', 'annule', 'expire'];

// Statuts qui donnent accès à l'application.
const STATUTS_DONNANT_ACCES = ['essai', 'actif'];

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function getAbonnement(exploitantId) {
  return db.prepare('SELECT * FROM abonnements WHERE exploitant_id = ?').get(exploitantId) || null;
}

/**
 * Un abonnement est valide si son statut donne accès et que sa date de fin
 * (si elle existe) n'est pas dépassée.
 */
export function abonnementValide(abonnement, aujourdhui = new Date().toISOString().slice(0, 10)) {
  if (!abonnement || !STATUTS_DONNANT_ACCES.includes(abonnement.statut)) return false;
  return !abonnement.fin || abonnement.fin >= aujourdhui;
}

/**
 * Valide les champs reçus du back-office. Retourne { erreur } ou { valeurs }.
 */
export function validerAbonnement(body) {
  const formule = String(body.formule || '');
  const statut = String(body.statut || 'essai');
  if (!FORMULES.some((f) => f.code === formule)) return { erreur: 'Formule inconnue' };
  if (!STATUTS_ABONNEMENT.includes(statut)) return { erreur: "Statut d'abonnement inconnu" };
  const date = (v) => (v == null || v === '' ? null : String(v));
  const debut = date(body.debut);
  const fin = date(body.fin);
  if ((debut && !DATE_REGEX.test(debut)) || (fin && !DATE_REGEX.test(fin)))
    return { erreur: 'Dates attendues au format AAAA-MM-JJ' };
  if (debut && fin && fin < debut) return { erreur: 'La date de fin précède la date de début' };
  const texte = (v) => (v == null || String(v).trim() === '' ? null : String(v).trim());
  return {
    valeurs: {
      formule,
      statut,
      debut,
      fin,
      fournisseur: texte(body.fournisseur),
      fournisseur_client_id: texte(body.fournisseur_client_id),
      fournisseur_abonnement_id: texte(body.fournisseur_abonnement_id),
      notes: texte(body.notes),
    },
  };
}

export function enregistrerAbonnement(exploitantId, v) {
  db.prepare(
    `INSERT INTO abonnements (exploitant_id, formule, statut, debut, fin, fournisseur,
       fournisseur_client_id, fournisseur_abonnement_id, notes, maj_le)
     VALUES (@exploitant_id, @formule, @statut, @debut, @fin, @fournisseur,
       @fournisseur_client_id, @fournisseur_abonnement_id, @notes, datetime('now'))
     ON CONFLICT (exploitant_id) DO UPDATE SET
       formule = excluded.formule, statut = excluded.statut, debut = excluded.debut, fin = excluded.fin,
       fournisseur = excluded.fournisseur, fournisseur_client_id = excluded.fournisseur_client_id,
       fournisseur_abonnement_id = excluded.fournisseur_abonnement_id, notes = excluded.notes,
       maj_le = excluded.maj_le`
  ).run({ exploitant_id: exploitantId, ...v });
  return getAbonnement(exploitantId);
}

/**
 * Middleware (à placer après authRequis) pour réserver des routes aux abonnés.
 * Pas encore branché : à activer quand la facturation sera en place.
 */
export function abonnementRequis(req, res, next) {
  if (abonnementValide(getAbonnement(req.exploitant.id))) return next();
  res.status(402).json({ error: 'Un abonnement actif est nécessaire pour cette fonctionnalité.' });
}
