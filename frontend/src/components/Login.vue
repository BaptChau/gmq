<script setup>
import { ref } from 'vue';
import { api, setToken } from '../api.js';
import Icone from './Icone.vue';
import Logo from './Logo.vue';

const emit = defineEmits(['connecte']);

// 'login' ou 'register' ; les liens « Créer un compte » du site arrivent avec ?inscription
const mode = ref(new URLSearchParams(location.search).has('inscription') ? 'register' : 'login');

// Site de présentation : même domaine, préfixé par « landing. »
const urlSite = `${location.protocol}//landing.${location.host}/`;
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
    <Logo />
    <div class="card login-card">
      <h1 class="login-titre">{{ mode === 'login' ? 'Connexion' : 'Créer un compte' }}</h1>
      <p class="aide">
        {{ mode === 'login'
          ? 'Accédez au suivi de vos broutards.'
          : 'Quelques secondes suffisent. Vous pourrez ajouter vos animaux juste après.' }}
      </p>

      <p v-if="erreur" class="bandeau erreur" role="alert"><Icone nom="alerte" /> {{ erreur }}</p>

      <div v-if="mode === 'register'" class="champ">
        <label for="lg-nom">Nom de l'exploitation (facultatif)</label>
        <input id="lg-nom" v-model="nom" autocomplete="organization" placeholder="Exemple : GAEC des Prés" @keyup.enter="valider" />
      </div>

      <div class="champ">
        <label for="lg-email">Adresse email</label>
        <input id="lg-email" type="email" v-model="email" autocomplete="email" placeholder="vous@exemple.fr" @keyup.enter="valider" />
      </div>

      <div class="champ">
        <label for="lg-mdp">Mot de passe</label>
        <span v-if="mode === 'register'" class="exemple">Au moins 6 caractères.</span>
        <input
          id="lg-mdp"
          type="password"
          v-model="mot_de_passe"
          :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
          @keyup.enter="valider"
        />
      </div>

      <button class="pleine-largeur" :disabled="enCours" @click="valider">
        {{ enCours ? 'Veuillez patienter…' : mode === 'login' ? 'Se connecter' : 'Créer mon compte' }}
      </button>

      <p class="bascule">
        <template v-if="mode === 'login'">
          Pas encore de compte ?
          <button class="lien" @click="basculer">Créer un compte</button>
        </template>
        <template v-else>
          Déjà un compte ?
          <button class="lien" @click="basculer">Se connecter</button>
        </template>
      </p>
    </div>
    <a class="lien-site" :href="urlSite">Découvrir l'application</a>
  </div>
</template>
