import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseCoversPicks } from "../src/coversParser.js";
import { fetchConsensus, sports } from "../src/consensus.js";
import { fetchHtml } from "../src/utils.js";

const publicDir = join(process.cwd(), "public");
const outputDir = join(publicDir, "data");

async function main() {
  await mkdir(outputDir, { recursive: true });

  for (const config of Object.values(sports)) {
    const sportDir = config.id === "mlb" ? outputDir : join(outputDir, config.id);
    await mkdir(sportDir, { recursive: true });
    await writeSportData(config, sportDir);
  }

  // Write per-sport index.html files for GitHub Pages routing.
  for (const config of Object.values(sports)) {
    if (config.id !== "mlb") {
      await writeSportHtml(config);
    }
  }
}

async function writeSportData(config, sportDir) {
  const coversSource = config.sources.find((source) => source.id === "covers");
  const outputFile = join(sportDir, "picks.json");
  const consensusFile = join(sportDir, "consensus.json");

  // Fetch the Covers page once and reuse the HTML for both picks and consensus.
  const html = await fetchCoversHtmlWithExpandedPages(coversSource.url, config.id);

  const parsed = parseCoversPicks(html, { sport: config.id, sourceUrl: coversSource.url });
  const payload = {
    ...parsed,
    sport: config.id,
    sportLabel: config.label,
    fetchedAt: new Date().toISOString(),
    sourceUrl: coversSource.url
  };

  await writeFile(outputFile, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Wrote ${payload.picks.length} parsed ${config.label} expert picks (${payload.counts.expertPicks} listed) to ${outputFile}`);

  // Consensus is best-effort: one unavailable source should not block deploys.
  try {
    const consensus = await fetchConsensus({ sport: config.id, coversHtml: html });
    await writeFile(consensusFile, `${JSON.stringify(consensus, null, 2)}\n`);
    console.log(`Wrote ${consensus.counts.consensus} ${config.label} consensus groups to ${consensusFile}`);

    // Log parser health warnings so CI surfacing is visible in the build log.
    for (const source of consensus.sources) {
      if (source.warning) {
        console.warn(`[health] ${config.label}/${source.name}: ${source.warning}`);
      }
    }
  } catch (error) {
    console.error(`${config.label} consensus fetch failed — writing empty placeholder:`, error.message);
    await writeFile(consensusFile, `${JSON.stringify(emptyConsensus(config), null, 2)}\n`);
  }
}

async function fetchCoversHtmlWithExpandedPages(sourceUrl, sport) {
  const html = await fetchHtml(sourceUrl);
  const parsed = parseCoversPicks(html, { sport, sourceUrl });
  const expandedPages = await Promise.all(parsed.games
    .filter((game) => game.matchupUrl)
    .map(async (game) => {
      const url = new URL(game.matchupUrl, sourceUrl).href;
      try {
        const pageHtml = await fetchHtml(url);
        return wrapExpandedPage(game, pageHtml);
      } catch (error) {
        console.warn(`[covers/${sport}] Expanded picks fetch failed for ${url}: ${error.message}`);
        return "";
      }
    }));

  return [html, ...expandedPages.filter(Boolean)].join("\n");
}

function wrapExpandedPage(game, html) {
  const metadata = encodeURIComponent(JSON.stringify({
    away: game.away,
    home: game.home,
    matchup: game.matchup,
    startsAt: game.startsAt,
    expertPicks: game.expertPicks,
    computerPicks: game.computerPicks,
    matchupUrl: game.matchupUrl
  }));
  return `<!-- COVERS_EXPANDED_START ${metadata} -->\n${html}\n<!-- COVERS_EXPANDED_END -->`;
}

async function writeSportHtml(config) {
  const rootHtml = await readFile(join(publicDir, "index.html"), "utf8");

  const sportDir = join(publicDir, config.id);
  await mkdir(sportDir, { recursive: true });

  const label = config.label;
  const sourceUrl = config.sources.find((s) => s.id === "covers")?.url || `https://www.covers.com/picks/${config.id}`;

  const patched = rootHtml
    .replace(/<title>Daily Expert MLB Board<\/title>/, `<title>Daily Expert ${label} Board</title>`)
    .replace(/Expert MLB Board/, `Expert ${label} Board`)
    .replace(/href="styles\.css"/, `href="../styles.css"`)
    .replace(/src="app\.js"/, `src="../app.js"`)
    .replace(/href="https:\/\/www\.covers\.com\/picks\/mlb"/, `href="${sourceUrl}"`)
    .replace(/href="\.\/"/, `href="../"`)
    .replace(/href="nba\/"/, `href="../nba/"`)
    .replace(/href="nhl\/"/, `href="../nhl/"`);

  const outFile = join(sportDir, "index.html");
  await writeFile(outFile, patched);
  console.log(`Wrote ${outFile}`);
}

function emptyConsensus(config) {
  return {
    sport: config.id,
    sportLabel: config.label,
    generatedAt: new Date().toISOString(),
    sources: [],
    picks: [],
    consensus: [],
    counts: { sources: 0, activeSources: 0, picks: 0, consensus: 0 }
  };
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
