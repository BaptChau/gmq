<script setup>
// Icônes au trait (24×24), utilisées à la place des emojis.
// Décoratives par défaut : le texte à côté porte le sens.
defineProps({ nom: { type: String, required: true } });

const TRACES = {
  plus: ['M12 5v14', 'M5 12h14'],
  corbeille: ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 13h10l1-13', 'M10 11v6', 'M14 11v6'],
  balance: ['M12 4v16', 'M7 20h10', 'M5 8h14', 'M5 8l-3 6a3 3 0 0 0 6 0z', 'M19 8l-3 6a3 3 0 0 0 6 0z'],
  utilisateur: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M4 21a8 8 0 0 1 16 0'],
  sortie: ['M14 4h5v16h-5', 'M10 8l-4 4 4 4', 'M6 12h10'],
  hausse: ['M3 17l6-6 4 4 8-8', 'M15 7h6v6'],
  baisse: ['M3 7l6 6 4-4 8 8', 'M15 17h6v-6'],
  stable: ['M4 12h16', 'M14 6l6 6-6 6'],
  attente: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 7v5l3 2'],
  valide: ['M5 12l5 5 9-10'],
  alerte: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 8v5', 'M12 16h.01'],
  liste: ['M9 6h12', 'M9 12h12', 'M9 18h12', 'M4 6h.01', 'M4 12h.01', 'M4 18h.01'],
  drapeau: ['M5 21V4', 'M5 4h12l-2.5 4L17 12H5'],
  flecheGauche: ['M19 12H5', 'M11 18l-6-6 6-6'],
};
</script>

<template>
  <svg
    class="icone"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path v-for="d in TRACES[nom]" :key="d" :d="d" />
  </svg>
</template>
