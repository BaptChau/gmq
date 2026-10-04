// Création d'un administrateur du back-office, ou réinitialisation de son accès.
// Usage : npm run admin -- <identifiant> [nom]
//   (Docker : docker compose exec backend node src/admin-cli.js <identifiant> [nom])
//
// Affiche un code d'activation à usage unique. À la première connexion sur
// backof.<domaine>, l'admin saisit son identifiant et ce code, puis enrôle son
// application d'authentification (QR code affiché dans le navigateur).
// Sur un admin existant (téléphone perdu…), l'ancien TOTP est supprimé et ses
// sessions sont fermées : il refait l'enrôlement avec le nouveau code.
import db from './db.js';
import { genererCodeActivation, hacherCodeActivation, ACTIVATION_HEURES } from './auth.js';

// « @ » autorisé : les admins migrés de l'ancien système gardent leur email comme identifiant
const IDENTIFIANT_REGEX = /^[a-z0-9._@-]{3,64}$/;

const [brut, ...nomParts] = process.argv.slice(2);
const identifiant = String(brut || '').trim().toLowerCase();
const nom = nomParts.join(' ') || null;

if (!IDENTIFIANT_REGEX.test(identifiant)) {
  console.error('Usage : npm run admin -- <identifiant> [nom]');
  console.error('Identifiant : 3 à 64 caractères parmi a-z, 0-9, « . », « _ », « - », « @ ».');
  process.exit(1);
}

const code = genererCodeActivation();
const hash = hacherCodeActivation(code);
const expire = new Date(Date.now() + ACTIVATION_HEURES * 3600 * 1000).toISOString();

const existant = db.prepare('SELECT id FROM admins WHERE identifiant = ?').get(identifiant);
if (existant) {
  db.prepare(
    `UPDATE admins SET totp_secret = NULL, totp_secret_attente = NULL, totp_dernier_pas = -1,
       activation_hash = ?, activation_expire = ?, nom = COALESCE(?, nom),
       jeton_version = jeton_version + 1 WHERE id = ?`
  ).run(hash, expire, nom, existant.id);
  console.log(`Accès de l'admin « ${identifiant} » réinitialisé (anciennes sessions fermées).`);
} else {
  db.prepare('INSERT INTO admins (identifiant, nom, activation_hash, activation_expire) VALUES (?, ?, ?, ?)').run(
    identifiant, nom, hash, expire
  );
  console.log(`Admin « ${identifiant} » créé.`);
}

console.log(`
Code d'activation (valable ${ACTIVATION_HEURES} h, à usage unique) :

    ${code}

Première connexion : ouvrez backof.<votre-domaine>, choisissez « Première connexion »,
saisissez l'identifiant « ${identifiant} » et ce code, puis suivez l'enrôlement.`);
