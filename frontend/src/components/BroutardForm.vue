<script setup>
import { ref } from 'vue';
import { api } from '../api.js';

const props = defineProps({
  meres: Array,
  rendements: { type: Array, default: () => [55, 58, 60] },
  rendementDefaut: { type: Number, default: 58 },
});
const emit = defineEmits(['cree', 'erreur']);

const numero = ref('');
const mere_id = ref('');
const debut_engraissement = ref(new Date().toISOString().slice(0, 10));
const rendement = ref(''); // '' => rendement par défaut
const succes = ref('');

async function creer() {
  succes.value = '';
  if (!numero.value || !debut_engraissement.value) {
    emit('erreur', "Merci d'indiquer au moins le numéro de boucle et la date de début.");
    return;
  }
  try {
    await api.createBroutard({
      numero: numero.value,
      mere_id: mere_id.value || null,
      debut_engraissement: debut_engraissement.value,
      rendement: rendement.value === '' ? null : Number(rendement.value),
    });
    numero.value = '';
    mere_id.value = '';
    rendement.value = '';
    succes.value = '✓ Broutard ajouté à la liste.';
    setTimeout(() => { succes.value = ''; }, 4000);
    emit('cree');
  } catch (e) {
    emit('erreur', e.message);
  }
}
</script>

<template>
  <div class="card">
    <h2>➕ Ajouter un broutard</h2>
    <p class="aide">Renseignez un nouveau jeune bovin à suivre.</p>

    <p v-if="succes" class="bandeau succes">{{ succes }}</p>

    <div class="champ">
      <label for="bf-numero">Numéro de boucle</label>
      <span class="exemple">Le numéro inscrit sur la boucle de l'oreille.</span>
      <input id="bf-numero" v-model="numero" placeholder="Exemple : FR3004" />
    </div>

    <div class="champ">
      <label for="bf-mere">Mère (facultatif)</label>
      <span class="exemple">Choisissez la mère dans la liste, si vous la connaissez.</span>
      <select id="bf-mere" v-model="mere_id">
        <option value="">— Aucune mère —</option>
        <option v-for="m in meres" :key="m.id" :value="m.id">
          {{ m.numero }}{{ m.nom ? ' — ' + m.nom : '' }}
        </option>
      </select>
    </div>

    <div class="champ">
      <label for="bf-debut">Date de début d'engraissement</label>
      <span class="exemple">Le jour où le veau a commencé à être engraissé.</span>
      <input id="bf-debut" type="date" v-model="debut_engraissement" />
    </div>

    <div class="champ">
      <label for="bf-rendement">Rendement carcasse</label>
      <span class="exemple">
        Sert à estimer le poids vif à partir du poids de carcasse. Laissez sur « défaut »
        si vous ne le connaissez pas.
      </span>
      <select id="bf-rendement" v-model="rendement">
        <option value="">Rendement par défaut ({{ rendementDefaut }} %)</option>
        <option v-for="r in rendements" :key="r" :value="r">{{ r }} %</option>
      </select>
    </div>

    <button class="pleine-largeur" @click="creer">➕ Ajouter ce broutard</button>
  </div>
</template>
