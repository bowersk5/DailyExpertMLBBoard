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

  // Write sport pages so GitHub Pages can serve /nba/ and /nhl/.
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

  // Fetch Covers once so picks.json and consensus.json use the same page data.
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

  // If a consensus source fails, still publish the Covers picks.
  try {
    const consensus = await fetchConsensus({ sport: config.id, coversHtml: html });
    await writeFile(consensusFile, `${JSON.stringify(consensus, null, 2)}\n`);
    console.log(`Wrote ${consensus.counts.consensus} ${config.label} consensus groups to ${consensusFile}`);
  } catch (error) {
    console.error(`${config.label} consensus fetch failed — writing empty placeholder:`, error.message);
    await writeFile(consensusFile, `${JSON.stringify(emptyConsensus(config), null, 2)}\n`);
  }
}

async function writeSportHtml(config) {
  // Reuse the root page, then adjust title, source link, and relative paths.
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
