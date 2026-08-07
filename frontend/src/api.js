// Petit client HTTP pour l'API GMQ
const BASE = '/api';

async function req(url, options = {}) {
  const res = await fetch(BASE + url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Erreur ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}

export const api = {
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
