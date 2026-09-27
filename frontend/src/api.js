// Petit client HTTP pour l'API GMQ
const BASE = '/api';
const CLE_JETON = 'gmq_token';

// Jeton JWT de la session, conservé dans le navigateur
let token = null;
try { token = localStorage.getItem(CLE_JETON); } catch { /* stockage indisponible */ }

export function getToken() {
  return token;
}

export function setToken(valeur) {
  token = valeur;
  try {
    if (valeur) localStorage.setItem(CLE_JETON, valeur);
    else localStorage.removeItem(CLE_JETON);
  } catch { /* stockage indisponible */ }
}

// Appelé quand le serveur refuse le jeton (session expirée) : défini par App.vue
let surSessionExpiree = () => {};
export function onSessionExpiree(fn) {
  surSessionExpiree = fn;
}

async function req(url, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + url, { ...options, headers });
  if (res.status === 401 && token) {
    setToken(null);
    surSessionExpiree();
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Erreur ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}

export const api = {
  // Authentification
  register: (data) => req('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  login: (data) => req('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  me: () => req('/auth/me'),

  // Configuration (valeurs de rendement pour le sélecteur)
  getConfig: () => req('/config'),

  // Mères
  listMeres: () => req('/meres'),
  createMere: (data) => req('/meres', { method: 'POST', body: JSON.stringify(data) }),
  deleteMere: (id) => req(`/meres/${id}`, { method: 'DELETE' }),

  // Broutards
  listBroutards: () => req('/broutards'),
  getBroutard: (numero) => req(`/broutards/${numero}`),
  createBroutard: (data) => req('/broutards', { method: 'POST', body: JSON.stringify(data) }),
  deleteBroutard: (numero) => req(`/broutards/${numero}`, { method: 'DELETE' }),

  // Pesées
  addPesee: (numero, data) => req(`/broutards/${numero}/pesees`, { method: 'POST', body: JSON.stringify(data) }),
  deletePesee: (id) => req(`/pesees/${id}`, { method: 'DELETE' }),
};
