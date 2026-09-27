import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

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

export function signerJeton(exploitant) {
  return jwt.sign(
    { id: exploitant.id, email: exploitant.email, nom: exploitant.nom },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/**
 * Middleware Express : exige un jeton valide et attache req.exploitant.
 */
export function authRequis(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentification requise' });
  try {
    req.exploitant = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Session invalide ou expirée' });
  }
}
