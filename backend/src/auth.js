import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import db from './db.js';

// Secret de signature des jetons JWT.
// En production, JWT_SECRET DOIT être défini (voir .env). En dev on tolère un défaut.
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-a-changer';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET doit être défini en production.');
  process.exit(1);
}

export function hacherMotDePasse(motDePasse) {
  return bcrypt.hashSync(motDePasse, 10);
}

export function verifierMotDePasse(motDePasse, hash) {
  return bcrypt.compareSync(motDePasse, hash);
}

// Les jetons portent un rôle : un jeton exploitant n'ouvre jamais le back-office, et inversement.
const ROLE_ADMIN = 'admin';

// Longueur minimale commune aux mots de passe (inscription, changement par un admin).
export const MOT_DE_PASSE_MIN = 6;
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function lireJeton(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

export function signerJeton(exploitant) {
  return jwt.sign(
    { id: exploitant.id, email: exploitant.email, nom: exploitant.nom, v: exploitant.jeton_version },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

// Message renvoyé quand un compte existe mais ne peut pas (ou plus) se connecter.
export function messageStatut(statut) {
  if (statut === 'en_attente') return 'Votre compte est en attente de validation.';
  if (statut === 'gele') return 'Votre compte est suspendu. Contactez le support.';
  return null;
}

/**
 * Middleware Express : exige un jeton exploitant valide et attache req.exploitant.
 * Le compte est relu en base à chaque requête : un gel ou un changement de mot de
 * passe par un admin prend effet immédiatement.
 */
export function authRequis(req, res, next) {
  const token = lireJeton(req);
  if (!token) return res.status(401).json({ error: 'Authentification requise' });
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Session invalide ou expirée' });
  }
  if (payload.role === ROLE_ADMIN) return res.status(401).json({ error: 'Session invalide ou expirée' });
  const exploitant = db
    .prepare('SELECT id, email, nom, statut, jeton_version FROM exploitants WHERE id = ?')
    .get(payload.id);
  if (!exploitant || (payload.v ?? 0) !== exploitant.jeton_version)
    return res.status(401).json({ error: 'Session invalide ou expirée' });
  const bloque = messageStatut(exploitant.statut);
  if (bloque) return res.status(403).json({ error: bloque, statut: exploitant.statut });
  req.exploitant = exploitant;
  next();
}

/* ---------------- Code d'activation (première connexion admin) ---------------- */

// Durée de validité d'un code d'activation
export const ACTIVATION_HEURES = 24;
const ALPHABET_ACTIVATION = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans 0/O ni 1/I

// Code aléatoire de 16 caractères (80 bits), présenté par groupes : ABCD-EFGH-JKLM-NPQR
export function genererCodeActivation() {
  const octets = randomBytes(16);
  const brut = [...octets].map((o) => ALPHABET_ACTIVATION[o % ALPHABET_ACTIVATION.length]).join('');
  return brut.match(/.{4}/g).join('-');
}

// Les tirets, espaces et la casse sont ignorés à la saisie
function normaliserCodeActivation(code) {
  return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function hacherCodeActivation(code) {
  return createHash('sha256').update(normaliserCodeActivation(code)).digest('hex');
}

/** Vérifie un code d'activation saisi contre l'admin (hash + expiration). */
export function verifierCodeActivation(admin, code, maintenant = new Date()) {
  if (!admin.activation_hash || !admin.activation_expire) return false;
  // Date ISO (UTC) ; une date illisible donne NaN et est donc refusée
  if (!(new Date(admin.activation_expire) > maintenant)) return false;
  const saisi = Buffer.from(hacherCodeActivation(code), 'hex');
  return timingSafeEqual(saisi, Buffer.from(admin.activation_hash, 'hex'));
}

// Jeton de courte durée remis après validation du code d'activation : il ne donne
// accès qu'à la finalisation de l'enrôlement TOTP, pas au back-office.
const ROLE_ENROLEMENT = 'admin-enrolement';

export function signerJetonAdmin(admin) {
  return jwt.sign(
    { id: admin.id, identifiant: admin.identifiant, role: ROLE_ADMIN, v: admin.jeton_version },
    JWT_SECRET,
    { expiresIn: process.env.ADMIN_JWT_EXPIRES_IN || '8h' }
  );
}

export function signerJetonEnrolement(admin) {
  return jwt.sign({ id: admin.id, role: ROLE_ENROLEMENT, v: admin.jeton_version }, JWT_SECRET, {
    expiresIn: '15m',
  });
}

// Fabrique un middleware qui exige un jeton admin du rôle donné et attache req.admin.
function exigerJetonAdmin(role) {
  return (req, res, next) => {
    const token = lireJeton(req);
    if (!token) return res.status(401).json({ error: 'Authentification requise' });
    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Session invalide ou expirée' });
    }
    if (payload.role !== role) return res.status(401).json({ error: 'Session invalide ou expirée' });
    const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(payload.id);
    if (!admin || payload.v !== admin.jeton_version)
      return res.status(401).json({ error: 'Session invalide ou expirée' });
    req.admin = admin;
    next();
  };
}

/** Middleware Express : exige une session administrateur. */
export const adminRequis = exigerJetonAdmin(ROLE_ADMIN);

/** Middleware Express : exige un jeton d'enrôlement (première connexion en cours). */
export const enrolementRequis = exigerJetonAdmin(ROLE_ENROLEMENT);
