// Jeu de données de démonstration
import db from './db.js';

db.exec('DELETE FROM pesees; DELETE FROM broutards; DELETE FROM meres;');

const insMere = db.prepare('INSERT INTO meres (numero, nom) VALUES (?, ?)');
const mere1 = insMere.run('FR2201', 'Marguerite').lastInsertRowid;
const mere2 = insMere.run('FR2202', 'Blanchette').lastInsertRowid;

// rendement : null => défaut global (58 %), sinon valeur propre à l'animal
const insBrout = db.prepare(
  'INSERT INTO broutards (numero, mere_id, debut_engraissement, rendement) VALUES (?, ?, ?, ?)'
);
insBrout.run('FR3001', mere1, '2026-03-01', null); // rendement par défaut
insBrout.run('FR3002', mere1, '2026-03-15', 60); // rendement propre 60 %
insBrout.run('FR3003', mere2, '2026-04-01', null);

const insPesee = db.prepare(
  'INSERT INTO pesees (broutard_numero, date, poids, type) VALUES (?, ?, ?, ?)'
);
// FR3001 : pesées sur pied puis carcasse à l'abattoir
insPesee.run('FR3001', '2026-03-01', 280, 'vif');
insPesee.run('FR3001', '2026-04-01', 320, 'vif');
insPesee.run('FR3001', '2026-05-01', 365, 'vif');
insPesee.run('FR3001', '2026-06-15', 270, 'carcasse'); // carcasse -> ~466 kg vif à 58 %

// FR3002 : deux pesées sur pied (pas encore abattu)
insPesee.run('FR3002', '2026-03-15', 300, 'vif');
insPesee.run('FR3002', '2026-05-15', 390, 'vif');

console.log('Base de démonstration remplie.');
