// Libellés et formats partagés par l'application.

/**
 * Niveau de croissance à partir du GMQ (g/jour) : couleur, icône et mots simples.
 * Repères : moins de 800 g/j faible, de 800 à 1 100 g/j correcte, au-delà bonne.
 */
export function niveauCroissance(gmq) {
  if (gmq == null) return { classe: 'none', icone: 'attente', court: 'En attente', long: 'En attente de pesées' };
  if (gmq < 800) return { classe: 'low', icone: 'baisse', court: 'Faible', long: 'Croissance faible' };
  if (gmq < 1100) return { classe: 'mid', icone: 'stable', court: 'Correcte', long: 'Croissance correcte' };
  return { classe: 'good', icone: 'hausse', court: 'Bonne', long: 'Bonne croissance' };
}

const FORMAT_DATE = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

// '2026-03-01' -> '1 mars 2026' (date ISO interprétée sans décalage horaire)
export function dateLisible(iso) {
  if (!iso) return '';
  const [a, m, j] = iso.split('-').map(Number);
  return FORMAT_DATE.format(new Date(a, m - 1, j));
}

// 1050 -> '1 050' ; nombre(1.755, 2) -> '1,76'
export function nombre(n, decimales = 0) {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: decimales }).format(n);
}
