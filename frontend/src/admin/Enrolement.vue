<script setup>
import { ref, onMounted } from 'vue';
import QRCode from 'qrcode';
import { api } from './api.js';

// Étape d'enrôlement à la première connexion : scan du QR code puis premier code
const props = defineProps({
  enrolement: { type: Object, required: true }, // { jeton, secret, uri }
});
const emit = defineEmits(['termine', 'annule']);

const qr = ref('');
const code = ref('');
const erreur = ref('');
const enCours = ref(false);
const secretLisible = props.enrolement.secret.match(/.{1,4}/g).join(' ');

async function valider() {
  erreur.value = '';
  enCours.value = true;
  try {
    emit('termine', await api.terminerEnrolement(props.enrolement.jeton, code.value));
  } catch (e) {
    erreur.value = e.message;
    code.value = '';
  } finally {
    enCours.value = false;
  }
}

onMounted(async () => {
  qr.value = await QRCode.toDataURL(props.enrolement.uri, { margin: 1, width: 220 });
});
</script>

<template>
  <div class="login-wrap">
    <form class="card login-card" @submit.prevent="valider">
      <h1 class="login-titre">🔐 Première connexion</h1>
      <p class="aide">
        Protégez votre compte avec une application d'authentification
        (Google Authenticator, Aegis, 1Password, Authy…).
      </p>

      <ol class="etapes">
        <li>Dans l'application, ajoutez un compte et scannez ce QR code :</li>
      </ol>
      <div class="qr">
        <img v-if="qr" :src="qr" alt="QR code à scanner avec l'application d'authentification" width="220" height="220" />
      </div>
      <p class="meta cle-manuelle">
        Impossible de scanner ? Saisissez la clé : <code>{{ secretLisible }}</code>
      </p>

      <ol class="etapes" start="2">
        <li>Saisissez le code à 6 chiffres affiché par l'application :</li>
      </ol>
      <p v-if="erreur" class="bandeau erreur">⚠️ {{ erreur }}</p>
      <div class="champ">
        <input
          v-model="code"
          aria-label="Code à 6 chiffres"
          inputmode="numeric"
          autocomplete="one-time-code"
          pattern="[0-9]{6}"
          maxlength="6"
          placeholder="123456"
          required
        />
      </div>
      <button class="pleine-largeur" :disabled="enCours">
        {{ enCours ? 'Vérification…' : 'Activer et se connecter' }}
      </button>
      <p class="bascule">
        <button type="button" class="lien" @click="emit('annule')">Annuler</button>
      </p>
    </form>
  </div>
</template>
