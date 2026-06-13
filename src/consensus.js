import { parseCoversPicks } from "./coversParser.js";
import { decodeEntities, fetchHtml } from "./utils.js";

export const sports = {
  mlb: {
    id: "mlb",
    label: "MLB",
    minExpectedPicks: 3,
    sources: [
      { id: "covers",    name: "Covers",       url: "https://www.covers.com/picks/mlb",         parser: parseCoversSource },
      { id: "pickswise", name: "Pickswise",     url: "https://www.pickswise.com/mlb/picks/",     parser: parsePickswiseSource },
      { id: "action",    name: "Action Network",url: "https://www.actionnetwork.com/mlb/picks/", parser: parseActionSource },
      { id: "thelines",  name: "The Lines",     url: "https://www.thelines.com/picks/mlb/",      parser: parseTheLinesSource }
    ]
  },
  nba: {
    id: "nba",
    label: "NBA",
    minExpectedPicks: 1,
    sources: [
      { id: "covers",    name: "Covers",      url: "https://www.covers.com/picks/nba",         parser: parseCoversSource },
      { id: "pickswise", name: "Pickswise",   url: "https://www.pickswise.com/nba/picks/",     parser: parsePickswiseSource },
      { id: "thelines",  name: "The Lines",   url: "https://www.thelines.com/picks/nba/",      parser: parseTheLinesSource }
    ]
  },
  nhl: {
    id: "nhl",
    label: "NHL",
    minExpectedPicks: 1,
    sources: [
      { id: "covers",    name: "Covers",      url: "https://www.covers.com/picks/nhl",         parser: parseCoversSource },
      { id: "pickswise", name: "Pickswise",   url: "https://www.pickswise.com/nhl/picks/",     parser: parsePickswiseSource, minExpectedPicks: 0 },
      { id: "thelines",  name: "The Lines",   url: "https://www.thelines.com/picks/nhl/",      parser: parseTheLinesSource }
    ]
  }
};

const defaultSport = "mlb";

// Team abbreviations that need a common spelling across sources.
const teamAliases = {
  ARZ: "ARI",
  ATH: "OAK",
  AZ: "ARI",
  BKN: "BRK",
  CHA: "CHA",
  CWS: "CHW",
  CLB: "CBJ",
  LAK: "LAK",
  MI: "MIA",
  MON: "MTL",
  NJ: "NJD",
  NYI: "NYI",
  NYR: "NYR",
  PHO: "PHX",
  SFG: "SF",
  UTA: "UTA",
  VEG: "VGK",
  WSH: "WAS"
};

// These aliases only apply within one sport.
const sportTeamAliases = {
  mlb: { CHI: "CHC", LA: "LAD", NO: "NOP", NY: "NYY" },
  nba: { NO: "NOP", NY: "NYK", GS: "GS" },
  nhl: { NO: "NSH" }
};

const teamNameAliases = [
  ["white sox", "CHW"], ["tigers", "DET"], ["royals", "KC"], ["rangers", "TEX"],
  ["twins", "MIN"], ["pirates", "PIT"], ["padres", "SD"], ["nationals", "WAS"],
  ["blue jays", "TOR"], ["orioles", "BAL"], ["angels", "LAA"], ["rays", "TB"],
  ["cubs", "CHC"], ["cardinals", "STL"], ["giants", "SF"], ["guardians", "CLE"],
  ["reds", "CIN"], ["diamondbacks", "ARI"], ["yankees", "NYY"], ["athletics", "ATH"],
  ["phillies", "PHI"], ["dodgers", "LAD"], ["brewers", "MIL"], ["rockies", "COL"],
  ["braves", "ATL"], ["red sox", "BOS"], ["mariners", "SEA"], ["mets", "NYM"],
  ["marlins", "MIA"], ["astros", "HOU"],
  ["hawks", "ATL"], ["celtics", "BOS"], ["nets", "BRK"], ["hornets", "CHA"],
  ["bulls", "CHI"], ["cavaliers", "CLE"], ["mavericks", "DAL"], ["nuggets", "DEN"],
  ["pistons", "DET"], ["warriors", "GS"], ["rockets", "HOU"], ["pacers", "IND"],
  ["clippers", "LAC"], ["lakers", "LAL"], ["grizzlies", "MEM"], ["heat", "MIA"],
  ["bucks", "MIL"], ["timberwolves", "MIN"], ["pelicans", "NOP"], ["knicks", "NYK"],
  ["thunder", "OKC"], ["magic", "ORL"], ["76ers", "PHI"], ["sixers", "PHI"],
  ["suns", "PHX"], ["trail blazers", "POR"], ["kings", "SAC"], ["spurs", "SA"],
  ["raptors", "TOR"], ["jazz", "UTA"], ["wizards", "WAS"],
  ["ducks", "ANA"], ["bruins", "BOS"], ["sabres", "BUF"], ["flames", "CGY"],
  ["hurricanes", "CAR"], ["blackhawks", "CHI"], ["avalanche", "COL"],
  ["blue jackets", "CBJ"], ["stars", "DAL"], ["red wings", "DET"], ["oilers", "EDM"],
  ["panthers", "FLA"], ["wild", "MIN"], ["canadiens", "MTL"], ["predators", "NSH"],
  ["devils", "NJD"], ["islanders", "NYI"], ["rangers", "NYR"], ["senators", "OTT"],
  ["flyers", "PHI"], ["penguins", "PIT"], ["sharks", "SJ"], ["kraken", "SEA"],
  ["blues", "STL"], ["lightning", "TB"], ["maple leafs", "TOR"], ["canucks", "VAN"],
  ["golden knights", "VGK"], ["capitals", "WAS"], ["jets", "WPG"]
];

export async function fetchMlbConsensus({ coversHtml } = {}) {
  return fetchConsensus({ sport: "mlb", coversHtml });
}

export async function fetchConsensus({ sport = defaultSport, coversHtml } = {}) {
  const config = sportConfig(sport);
  const settled = await Promise.allSettled(
    config.sources.map((source) =>
      source.id === "covers" && coversHtml
        ? fetchSourceFromHtml(source, coversHtml, config)
        : fetchSource(source, config)
    )
  );

  const sourceResults = settled.map((result, index) => {
    if (result.status === "fulfilled") {
      const sr = result.value;
      const minExpectedPicks = sr.minExpectedPicks ?? config.minExpectedPicks ?? 1;
      if (minExpectedPicks > 0 && sr.picks.length < minExpectedPicks && !sr.error) {
        sr.warning = `Expected ≥${minExpectedPicks} picks but got ${sr.picks.length} — parser may be broken`;
        console.warn(`[health] ${sr.name}: ${sr.warning}`);
      }
      return sr;
    }
    return {
      id: config.sources[index].id,
      name: config.sources[index].name,
      url: config.sources[index].url,
      error: result.reason.message,
      picks: []
    };
  });

  const allPicks = sourceResults.flatMap((source) => source.picks);
  const consensus = buildConsensus(allPicks, { totalSources: config.sources.length });

  return {
    sport: config.id,
    sportLabel: config.label,
    generatedAt: new Date().toISOString(),
    sources: sourceResults.map(({ id, name, url, picks, error, warning }) => ({
      id, name, url,
      error: error || null,
      warning: warning || null,
      picks: picks.length
    })),
    picks: allPicks,
    consensus,
    counts: {
      sources: sourceResults.length,
      activeSources: sourceResults.filter((s) => !s.error && s.picks.length > 0).length,
      picks: allPicks.length,
      consensus: consensus.length
    }
  };
}

/**
 * Build consensus from a flat list of normalised picks.
 *
 * Confidence scoring:
 *   - Cross-source agreement is the primary signal: +200 per unique source
 *   - Expert count within a source is secondary: +10 per unique expert
 *   - Recency bonus: picks published in the last 4 hours get +50
 *
 * A 2-source/1-expert pick (score 410) always beats a 1-source/5-expert pick (score 250).
 */
export function buildConsensus(picks, { totalSources = sports[defaultSport].sources.length } = {}) {
  const grouped = new Map();

  for (const pick of picks) {
    if (!pick.key) continue;

    const existing = grouped.get(pick.key) || {
      key: pick.key,
      matchup: pick.matchup,
      startsAt: pick.startsAt,
      market: pick.market,
      selection: pick.selection,
      sourceCount: 0,
      pickCount: 0,
      sources: [],
      experts: [],
      odds: [],
      examples: [],
      _recentCount: 0
    };
    const sourceKey = `${pick.source}:${pick.expert || pick.source}`;

    if (!existing.sources.some((s) => s.id === pick.sourceId)) {
      existing.sources.push({ id: pick.sourceId, name: pick.source });
      existing.sourceCount += 1;
    }
    if (!existing.experts.includes(sourceKey)) {
      existing.experts.push(sourceKey);
      existing.pickCount += 1;
    }
    if (pick.odds && !existing.odds.includes(pick.odds)) {
      existing.odds.push(pick.odds);
    }
    if (isRecent(pick.made)) {
      existing._recentCount += 1;
    }
    existing.examples.push({
      source: pick.source,
      expert: pick.expert,
      odds: pick.odds,
      analysis: pick.analysis
    });
    grouped.set(pick.key, existing);
  }

  return [...grouped.values()]
    .map((pick) => {
      const { _recentCount, ...rest } = pick;
      const confidence =
        pick.sourceCount * 200 +
        pick.pickCount * 10 +
        (_recentCount > 0 ? 50 : 0);
      return { ...rest, agreement: `${pick.sourceCount}/${totalSources}`, confidence };
    })
    .sort((a, b) => b.confidence - a.confidence || b.pickCount - a.pickCount || a.selection.localeCompare(b.selection));
}

export function sportConfig(sport = defaultSport) {
  return sports[sport] || sports[defaultSport];
}

function isRecent(made = "") {
  if (/\d+\s+minutes?\s+ago/i.test(made)) return true;
  const hourMatch = made.match(/^(\d+)\s+hours?\s+ago/i);
  if (hourMatch && Number(hourMatch[1]) <= 4) return true;
  return false;
}

async function fetchSource(source, config) {
  const html = await fetchHtml(source.url);
  return fetchSourceFromHtml(source, html, config);
}

function fetchSourceFromHtml(source, html, config) {
  const picks = source.parser(html, config).map((pick) => ({
    ...pick,
    sourceId: source.id,
    source: source.name,
    url: source.url
  }));
  return { id: source.id, name: source.name, url: source.url, picks, minExpectedPicks: source.minExpectedPicks };
}

// Covers source parser.

function parseCoversSource(html, config) {
  const data = parseCoversPicks(html, {
    sport: config.id,
    sourceUrl: sports[config.id].sources.find((s) => s.id === "covers")?.url
  });
  return data.picks.map((pick) => normalizePick({
    matchup: pick.matchup,
    startsAt: pick.startsAt,
    market: pick.market,
    selection: pick.selection,
    odds: pick.odds,
    expert: pick.analyst,
    analysis: pick.analysis,
    made: pick.made,
    sport: config.id
  })).filter(Boolean);
}

// Pickswise source parser.
//
// Pickswise has used two page formats:
// - older pages put pick data in a __NEXT_DATA__ JSON script
// - newer pages stream rendered rows through self.__next_f.push(...)
// Try both formats so a site change does not silently remove every pick.

function parsePickswiseSource(html, config) {
  const data = readNextData(html);

  if (!data) {
    const picks = parsePickswiseFlightRows(html, config);
    if (picks.length > 0) {
      console.log(`[pickswise/${config.id}] Found ${picks.length} rendered pick row(s)`);
      return picks;
    }
    if (!pickswiseHasNoPicks(html, config.id)) {
      console.warn(`[pickswise/${config.id}] No __NEXT_DATA__ or rendered pick rows found in HTML`);
    }
    return picks;
  }

  const records = probePickswisePaths(data, config.id);

  if (records.length === 0) {
    const picks = parsePickswiseFlightRows(html, config);
    if (picks.length > 0) {
      console.log(`[pickswise/${config.id}] Found ${picks.length} rendered pick row(s)`);
      return picks;
    }
    if (!pickswiseHasNoPicks(html, config.id)) {
      // Show the available page data keys so the parser is easier to update.
      const topKeys = Object.keys(data?.props?.pageProps || {}).join(", ") || "(empty)";
      console.warn(`[pickswise/${config.id}] 0 games found. pageProps keys: ${topKeys}`);
    }
    return picks;
  }

  console.log(`[pickswise/${config.id}] Found ${records.length} game(s)`);

  const picks = [];
  for (const game of records) {
    const away = normalizeTeamAbbr(game.awayTeam?.abbreviation, config.id);
    const home = normalizeTeamAbbr(game.homeTeam?.abbreviation, config.id);

    for (const pick of game.basePicks || []) {
      picks.push(normalizePick({
        matchup: `${away} @ ${home}`,
        startsAt: game.startTime || game.startTimeString,
        market: pick.market,
        selection: pick.outcome,
        odds: pick.oddsAmerican,
        expert: "Pickswise",
        analysis: stripHtml(pick.reasoning || ""),
        line: pick.line,
        type: pick.market,
        sport: config.id,
        home, away
      }));
    }
  }

  return picks.filter(Boolean);
}

function parsePickswiseFlightRows(html, config) {
  const flight = readNextFlightPayload(html);
  if (!flight) return [];

  const picks = [];
  const seen = new Set();
  const rowPattern = /\["\$","tr","[^"\\]+",\{[\s\S]*?"children":"([A-Z]{2,4})\s+vs\s+([A-Z]{2,4})"[\s\S]*?\]\]\}\],\["\$","td",null,\{"className":"px-4 py-3","children":\["\$","p",null,\{"className":"text-body-bold text-primary-blue-dark","children":"([^"\\]+)"\}\]\}\][\s\S]*?"children":"([+-]?\d+|—)"/g;

  let match;
  while ((match = rowPattern.exec(flight)) !== null) {
    const [, away, home, selection, odds] = match;
    const key = `${away}|${home}|${selection}|${odds}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const pick = normalizePick({
      matchup: `${away} @ ${home}`,
      away,
      home,
      market: pickswiseMarketFromSelection(selection),
      selection,
      odds: odds === "—" ? "" : odds,
      expert: "Pickswise",
      analysis: selection,
      sport: config.id
    });
    if (pick) picks.push(pick);
  }

  return picks;
}

function pickswiseMarketFromSelection(selection = "") {
  const clean = cleanText(selection);
  const prefix = clean.match(/^([A-Za-z ]+)\s+-\s+/)?.[1];
  if (prefix) return prefix;
  if (/\b[+-]\d+(?:\.\d+)?\b/.test(clean)) return "Spread";
  return clean;
}

function pickswiseHasNoPicks(html, sport) {
  const label = sportConfig(sport).label;
  const noPicksPattern = new RegExp(`no\\s+(?:${label}|National \\w+(?: \\w+)*)\\s+Picks`, "i");
  return noPicksPattern.test(`${stripHtml(html)} ${readNextFlightPayload(html)}`);
}

function readNextFlightPayload(html) {
  const chunks = [];
  const pattern = /self\.__next_f\.push\(\[1,"((?:\\.|[^"\\])*)"\]\)<\/script>/g;
  let match;

  while ((match = pattern.exec(html)) !== null) {
    try {
      chunks.push(JSON.parse(`"${match[1]}"`));
    } catch {
      // Keep reading; another streamed chunk may still contain pick rows.
    }
  }

  return chunks.join("");
}

/**
 * Try known __NEXT_DATA__ paths for Pickswise pick data.
 * Returns the first non-empty array of game records found, or [].
 */
function probePickswisePaths(data, sport) {
  const path = `/${sport}/picks/`;
  const pp = data?.props?.pageProps;

  // Each candidate is either an array of picks or an object keyed by page path.
  const candidates = [
    pp?.initialState?.sportPredictionsPicks,
    pp?.picks,
    pp?.data?.picks,
    pp?.predictions,
    pp?.pageData?.picks,
    pp?.[sport]?.picks,
    pp?.initialData?.picks,
    pp?.serverState?.picks,
    pp?.dehydratedState?.queries?.[0]?.state?.data?.picks
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;

    // Some page data is keyed by URL path, such as /mlb/picks/.
    if (typeof candidate === "object" && !Array.isArray(candidate)) {
      const records =
        candidate[path] ||
        candidate[path.slice(0, -1)] ||
        Object.entries(candidate).find(([key]) => key.includes(`/${sport}/`))?.[1];
      if (Array.isArray(records) && records.length > 0) return records;
    }

    // Other page data is already an array of games.
    if (Array.isArray(candidate) && candidate.length > 0) return candidate;
  }

  return [];
}

// Action Network source parser.

function parseActionSource(html, config) {
  const data = readNextData(html);
  const profiles = data?.props?.pageProps?.initialExpertsResponse?.response?.profiles || [];
  const picks = [];

  for (const profile of profiles) {
    for (const pick of profile.picks || []) {
      const teams = pick.game?.teams || [];
      const away = normalizeTeamAbbr(teams.find((t) => t.id === pick.game?.away_team_id)?.abbr, config.id);
      const home = normalizeTeamAbbr(teams.find((t) => t.id === pick.game?.home_team_id)?.abbr, config.id);
      picks.push(normalizePick({
        matchup: `${away} @ ${home}`,
        startsAt: pick.starts_at || pick.game?.start_time,
        market: pick.type,
        selection: pick.play,
        odds: formatAmericanOdds(pick.odds),
        expert: profile.name?.trim() || "Action expert",
        analysis: pick.meta?.note || "",
        line: pick.value,
        type: pick.type,
        sport: config.id,
        home, away
      }));
    }
  }

  return picks.filter(Boolean);
}

// The Lines source parser.
//
// The Lines publishes picks as article links on a sport picks page.
// We parse the article titles because they usually contain the matchup,
// market, selection, and odds.
//
// This is fragile by nature. If their article titles change, the health
// warning should make that visible during builds.

function parseTheLinesSource(html, config) {
  const picks = [];

  // First try the normal WordPress title markup.
  const articlePattern = /<(?:h2|h3)[^>]*class="[^"]*(?:entry-title|post-title)[^"]*"[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const fallbackPattern = /<a[^>]+href="(https:\/\/www\.thelines\.com\/picks\/[a-z]+\/[^"]+)"[^>]*class="[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;

  const articles = [];
  let match;

  while ((match = articlePattern.exec(html)) !== null) {
    const href = match[1];
    const title = cleanText(match[2].replace(/<[^>]+>/g, " "));
    if (href && title && isRecentTheLinesArticle(title, href, config.id)) {
      articles.push({ href, title });
    }
  }

  // If title markup changes, scan every link that looks like a pick article.
  if (articles.length === 0) {
    while ((match = fallbackPattern.exec(html)) !== null) {
      const href = match[1];
      const title = cleanText(match[2].replace(/<[^>]+>/g, " "));
      if (href && title) {
        articles.push({ href, title });
      }
    }
  }

  // Extract pick data from article titles on the index page.
  // TheLines titles follow patterns like:
  //   "NYY vs BOS Picks and Predictions: Yankees Moneyline -130"
  //   "NBA Finals Game 4 Picks: Spurs vs Knicks Best Bets"
  // This avoids fetching every article during each build.
  for (const article of articles.slice(0, 10)) {
    const pick = extractTheLinesPickFromTitle(article.title, config.id);
    if (pick) picks.push(pick);
  }

  if (picks.length === 0 && articles.length === 0) {
    // Print a short sample so parser failures are easier to debug.
    const sample = html.slice(0, 2000).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 500);
    console.warn(`[thelines/${config.id}] No articles found. HTML sample: ${sample}`);
  } else {
    console.log(`[thelines/${config.id}] Found ${articles.length} article(s), extracted ${picks.length} pick(s)`);
  }

  return picks;
}

/**
 * Return true when the article looks like a current pick for this sport.
 */
function isRecentTheLinesArticle(title, href, sport) {
  const lower = title.toLowerCase();
  const hrefLower = href.toLowerCase();

  // Prefer the correct sport's picks page.
  if (!hrefLower.includes(`/picks/${sport}/`) && !hrefLower.includes(`/${sport}/picks/`)) {
    // Also accept generic pick URLs when the title names the sport.
    if (!hrefLower.includes("/picks/")) return false;
    const sportKeywords = {
      mlb: ["mlb", "baseball"],
      nba: ["nba", "basketball"],
      nhl: ["nhl", "hockey"]
    };
    if (!sportKeywords[sport]?.some((kw) => lower.includes(kw))) return false;
  }

  // Skip pages that are not daily picks.
  if (/futures|odds|review|promo|bonus|code/i.test(title)) return false;

  return true;
}

/**
 * Extract a normalized pick from a The Lines article title.
 *
 * Supported title patterns:
 *   "TOR vs BOS Pick: Over 6.5 (-115) | MLB Best Bet"
 *   "Spurs vs Knicks Game 4 Predictions: SA -3.5 Best Bet"
 *   "CAR vs VGK Picks and Predictions: Pavel Dorofeyev Anytime Goal"
 *   "MLB Best Bets Today: Under 8 Brewers vs Athletics"
 */
function extractTheLinesPickFromTitle(title, sport) {
  // First look for team abbreviations.
  const abbrPairPattern = /\b([A-Z]{2,4})\s+(?:vs?\.?|@)\s+([A-Z]{2,4})\b/;
  const abbrMatch = title.match(abbrPairPattern);

  let away = "", home = "";
  if (abbrMatch) {
    away = normalizeTeamAbbr(abbrMatch[1], sport);
    home = normalizeTeamAbbr(abbrMatch[2], sport);
  } else {
    // If abbreviations are missing, try full team names.
    const namePairPattern = /\b(\w[\w\s]+?)\s+(?:vs?\.?|@)\s+(\w[\w\s]+?)\b(?:\s+(?:Picks?|Predictions?|Best Bet))/i;
    const nameMatch = title.match(namePairPattern);
    if (nameMatch) {
      away = teamFromName(nameMatch[1]) || nameMatch[1].trim().toUpperCase().slice(0, 3);
      home = teamFromName(nameMatch[2]) || nameMatch[2].trim().toUpperCase().slice(0, 3);
    }
  }

  if (!away || !home) return null;
  const matchup = `${away} @ ${home}`;

  // The pick usually appears after the first colon.
  const colonIdx = title.indexOf(":");
  const pickText = colonIdx >= 0 ? title.slice(colonIdx + 1).trim() : title;

  // Infer the market from the pick text.
  const market = normalizeMarket("", pickText, "");

  // Build the shared pick shape used by consensus.
  const normalized = normalizePick({
    matchup,
    startsAt: "",
    market,
    selection: pickText.replace(/\s*\|.*$/, "").trim(),
    odds: extractOddsFromText(pickText),
    expert: "The Lines",
    analysis: title,
    made: "",
    sport
  });

  return normalized;
}

/** Pull an American odds value from text, such as "(-115)" or "+130". */
function extractOddsFromText(text) {
  const match = text.match(/\(([+-]\d+)\)|([+-]\d{3,4})\b/);
  return match ? (match[1] || match[2]) : "";
}

// Shared normalization helpers.

export function normalizePick(raw) {
  const sport = raw.sport || "";
  const matchup = normalizeMatchup(raw.matchup, raw.away, raw.home, sport);
  const [away, home] = matchup.split(" @ ");
  const market = normalizeMarket(raw.market, raw.selection, raw.type);
  const normalized = normalizeSelection({ ...raw, market, away, home });

  if (!away || !home || !market || !normalized) return null;

  return {
    matchup,
    startsAt: raw.startsAt || "",
    market,
    selection: normalized.label,
    odds: normalizeOdds(raw.odds),
    expert: raw.expert || "",
    analysis: raw.analysis || "",
    made: raw.made || "",
    key: `${matchup}|${market}|${normalized.key}`
  };
}

function normalizeMarket(market = "", selection = "", type = "") {
  const value = `${market} ${selection} ${type}`.toLowerCase();
  if (value.includes("parlay")) return "Parlay";
  if (value.includes("money") || value.includes("ml_")) return "Moneyline";
  if (value.includes("run line")) return "Run Line";
  if (value.includes("spread") || value.includes("puck line")) return "Spread";
  if (value.includes("prop") || value.includes("custom") ||
      /total (?:points|rebounds|assists|threes|steals|blocks|turnovers|bases|hits|strikeouts|saves)|points scored/i.test(value) ||
      /to hit|hits|rbi|home runs|earned runs|strikeouts|ks|points|rebounds|assists|goals|shots|saves|anytime goal/i.test(value)) {
    return "Prop";
  }
  if (value.includes("total") || value.includes("over") || value.includes("under")) return "Total";
  return cleanText(market) || "Other";
}

function normalizeSelection(raw) {
  const selection = cleanText(raw.selection);

  if (raw.market === "Moneyline") {
    const side = sideFromSelection(selection, raw.type, raw.away, raw.home, raw.sport);
    if (!side) return null;
    return { key: side, label: `${side} Moneyline` };
  }

  if (raw.market === "Run Line" || raw.market === "Spread") {
    const side = sideFromSelection(selection, raw.type, raw.away, raw.home, raw.sport);
    const line = signedLine(selection.match(/([+-]\d+(?:\.\d+)?)/)?.[1] || raw.line);
    if (!side || !line) return null;
    return { key: `${side} ${line}`, label: `${side} ${line}` };
  }

  if (raw.market === "Total") {
    const direction = selection.match(/\bunder\b|^u/i) ? "Under" : selection.match(/\bover\b|^o/i) ? "Over" : "";
    const line = lineNumber(selection.match(/(?:over|under|[ou])\s*(\d+(?:\.\d+)?)/i)?.[1] || raw.line);
    if (!direction || !line) return null;
    return { key: `${direction} ${line}`, label: `${direction} ${line}` };
  }

  if (raw.market === "Prop") {
    const label = stripTrailingOdds(selection);
    return { key: label.toLowerCase(), label };
  }

  const label = cleanSelectionLabel(stripTrailingOdds(selection));
  return { key: label.toLowerCase(), label };
}

function sideFromSelection(selection, type = "", away, home, sport = "") {
  const typeValue = `${type}`.toLowerCase();
  if (typeValue.includes("home")) return home;
  if (typeValue.includes("away")) return away;
  const explicit = selection.match(/\b([A-Z]{2,4})\b/)?.[1];
  const normalized = normalizeTeamAbbr(explicit, sport);
  if ([away, home].includes(normalized)) return normalized;
  return teamFromName(selection);
}

function normalizeMatchup(matchup = "", away, home, sport = "") {
  if (away && home) {
    return `${normalizeTeamAbbr(away, sport)} @ ${normalizeTeamAbbr(home, sport)}`;
  }
  const match = matchup.match(/([A-Z]{2,4})\s+@\s+([A-Z]{2,4})/);
  if (!match) return "";
  return `${normalizeTeamAbbr(match[1], sport)} @ ${normalizeTeamAbbr(match[2], sport)}`;
}

function normalizeTeamAbbr(value = "", sport = "") {
  const upper = `${value}`.toUpperCase().replace(/[^A-Z]/g, "");
  const base = teamAliases[upper] || upper;
  return (sport && sportTeamAliases[sport]?.[base]) || base;
}

function teamFromName(value = "") {
  const lower = value.toLowerCase();
  const found = teamNameAliases.find(([name]) => lower.includes(name));
  return found ? found[1] : "";
}

function cleanText(value = "") {
  return decodeEntities(`${value}`).replace(/\s+/g, " ").trim();
}

function stripTrailingOdds(value = "") {
  return value
    .replace(/\s*\([+-]\d+\)\s*$/, "")
    .replace(/\s*[+-]\d+\s*$/, "")
    .trim();
}

function cleanSelectionLabel(value = "") {
  return [
    "Points Scored",
    "Total Rebounds",
    "Total Assists",
    "Total Points",
    "Total Threes",
    "Total Steals",
    "Total Blocks"
  ].reduce((text, phrase) => {
    const repeated = new RegExp(`\\b${phrase}\\s+${phrase}\\b`, "gi");
    return text.replace(repeated, phrase);
  }, value);
}

function stripHtml(value = "") {
  return cleanText(value.replace(/<[^>]+>/g, " "));
}

function normalizeOdds(value) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number") return formatAmericanOdds(value);
  return cleanText(value);
}

function formatAmericanOdds(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  return number > 0 ? `+${number}` : `${number}`;
}

function lineNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${number}` : "";
}

function signedLine(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  return number > 0 ? `+${number}` : `${number}`;
}

function readNextData(html) {
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) return null;
  try {
    return JSON.parse(decodeEntities(match[1]));
  } catch {
    return null;
  }
}
