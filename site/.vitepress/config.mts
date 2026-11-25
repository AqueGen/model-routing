import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { withMermaid } from 'vitepress-plugin-mermaid'

const repo = 'https://github.com/AqueGen/model-routing'
const manifest = fileURLToPath(new URL('../../.claude-plugin/plugin.json', import.meta.url))
const version: string = JSON.parse(readFileSync(manifest, 'utf8')).version

export default withMermaid({
  title: 'model-routing',
  description:
    'Tiered model routing for Claude Code: every subagent dispatch runs on the cheapest tier and effort its role needs.',
  base: '/model-routing/',
  cleanUrls: true,
  lastUpdated: true,
  head: [['link', { rel: 'icon', type: 'image/svg+xml', href: '/model-routing/favicon.svg' }]],
  themeConfig: {
    nav: [
      { text: 'Docs', link: '/get-started/install', activeMatch: '^/(get-started|how-it-works|guides|reference|contribute)/' },
      { text: 'Benchmarks', link: '/benchmarks/', activeMatch: '^/benchmarks/' },
      { text: 'GitHub', link: repo },
      { text: version, link: `${repo}/releases` },
    ],
    sidebar: [
      {
        text: 'Get started',
        items: [
          { text: 'Install', link: '/get-started/install' },
          { text: 'Getting started', link: '/get-started/getting-started' },
          { text: 'Usage', link: '/get-started/usage' },
        ],
      },
      {
        text: 'How it works',
        items: [
          { text: 'Overview', link: '/how-it-works/' },
          { text: 'Why each choice', link: '/how-it-works/why-each-choice' },
          { text: 'Model tiers and effort ladder', link: '/how-it-works/model-tiers' },
          { text: 'Why not a router proxy', link: '/how-it-works/router-proxy' },
        ],
      },
      {
        text: 'Guides',
        items: [
          { text: 'Recommended settings', link: '/guides/recommended-settings' },
          { text: 'Routing modes', link: '/guides/routing-modes' },
          { text: 'Overriding pins', link: '/guides/overriding-pins' },
          { text: 'Configuration', link: '/guides/configuration' },
          { text: 'Staying up to date', link: '/guides/staying-up-to-date' },
        ],
      },
      {
        text: 'Benchmarks',
        items: [
          { text: 'Will it save you money', link: '/benchmarks/' },
          { text: 'Evals', link: '/benchmarks/evals' },
          { text: 'Evidence files', link: '/benchmarks/evidence' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'Dispatch counter', link: '/reference/dispatch-counter' },
          { text: 'Environment variables', link: '/reference/environment-variables' },
        ],
      },
      {
        text: 'Contribute',
        items: [{ text: 'Releasing and license', link: '/contribute/' }],
      },
    ],
    socialLinks: [{ icon: 'github', link: repo }],
    search: { provider: 'local' },
    editLink: {
      pattern: `${repo}/edit/main/site/:path`,
      text: 'Edit this page on GitHub',
    },
    outline: [2, 3],
    footer: { message: 'MIT License.' },
  },
  mermaid: {},
})
