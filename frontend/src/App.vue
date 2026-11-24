<script setup>
import { ref, onMounted, nextTick } from 'vue';
import { api, getToken, setToken, onSessionExpiree } from './api.js';
import Login from './components/Login.vue';
import BroutardForm from './components/BroutardForm.vue';
import BroutardDetail from './components/BroutardDetail.vue';
import MereManager from './components/MereManager.vue';
import Icone from './components/Icone.vue';
import Logo from './components/Logo.vue';
import { niveauCroissance, dateLisible, nombre } from './format.js';

const exploitant = ref(null); // compte connecté (null => écran de connexion)
const verificationSession = ref(Boolean(getToken()));
const broutards = ref([]);
const meres = ref([]);
const selection = ref(null); // numéro du broutard sélectionné
const detail = ref(null);
const error = ref('');
const succes = ref('');
const config = ref({ rendement_defaut: 58, rendements: [55, 58, 60] });

let successTimer = null;
function afficherSucces(message) {
  succes.value = message;
  error.value = '';
  if (successTimer) clearTimeout(successTimer);
  successTimer = setTimeout(() => { succes.value = ''; }, 4000);
}
function afficherErreur(message) {
  error.value = message;
}

async function charger() {
  error.value = '';
  try {
    [broutards.value, meres.value, config.value] = await Promise.all([
      api.listBroutards(),
      api.listMeres(),
      api.getConfig(),
    ]);
  } catch (e) {
    error.value = e.message;
  }
}

async function selectionner(numero) {
  selection.value = numero;
  try {
    detail.value = await api.getBroutard(numero);
  } catch (e) {
    error.value = e.message;
  }
}

// Sur téléphone (une seule colonne), la fiche est sous la liste : on y amène l'utilisateur
const ficheDetail = ref(null);
async function ouvrirFiche(numero) {
  await selectionner(numero);
  if (window.matchMedia('(max-width: 860px)').matches) {
    await nextTick();
    ficheDetail.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

async function onBroutardCree() {
  afficherSucces('Le broutard a bien été ajouté.');
  await charger();
}

async function supprimerBroutard(numero) {
  if (!confirm(`Voulez-vous vraiment supprimer le broutard ${numero} et toutes ses pesées ?\nCette action est définitive.`)) return;
  try {
    await api.deleteBroutard(numero);
    if (selection.value === numero) { selection.value = null; detail.value = null; }
    afficherSucces(`Le broutard ${numero} a été supprimé.`);
    await charger();
  } catch (e) {
    error.value = e.message;
  }
}

async function onPeseeChange() {
  await selectionner(selection.value);
  await charger(); // rafraîchit le GMQ dans la liste
}

function gmqLabel(b) {
  return b.gmq_g_jour == null ? 'En attente' : `${nombre(b.gmq_g_jour)} g/jour`;
}

function reinitialiser() {
  exploitant.value = null;
  broutards.value = [];
  meres.value = [];
  selection.value = null;
  detail.value = null;
  error.value = '';
  succes.value = '';
}

async function onConnecte(compte) {
  exploitant.value = compte;
  await charger();
}

function deconnecter() {
  setToken(null);
  reinitialiser();
}

onSessionExpiree(reinitialiser);

onMounted(async () => {
  if (!getToken()) return;
  try {
    exploitant.value = await api.me();
    await charger();
  } catch {
    reinitialiser();
  } finally {
    verificationSession.value = false;
  }
});
</script>

<template>
  <div v-if="verificationSession" class="container"><p class="aide">Chargement…</p></div>
  <Login v-else-if="!exploitant" @connecte="onConnecte" />
  <div v-else class="container">
    <div class="barre-app">
      <Logo />
      <div class="barre-compte">
        <span class="nom-compte"><Icone nom="utilisateur" /> {{ exploitant.nom || exploitant.email }}</span>
        <button class="ghost" @click="deconnecter"><Icone nom="sortie" /> Se déconnecter</button>
      </div>
    </div>

    <header class="intro">
      <h1>Mes broutards</h1>
      <p class="sous-titre">
        Ajoutez vos animaux, notez leurs pesées, et voyez tout de suite s'ils grossissent bien.
      </p>
    </header>

    <p v-if="succes" class="bandeau succes" role="status"><Icone nom="valide" /> {{ succes }}</p>
    <p v-if="error" class="bandeau erreur" role="alert"><Icone nom="alerte" /> {{ error }}</p>

    <div class="grid">
      <div>
        <div class="card">
          <h2>Liste des broutards ({{ broutards.length }})</h2>
          <p class="aide">Touchez un broutard pour voir ses pesées ou en ajouter une.</p>

          <p v-if="!broutards.length" class="empty">
            <Icone nom="liste" class="icone-vide" />
            Vous n'avez encore aucun broutard.<br />
            Commencez avec le formulaire « Ajouter un broutard » juste en dessous.
          </p>

          <div
            v-for="b in broutards"
            :key="b.numero"
            class="list-item cliquable"
            :class="{ active: selection === b.numero }"
            role="button"
            tabindex="0"
            :aria-pressed="selection === b.numero"
            @click="ouvrirFiche(b.numero)"
            @keydown.enter="ouvrirFiche(b.numero)"
          >
            <div>
              <div class="titre-item">{{ b.numero }}</div>
              <div class="meta">
                Mère : {{ b.mere_numero || 'non renseignée' }} · Depuis le {{ dateLisible(b.debut_engraissement) }}
              </div>
            </div>
            <div class="item-droite">
              <span class="gmq-badge" :class="niveauCroissance(b.gmq_g_jour).classe">
                <Icone :nom="niveauCroissance(b.gmq_g_jour).icone" />
                {{ gmqLabel(b) }}
                <span class="sr-only">— {{ niveauCroissance(b.gmq_g_jour).long }}</span>
              </span>
            </div>
          </div>
        </div>

        <BroutardForm
          :meres="meres"
          :rendements="config.rendements"
          :rendement-defaut="config.rendement_defaut"
          @cree="onBroutardCree"
          @erreur="afficherErreur"
        />

        <MereManager :meres="meres" @change="charger" @erreur="afficherErreur" />
      </div>

      <div ref="ficheDetail">
        <BroutardDetail
          :broutard="detail"
          @change="onPeseeChange"
          @supprimer="supprimerBroutard"
          @erreur="afficherErreur"
        />
      </div>
    </div>
  </div>
</template>
