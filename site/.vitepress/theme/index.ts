import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import '@fontsource/barlow-condensed/500.css'
import '@fontsource/barlow-condensed/600.css'
import './report.css'
import VerdictPanel from './VerdictPanel.vue'
import TierMark from './TierMark.vue'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('VerdictPanel', VerdictPanel)
    app.component('TierMark', TierMark)
  },
} satisfies Theme
