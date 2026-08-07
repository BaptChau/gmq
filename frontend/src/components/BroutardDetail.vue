<script setup>
import { ref, computed } from 'vue';
import { api } from '../api.js';

const props = defineProps({ broutard: Object });
const emit = defineEmits(['change', 'erreur']);

const date = ref(new Date().toISOString().slice(0, 10));
const poids = ref('');
const typePesee = ref('vif');
const succes = ref('');

function montrerSucces(message) {
  succes.value = message;
  setTimeout(() => { succes.value = ''; }, 4000);
}

// Niveau de croissance à partir du GMQ (g/jour).
const niveau = computed(() => {
  const gmq = props.broutard ? props.broutard.gmq_g_jour : null;
  if (gmq == null) return { classe: 'none', icone: '⏳', mot: 'En attente de pesées' };
  if (gmq < 800) return { classe: 'low', icone: '🔻', mot: 'Croissance faible' };
  if (gmq < 1100) return { classe: 'mid', icone: '➡️', mot: 'Croissance correcte' };
  return { classe: 'good', icone: '🔺', mot: 'Bonne croissance' };
});

// Poids vif équivalent d'une pesée (converti si c'est une carcasse).
function poidsVif(p) {
  if (p.type !== 'carcasse') return p.poids;
  const r = props.broutard.rendement_applique || 58;
  return Math.round(p.poids / (r / 100));
}

async function ajouterPesee() {
  succes.value = '';
  if (!date.value || poids.value === '') {
    emit('erreur', "Merci d'indiquer la date et le poids de la pesée.");
    return;
  }
  try {
    await api.addPesee(props.broutard.numero, {
      date: date.value,
      poids: Number(poids.value),
      type: typePesee.value,
    });
    poids.value = '';
    montrerSucces(typePesee.value === 'carcasse' ? '✓ Poids de carcasse enregistré.' : '✓ Pesée enregistrée.');
    emit('change');
  } catch (e) {
    emit('erreur', e.message);
  }
}

async function supprimerPesee(id) {
  if (!confirm('Voulez-vous vraiment supprimer cette pesée ?')) return;
  try {
    await api.deletePesee(id);
    montrerSucces('✓ Pesée supprimée.');
    emit('change');
  } catch (e) {
    emit('erreur', e.message);
  }
}
</script>

<template>
  <div class="card" v-if="broutard">
    <h2>🐄 Broutard {{ broutard.numero }}</h2>
    <p class="aide">
      Mère : {{ broutard.mere_numero || 'non renseignée' }}{{ broutard.mere_nom ? ' (' + broutard.mere_nom + ')' : '' }}
      · Début d'engraissement : {{ broutard.debut_engraissement }}
      · Rendement : {{ broutard.rendement_applique }} %{{ broutard.rendement == null ? ' (défaut)' : '' }}
    </p>

    <p v-if="succes" class="bandeau succes">{{ succes }}</p>

    <!-- Encart GMQ expliqué en langage simple -->
    <div class="gmq-encart" :class="niveau.classe">
      <span class="gmq-icone" aria-hidden="true">{{ niveau.icone }}</span>
      <div>
        <template v-if="broutard.gmq_g_jour == null">
          <div class="gmq-chiffre">Pas encore de résultat</div>
          <div class="gmq-texte">
            Le calcul de croissance a besoin d'au moins <strong>2 pesées</strong>.
            Ajoutez une deuxième pesée pour voir combien le veau prend par jour.
          </div>
        </template>
        <template v-else>
          <div class="gmq-chiffre">{{ broutard.gmq_g_jour }} g / jour — {{ niveau.mot }}</div>
          <div class="gmq-texte">
            Le veau prend en moyenne <strong>{{ broutard.gmq_g_jour }} grammes par jour</strong>
            (soit environ {{ (broutard.gmq_g_jour / 1000).toFixed(2) }} kg par jour).
          </div>
        </template>
      </div>
    </div>

    <!-- Bloc carcasse (si le broutard a été abattu) -->
    <div v-if="broutard.a_carcasse" class="carcasse-encart">
      <span class="gmq-icone" aria-hidden="true">🥩</span>
      <div>
        <div class="gmq-chiffre">Abattu · carcasse {{ broutard.poids_carcasse }} kg</div>
        <div class="gmq-texte">
          Poids vif estimé : <strong>{{ broutard.poids_vif_estime }} kg</strong>
          (carcasse ÷ rendement {{ broutard.rendement_applique }} %).
          Ce poids vif estimé est utilisé pour le calcul du GMQ.
        </div>
      </div>
    </div>

    <h3>⚖️ Les pesées</h3>
    <div class="table-wrap" v-if="broutard.pesees && broutard.pesees.length">
      <table>
        <thead>
          <tr><th>Date</th><th>Type</th><th>Poids</th><th>Poids vif</th><th></th></tr>
        </thead>
        <tbody>
          <tr v-for="p in broutard.pesees" :key="p.id">
            <td>{{ p.date }}</td>
            <td>
              <span v-if="p.type === 'carcasse'" class="type-tag carcasse">🥩 Carcasse</span>
              <span v-else class="type-tag vif">Sur pied</span>
            </td>
            <td>{{ p.poids }} kg</td>
            <td>
              {{ poidsVif(p) }} kg
              <span v-if="p.type === 'carcasse'" class="estime">(estimé)</span>
            </td>
            <td class="actions">
              <button class="danger" @click="supprimerPesee(p.id)">🗑️ Supprimer</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else class="empty">
      <span class="grand">⚖️</span>
      Aucune pesée pour ce broutard.<br />
      Ajoutez la première pesée ci-dessous.
    </p>

    <h3>➕ Ajouter une pesée</h3>
    <div class="champ">
      <label for="bd-type">Type de pesée</label>
      <select id="bd-type" v-model="typePesee">
        <option value="vif">Poids sur pied (animal vivant)</option>
        <option value="carcasse">Poids de carcasse (sortie d'abattoir)</option>
      </select>
    </div>
    <div class="row">
      <div class="champ">
        <label for="bd-date">Date de la pesée</label>
        <input id="bd-date" type="date" v-model="date" />
      </div>
      <div class="champ">
        <label for="bd-poids">Poids en kilos</label>
        <input id="bd-poids" type="number" step="0.1" inputmode="decimal" v-model="poids"
               :placeholder="typePesee === 'carcasse' ? 'Exemple : 270' : 'Exemple : 340'" />
      </div>
    </div>
    <button class="pleine-largeur" @click="ajouterPesee">
      {{ typePesee === 'carcasse' ? '🥩 Enregistrer le poids de carcasse' : '➕ Enregistrer la pesée' }}
    </button>
  </div>

  <div class="card" v-else>
    <h2>🐄 Détail d'un broutard</h2>
    <p class="empty">
      <span class="grand">👈</span>
      Touchez un broutard dans la liste de gauche
      pour voir ses pesées et sa croissance, ou pour ajouter une pesée.
    </p>
  </div>
</template>
