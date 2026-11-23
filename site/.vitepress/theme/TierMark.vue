<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ tier: 'haiku' | 'sonnet' | 'opus' }>()
const order = ['haiku', 'sonnet', 'opus'] as const
const level = computed(() => order.indexOf(props.tier) + 1)
</script>

<template>
  <span class="tier-mark" :aria-label="`${tier}, tier ${level} of 3`">
    <span class="tier-segments" aria-hidden="true">
      <span v-for="n in 3" :key="n" class="tier-seg" :class="{ on: n <= level }" />
    </span>
    <span class="tier-name">{{ tier }}</span>
  </span>
</template>
