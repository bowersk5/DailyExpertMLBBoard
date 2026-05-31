import { parseCoversMlbPicks } from "./coversParser.js";
import { decodeEntities, fetchHtml } from "./utils.js";

const sources = [
  {
    id: "covers",
    name: "Covers",
    url: "https://www.covers.com/picks/mlb",
    parser: parseCoversSource
  },
  {
    id: "pickswise",
    name: "Pickswise",
    url: "https://www.pickswise.com/mlb/picks/",
    parser: parsePickswiseSource
  },
  {
    id: "action",
    name: "Action Network",
    url: "https://www.actionnetwork.com/mlb/picks/",
    parser: parseActionSource
  }
];

const teamAliases = {
  ARZ: "ARI",
  AZ: "ARI",
  CWS: "CHW",
  CHI: "CHC",
  LA: "LAD",
  MI: "MIA",
  SFG: "SF",
  WSH: "WAS"
};

const teamNameAliases = [
  ["white sox", "CHW"],
  ["tigers", "DET"],
  ["royals", "KC"],
  ["rangers", "TEX"],
  ["twins", "MIN"],
  ["pirates", "PIT"],
  ["padres", "SD"],
  ["nationals", "WAS"],
  ["blue jays", "TOR"],
  ["orioles", "BAL"],
  ["angels", "LAA"],
  ["rays", "TB"],
  ["cubs", "CHC"],
  ["cardinals", "STL"],
  ["giants", "SF"],
  ["guardians", "CLE"],
  ["reds", "CIN"],
  ["diamondbacks", "ARI"],
  ["yankees", "NYY"],
  ["athletics", "ATH"],
  ["phillies", "PHI"],
  ["dodgers", "LAD"],
  ["brewers", "MIL"],
  ["rockies", "COL"],
  ["braves", "ATL"],
  ["red sox", "BOS"],
  ["mariners", "SEA"],
  ["mets", "NYM"],
  ["marlins", "MIA"],
  ["astros", "HOU"]
];

/**
 * Fetch picks from all sources and build consensus groups.
 *
 * @param {object} [options]
 * @param {string} [options.coversHtml] - Pre-fetched Covers HTML. When provided,
 *   the Covers page is not fetched again, avoiding a duplicate HTTP request when
 *   the caller (e.g. generateStaticData.js) has already fetched it.
 */
export async function fetchMlbConsensus({ coversHtml } = {}) {
  const settled = await Promise.allSettled(
    sources.map((source) =>
      source.id === "covers" && coversHtml
        ? fetchSourceFromHtml(source, coversHtml)
        : fetchSource(source)
    )
  );

  const sourceResults = settled.map((result, index) => {
    if (result.status === "fulfilled") {
      return result.value;
    }

    return {
      id: sources[index].id,
      name: sources[index].name,
      url: sources[index].url,
      error: result.reason.message,
      picks: []
    };
  });

  const allPicks = sourceResults.flatMap((source) => source.picks);
  const consensus = buildConsensus(allPicks);

  return {
    generatedAt: new Date().toISOString(),
    sources: sourceResults.map(({ id, name, url, picks, error }) => ({
      id,
      name,
      url,
      error: error || null,
      picks: picks.length
    })),
    picks: allPicks,
    consensus,
    counts: {
      sources: sourceResults.length,
      activeSources: sourceResults.filter((source) => !source.error && source.picks.length > 0).length,
      picks: allPicks.length,
      consensus: consensus.length
    }
  };
}

export function buildConsensus(picks) {
  const grouped = new Map();

  for (const pick of picks) {
    if (!pick.key) {
      continue;
    }

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
      examples: []
    };
    const sourceKey = `${pick.source}:${pick.expert || pick.source}`;

    if (!existing.sources.some((source) => source.id === pick.sourceId)) {
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
    existing.examples.push({
      source: pick.source,
      expert: pick.expert,
      odds: pick.odds,
      analysis: pick.analysis
    });
    grouped.set(pick.key, existing);
  }

  return [...grouped.values()]
    .map((pick) => ({
      ...pick,
      agreement: `${pick.sourceCount}/${sources.length}`,
      confidence: pick.sourceCount * 100 + pick.pickCount
    }))
    .sort((a, b) => b.confidence - a.confidence || b.pickCount - a.pickCount || a.selection.localeCompare(b.selection));
}

async function fetchSource(source) {
  const html = await fetchHtml(source.url);
  return fetchSourceFromHtml(source, html);
}

/** Build a source result from already-fetched HTML (no network call). */
function fetchSourceFromHtml(source, html) {
  const picks = source.parser(html).map((pick) => ({
    ...pick,
    sourceId: source.id,
    source: source.name,
    url: source.url
  }));

  return {
    id: source.id,
    name: source.name,
    url: source.url,
    picks
  };
}

function parseCoversSource(html) {
  const data = parseCoversMlbPicks(html);
  return data.picks.map((pick) => normalizePick({
    matchup: pick.matchup,
    startsAt: pick.startsAt,
    market: pick.market,
    selection: pick.selection,
    odds: pick.odds,
    expert: pick.analyst,
    analysis: pick.analysis
  })).filter(Boolean);
}

function parsePickswiseSource(html) {
  const data = readNextData(html);
  const records = data?.props?.pageProps?.initialState?.sportPredictionsPicks?.["/mlb/picks/"] || [];
  const picks = [];

  for (const game of records) {
    const away = normalizeTeamAbbr(game.awayTeam?.abbreviation);
    const home = normalizeTeamAbbr(game.homeTeam?.abbreviation);

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
        home,
        away
      }));
    }
  }

  return picks.filter(Boolean);
}

function parseActionSource(html) {
  const data = readNextData(html);
  const profiles = data?.props?.pageProps?.initialExpertsResponse?.response?.profiles || [];
  const picks = [];

  for (const profile of profiles) {
    for (const pick of profile.picks || []) {
      const teams = pick.game?.teams || [];
      const away = normalizeTeamAbbr(teams.find((team) => team.id === pick.game?.away_team_id)?.abbr);
      const home = normalizeTeamAbbr(teams.find((team) => team.id === pick.game?.home_team_id)?.abbr);

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
        home,
        away
      }));
    }
  }

  return picks.filter(Boolean);
}

function normalizePick(raw) {
  const matchup = normalizeMatchup(raw.matchup, raw.away, raw.home);
  const [away, home] = matchup.split(" @ ");
  const market = normalizeMarket(raw.market, raw.selection, raw.type);
  const normalized = normalizeSelection({ ...raw, market, away, home });

  if (!away || !home || !market || !normalized) {
    return null;
  }

  return {
    matchup,
    startsAt: raw.startsAt || "",
    market,
    selection: normalized.label,
    odds: normalizeOdds(raw.odds),
    expert: raw.expert || "",
    analysis: raw.analysis || "",
    key: `${matchup}|${market}|${normalized.key}`
  };
}

function normalizeMarket(market = "", selection = "", type = "") {
  const value = `${market} ${selection} ${type}`.toLowerCase();

  if (value.includes("money") || value.includes("ml_")) {
    return "Moneyline";
  }
  if (value.includes("spread") || value.includes("run line")) {
    return "Run Line";
  }
  if (value.includes("total") || value.includes("over") || value.includes("under")) {
    return "Total";
  }
  if (value.includes("prop") || value.includes("custom") || /to hit|hits|rbi|home runs|earned runs|strikeouts|ks/i.test(value)) {
    return "Prop";
  }

  return cleanText(market) || "Other";
}

function normalizeSelection(raw) {
  const selection = cleanText(raw.selection);

  if (raw.market === "Moneyline") {
    const side = sideFromSelection(selection, raw.type, raw.away, raw.home);
    if (!side) {
      return null;
    }
    return { key: side, label: `${side} Moneyline` };
  }

  if (raw.market === "Run Line") {
    const side = sideFromSelection(selection, raw.type, raw.away, raw.home);
    const line = signedLine(selection.match(/([+-]\d+(?:\.\d+)?)/)?.[1] || raw.line);
    if (!side || !line) {
      return null;
    }
    return { key: `${side} ${line}`, label: `${side} ${line}` };
  }

  if (raw.market === "Total") {
    const direction = selection.match(/\bunder\b|^u/i) ? "Under" : selection.match(/\bover\b|^o/i) ? "Over" : "";
    const line = lineNumber(selection.match(/(?:over|under|[ou])\s*(\d+(?:\.\d+)?)/i)?.[1] || raw.line);
    if (!direction || !line) {
      return null;
    }
    return { key: `${direction} ${line}`, label: `${direction} ${line}` };
  }

  if (raw.market === "Prop") {
    const label = selection.replace(/\s*[+-]\d+$/, "");
    return { key: label.toLowerCase(), label };
  }

  return { key: selection.toLowerCase(), label: selection };
}

function sideFromSelection(selection, type = "", away, home) {
  const typeValue = `${type}`.toLowerCase();

  if (typeValue.includes("home")) {
    return home;
  }
  if (typeValue.includes("away")) {
    return away;
  }

  const explicit = selection.match(/\b([A-Z]{2,4})\b/)?.[1];
  const normalized = normalizeTeamAbbr(explicit);
  if ([away, home].includes(normalized)) {
    return normalized;
  }

  return teamFromName(selection);
}

function normalizeMatchup(matchup = "", away, home) {
  if (away && home) {
    return `${normalizeTeamAbbr(away)} @ ${normalizeTeamAbbr(home)}`;
  }

  const match = matchup.match(/([A-Z]{2,4})\s+@\s+([A-Z]{2,4})/);
  if (!match) {
    return "";
  }

  return `${normalizeTeamAbbr(match[1])} @ ${normalizeTeamAbbr(match[2])}`;
}

function normalizeTeamAbbr(value = "") {
  const upper = `${value}`.toUpperCase().replace(/[^A-Z]/g, "");
  return teamAliases[upper] || upper;
}

function teamFromName(value = "") {
  const lower = value.toLowerCase();
  const found = teamNameAliases.find(([name]) => lower.includes(name));
  return found ? found[1] : "";
}

function cleanText(value = "") {
  return decodeEntities(`${value}`).replace(/\s+/g, " ").trim();
}

function stripHtml(value = "") {
  return cleanText(value.replace(/<[^>]+>/g, " "));
}

function normalizeOdds(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  if (typeof value === "number") {
    return formatAmericanOdds(value);
  }

  return cleanText(value);
}

function formatAmericanOdds(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "";
  }
  return number > 0 ? `+${number}` : `${number}`;
}

function lineNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${number}` : "";
}

function signedLine(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "";
  }
  return number > 0 ? `+${number}` : `${number}`;
}

function readNextData(html) {
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  return match ? JSON.parse(decodeEntities(match[1])) : null;
}
