// Jeu de données de démonstration
import db from './db.js';
import { hacherMotDePasse } from './auth.js';

db.exec('DELETE FROM pesees; DELETE FROM broutards; DELETE FROM meres; DELETE FROM exploitants;');

// Compte de démonstration : demo@gmq.fr / demo123
const exp = db
  .prepare("INSERT INTO exploitants (email, mot_de_passe, nom, statut) VALUES (?, ?, ?, 'actif')")
  .run('demo@gmq.fr', hacherMotDePasse('demo123'), 'GAEC de démonstration').lastInsertRowid;

const insMere = db.prepare('INSERT INTO meres (exploitant_id, numero, nom) VALUES (?, ?, ?)');
const mere1 = insMere.run(exp, 'FR2201', 'Marguerite').lastInsertRowid;
const mere2 = insMere.run(exp, 'FR2202', 'Blanchette').lastInsertRowid;

// rendement : null => défaut global (58 %), sinon valeur propre à l'animal
const insBrout = db.prepare(
  'INSERT INTO broutards (exploitant_id, numero, mere_id, debut_engraissement, rendement) VALUES (?, ?, ?, ?, ?)'
);
insBrout.run(exp, 'FR3001', mere1, '2026-03-01', null); // rendement par défaut
insBrout.run(exp, 'FR3002', mere1, '2026-03-15', 60); // rendement propre 60 %
insBrout.run(exp, 'FR3003', mere2, '2026-04-01', null);

const insPesee = db.prepare(
  'INSERT INTO pesees (exploitant_id, broutard_numero, date, poids, type) VALUES (?, ?, ?, ?, ?)'
);
// FR3001 : pesées sur pied puis carcasse à l'abattoir
insPesee.run(exp, 'FR3001', '2026-03-01', 280, 'vif');
insPesee.run(exp, 'FR3001', '2026-04-01', 320, 'vif');
insPesee.run(exp, 'FR3001', '2026-05-01', 365, 'vif');
insPesee.run(exp, 'FR3001', '2026-06-15', 270, 'carcasse'); // carcasse -> ~466 kg vif à 58 %

// FR3002 : deux pesées sur pied (pas encore abattu)
insPesee.run(exp, 'FR3002', '2026-03-15', 300, 'vif');
insPesee.run(exp, 'FR3002', '2026-05-15', 390, 'vif');

console.log('Base de démonstration remplie (compte demo@gmq.fr / demo123).');
