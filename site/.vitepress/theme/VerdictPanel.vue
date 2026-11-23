<script setup lang="ts">
import { withBase } from 'vitepress'
import TierMark from './TierMark.vue'

const evidence = 'https://github.com/AqueGen/model-routing/blob/main/evals/evidence/'
</script>

<template>
  <section class="verdict" aria-labelledby="verdict-title">
    <div class="verdict-inner">
      <div class="verdict-main">
        <h1 id="verdict-title" class="verdict-title">
          Multi-file implementer work on sonnet cost 53% less, and every hidden test still passed.
        </h1>
        <table class="verdict-table">
          <caption class="sr-only">Implementer multi-file eval, mean cost per run and hidden tests passed</caption>
          <thead>
            <tr>
              <th scope="col">Arm</th>
              <th scope="col">Model</th>
              <th scope="col" class="num">Cost/run</th>
              <th scope="col" class="num">Hidden tests</th>
            </tr>
          </thead>
          <tbody>
            <tr class="chosen">
              <th scope="row">0.17 implementer</th>
              <td><TierMark tier="sonnet" /></td>
              <td class="num"><a :href="evidence + 'implementer-multi-sonnet.json'">$0.209</a></td>
              <td class="num"><a :href="evidence + 'implementer-multi-sonnet.json'">3 / 3</a></td>
            </tr>
            <tr class="ghost">
              <th scope="row">0.16 multi-file trigger</th>
              <td><TierMark tier="opus" /></td>
              <td class="num"><a :href="evidence + 'implementer-multi-opus.json'">$0.445</a></td>
              <td class="num"><a :href="evidence + 'implementer-multi-opus.json'">3 / 3</a></td>
            </tr>
          </tbody>
        </table>
        <div class="verdict-actions">
          <a class="verdict-btn primary" :href="withBase('/get-started/install')">Install</a>
          <a class="verdict-btn" :href="withBase('/benchmarks/')">Read every result</a>
        </div>
      </div>
      <aside class="method" aria-labelledby="method-title">
        <h2 id="method-title" class="method-title">How we tested</h2>
        <dl class="method-list">
          <div><dt>Case</dt><dd><a :href="withBase('/benchmarks/evals')"><code>implementer-multi-file</code></a></dd></div>
          <div><dt>Task</dt><dd>Multi-currency support across six modules of a small invoice ledger</dd></div>
          <div><dt>Graded by</dt><dd>Hidden tests the model never sees, plus the visible suite</dd></div>
          <div><dt>Runs</dt><dd>3 per arm, Claude Code 2.1.330, 2026-11-23; the sonnet arm ran with an unshipped context cap this task never reaches</dd></div>
          <div><dt>Prices</dt><dd>Claude API list prices</dd></div>
        </dl>
        <p class="method-note">
          One workload, three runs an arm: the direction is solid, the exact percentage is not.
        </p>
      </aside>
    </div>
  </section>
</template>
