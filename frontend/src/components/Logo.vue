<script setup>
defineProps({ href: { type: String, default: null } });
</script>

<template>
  <component :is="href ? 'a' : 'span'" class="logo" :href="href">
    <svg class="logo-marque" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="8" fill="var(--accent)" />
      <path d="M8 21l5-5 4 3 7-8" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
    Suivi GMQ
  </component>
</template>
