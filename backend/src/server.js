import express from 'express';
import cors from 'cors';
import db, { calculerGmq, RENDEMENT_DEFAUT, RENDEMENTS_AUTORISES, EMAIL_ANCIENNES_DONNEES } from './db.js';
import { authRequis, hacherMotDePasse, verifierMotDePasse, signerJeton } from './auth.js';

const app = express();

// CORS : en production on peut restreindre aux origines autorisées via CORS_ORIGIN
// (liste séparée par des virgules). Sans variable, on autorise tout (utile en dev).
const corsOrigin = process.env.CORS_ORIGIN;
app.use(cors(corsOrigin ? { origin: corsOrigin.split(',').map((o) => o.trim()) } : {}));
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Endpoint de santé pour le healthcheck Docker / orchestrateur
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Configuration exposée au frontend (valeurs du sélecteur de rendement)
app.get('/api/config', (req, res) => {
  res.json({ rendement_defaut: RENDEMENT_DEFAUT, rendements: RENDEMENTS_AUTORISES });
});

/* ------------------------- AUTHENTIFICATION ------------------------- */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function exploitantPublic(e) {
  return { id: e.id, email: e.email, nom: e.nom };
}

app.post('/api/auth/register', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const motDePasse = String(req.body.mot_de_passe || '');
  const nom = String(req.body.nom || '').trim() || null;
  if (!EMAIL_REGEX.test(email)) return res.status(400).json({ error: 'Adresse email invalide' });
  if (motDePasse.length < 6)
    return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères' });
  if (db.prepare('SELECT 1 FROM exploitants WHERE email = ?').get(email))
    return res.status(409).json({ error: 'Un compte existe déjà avec cet email' });

  const hash = hacherMotDePasse(motDePasse);

  // Données antérieures aux comptes : réclamées par l'email ANCIENNES_DONNEES_EMAIL
  // s'il est défini, sinon par le premier compte créé.
  const proprietaireAttendu = (process.env.ANCIENNES_DONNEES_EMAIL || '').trim().toLowerCase();
  const provisoire = db.prepare('SELECT id FROM exploitants WHERE email = ?').get(EMAIL_ANCIENNES_DONNEES);
  let id;
  if (provisoire && (!proprietaireAttendu || proprietaireAttendu === email)) {
    db.prepare('UPDATE exploitants SET email = ?, mot_de_passe = ?, nom = ? WHERE id = ?').run(
      email, hash, nom, provisoire.id
    );
    id = provisoire.id;
  } else {
    id = db
      .prepare('INSERT INTO exploitants (email, mot_de_passe, nom) VALUES (?, ?, ?)')
      .run(email, hash, nom).lastInsertRowid;
  }

  const exploitant = db.prepare('SELECT * FROM exploitants WHERE id = ?').get(id);
  res.status(201).json({ token: signerJeton(exploitant), exploitant: exploitantPublic(exploitant) });
});

app.post('/api/auth/login', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const motDePasse = String(req.body.mot_de_passe || '');
  const exploitant = db.prepare('SELECT * FROM exploitants WHERE email = ?').get(email);
  if (!exploitant || !exploitant.mot_de_passe || !verifierMotDePasse(motDePasse, exploitant.mot_de_passe))
    return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
  res.json({ token: signerJeton(exploitant), exploitant: exploitantPublic(exploitant) });
});

app.get('/api/auth/me', authRequis, (req, res) => {
  const exploitant = db.prepare('SELECT * FROM exploitants WHERE id = ?').get(req.exploitant.id);
  if (!exploitant) return res.status(401).json({ error: 'Compte introuvable' });
  res.json(exploitantPublic(exploitant));
});

// Toutes les routes métier ci-dessous exigent d'être connecté
app.use(['/api/meres', '/api/broutards', '/api/pesees'], authRequis);

// Petit helper pour attacher le GMQ + infos mère/carcasse à un broutard
function enrichirBroutard(b) {
  const gmq = calculerGmq(b.exploitant_id, b.numero);
  return {
    ...b,
    gmq_g_jour: gmq.gmq_g_jour,
    nb_pesees: gmq.nb_pesees,
    premiere_pesee: gmq.premier,
    derniere_pesee: gmq.dernier,
    rendement_applique: gmq.rendement, // % réellement utilisé (propre ou défaut)
    poids_carcasse: gmq.poids_carcasse,
    poids_vif_estime: gmq.poids_vif_estime,
    a_carcasse: gmq.a_carcasse,
  };
}

// Valide/normalise un rendement reçu : null accepté (=> défaut), sinon doit être autorisé.
function normaliserRendement(valeur) {
  if (valeur == null || valeur === '') return { ok: true, value: null };
  const n = Number(valeur);
  if (!RENDEMENTS_AUTORISES.includes(n)) return { ok: false };
  return { ok: true, value: n };
}

// Vérifie qu'une mère (si fournie) appartient bien à l'exploitant.
function mereAutorisee(mereId, exploitantId) {
  if (!mereId) return true;
  return Boolean(db.prepare('SELECT 1 FROM meres WHERE id = ? AND exploitant_id = ?').get(mereId, exploitantId));
}

const SELECT_BROUTARD = `SELECT b.*, m.numero AS mere_numero, m.nom AS mere_nom
       FROM broutards b LEFT JOIN meres m ON m.id = b.mere_id
       WHERE b.exploitant_id = ?`;

function getBroutard(exploitantId, numero) {
  return db.prepare(`${SELECT_BROUTARD} AND b.numero = ?`).get(exploitantId, numero);
}

/* ----------------------------- MÈRES ----------------------------- */

app.get('/api/meres', (req, res) => {
  const meres = db.prepare('SELECT * FROM meres WHERE exploitant_id = ? ORDER BY numero').all(req.exploitant.id);
  res.json(meres);
});

app.post('/api/meres', (req, res) => {
  const { numero, nom } = req.body;
  if (!numero) return res.status(400).json({ error: 'Le numéro de la mère est requis' });
  try {
    const info = db
      .prepare('INSERT INTO meres (exploitant_id, numero, nom) VALUES (?, ?, ?)')
      .run(req.exploitant.id, numero, nom || null);
    res.status(201).json(db.prepare('SELECT * FROM meres WHERE id = ?').get(info.lastInsertRowid));
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE' || String(e).includes('UNIQUE'))
      return res.status(409).json({ error: 'Ce numéro de mère existe déjà' });
    res.status(500).json({ error: String(e) });
  }
});

app.put('/api/meres/:id', (req, res) => {
  const { numero, nom } = req.body;
  if (!numero) return res.status(400).json({ error: 'Le numéro de la mère est requis' });
  try {
    const info = db
      .prepare('UPDATE meres SET numero = ?, nom = ? WHERE id = ? AND exploitant_id = ?')
      .run(numero, nom || null, req.params.id, req.exploitant.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Mère introuvable' });
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE' || String(e).includes('UNIQUE'))
      return res.status(409).json({ error: 'Ce numéro de mère existe déjà' });
    return res.status(500).json({ error: String(e) });
  }
  res.json(db.prepare('SELECT * FROM meres WHERE id = ?').get(req.params.id));
});

app.delete('/api/meres/:id', (req, res) => {
  const info = db.prepare('DELETE FROM meres WHERE id = ? AND exploitant_id = ?').run(req.params.id, req.exploitant.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Mère introuvable' });
  res.status(204).end();
});

/* --------------------------- BROUTARDS --------------------------- */

app.get('/api/broutards', (req, res) => {
  const broutards = db.prepare(`${SELECT_BROUTARD} ORDER BY b.numero`).all(req.exploitant.id);
  res.json(broutards.map(enrichirBroutard));
});

app.get('/api/broutards/:numero', (req, res) => {
  const b = getBroutard(req.exploitant.id, req.params.numero);
  if (!b) return res.status(404).json({ error: 'Broutard introuvable' });
  const pesees = db
    .prepare('SELECT * FROM pesees WHERE exploitant_id = ? AND broutard_numero = ? ORDER BY date ASC, id ASC')
    .all(req.exploitant.id, req.params.numero);
  res.json({ ...enrichirBroutard(b), pesees });
});

app.post('/api/broutards', (req, res) => {
  const { numero, mere_id, debut_engraissement, rendement } = req.body;
  if (!numero || !debut_engraissement)
    return res.status(400).json({ error: 'numero et debut_engraissement sont requis' });
  const rd = normaliserRendement(rendement);
  if (!rd.ok)
    return res.status(400).json({ error: `Rendement invalide (autorisés : ${RENDEMENTS_AUTORISES.join(', ')} %)` });
  if (!mereAutorisee(mere_id, req.exploitant.id)) return res.status(400).json({ error: 'Mère introuvable' });
  try {
    db.prepare(
      'INSERT INTO broutards (exploitant_id, numero, mere_id, debut_engraissement, rendement) VALUES (?, ?, ?, ?, ?)'
    ).run(req.exploitant.id, numero, mere_id || null, debut_engraissement, rd.value);
    res.status(201).json(enrichirBroutard(getBroutard(req.exploitant.id, numero)));
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE' || String(e).includes('UNIQUE'))
      return res.status(409).json({ error: 'Ce numéro de broutard existe déjà' });
    res.status(500).json({ error: String(e) });
  }
});

app.put('/api/broutards/:numero', (req, res) => {
  const { mere_id, debut_engraissement, rendement } = req.body;
  const rd = normaliserRendement(rendement);
  if (!rd.ok)
    return res.status(400).json({ error: `Rendement invalide (autorisés : ${RENDEMENTS_AUTORISES.join(', ')} %)` });
  if (!mereAutorisee(mere_id, req.exploitant.id)) return res.status(400).json({ error: 'Mère introuvable' });
  const info = db
    .prepare(
      'UPDATE broutards SET mere_id = ?, debut_engraissement = ?, rendement = ? WHERE exploitant_id = ? AND numero = ?'
    )
    .run(mere_id || null, debut_engraissement, rd.value, req.exploitant.id, req.params.numero);
  if (info.changes === 0) return res.status(404).json({ error: 'Broutard introuvable' });
  res.json(enrichirBroutard(getBroutard(req.exploitant.id, req.params.numero)));
});

app.delete('/api/broutards/:numero', (req, res) => {
  const info = db
    .prepare('DELETE FROM broutards WHERE exploitant_id = ? AND numero = ?')
    .run(req.exploitant.id, req.params.numero);
  if (info.changes === 0) return res.status(404).json({ error: 'Broutard introuvable' });
  res.status(204).end();
});

/* ---------------------------- PESÉES ----------------------------- */

app.get('/api/broutards/:numero/pesees', (req, res) => {
  const pesees = db
    .prepare('SELECT * FROM pesees WHERE exploitant_id = ? AND broutard_numero = ? ORDER BY date ASC, id ASC')
    .all(req.exploitant.id, req.params.numero);
  res.json(pesees);
});

app.post('/api/broutards/:numero/pesees', (req, res) => {
  const { date, poids, type } = req.body;
  const broutard = getBroutard(req.exploitant.id, req.params.numero);
  if (!broutard) return res.status(404).json({ error: 'Broutard introuvable' });
  if (!date || poids == null) return res.status(400).json({ error: 'date et poids sont requis' });
  const typePesee = type || 'vif';
  if (!['vif', 'carcasse'].includes(typePesee))
    return res.status(400).json({ error: "type invalide (attendu 'vif' ou 'carcasse')" });
  const info = db
    .prepare('INSERT INTO pesees (exploitant_id, broutard_numero, date, poids, type) VALUES (?, ?, ?, ?, ?)')
    .run(req.exploitant.id, req.params.numero, date, poids, typePesee);
  res.status(201).json(db.prepare('SELECT * FROM pesees WHERE id = ?').get(info.lastInsertRowid));
});

app.delete('/api/pesees/:id', (req, res) => {
  const info = db.prepare('DELETE FROM pesees WHERE id = ? AND exploitant_id = ?').run(req.params.id, req.exploitant.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Pesée introuvable' });
  res.status(204).end();
});

app.listen(PORT, () => {
  console.log(`API GMQ démarrée sur http://localhost:${PORT}`);
});
