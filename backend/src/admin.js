// Routes du back-office (montées sur /api/admin).
// En production, nginx ne les expose que sur le sous-domaine backof.* (voir frontend/nginx.conf).
import { Router } from 'express';
import db, { EMAIL_ANCIENNES_DONNEES } from './db.js';
import {
  adminRequis, signerJetonAdmin, hacherMotDePasse, verifierMotDePasse, MOT_DE_PASSE_MIN,
} from './auth.js';
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
  return { id: a.id, email: a.email, nom: a.nom };
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

// Limite les essais de connexion : MAX_ECHECS échecs par email sur FENETRE_MS.
const MAX_ECHECS = 10;
const FENETRE_MS = 15 * 60 * 1000;
const echecs = new Map(); // email -> { n, depuis }

function tropDEchecs(email) {
  const e = echecs.get(email);
  if (!e) return false;
  if (Date.now() - e.depuis > FENETRE_MS) {
    echecs.delete(email);
    return false;
  }
  return e.n >= MAX_ECHECS;
}

function noterEchec(email) {
  const e = echecs.get(email);
  if (!e || Date.now() - e.depuis > FENETRE_MS) echecs.set(email, { n: 1, depuis: Date.now() });
  else e.n += 1;
}

router.post('/login', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const motDePasse = String(req.body.mot_de_passe || '');
  if (tropDEchecs(email))
    return res.status(429).json({ error: 'Trop de tentatives. Réessayez dans quelques minutes.' });
  const admin = db.prepare('SELECT * FROM admins WHERE email = ?').get(email);
  if (!admin || !verifierMotDePasse(motDePasse, admin.mot_de_passe)) {
    noterEchec(email);
    return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
  }
  echecs.delete(email);
  res.json({ token: signerJetonAdmin(admin), admin: adminPublic(admin) });
});

// Tout le reste exige une session admin
router.use(adminRequis);

router.get('/me', (req, res) => res.json(adminPublic(req.admin)));

// L'admin change son propre mot de passe (ses autres sessions sont fermées)
router.put('/me/mot-de-passe', (req, res) => {
  const ancien = String(req.body.ancien_mot_de_passe || '');
  const nouveau = String(req.body.mot_de_passe || '');
  const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.admin.id);
  if (!verifierMotDePasse(ancien, admin.mot_de_passe))
    return res.status(400).json({ error: 'Mot de passe actuel incorrect' });
  if (nouveau.length < 10)
    return res.status(400).json({ error: 'Le mot de passe admin doit contenir au moins 10 caractères' });
  db.prepare('UPDATE admins SET mot_de_passe = ?, jeton_version = jeton_version + 1 WHERE id = ?').run(
    hacherMotDePasse(nouveau), admin.id
  );
  journaliser(admin.id, 'admin_mot_de_passe');
  const maj = db.prepare('SELECT * FROM admins WHERE id = ?').get(admin.id);
  res.json({ token: signerJetonAdmin(maj), admin: adminPublic(maj) });
});

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
      `SELECT j.*, a.email AS admin_email FROM admin_journal j LEFT JOIN admins a ON a.id = j.admin_id
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
        `SELECT j.*, a.email AS admin_email, e.email AS exploitant_email
         FROM admin_journal j
         LEFT JOIN admins a ON a.id = j.admin_id
         LEFT JOIN exploitants e ON e.id = j.exploitant_id
         ORDER BY j.id DESC LIMIT ?`
      )
      .all(limite)
  );
});

export default router;
