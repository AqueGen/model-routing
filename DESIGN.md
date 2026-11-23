---
name: model-routing docs
description: Documentation site and landing page for model-routing, set as an independent comparative test report.
colors:
  report-green: "#0d5a42"
  report-green-deep: "#0a4734"
  on-report: "#f3faf6"
  on-report-muted: "#c4ded2"
  report-tint: "#e3efe9"
  paper: "#f9fbfa"
  paper-2: "#f0f3f1"
  ink: "#16202a"
  ink-2: "#46525d"
  rule: "#d4dbd7"
  dark-paper: "#0f1519"
  dark-paper-2: "#172025"
  dark-ink: "#e5ece9"
  dark-ink-2: "#a7b4af"
  dark-rule: "#2b3631"
  dark-report-green: "#134a37"
  dark-link: "#6cc9a1"
  dark-frame-rule: "#2f8f69"
typography:
  display:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "clamp(36px, 4.6vw, 60px)"
    fontWeight: 600
    lineHeight: 1.02
    letterSpacing: "-0.01em"
  heading-1:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "44px"
    fontWeight: 600
    lineHeight: 1.05
  heading-2:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "30px"
    fontWeight: 600
    lineHeight: 1.15
  table-label:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    letterSpacing: "0.04em"
  result-figure:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "28px"
    fontWeight: 600
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    lineHeight: 1.75
rounded:
  sm: "6px"
spacing:
  gutter-desktop: "32px"
  gutter-tablet: "24px"
  gutter-mobile: "20px"
  cell-x: "20px"
components:
  button-primary:
    backgroundColor: "{colors.on-report}"
    textColor: "{colors.report-green-deep}"
    rounded: "{rounded.sm}"
    padding: "11px 22px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.on-report}"
    rounded: "{rounded.sm}"
    padding: "11px 22px"
  verdict-field:
    backgroundColor: "{colors.report-green}"
    textColor: "{colors.on-report}"
  method-box:
    backgroundColor: "{colors.report-green-deep}"
    textColor: "{colors.on-report}"
    rounded: "{rounded.sm}"
    padding: "22px 24px"
---

# Design System: model-routing docs

## Overview

The site is an independent comparative test report about the plugin itself. The first thing a visitor meets is a verdict with measured numbers, a "How we tested" box and rating marks, never a slogan or a grid of feature cards. The world owns the frame (the report-green verdict field, the green rule under the masthead, condensed display headings, test-report tables); the reading column inside docs pages stays calm and achromatic.

It is a Read surface: documentation reads as documentation, with VitePress's own navigation, sidebar, search and outline left in their standard places and restyled, not replaced.

## Colors

### Primary

Report green `#0d5a42` owns whole regions, never accents: the verdict field on the home page and the 3px frame rule under the navigation. Text on it is `#f3faf6`; secondary text on it is `#c4ded2`, tinted from the field, never grey.

### Neutral

Cool report paper `#f9fbfa` with `#f0f3f1` for code and soft surfaces, blue-black ink `#16202a`, secondary ink `#46525d`, hairline rules `#d4dbd7`. Dark mode swaps to `#0f1519` paper and `#e5ece9` ink; the verdict field deepens to `#134a37` and the frame rule brightens to `#2f8f69` so it stays visible.

### Named Rules

- **Colour in the frame, not the column.** Green appears in the verdict field, the masthead rule, links and selection; body text and docs tables stay ink on paper.
- **State is a mark, not a hue.** Model tier is shown by the number of filled discs (one haiku, two sonnet, three opus), so it reads without colour; the unchosen arm of a comparison is dimmed to 80% but stays legible.

## Typography

Barlow Condensed (600, self-hosted through `@fontsource/barlow-condensed`) is the report voice: page titles, section headings, table header labels, tier names and result figures. Inter, VitePress's own face, carries body text at a real reading measure.

### Hierarchy

- Display (verdict headline): clamp(36px, 4.6vw, 60px), 1.02 line height, at most about 20 characters per line.
- H1 44px, H2 30px with a 1px ink rule above it, H3 22px.
- Table header labels 15px uppercase, 0.04em tracking.
- Result figures in the verdict table 28px (20-22px on mobile), tabular numerals.

### Named Rules

- **Numbers are tabular.** Every table sets `font-variant-numeric: tabular-nums`.
- **No eyebrow labels.** Headings carry their own weight; nothing sits above them.

## Layout

One gutter per breakpoint: 32px from 960px up, 24px from 641 to 959px, 20px at 640px and below. The home verdict field is full width; its content and the body below share the 1152px container and the same left edge. Docs keep VitePress's sidebar, content column and outline. Docs tables top-align their cells; on screens 640px and narrower, multi-column tables scroll inside their own box rather than squeezing, and the home agents table stacks each row.

## Elevation & Depth

Flat. No shadows anywhere; separation comes from hairline rules, a 2px ink rule under table headers, and the method box's 1.5px outline on the deeper green.

## Shapes

One radius, 6px, for buttons, code blocks and the method box. Tier discs are circles. No pills, no cards.

## Components

### Buttons

On the verdict field only: a solid on-report primary ("Install") and an outlined secondary ("Read every result"), 6px radius, 11px by 22px padding, no underline.

### Navigation

VitePress navbar and sidebar, restyled: condensed title, 3px frame rule across the full width, the built-in navbar divider hidden.

### Verdict field (signature)

A full-width report-green section holding the verdict headline, a result table (arm, tier mark, cost per run, hidden tests) whose every figure links to the evidence JSON that produced it, the two buttons, and the "How we tested" box (definition list of case, task, grading, runs, prices, plus one caveat line).

### Tier mark

`<TierMark tier="haiku|sonnet|opus" />`: three 10px discs with 1, 2 or 3 filled, plus the tier name in the table-label style; the name hides below 480px inside the verdict table.

## Do's and Don'ts

### Do:

- Do link every measured number in a results table to the evidence file that produced it.
- Do show the losing arm of a comparison, dimmed, next to the winner.
- Do keep colour in the frame and the reading column achromatic.

### Don't:

- Don't add feature-card grids, hero metrics, gradient text or decorative shadows.
- Don't put a label or kicker above a heading.
- Don't state a saving the evals do not show, or a number with no source on the page.
