---
version: 1
slug: "site-index-md"
primary_target: "site/index.md"
related_targets: ["site/guide"]
---

# Docs site (landing + documentation)

Scope: the VitePress site in `site/`, home page and every docs page. Visitor mode: Read (the home page is the documentation's front door, not a campaign page).

Audience and job: Claude Code users deciding in minutes whether to install, then returning to tune pins and read stats. Proof: the eval results and evidence files in the repo. Constraints: PRODUCT.md principles; no claim stronger than the README; WCAG 2.2 AA.

Decision note: the owner delegated the direction choice ("choose the design yourself"), so no decision page was served; the assigned direction is built unattended.

## Direction contract

THESIS: The site is an independent comparative test report about the plugin itself: verdicts with measured numbers, a "how we tested" box, rating marks. It refuses the category default of a dark hero with a slogan and a feature-card grid.

OWN-WORLD: Report paper: cool white ground, near-black blue ink, one report colour (deep test-report green for verdict fields and rules), tier rating discs (haiku 1, sonnet 2, opus 3 filled segments) as marks readable without colour; tabular figures everywhere numbers sit; hairline table rules, no cards, no shadows, no gradients.

STORY: The reader sees the verdict first (what was tested, what it cost, did quality hold), follows any number to its evidence file, then installs or reads how it works.

FIRST VIEWPORT: Masthead with product name and a "Test report 0.17.0" running head; left two thirds a full-width verdict field in report green carrying the measured result table (implementer multi-file: sonnet $0.209 vs opus $0.445, hidden tests 3/3 each); right a "How we tested" box; install command directly under the verdict; nav to Docs and Benchmarks.

FORM: Comparative test report (candidate 4 of 7). Raises: evidence-linked numerals (patent drawing sheet), state as a mark not a hue (cutting bench), unchosen tiers shown as ghosts (cathode gauze), version changes called out 1:1 (brick instructions), colour confined to the frame while the reading column stays achromatic (iridescent cloud edge), the verdict field owns its region in one colour (seedbed lobes). seed:b2eff57141349c05

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
