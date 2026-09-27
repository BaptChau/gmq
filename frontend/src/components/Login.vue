<script setup>
import { ref } from 'vue';
import { api, setToken } from '../api.js';

const emit = defineEmits(['connecte']);

const mode = ref('login'); // 'login' ou 'register'
const email = ref('');
const mot_de_passe = ref('');
const nom = ref('');
const erreur = ref('');
const enCours = ref(false);

async function valider() {
  erreur.value = '';
  if (!email.value || !mot_de_passe.value) {
    erreur.value = 'Merci de renseigner votre email et votre mot de passe.';
    return;
  }
  enCours.value = true;
  try {
    const data =
      mode.value === 'login'
        ? await api.login({ email: email.value, mot_de_passe: mot_de_passe.value })
        : await api.register({ email: email.value, mot_de_passe: mot_de_passe.value, nom: nom.value });
    setToken(data.token);
    emit('connecte', data.exploitant);
  } catch (e) {
    erreur.value = e.message;
  } finally {
    enCours.value = false;
  }
}

function basculer() {
  mode.value = mode.value === 'login' ? 'register' : 'login';
  erreur.value = '';
}
</script>

<template>
  <div class="login-wrap">
    <div class="card login-card">
      <h1 class="login-titre">🐄 Suivi de mes broutards</h1>
      <p class="aide" style="text-align:center;">
        {{ mode === 'login' ? 'Connectez-vous à votre exploitation.' : 'Créez le compte de votre exploitation.' }}
      </p>

      <p v-if="erreur" class="bandeau erreur">⚠️ {{ erreur }}</p>

      <div v-if="mode === 'register'" class="champ">
        <label for="lg-nom">Nom de l'exploitation (facultatif)</label>
        <input id="lg-nom" v-model="nom" placeholder="Exemple : GAEC des Prés" @keyup.enter="valider" />
      </div>

      <div class="champ">
        <label for="lg-email">Email</label>
        <input id="lg-email" type="email" v-model="email" placeholder="vous@exemple.fr" @keyup.enter="valider" />
      </div>

      <div class="champ">
        <label for="lg-mdp">Mot de passe</label>
        <input id="lg-mdp" type="password" v-model="mot_de_passe" placeholder="Au moins 6 caractères" @keyup.enter="valider" />
      </div>

      <button class="pleine-largeur" :disabled="enCours" @click="valider">
        {{ enCours ? 'Veuillez patienter…' : mode === 'login' ? '🔑 Se connecter' : '✅ Créer mon compte' }}
      </button>

      <p class="bascule">
        <template v-if="mode === 'login'">
          Pas encore de compte ?
          <button class="lien" @click="basculer">Créer une exploitation</button>
        </template>
        <template v-else>
          Déjà un compte ?
          <button class="lien" @click="basculer">Se connecter</button>
        </template>
      </p>
    </div>
  </div>
</template>
