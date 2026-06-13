import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCoversPicks } from "./src/coversParser.js";
import { fetchConsensus, sportConfig, sports } from "./src/consensus.js";
import { fetchHtml } from "./src/utils.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(__dirname, "public");
const port = Number(process.env.PORT || 3000);
const cache = new Map();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

const sportSlugs = new Set(Object.keys(sports));

function isSportPath(pathname) {
  const slug = pathname.replace(/^\/|\/$/g, "");
  return sportSlugs.has(slug);
}

function todayKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function cacheForSport(sport) {
  const config = sportConfig(sport);
  if (!cache.has(config.id)) {
    cache.set(config.id, {
      dateKey: null,
      fetchedAt: null,
      payload: null,
      consensus: null
    });
  }
  return { config, entry: cache.get(config.id) };
}

async function fetchDailyPicks(sport, force = false) {
  const { config, entry } = cacheForSport(sport);
  const key = todayKey();
  const coversSource = config.sources.find((source) => source.id === "covers");

  if (!force && entry.dateKey === key && entry.payload) {
    return entry.payload;
  }

  const html = await fetchCoversHtmlWithExpandedPages(coversSource.url, config.id);
  const parsed = parseCoversPicks(html, { sport: config.id, sourceUrl: coversSource.url });
  entry.dateKey = key;
  entry.fetchedAt = new Date().toISOString();
  entry.payload = {
    ...parsed,
    sport: config.id,
    sportLabel: config.label,
    fetchedAt: entry.fetchedAt,
    cachedFor: key,
    sourceUrl: coversSource.url
  };

  return entry.payload;
}

async function fetchDailyConsensus(sport, force = false) {
  const { config, entry } = cacheForSport(sport);
  const key = todayKey();
  const coversSource = config.sources.find((source) => source.id === "covers");

  if (!force && entry.dateKey === key && entry.consensus) {
    return entry.consensus;
  }

  const coversHtml = await fetchCoversHtmlWithExpandedPages(coversSource.url, config.id);
  const payload = await fetchConsensus({ sport: config.id, coversHtml });
  entry.dateKey = key;
  entry.consensus = payload;
  return payload;
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
      } catch {
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

/**
 * Read public/index.html and patch asset paths + sport-specific content
 * for pages served from a subdirectory (e.g. /nba/, /nhl/).
 * On the local dev server there are no pre-built sport subpages, so we
 * generate the patched HTML on the fly — the same transformations that
 * generateStaticData.js applies at build time.
 */
async function sportPageHtml(sport) {
  const rootHtml = await readFile(join(publicDir, "index.html"), "utf8");
  const config = sportConfig(sport);
  const label = config.label;
  const sourceUrl = config.sources.find((s) => s.id === "covers")?.url ||
    `https://www.covers.com/picks/${config.id}`;

  return rootHtml
    .replace(/<title>Daily Expert MLB Board<\/title>/, `<title>Daily Expert ${label} Board</title>`)
    .replace(/Expert MLB Board/, `Expert ${label} Board`)
    .replace(/href="styles\.css"/, `href="../styles.css"`)
    .replace(/src="app\.js"/, `src="../app.js"`)
    .replace(/href="https:\/\/www\.covers\.com\/picks\/mlb"/, `href="${sourceUrl}"`)
    .replace(/href="\.\/"/, `href="../"`)
    .replace(/href="nba\/"/, `href="../nba/"`)
    .replace(/href="nhl\/"/, `href="../nhl/"`);
}

async function serveStatic(pathname, res) {
  // Root → serve index.html as-is.
  if (pathname === "/") {
    try {
      const body = await readFile(join(publicDir, "index.html"));
      res.writeHead(200, { "content-type": mimeTypes[".html"] });
      res.end(body);
    } catch {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not found");
    }
    return;
  }

  // Sport landing pages (/nba, /nba/, /nhl, /nhl/) — serve a patched version
  // of index.html with sport-specific title and ../-prefixed asset paths so
  // styles.css and app.js resolve correctly from the subdirectory.
  if (isSportPath(pathname)) {
    try {
      const slug = pathname.replace(/^\/|\/$/g, "");
      const body = await sportPageHtml(slug);
      res.writeHead(200, { "content-type": mimeTypes[".html"] });
      res.end(body);
    } catch {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not found");
    }
    return;
  }

  // Everything else: CSS, JS, JSON data files, etc.
  const safePath = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(publicDir, safePath);

  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const body = await readFile(filePath);
    res.writeHead(200, { "content-type": mimeTypes[extname(filePath)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const sport = sportConfig(url.searchParams.get("sport") || url.pathname.replace(/^\/|\/$/g, "")).id;

  if (url.pathname === "/api/picks") {
    try {
      const data = await fetchDailyPicks(sport, url.searchParams.get("refresh") === "1");
      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store"
      });
      res.end(JSON.stringify(data));
    } catch (error) {
      res.writeHead(502, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({
        error: `Unable to fetch Covers ${sportConfig(sport).label} picks right now.`,
        detail: error.message,
        sourceUrl: sportConfig(sport).sources.find((source) => source.id === "covers")?.url
      }));
    }
    return;
  }

  if (url.pathname === "/api/consensus") {
    try {
      const data = await fetchDailyConsensus(sport, url.searchParams.get("refresh") === "1");
      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store"
      });
      res.end(JSON.stringify(data));
    } catch (error) {
      res.writeHead(502, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({
        error: `Unable to compare ${sportConfig(sport).label} picks right now.`,
        detail: error.message
      }));
    }
    return;
  }

  await serveStatic(url.pathname, res);
});

server.listen(port, () => {
  console.log(`Daily Expert Picks is running at http://localhost:${port}`);
});
