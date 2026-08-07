import express from 'express';
import cors from 'cors';
import db, { calculerGmq, RENDEMENT_DEFAUT, RENDEMENTS_AUTORISES } from './db.js';

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

// Petit helper pour attacher le GMQ + infos mère/carcasse à un broutard
function enrichirBroutard(b) {
  const gmq = calculerGmq(b.numero);
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

/* ----------------------------- MÈRES ----------------------------- */

app.get('/api/meres', (req, res) => {
  const meres = db.prepare('SELECT * FROM meres ORDER BY numero').all();
  res.json(meres);
});

app.post('/api/meres', (req, res) => {
  const { numero, nom } = req.body;
  if (!numero) return res.status(400).json({ error: 'Le numéro de la mère est requis' });
  try {
    const info = db.prepare('INSERT INTO meres (numero, nom) VALUES (?, ?)').run(numero, nom || null);
    res.status(201).json(db.prepare('SELECT * FROM meres WHERE id = ?').get(info.lastInsertRowid));
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE' || String(e).includes('UNIQUE'))
      return res.status(409).json({ error: 'Ce numéro de mère existe déjà' });
    res.status(500).json({ error: String(e) });
  }
});

app.put('/api/meres/:id', (req, res) => {
  const { numero, nom } = req.body;
  const info = db.prepare('UPDATE meres SET numero = ?, nom = ? WHERE id = ?').run(numero, nom || null, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Mère introuvable' });
  res.json(db.prepare('SELECT * FROM meres WHERE id = ?').get(req.params.id));
});

app.delete('/api/meres/:id', (req, res) => {
  const info = db.prepare('DELETE FROM meres WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Mère introuvable' });
  res.status(204).end();
});

/* --------------------------- BROUTARDS --------------------------- */

app.get('/api/broutards', (req, res) => {
  const broutards = db
    .prepare(
      `SELECT b.*, m.numero AS mere_numero, m.nom AS mere_nom
       FROM broutards b LEFT JOIN meres m ON m.id = b.mere_id
       ORDER BY b.numero`
    )
    .all();
  res.json(broutards.map(enrichirBroutard));
});

app.get('/api/broutards/:numero', (req, res) => {
  const b = db
    .prepare(
      `SELECT b.*, m.numero AS mere_numero, m.nom AS mere_nom
       FROM broutards b LEFT JOIN meres m ON m.id = b.mere_id
       WHERE b.numero = ?`
    )
    .get(req.params.numero);
  if (!b) return res.status(404).json({ error: 'Broutard introuvable' });
  const pesees = db
    .prepare('SELECT * FROM pesees WHERE broutard_numero = ? ORDER BY date ASC, id ASC')
    .all(req.params.numero);
  res.json({ ...enrichirBroutard(b), pesees });
});

app.post('/api/broutards', (req, res) => {
  const { numero, mere_id, debut_engraissement, rendement } = req.body;
  if (!numero || !debut_engraissement)
    return res.status(400).json({ error: 'numero et debut_engraissement sont requis' });
  const rd = normaliserRendement(rendement);
  if (!rd.ok)
    return res.status(400).json({ error: `Rendement invalide (autorisés : ${RENDEMENTS_AUTORISES.join(', ')} %)` });
  try {
    db.prepare(
      'INSERT INTO broutards (numero, mere_id, debut_engraissement, rendement) VALUES (?, ?, ?, ?)'
    ).run(numero, mere_id || null, debut_engraissement, rd.value);
    res.status(201).json(enrichirBroutard(db.prepare('SELECT * FROM broutards WHERE numero = ?').get(numero)));
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
  const info = db
    .prepare('UPDATE broutards SET mere_id = ?, debut_engraissement = ?, rendement = ? WHERE numero = ?')
    .run(mere_id || null, debut_engraissement, rd.value, req.params.numero);
  if (info.changes === 0) return res.status(404).json({ error: 'Broutard introuvable' });
  res.json(enrichirBroutard(db.prepare('SELECT * FROM broutards WHERE numero = ?').get(req.params.numero)));
});

app.delete('/api/broutards/:numero', (req, res) => {
  const info = db.prepare('DELETE FROM broutards WHERE numero = ?').run(req.params.numero);
  if (info.changes === 0) return res.status(404).json({ error: 'Broutard introuvable' });
  res.status(204).end();
});

/* ---------------------------- PESÉES ----------------------------- */

app.get('/api/broutards/:numero/pesees', (req, res) => {
  const pesees = db
    .prepare('SELECT * FROM pesees WHERE broutard_numero = ? ORDER BY date ASC, id ASC')
    .all(req.params.numero);
  res.json(pesees);
});

app.post('/api/broutards/:numero/pesees', (req, res) => {
  const { date, poids, type } = req.body;
  const broutard = db.prepare('SELECT numero FROM broutards WHERE numero = ?').get(req.params.numero);
  if (!broutard) return res.status(404).json({ error: 'Broutard introuvable' });
  if (!date || poids == null) return res.status(400).json({ error: 'date et poids sont requis' });
  const typePesee = type || 'vif';
  if (!['vif', 'carcasse'].includes(typePesee))
    return res.status(400).json({ error: "type invalide (attendu 'vif' ou 'carcasse')" });
  const info = db
    .prepare('INSERT INTO pesees (broutard_numero, date, poids, type) VALUES (?, ?, ?, ?)')
    .run(req.params.numero, date, poids, typePesee);
  res.status(201).json(db.prepare('SELECT * FROM pesees WHERE id = ?').get(info.lastInsertRowid));
});

app.delete('/api/pesees/:id', (req, res) => {
  const info = db.prepare('DELETE FROM pesees WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Pesée introuvable' });
  res.status(204).end();
});

app.listen(PORT, () => {
  console.log(`API GMQ démarrée sur http://localhost:${PORT}`);
});
