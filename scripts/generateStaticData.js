import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { join } from "node:path";
import { parseCoversPicks } from "../src/coversParser.js";
import { fetchConsensus, sports } from "../src/consensus.js";
import { fetchHtml } from "../src/utils.js";

const publicDir = join(process.cwd(), "public");
const outputDir = join(publicDir, "data");

// History dir lives outside public/ so it is not deployed to Pages.
const historyDir = join(process.cwd(), "history");

async function main() {
  await mkdir(outputDir, { recursive: true });
  await mkdir(historyDir, { recursive: true });

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
  const html = await fetchHtml(coversSource.url);

  const parsed = parseCoversPicks(html, { sport: config.id, sourceUrl: coversSource.url });
  const payload = {
    ...parsed,
    sport: config.id,
    sportLabel: config.label,
    fetchedAt: new Date().toISOString(),
    sourceUrl: coversSource.url
  };

  await writeFile(outputFile, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Wrote ${payload.counts.picks} ${config.label} expert picks to ${outputFile}`);

  // Archive a dated snapshot so we can track pick history over time.
  await archiveSnapshot(config.id, "picks", payload);

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

    await archiveSnapshot(config.id, "consensus", consensus);
  } catch (error) {
    console.error(`${config.label} consensus fetch failed — writing empty placeholder:`, error.message);
    await writeFile(consensusFile, `${JSON.stringify(emptyConsensus(config), null, 2)}\n`);
  }
}

/**
 * Write a dated snapshot to history/<sport>/<YYYY-MM-DD>-<type>.json.
 * These are not deployed — they are committed to the repo so you can track
 * which picks were published each day and eventually compute hit rates.
 */
async function archiveSnapshot(sportId, type, data) {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const sportHistoryDir = join(historyDir, sportId);
  await mkdir(sportHistoryDir, { recursive: true });
  const file = join(sportHistoryDir, `${date}-${type}.json`);
  await writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`Archived snapshot → ${file}`);
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
