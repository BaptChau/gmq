<script setup>
import { ref } from 'vue';
import { api } from '../api.js';

const props = defineProps({ meres: Array });
const emit = defineEmits(['change', 'erreur']);

const numero = ref('');
const nom = ref('');
const succes = ref('');

function montrerSucces(message) {
  succes.value = message;
  setTimeout(() => { succes.value = ''; }, 4000);
}

async function creer() {
  succes.value = '';
  if (!numero.value) {
    emit('erreur', 'Merci d\'indiquer le numéro de la mère.');
    return;
  }
  try {
    await api.createMere({ numero: numero.value, nom: nom.value || null });
    numero.value = '';
    nom.value = '';
    montrerSucces('✓ Mère ajoutée.');
    emit('change');
  } catch (e) {
    emit('erreur', e.message);
  }
}

async function supprimer(id) {
  if (!confirm('Voulez-vous vraiment supprimer cette mère ?\nLes broutards liés seront conservés, mais sans mère.')) return;
  try {
    await api.deleteMere(id);
    montrerSucces('✓ Mère supprimée.');
    emit('change');
  } catch (e) {
    emit('erreur', e.message);
  }
}
</script>

<template>
  <div class="card">
    <h2>🐮 Les mères ({{ meres.length }})</h2>
    <p class="aide">
      Enregistrez les mères pour pouvoir les relier à vos broutards. C'est facultatif.
    </p>

    <p v-if="succes" class="bandeau succes">{{ succes }}</p>

    <div class="row">
      <div class="champ">
        <label for="mm-numero">Numéro de la mère</label>
        <input id="mm-numero" v-model="numero" placeholder="Exemple : FR2203" />
      </div>
      <div class="champ">
        <label for="mm-nom">Nom (facultatif)</label>
        <input id="mm-nom" v-model="nom" placeholder="Exemple : Noisette" />
      </div>
    </div>
    <button class="pleine-largeur" @click="creer">➕ Ajouter cette mère</button>

    <div class="mt">
      <p v-if="!meres.length" class="empty">
        <span class="grand">🐮</span>
        Aucune mère enregistrée pour l'instant.
      </p>
      <div v-for="m in meres" :key="m.id" class="list-item" style="cursor:default;">
        <div>
          <span class="titre-item">{{ m.numero }}</span>
          <span class="meta" v-if="m.nom"> · {{ m.nom }}</span>
        </div>
        <button class="danger" @click="supprimer(m.id)">🗑️ Supprimer</button>
      </div>
    </div>
  </div>
</template>
