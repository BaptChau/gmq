<script setup>
import { ref, onMounted, watch } from 'vue';
import { api, getToken, setToken, onSessionExpiree, LIBELLES_STATUT } from './api.js';
import ExploitantPanel from './ExploitantPanel.vue';

const admin = ref(null);
const verificationSession = ref(Boolean(getToken()));

// Connexion
const email = ref('');
const motDePasse = ref('');
const enCours = ref(false);

const exploitants = ref([]);
const filtreStatut = ref('en_attente');
const recherche = ref('');
const selection = ref(null); // id de l'exploitant ouvert
const erreur = ref('');
const succes = ref('');
const formules = ref({ formules: [], statuts: [] });

const FILTRES = [
  { valeur: 'en_attente', libelle: 'À valider' },
  { valeur: 'actif', libelle: 'Actifs' },
  { valeur: 'gele', libelle: 'Gelés' },
  { valeur: '', libelle: 'Tous' },
];

let successTimer = null;
function afficherSucces(message) {
  succes.value = message;
  erreur.value = '';
  clearTimeout(successTimer);
  successTimer = setTimeout(() => { succes.value = ''; }, 4000);
}

async function connecter() {
  erreur.value = '';
  enCours.value = true;
  try {
    const data = await api.login({ email: email.value, mot_de_passe: motDePasse.value });
    setToken(data.token);
    motDePasse.value = '';
    admin.value = data.admin;
    await demarrer();
  } catch (e) {
    erreur.value = e.message;
  } finally {
    enCours.value = false;
  }
}

function deconnecter(message = '') {
  setToken(null);
  admin.value = null;
  exploitants.value = [];
  selection.value = null;
  erreur.value = message;
}

onSessionExpiree(() => deconnecter('Session expirée, reconnectez-vous.'));

async function charger() {
  try {
    exploitants.value = await api.listExploitants({ statut: filtreStatut.value, q: recherche.value.trim() });
  } catch (e) {
    erreur.value = e.message;
  }
}

async function demarrer() {
  formules.value = await api.getFormules();
  await charger();
}

// Recherche : on attend que la saisie se calme avant d'interroger l'API
let rechercheTimer = null;
watch(recherche, () => {
  clearTimeout(rechercheTimer);
  rechercheTimer = setTimeout(charger, 300);
});
watch(filtreStatut, charger);

async function onModifie(message) {
  afficherSucces(message);
  await charger();
}

function libelleAbonnement(e) {
  if (!e.abonnement) return '—';
  const f = formules.value.formules.find((x) => x.code === e.abonnement.formule);
  return `${f ? f.libelle : e.abonnement.formule} (${e.abonnement.statut})`;
}

onMounted(async () => {
  if (!getToken()) return;
  try {
    admin.value = await api.me();
    await demarrer();
  } catch {
    deconnecter();
  } finally {
    verificationSession.value = false;
  }
});
</script>

<template>
  <div class="admin">
    <div v-if="verificationSession" class="container"><p class="aide">Chargement…</p></div>

    <div v-else-if="!admin" class="login-wrap">
      <form class="card login-card" @submit.prevent="connecter">
        <h1 class="login-titre">🔒 Back-office GMQ</h1>
        <p v-if="erreur" class="bandeau erreur">⚠️ {{ erreur }}</p>
        <div class="champ">
          <label for="ad-email">Email</label>
          <input id="ad-email" type="email" v-model="email" autocomplete="username" required />
        </div>
        <div class="champ">
          <label for="ad-mdp">Mot de passe</label>
          <input id="ad-mdp" type="password" v-model="motDePasse" autocomplete="current-password" required />
        </div>
        <button class="pleine-largeur" :disabled="enCours">
          {{ enCours ? 'Veuillez patienter…' : 'Se connecter' }}
        </button>
      </form>
    </div>

    <div v-else class="container">
      <header>
        <div class="barre-compte">
          <span>🔒 {{ admin.nom || admin.email }}</span>
          <button class="ghost" @click="deconnecter()">Se déconnecter</button>
        </div>
        <h1>Back-office — Exploitants</h1>
      </header>

      <p v-if="succes" class="bandeau succes">{{ succes }}</p>
      <p v-if="erreur" class="bandeau erreur">⚠️ {{ erreur }}</p>

      <div class="grid">
        <div class="card">
          <div class="filtres">
            <button
              v-for="f in FILTRES"
              :key="f.valeur"
              :class="{ ghost: filtreStatut !== f.valeur }"
              @click="filtreStatut = f.valeur"
            >
              {{ f.libelle }}
            </button>
            <input v-model="recherche" type="search" placeholder="Rechercher (email, nom)" />
          </div>

          <p v-if="!exploitants.length" class="empty">Aucun exploitant.</p>
          <div
            v-for="e in exploitants"
            :key="e.id"
            class="list-item"
            :class="{ active: selection === e.id }"
            role="button"
            tabindex="0"
            @click="selection = e.id"
            @keydown.enter="selection = e.id"
          >
            <div>
              <div class="titre-item">{{ e.nom || e.email }}</div>
              <div class="meta">
                {{ e.email }} · {{ e.nb_broutards }} broutard(s) · Abonnement : {{ libelleAbonnement(e) }}
              </div>
            </div>
            <span class="statut-badge" :class="e.statut">{{ LIBELLES_STATUT[e.statut] }}</span>
          </div>
        </div>

        <div>
          <ExploitantPanel
            v-if="selection"
            :key="selection"
            :id="selection"
            :formules="formules"
            @modifie="onModifie"
            @erreur="(m) => (erreur = m)"
          />
          <p v-else class="empty">Sélectionnez un exploitant pour le gérer.</p>
        </div>
      </div>
    </div>
  </div>
</template>
