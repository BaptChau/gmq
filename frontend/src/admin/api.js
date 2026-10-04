// Client HTTP du back-office (routes /api/admin)
const BASE = '/api/admin';
const CLE_JETON = 'gmq_admin_token';

let token = null;
try { token = sessionStorage.getItem(CLE_JETON); } catch { /* stockage indisponible */ }

export function getToken() {
  return token;
}

// Jeton admin gardé pour l'onglet seulement (sessionStorage) : fermé => déconnecté
export function setToken(valeur) {
  token = valeur;
  try {
    if (valeur) sessionStorage.setItem(CLE_JETON, valeur);
    else sessionStorage.removeItem(CLE_JETON);
  } catch { /* stockage indisponible */ }
}

let surSessionExpiree = () => {};
export function onSessionExpiree(fn) {
  surSessionExpiree = fn;
}

// options.jeton : jeton à utiliser à la place de la session (ex. jeton d'enrôlement)
async function req(url, { jeton, ...options } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const auth = jeton || token;
  if (auth) headers.Authorization = `Bearer ${auth}`;
  const res = await fetch(BASE + url, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (res.status === 401 && token && !jeton) {
      setToken(null);
      surSessionExpiree();
    }
    throw new Error(body.error || `Erreur ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}

export const LIBELLES_STATUT = { en_attente: 'En attente', actif: 'Actif', gele: 'Gelé' };

const json = (method, data) => ({ method, body: JSON.stringify(data) });

export const api = {
  // Réponse : { token, admin } ou, à la première connexion, { enrolement: { jeton, secret, uri } }
  login: (data) => req('/login', json('POST', data)),
  terminerEnrolement: (jeton, code) => req('/enrolement', { ...json('POST', { code }), jeton }),
  me: () => req('/me'),

  listExploitants: (filtres = {}) => {
    const params = new URLSearchParams(Object.entries(filtres).filter(([, v]) => v)).toString();
    return req(`/exploitants${params ? `?${params}` : ''}`);
  },
  getExploitant: (id) => req(`/exploitants/${id}`),
  setStatut: (id, statut, motif) => req(`/exploitants/${id}/statut`, json('PATCH', { statut, motif })),
  setMotDePasse: (id, mot_de_passe) => req(`/exploitants/${id}/mot-de-passe`, json('PUT', { mot_de_passe })),

  getFormules: () => req('/abonnements/formules'),
  setAbonnement: (id, data) => req(`/exploitants/${id}/abonnement`, json('PUT', data)),
  deleteAbonnement: (id) => req(`/exploitants/${id}/abonnement`, { method: 'DELETE' }),

  journal: (limite) => req(`/journal?limite=${limite || 100}`),
};
