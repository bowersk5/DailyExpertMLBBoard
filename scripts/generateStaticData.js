import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseCoversMlbPicks } from "../src/coversParser.js";
import { fetchMlbConsensus } from "../src/consensus.js";
import { fetchHtml } from "../src/utils.js";

const sourceUrl = "https://www.covers.com/picks/mlb";
const outputDir = join(process.cwd(), "public", "data");
const outputFile = join(outputDir, "picks.json");
const consensusFile = join(outputDir, "consensus.json");

async function main() {
  // Fetch the Covers page once and reuse the HTML for both picks and consensus.
  // Previously the page was fetched twice — once here and again inside
  // fetchMlbConsensus — which wasted a request and risked inconsistent data.
  const html = await fetchHtml(sourceUrl);

  const parsed = parseCoversMlbPicks(html, sourceUrl);
  const payload = {
    ...parsed,
    fetchedAt: new Date().toISOString(),
    sourceUrl
  };

  await mkdir(outputDir, { recursive: true });
  await writeFile(outputFile, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Wrote ${payload.counts.picks} expert picks to ${outputFile}`);

  // Consensus is best-effort: a failure from Pickswise or Action Network should
  // not prevent the main picks page from deploying.
  try {
    const consensus = await fetchMlbConsensus({ coversHtml: html });
    await writeFile(consensusFile, `${JSON.stringify(consensus, null, 2)}\n`);
    console.log(`Wrote ${consensus.counts.consensus} consensus groups to ${consensusFile}`);
  } catch (error) {
    console.error("Consensus fetch failed — writing empty placeholder:", error.message);
    const empty = {
      generatedAt: new Date().toISOString(),
      sources: [],
      picks: [],
      consensus: [],
      counts: { sources: 0, activeSources: 0, picks: 0, consensus: 0 }
    };
    await writeFile(consensusFile, `${JSON.stringify(empty, null, 2)}\n`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
