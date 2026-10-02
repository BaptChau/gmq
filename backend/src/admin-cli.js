// Création / réinitialisation d'un compte administrateur du back-office.
// Usage : npm run admin -- <email> [nom]
//   (Docker : docker compose exec backend node src/admin-cli.js <email> [nom])
// Le mot de passe est demandé au clavier pour ne pas apparaître dans l'historique du shell.
import { createInterface } from 'node:readline';
import db from './db.js';
import { hacherMotDePasse, EMAIL_REGEX } from './auth.js';

const [email, ...nomParts] = process.argv.slice(2);
const nom = nomParts.join(' ') || null;

if (!email || !EMAIL_REGEX.test(email)) {
  console.error('Usage : npm run admin -- <email> [nom]');
  process.exit(1);
}

// Lecture du mot de passe sans l'afficher à l'écran
function demanderMotDePasse(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(question)) rl.output.write(s); };
    rl.question(question, (reponse) => {
      rl.output.write('\n');
      rl.close();
      resolve(reponse);
    });
  });
}

const motDePasse = await demanderMotDePasse('Mot de passe (10 caractères minimum) : ');
if (motDePasse.length < 10) {
  console.error('Mot de passe trop court.');
  process.exit(1);
}
if ((await demanderMotDePasse('Confirmez le mot de passe : ')) !== motDePasse) {
  console.error('Les mots de passe ne correspondent pas.');
  process.exit(1);
}

const hash = hacherMotDePasse(motDePasse);
const existant = db.prepare('SELECT id FROM admins WHERE email = ?').get(email);
if (existant) {
  // Réinitialisation : les sessions en cours de cet admin sont fermées
  db.prepare('UPDATE admins SET mot_de_passe = ?, nom = COALESCE(?, nom), jeton_version = jeton_version + 1 WHERE id = ?')
    .run(hash, nom, existant.id);
  console.log(`Mot de passe de l'admin ${email} réinitialisé.`);
} else {
  db.prepare('INSERT INTO admins (email, mot_de_passe, nom) VALUES (?, ?, ?)').run(email.toLowerCase(), hash, nom);
  console.log(`Admin ${email} créé.`);
}
