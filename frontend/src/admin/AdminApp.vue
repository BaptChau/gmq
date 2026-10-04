<script setup>
import { ref, onMounted, watch } from 'vue';
import { api, getToken, setToken, onSessionExpiree, LIBELLES_STATUT } from './api.js';
import ExploitantPanel from './ExploitantPanel.vue';
import Enrolement from './Enrolement.vue';

const admin = ref(null);
const verificationSession = ref(Boolean(getToken()));

// Connexion
const identifiant = ref('');
const code = ref('');
const enCours = ref(false);
// Première connexion : le code saisi est le code d'activation donné par admin-cli
const premiereConnexion = ref(false);
const enrolement = ref(null); // { jeton, secret, uri } pendant l'enrôlement

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
    const data = await api.login({ identifiant: identifiant.value, code: code.value });
    if (data.enrolement) {
      // Première connexion détectée : on passe à l'enrôlement de l'application
      enrolement.value = data.enrolement;
      return;
    }
    await ouvrirSession(data);
  } catch (e) {
    erreur.value = e.message;
  } finally {
    code.value = ''; // un code TOTP ne sert qu'une fois
    enCours.value = false;
  }
}

async function ouvrirSession({ token, admin: compte }) {
  setToken(token);
  admin.value = compte;
  enrolement.value = null;
  premiereConnexion.value = false;
  await demarrer();
}

function annulerEnrolement() {
  enrolement.value = null;
  erreur.value = 'Enrôlement annulé. Votre code d’activation reste valable jusqu’à son expiration.';
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

    <Enrolement
      v-else-if="enrolement"
      :enrolement="enrolement"
      @termine="ouvrirSession"
      @annule="annulerEnrolement"
    />

    <div v-else-if="!admin" class="login-wrap">
      <form class="card login-card" @submit.prevent="connecter">
        <h1 class="login-titre">🔒 Back-office GMQ</h1>
        <p v-if="erreur" class="bandeau erreur">⚠️ {{ erreur }}</p>
        <div class="champ">
          <label for="ad-identifiant">Identifiant</label>
          <input id="ad-identifiant" v-model="identifiant" autocomplete="username" autocapitalize="none" required />
        </div>
        <div v-if="premiereConnexion" class="champ">
          <label for="ad-activation">Code d'activation</label>
          <span class="exemple">Le code reçu à la création de votre compte admin.</span>
          <input
            id="ad-activation"
            v-model="code"
            autocomplete="off"
            autocapitalize="characters"
            spellcheck="false"
            placeholder="ABCD-EFGH-JKLM-NPQR"
            required
          />
        </div>
        <div v-else class="champ">
          <label for="ad-code">Code de l'application d'authentification</label>
          <input
            id="ad-code"
            v-model="code"
            inputmode="numeric"
            autocomplete="one-time-code"
            pattern="[0-9]{6}"
            maxlength="6"
            placeholder="123456"
            required
          />
        </div>
        <button class="pleine-largeur" :disabled="enCours">
          {{ enCours ? 'Veuillez patienter…' : premiereConnexion ? 'Continuer' : 'Se connecter' }}
        </button>
        <p class="bascule">
          <button type="button" class="lien" @click="premiereConnexion = !premiereConnexion; code = ''; erreur = ''">
            {{ premiereConnexion ? 'J’ai déjà configuré mon application' : 'Première connexion ?' }}
          </button>
        </p>
      </form>
    </div>

    <div v-else class="container">
      <header>
        <div class="barre-compte">
          <span>🔒 {{ admin.nom || admin.identifiant }}</span>
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
