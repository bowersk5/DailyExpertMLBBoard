# Daily Expert MLB Board

A zero-dependency Node.js dashboard that aggregates and cross-references daily MLB, NBA, and NHL betting picks from expert sources — **Covers**, **Pickswise**, and **Action Network** — and deploys automatically twice a day as a static GitHub Pages site.

---

## How it works

1. A GitHub Actions workflow runs at **2:30 PM UTC** (10:30 AM ET) and **10:00 PM UTC** (6:00 PM ET) each day.
2. `scripts/generateStaticData.js` scrapes all configured pick sources, follows Covers matchup "View Picks" pages, normalises the data, and writes JSON files into `public/data/`.
3. The script also generates sport subdirectory pages (`public/nba/index.html`, `public/nhl/index.html`) from the root `public/index.html` template.
4. The `public/` folder is deployed to GitHub Pages — no server required.
5. A local dev server (`server.js`) is also available for development; it fetches live data on demand and serves the same frontend.

### Sources

| Sport | Covers | Pickswise | Action Network |
|---|---|---|---|
| MLB | ✓ | ✓ | ✓ |
| NBA | ✓ | ✓ | — |
| NHL | ✓ | ✓ | — |

---

## Quick start

**Requirements:** Node.js ≥ 20 (uses the built-in `fetch` API — no `npm install` needed).

```bash
# Clone the repo
git clone https://github.com/bowersk5/DailyExpertMLBBoard.git
cd DailyExpertMLBBoard

# Run tests
npm test

# Generate today's static data files and sport pages
npm run build:pages

# Start the local dev server (live data, auto-restarts on file changes)
npm run dev
# → http://localhost:3000
```

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port for the local dev server |

No API keys are required. The app scrapes publicly available web pages.

---

## Data model

Each sport writes two generated JSON files:

- `picks.json` — Covers expert picks, including expanded matchup pages when Covers hides most cards behind a "View Picks" link.
- `consensus.json` — Normalised picks from all configured sources, grouped by matchup, market, and selection.

The Covers payload distinguishes listed picks from parsed cards:

- `counts.expertPicks` / `counts.picks` — the expert-pick count listed by Covers for current games.
- `counts.parsedPicks` — the number of expert pick cards parsed into the dashboard.
- `counts.computerPicks` — the computer-pick count listed by Covers, when present.

When Covers exposes the full matchup page, `parsedPicks` should match `expertPicks`. If a source changes its markup or hides cards differently, the dashboard can still show the listed count while parser health warnings surface the mismatch.

---

## Project structure

```
├── .github/workflows/pages.yml  # CI: test → generate → deploy (runs twice daily)
├── public/
│   ├── index.html               # Root page (MLB) — also used as template for sport subpages
│   ├── styles.css
│   ├── app.js                   # Frontend logic (vanilla JS)
│   └── data/
│       ├── picks.json           # Generated: MLB Covers expert picks
│       ├── consensus.json       # Generated: MLB cross-source consensus
│       ├── nba/                 # Generated: NBA picks and consensus
│       └── nhl/                 # Generated: NHL picks and consensus
├── scripts/
│   └── generateStaticData.js    # Build script: generates JSON + sport subpages
├── src/
│   ├── coversParser.js          # HTML parser for Covers
│   ├── consensus.js             # Multi-source aggregator with sport-aware normalisation
│   └── utils.js                 # Shared: decodeEntities, fetchHtml (with per-request timeout)
├── test/
│   ├── coversParser.test.js
│   └── consensus.test.js
└── server.js                    # Local dev server (not used in production)
```

---

## Frontend features

- **Sport tabs** — Switch between MLB, NBA, and NHL. Each tab loads its own consensus data.
- **Market filters** — Filter consensus picks by market type (Moneyline, Total, Run Line, Spread, Prop, Parlay) without a page reload.
- **Listed vs parsed counts** — The page summary shows the Covers-listed expert pick count and notes how many picks are currently available as consensus cards when those numbers differ.
- **Expandable analysis** — Each pick card shows a truncated expert summary; click "Read analysis" to expand the full write-up inline.
- **Parlay builder** — Click "+ Parlay" on any card to add it to a slip. The drawer at the bottom of the page calculates combined American odds and projected profit on a configurable stake.
- **Stale data warning** — A banner appears automatically when the data is more than 10 hours old, prompting a manual refresh.

---

## Deployment

The GitHub Actions workflow in `.github/workflows/pages.yml` handles everything:

- Triggers on push to `main`/`master`, on a daily schedule (10:30 AM ET and 6:00 PM ET), and manually via **Actions → Run workflow**.
- Runs `npm test` before generating data — a test failure aborts the deploy.
- Generates JSON data files and per-sport HTML pages (`nba/`, `nhl/`) from the root index template.
- Uploads only the `public/` folder to GitHub Pages.

To trigger a one-off refresh without pushing a commit, go to **Actions → Deploy GitHub Pages → Run workflow**.

---

## Development notes

- **No npm dependencies.** The project relies exclusively on Node.js built-ins (`node:http`, `node:fs`, `node:path`) and the native `fetch` API (Node ≥ 18). There is no `package-lock.json` because there is nothing to lock.
- **Fetch timeouts.** Each source request has a 15-second timeout via `AbortController`. A hung upstream will fail fast rather than stalling the entire build.
- **Covers expanded pages.** Covers league pages often show only teaser cards plus a matchup "View Picks" link. The build and local server follow those links and merge the expanded card layout back into the sport payload before consensus is built.
- **Parsers are fragile by nature.** Scraping HTML is inherently brittle. If a source site redesigns its page, the corresponding parser in `src/` will need updating. The build logs a warning when a source returns fewer picks than expected, which helps surface silent parser breakage (e.g. changes to the `__NEXT_DATA__` JSON blob that Pickswise and Action Network use).
- **Consensus is best-effort.** If Pickswise or Action Network is unreachable during the build, the script writes an empty `consensus.json` and continues so the main picks page still deploys.
- **Consensus confidence scoring.** Picks are ranked by: cross-source agreement (primary, +200 per unique source), expert count (secondary, +10 per expert), and recency (+50 if any pick was published in the last 4 hours). A pick agreed on by 2 sources always outranks one with many experts from a single source.
- **Sport-aware team normalisation.** `src/consensus.js` maintains a base abbreviation alias table plus per-sport overrides (e.g. `CHI` maps to `CHC` in MLB but stays `CHI` for the Bulls in NBA). Covers uses `VEG` for the Vegas Golden Knights; this is aliased to the canonical `VGK` used by other sources.
- **Generated files are gitignored.** `public/nba/`, `public/nhl/`, their `data/` subdirectories, and the retired `history/` archive directory are rebuilt or ignored by convention and should not be committed.
