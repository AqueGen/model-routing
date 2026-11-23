# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Documentation site: VitePress 1.x in `site/`, deployed to GitHub Pages at https://aquegen.github.io/model-routing/ (delegated by the owner: chosen for built-in local search, dark mode, copy buttons and a one-command static build).

## Users

Developers who run Claude Code daily, often on a subscription plan or the API, who dispatch subagents (directly, through Superpowers, or through Workflow scripts) and want those dispatches to cost less without losing quality. They arrive from GitHub or a plugin marketplace and decide in a few minutes whether to install, then return to the docs to tune pins and read the stats. (Inferred from the README and the owner's own usage; not interviewed.)

## Product Purpose

model-routing is a Claude Code plugin that picks the agent, model tier (haiku, sonnet, opus) and reasoning effort for each subagent dispatch that something else decided to make, so the dispatch does not inherit the expensive session model. Since 0.17 it adds no dispatches of its own. Success: a measurable drop in subagent cost at equal quality, shown by reproducible evals and the bundled dispatch counter.

## Positioning

Evidence-first and honest about its own limits. It publishes measured A/B evals with the runner, fixtures and raw aggregates in the repo, including results that went against it (up to 0.16 it caused dispatches that made a measured session 23% more expensive; 0.17 removed that). Neighboring routers mostly claim savings from runs on delegation-heavy prompts without a baseline.

## Operating Context

Installed through `/plugin marketplace add AqueGen/model-routing` and `/plugin install`. Works next to Superpowers, Workflow scripts and the user's own pinned agents. Users check results with `/model-routing:stats` and `dispatch-counter.mjs tokens`, and run `evals/run-local.mjs` to reproduce numbers.

## Capabilities and Constraints

- Bundled agents: scout, surveyor, implementer, reviewer, task-reviewer, test-runner, verifier, e2e-runner, each with a model and effort pin.
- SessionStart routing anchor (~620 tokens) and a routing skill; always-on cost about 1.9k tokens per session.
- Dispatch counter with stats, report and tokens modes.
- No proxy, no server, no API key; everything stays inside Claude Code.
- The plugin cannot change the main-session model.

## Brand Commitments

Name: model-routing (lowercase, hyphenated). License: see LICENSE in the repo. No logo exists. Voice: plain, factual, first-person from the author where it reports measurements; no marketing superlatives.

## Evidence on Hand

- `evals/evidence/*.json`: aggregates for every published number (implementer multi-file: sonnet $0.209 vs opus $0.445, 3/3 hidden tests each; inline cases; reviewer seeded bugs 12/12).
- README tables and mermaid charts of a 7-day snapshot of the author's own usage.
- No testimonials, user counts, press or customer logos exist; do not fabricate any.

## Product Principles

1. Every number links to a file that produced it.
2. Say what it does not do as clearly as what it does.
3. Never push the user toward more subagent dispatches.
4. Cheapest tier that holds quality, measured, not assumed.

## Accessibility & Inclusion

WCAG 2.2 AA for the docs site: readable contrast in light and dark, keyboard navigation, no information carried by color alone in charts and tables. (Standard assumed; no product-specific requirement stated.)
