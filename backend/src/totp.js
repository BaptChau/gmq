// Codes à usage unique basés sur le temps (TOTP, RFC 6238), compatibles avec les
// applications d'authentification (Google Authenticator, Aegis, 1Password, Authy…).
// Paramètres standard : HMAC-SHA1, 6 chiffres, pas de 30 secondes.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const ALPHABET_BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const PAS_SECONDES = 30;
const CHIFFRES = 6;
// Tolérance d'horloge : on accepte le pas précédent et le suivant (±30 s)
const FENETRE = 1;

export function base32Encode(buffer) {
  let bits = 0;
  let valeur = 0;
  let sortie = '';
  for (const octet of buffer) {
    valeur = (valeur << 8) | octet;
    bits += 8;
    while (bits >= 5) {
      sortie += ALPHABET_BASE32[(valeur >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) sortie += ALPHABET_BASE32[(valeur << (5 - bits)) & 31];
  return sortie;
}

export function base32Decode(texte) {
  const propre = texte.toUpperCase().replace(/[\s=]/g, '');
  let bits = 0;
  let valeur = 0;
  const octets = [];
  for (const c of propre) {
    const i = ALPHABET_BASE32.indexOf(c);
    if (i === -1) throw new Error('Secret base32 invalide');
    valeur = (valeur << 5) | i;
    bits += 5;
    if (bits >= 8) {
      octets.push((valeur >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(octets);
}

// Nouveau secret aléatoire de 160 bits, encodé en base32 (format attendu par les applis)
export function genererSecret() {
  return base32Encode(randomBytes(20));
}

export function pasCourant(maintenant = Date.now()) {
  return Math.floor(maintenant / 1000 / PAS_SECONDES);
}

// Code (HOTP) pour un pas de temps donné
export function codePourPas(secretBuffer, pas, chiffres = CHIFFRES) {
  const compteur = Buffer.alloc(8);
  compteur.writeBigUInt64BE(BigInt(pas));
  const hmac = createHmac('sha1', secretBuffer).update(compteur).digest();
  const decalage = hmac[hmac.length - 1] & 0xf;
  const binaire = hmac.readUInt32BE(decalage) & 0x7fffffff;
  return String(binaire % 10 ** chiffres).padStart(chiffres, '0');
}

/**
 * Vérifie un code saisi. Retourne le pas de temps qui correspond (à mémoriser pour
 * refuser la réutilisation du même code), ou null si le code est invalide.
 * @param {string} secret secret base32
 * @param {string} code code saisi par l'utilisateur
 * @param {number} dernierPas dernier pas déjà utilisé (anti-rejeu)
 */
export function verifierCode(secret, code, dernierPas = -1, maintenant = Date.now()) {
  const saisi = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(saisi)) return null;
  const cle = base32Decode(secret);
  const courant = pasCourant(maintenant);
  for (let pas = courant - FENETRE; pas <= courant + FENETRE; pas++) {
    if (pas <= dernierPas) continue;
    if (timingSafeEqual(Buffer.from(codePourPas(cle, pas)), Buffer.from(saisi))) return pas;
  }
  return null;
}

// URI à scanner (QR code) ou à saisir dans l'application d'authentification
export function uriOtpauth(secret, identifiant, emetteur = 'GMQ Back-office') {
  const label = encodeURIComponent(`${emetteur}:${identifiant}`);
  const params = new URLSearchParams({
    secret, issuer: emetteur, algorithm: 'SHA1', digits: String(CHIFFRES), period: String(PAS_SECONDES),
  });
  return `otpauth://totp/${label}?${params}`;
}
