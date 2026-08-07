<script setup>
import { ref, onMounted } from 'vue';
import { api } from './api.js';
import BroutardForm from './components/BroutardForm.vue';
import BroutardDetail from './components/BroutardDetail.vue';
import MereManager from './components/MereManager.vue';

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

async function onBroutardCree() {
  afficherSucces('✓ Le broutard a bien été ajouté.');
  await charger();
}

async function supprimerBroutard(numero) {
  if (!confirm(`Voulez-vous vraiment supprimer le broutard ${numero} et toutes ses pesées ?\nCette action est définitive.`)) return;
  try {
    await api.deleteBroutard(numero);
    if (selection.value === numero) { selection.value = null; detail.value = null; }
    afficherSucces(`✓ Le broutard ${numero} a été supprimé.`);
    await charger();
  } catch (e) {
    error.value = e.message;
  }
}

async function onPeseeChange() {
  await selectionner(selection.value);
  await charger(); // rafraîchit le GMQ dans la liste
}

// Niveau de croissance à partir du GMQ (g/jour), pour la couleur et le texte.
function gmqNiveau(gmq) {
  if (gmq == null) return { classe: 'none', icone: '⏳', mot: 'En attente' };
  if (gmq < 800) return { classe: 'low', icone: '🔻', mot: 'Faible' };
  if (gmq < 1100) return { classe: 'mid', icone: '➡️', mot: 'Correcte' };
  return { classe: 'good', icone: '🔺', mot: 'Bonne' };
}

function gmqLabel(b) {
  return b.gmq_g_jour == null ? 'En attente' : `${b.gmq_g_jour} g/jour`;
}

onMounted(charger);
</script>

<template>
  <div class="container">
    <header>
      <h1>🐄 Suivi de mes broutards</h1>
      <p class="sous-titre">
        Enregistrez vos jeunes bovins, notez leurs pesées, et voyez tout de suite s'ils grossissent bien.
      </p>
    </header>

    <p v-if="succes" class="bandeau succes">{{ succes }}</p>
    <p v-if="error" class="bandeau erreur">⚠️ {{ error }}</p>

    <div class="grid">
      <div>
        <BroutardForm
          :meres="meres"
          :rendements="config.rendements"
          :rendement-defaut="config.rendement_defaut"
          @cree="onBroutardCree"
          @erreur="afficherErreur"
        />

        <div class="card">
          <h2>📋 Mes broutards ({{ broutards.length }})</h2>
          <p class="aide">Touchez un broutard pour voir ses pesées et ajouter une nouvelle pesée.</p>

          <p v-if="!broutards.length" class="empty">
            <span class="grand">🐄</span>
            Vous n'avez encore aucun broutard.<br />
            Utilisez le formulaire « Ajouter un broutard » ci-dessus pour commencer.
          </p>

          <div
            v-for="b in broutards"
            :key="b.numero"
            class="list-item"
            :class="{ active: selection === b.numero }"
            role="button"
            tabindex="0"
            @click="selectionner(b.numero)"
            @keydown.enter="selectionner(b.numero)"
          >
            <div>
              <div class="titre-item">{{ b.numero }}</div>
              <div class="meta">
                Mère : {{ b.mere_numero || 'non renseignée' }} · Depuis le {{ b.debut_engraissement }}
              </div>
            </div>
            <div class="item-droite">
              <span
                class="gmq-badge"
                :class="gmqNiveau(b.gmq_g_jour).classe"
                :title="'Croissance : ' + gmqNiveau(b.gmq_g_jour).mot"
              >
                {{ gmqNiveau(b.gmq_g_jour).icone }} {{ gmqLabel(b) }}
              </span>
              <button class="danger" @click.stop="supprimerBroutard(b.numero)">🗑️ Supprimer</button>
            </div>
          </div>
        </div>

        <MereManager :meres="meres" @change="charger" @erreur="afficherErreur" />
      </div>

      <div>
        <BroutardDetail
          :broutard="detail"
          @change="onPeseeChange"
          @erreur="afficherErreur"
        />
      </div>
    </div>
  </div>
</template>
