// Routes du back-office (montées sur /api/admin).
// En production, nginx ne les expose que sur le sous-domaine backof.* (voir frontend/nginx.conf).
import { Router } from 'express';
import db, { EMAIL_ANCIENNES_DONNEES } from './db.js';
import {
  adminRequis, enrolementRequis, signerJetonAdmin, signerJetonEnrolement, verifierCodeActivation,
  hacherMotDePasse, MOT_DE_PASSE_MIN,
} from './auth.js';
import { verifierCode, genererSecret, uriOtpauth } from './totp.js';
import {
  FORMULES, STATUTS_ABONNEMENT, getAbonnement, validerAbonnement, enregistrerAbonnement, abonnementValide,
} from './abonnements.js';

const router = Router();

export const STATUTS_COMPTE = ['en_attente', 'actif', 'gele'];

function journaliser(adminId, action, exploitantId = null, details = null) {
  db.prepare('INSERT INTO admin_journal (admin_id, action, exploitant_id, details) VALUES (?, ?, ?, ?)').run(
    adminId, action, exploitantId, details ? JSON.stringify(details) : null
  );
}

function adminPublic(a) {
  return { id: a.id, identifiant: a.identifiant, nom: a.nom };
}

function getExploitant(id) {
  return db
    .prepare(
      `SELECT e.id, e.email, e.nom, e.statut, e.statut_motif, e.statut_maj_le, e.cree_le,
              (SELECT COUNT(*) FROM broutards b WHERE b.exploitant_id = e.id) AS nb_broutards
       FROM exploitants e WHERE e.id = ?`
    )
    .get(id);
}

function avecAbonnement(e) {
  const abonnement = getAbonnement(e.id);
  return { ...e, abonnement, abonnement_valide: abonnementValide(abonnement) };
}

/* -------------------------- CONNEXION ADMIN -------------------------- */

// Limite les essais de connexion : MAX_ECHECS échecs par identifiant sur FENETRE_MS.
// Un code TOTP n'a que 6 chiffres : la limite est volontairement basse.
const MAX_ECHECS = 5;
const FENETRE_MS = 15 * 60 * 1000;
const echecs = new Map(); // identifiant -> { n, depuis }

function tropDEchecs(identifiant) {
  const e = echecs.get(identifiant);
  if (!e) return false;
  if (Date.now() - e.depuis > FENETRE_MS) {
    echecs.delete(identifiant);
    return false;
  }
  return e.n >= MAX_ECHECS;
}

function noterEchec(identifiant) {
  const e = echecs.get(identifiant);
  if (!e || Date.now() - e.depuis > FENETRE_MS) echecs.set(identifiant, { n: 1, depuis: Date.now() });
  else e.n += 1;
}

/**
 * Connexion : identifiant + code.
 * - Admin enrôlé : le code est celui de l'application d'authentification → session.
 * - Première connexion (pas encore enrôlé) : le code est le code d'activation donné
 *   par admin-cli → on renvoie un secret TOTP à scanner et un jeton d'enrôlement.
 * Les deux cas répondent la même erreur en cas d'échec (pas d'indice sur le compte).
 */
router.post('/login', (req, res) => {
  const identifiant = String(req.body.identifiant || '').trim().toLowerCase();
  const code = String(req.body.code || '');
  if (tropDEchecs(identifiant))
    return res.status(429).json({ error: 'Trop de tentatives. Réessayez dans quelques minutes.' });
  const admin = db.prepare('SELECT * FROM admins WHERE identifiant = ?').get(identifiant);
  const refuser = () => {
    noterEchec(identifiant);
    res.status(401).json({ error: 'Identifiant ou code incorrect' });
  };
  if (!admin) return refuser();

  if (!admin.totp_secret) {
    // Première connexion : détection, puis préparation de l'enrôlement
    if (!verifierCodeActivation(admin, code)) return refuser();
    echecs.delete(identifiant);
    const secret = genererSecret();
    db.prepare('UPDATE admins SET totp_secret_attente = ? WHERE id = ?').run(secret, admin.id);
    return res.json({
      enrolement: {
        jeton: signerJetonEnrolement(admin),
        secret,
        uri: uriOtpauth(secret, admin.identifiant),
      },
    });
  }

  const pas = verifierCode(admin.totp_secret, code, admin.totp_dernier_pas);
  if (pas == null) return refuser();
  // Mémorise le pas utilisé : le même code ne pourra pas resservir
  db.prepare('UPDATE admins SET totp_dernier_pas = ? WHERE id = ?').run(pas, admin.id);
  echecs.delete(identifiant);
  res.json({ token: signerJetonAdmin(admin), admin: adminPublic(admin) });
});

// Fin de l'enrôlement : l'admin saisit le premier code de son application.
// Le secret devient définitif, le code d'activation est consommé, la session s'ouvre.
router.post('/enrolement', enrolementRequis, (req, res) => {
  const admin = req.admin;
  if (tropDEchecs(admin.identifiant))
    return res.status(429).json({ error: 'Trop de tentatives. Réessayez dans quelques minutes.' });
  if (admin.totp_secret || !admin.totp_secret_attente)
    return res.status(409).json({ error: 'Enrôlement déjà terminé ou expiré. Reconnectez-vous.' });
  const pas = verifierCode(admin.totp_secret_attente, req.body.code);
  if (pas == null) {
    noterEchec(admin.identifiant);
    return res.status(400).json({ error: 'Code incorrect. Vérifiez que l’heure du téléphone est à jour.' });
  }
  db.prepare(
    `UPDATE admins SET totp_secret = totp_secret_attente, totp_secret_attente = NULL, totp_dernier_pas = ?,
       activation_hash = NULL, activation_expire = NULL WHERE id = ?`
  ).run(pas, admin.id);
  echecs.delete(admin.identifiant);
  journaliser(admin.id, 'admin_enrolement');
  const maj = db.prepare('SELECT * FROM admins WHERE id = ?').get(admin.id);
  res.json({ token: signerJetonAdmin(maj), admin: adminPublic(maj) });
});

// Tout le reste exige une session admin
router.use(adminRequis);

router.get('/me', (req, res) => res.json(adminPublic(req.admin)));

/* ---------------------------- EXPLOITANTS ---------------------------- */

// Liste filtrable : ?statut=en_attente|actif|gele & ?q=texte (email ou nom)
router.get('/exploitants', (req, res) => {
  // Le compte provisoire des données antérieures aux comptes n'est pas un vrai exploitant
  const conditions = ['e.email <> ?'];
  const params = [EMAIL_ANCIENNES_DONNEES];
  if (req.query.statut) {
    if (!STATUTS_COMPTE.includes(req.query.statut)) return res.status(400).json({ error: 'Statut inconnu' });
    conditions.push('e.statut = ?');
    params.push(req.query.statut);
  }
  if (req.query.q) {
    conditions.push("(e.email LIKE ? ESCAPE '\\' OR e.nom LIKE ? ESCAPE '\\')");
    const motif = `%${String(req.query.q).replace(/[\\%_]/g, (c) => '\\' + c)}%`;
    params.push(motif, motif);
  }
  const ids = db.prepare(`SELECT e.id FROM exploitants e WHERE ${conditions.join(' AND ')} ORDER BY e.cree_le DESC, e.id DESC`).all(...params);
  res.json(ids.map(({ id }) => avecAbonnement(getExploitant(id))));
});

router.get('/exploitants/:id', (req, res) => {
  const e = getExploitant(req.params.id);
  if (!e) return res.status(404).json({ error: 'Exploitant introuvable' });
  const journal = db
    .prepare(
      `SELECT j.*, a.identifiant AS admin_identifiant FROM admin_journal j LEFT JOIN admins a ON a.id = j.admin_id
       WHERE j.exploitant_id = ? ORDER BY j.id DESC LIMIT 50`
    )
    .all(e.id);
  res.json({ ...avecAbonnement(e), journal });
});

// Validation / gel / réactivation d'un compte
router.patch('/exploitants/:id/statut', (req, res) => {
  const { statut } = req.body;
  const motif = String(req.body.motif || '').trim() || null;
  if (!STATUTS_COMPTE.includes(statut))
    return res.status(400).json({ error: `Statut invalide (attendu : ${STATUTS_COMPTE.join(', ')})` });
  const avant = getExploitant(req.params.id);
  if (!avant) return res.status(404).json({ error: 'Exploitant introuvable' });
  db.prepare("UPDATE exploitants SET statut = ?, statut_motif = ?, statut_maj_le = datetime('now') WHERE id = ?").run(
    statut, statut === 'gele' ? motif : null, avant.id
  );
  journaliser(req.admin.id, 'statut', avant.id, { avant: avant.statut, apres: statut, motif });
  res.json(avecAbonnement(getExploitant(avant.id)));
});

// Changement du mot de passe d'un exploitant : ses sessions en cours sont fermées
router.put('/exploitants/:id/mot-de-passe', (req, res) => {
  const motDePasse = String(req.body.mot_de_passe || '');
  if (motDePasse.length < MOT_DE_PASSE_MIN)
    return res.status(400).json({ error: `Le mot de passe doit contenir au moins ${MOT_DE_PASSE_MIN} caractères` });
  const info = db
    .prepare('UPDATE exploitants SET mot_de_passe = ?, jeton_version = jeton_version + 1 WHERE id = ?')
    .run(hacherMotDePasse(motDePasse), req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Exploitant introuvable' });
  journaliser(req.admin.id, 'mot_de_passe', Number(req.params.id));
  res.status(204).end();
});

/* ---------------------------- ABONNEMENTS ---------------------------- */

router.get('/abonnements/formules', (req, res) => {
  res.json({ formules: FORMULES, statuts: STATUTS_ABONNEMENT });
});

router.get('/exploitants/:id/abonnement', (req, res) => {
  if (!getExploitant(req.params.id)) return res.status(404).json({ error: 'Exploitant introuvable' });
  res.json(getAbonnement(req.params.id));
});

router.put('/exploitants/:id/abonnement', (req, res) => {
  if (!getExploitant(req.params.id)) return res.status(404).json({ error: 'Exploitant introuvable' });
  const { erreur, valeurs } = validerAbonnement(req.body);
  if (erreur) return res.status(400).json({ error: erreur });
  const abonnement = enregistrerAbonnement(Number(req.params.id), valeurs);
  journaliser(req.admin.id, 'abonnement', Number(req.params.id), valeurs);
  res.json(abonnement);
});

router.delete('/exploitants/:id/abonnement', (req, res) => {
  const info = db.prepare('DELETE FROM abonnements WHERE exploitant_id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Aucun abonnement' });
  journaliser(req.admin.id, 'abonnement_supprime', Number(req.params.id));
  res.status(204).end();
});

/* ------------------------------ JOURNAL ------------------------------ */

router.get('/journal', (req, res) => {
  const limite = Math.min(Number(req.query.limite) || 100, 500);
  res.json(
    db
      .prepare(
        `SELECT j.*, a.identifiant AS admin_identifiant, e.email AS exploitant_email
         FROM admin_journal j
         LEFT JOIN admins a ON a.id = j.admin_id
         LEFT JOIN exploitants e ON e.id = j.exploitant_id
         ORDER BY j.id DESC LIMIT ?`
      )
      .all(limite)
  );
});

export default router;
