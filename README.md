# Daily Expert Picks Board

Daily Expert Picks Board is a zero-dependency Node.js app that gathers public betting-pick pages, normalizes the picks across sources, and publishes a static consensus dashboard for MLB, NBA, and NHL.

The production site is static GitHub Pages output from `public/`. For local development, `server.js` serves the same frontend and fetches fresh source data on demand.

## What It Shows

- Sport-specific pages for MLB, NBA, and NHL.
- Consensus cards grouped by matchup, market, and selection.
- Game start times shown on consensus cards when the source data provides them.
- Source agreement, expert counts, sample pick sources, and expandable analysis text.
- Market filters for moneyline, totals, run line/spread, props, and parlays.
- A small parlay slip that calculates combined American odds and estimated profit.
- A stale-data banner when generated data is more than 10 hours old.
- Light and dark themes saved in local storage.

## Sources

Configured sources live in `src/consensus.js`.

| Sport | Covers | Pickswise | Action Network | The Lines |
| --- | --- | --- | --- | --- |
| MLB | Yes | Yes | Yes | Yes |
| NBA | Yes | Yes | No | Yes |
| NHL | Yes | Yes | No | Yes |

Covers is also used for the standalone `picks.json` payload. The build follows Covers matchup "View Picks" links when the league page only exposes teaser cards.

## Quick Start

Requirements:

- Node.js 20 or newer.
- No npm install step is required; the project uses Node built-ins and native `fetch`.

```bash
npm test
npm run build:pages
npm run dev
```

Then open:

```text
http://localhost:3000
```

Useful routes:

- `/` - MLB page.
- `/nba/` - NBA page.
- `/nhl/` - NHL page.
- `/api/picks?sport=mlb|nba|nhl` - live Covers picks payload.
- `/api/consensus?sport=mlb|nba|nhl` - live consensus payload.

Add `refresh=1` to either API route to bypass the in-memory daily cache during local development.

## Scripts

```bash
npm test
```

Runs the Node test suite.

```bash
npm run build:pages
```

Generates static JSON data under `public/data/` and writes static sport pages under `public/nba/` and `public/nhl/`.

```bash
npm start
```

Starts the local server with live data fetching.

```bash
npm run dev
```

Starts the local server with Node's watch mode.

The server uses `PORT`, defaulting to `3000`.

## Static Build Output

The generated static site uses these data files:

```text
public/data/picks.json
public/data/consensus.json
public/data/nba/picks.json
public/data/nba/consensus.json
public/data/nhl/picks.json
public/data/nhl/consensus.json
```

Generated data and generated sport subpages are gitignored by convention:

- `public/data/picks.json`
- `public/data/consensus.json`
- `public/data/nba/`
- `public/data/nhl/`
- `public/nba/`
- `public/nhl/`

The old `history/` archive workflow is retired and should not be reintroduced unless the project explicitly needs snapshots again.

## Data Model

Each sport gets two JSON payloads.

`picks.json` contains Covers-only data:

- `sport` and `sportLabel`
- `fetchedAt`
- `sourceUrl`
- `games`
- `picks`
- `bestPicks`
- `counts`

Important Covers counts:

- `counts.expertPicks` and `counts.picks` are the expert-pick totals listed by Covers.
- `counts.parsedPicks` is the number of current expert cards parsed into the payload.
- `counts.computerPicks` is the listed Covers computer-pick total when present.

`consensus.json` contains normalized picks from every configured source:

- `sport` and `sportLabel`
- `generatedAt`
- `sources`
- `picks`
- `consensus`
- `counts`

Consensus entries are grouped by normalized matchup, market, and selection. Confidence scoring favors cross-source agreement first, then expert count, then recency.

## Project Structure

```text
.
├── .github/workflows/pages.yml
├── public/
│   ├── index.html
│   ├── app.js
│   ├── styles.css
│   └── data/
├── scripts/
│   └── generateStaticData.js
├── src/
│   ├── consensus.js
│   ├── coversParser.js
│   └── utils.js
├── test/
│   ├── consensus.test.js
│   └── coversParser.test.js
├── package.json
└── server.js
```

Key files:

- `public/index.html` is the root MLB page and the template used to generate NBA/NHL subpages.
- `public/app.js` loads static JSON on GitHub Pages and live API JSON on localhost.
- `scripts/generateStaticData.js` performs the static build for GitHub Pages.
- `src/consensus.js` defines sports, sources, source parsers, normalization, and consensus scoring.
- `src/coversParser.js` parses Covers league pages and wrapped expanded matchup pages.
- `src/utils.js` contains shared fetch and HTML utility helpers.
- `server.js` serves static files locally and exposes live API routes.

## Deployment

GitHub Pages deployment is handled by `.github/workflows/pages.yml`.

The workflow runs:

- On pushes to `main` or `master`.
- Manually through `workflow_dispatch`.
- Twice daily on schedule:
  - `2:30 PM UTC` / `10:30 AM ET`
  - `10:00 PM UTC` / `6:00 PM ET`

The workflow:

1. Checks out the repo.
2. Sets up Node 22.
3. Runs `npm test`.
4. Runs `npm run build:pages`.
5. Uploads the `public/` directory to GitHub Pages.

## Development Notes

- This app scrapes public HTML, so source parser changes are expected whenever a source site changes markup.
- Each source request uses a timeout through `AbortController`.
- Covers matchup pages are merged back into the original league-page HTML with wrapper comments before parsing.
- If consensus generation fails for a sport during the static build, the script still writes the Covers `picks.json` payload and writes an empty consensus placeholder.
- Sport-specific team aliases live in `src/consensus.js` so shared abbreviations can normalize differently across MLB, NBA, and NHL.
