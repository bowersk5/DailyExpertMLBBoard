import { decodeEntities } from "./utils.js";

const gameLinePattern = /^([A-Z]{2,4})\s+@\s+([A-Z]{2,4})\s+(.+)$/;
const marketNames = new Set([
  "Moneyline",
  "Spread",
  "Total",
  "Game Prop",
  "Total Home Runs",
  "Total Hits",
  "Total Bases",
  "Total Strikeouts",
  "Outs Recorded",
  "Earned Runs Allowed",
  "Hits Allowed",
  "Pitcher Strikeouts",
  "Runs Batted In",
  "Stolen Bases",
  "Total Points",
  "Points Scored",
  "Total Rebounds",
  "Total Assists",
  "Total Threes",
  "Total Steals",
  "Total Blocks",
  "Points",
  "Rebounds",
  "Assists",
  "Shots on Goal"
]);

export function parseCoversMlbPicks(html, sourceUrl = "https://www.covers.com/picks/mlb") {
  return parseCoversPicks(html, { sport: "mlb", sourceUrl });
}

export function parseCoversPicks(html, { sport = "mlb", sourceUrl = `https://www.covers.com/picks/${sport}` } = {}) {
  const sportLabel = sport.toUpperCase();
  const title = readTitle(html);
  const cardGames = parseCardMarkup(html, sport);
  const expandedGames = parseExpandedMarkup(html);

  if (cardGames.length) {
    const games = mergeExpandedGames(cardGames, expandedGames);
    const picks = flattenPicks(games);
    return buildPayload({ title, html, sourceUrl, games, picks, sportLabel });
  }

  if (expandedGames.length) {
    const picks = flattenPicks(expandedGames);
    return buildPayload({ title, html, sourceUrl, games: expandedGames, picks, sportLabel });
  }

  const text = htmlToLines(html);
  const introIndex = text.findIndex((line) => line.startsWith(`Get free expert and computer ${sportLabel} picks`));
  const start = introIndex >= 0 ? Math.max(0, introIndex - 1) : Math.max(0, text.findIndex((line) => line === `${sportLabel} Picks`));
  const end = text.findIndex((line, index) => index > start && line.includes("What are Covers"));
  const lines = text.slice(start, end > start ? end : undefined);
  const games = [];
  let currentGame = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = cleanLine(lines[index]);
    const gameMatch = line.match(gameLinePattern);

    if (gameMatch) {
      currentGame = {
        away: gameMatch[1],
        home: gameMatch[2],
        matchup: `${gameMatch[1]} @ ${gameMatch[2]}`,
        startsAt: gameMatch[3],
        expertPicks: 0,
        computerPicks: 0,
        picks: []
      };
      games.push(currentGame);
      const counts = cleanLine(lines[index + 1] || "");
      const expert = counts.match(/(\d+)\s+Expert Picks?/i);
      const computer = counts.match(/(\d+)\s+Computer Picks?/i);
      currentGame.expertPicks = expert ? Number(expert[1]) : 0;
      currentGame.computerPicks = computer ? Number(computer[1]) : 0;
      continue;
    }

    if (!currentGame || !marketNames.has(line)) {
      continue;
    }

    const parsedPick = readPick(lines, index, currentGame);
    if (parsedPick.pick) {
      currentGame.picks.push(parsedPick.pick);
      index = parsedPick.nextIndex;
    }
  }

  const picks = games.flatMap((game) => game.picks.map((pick) => ({
    ...pick,
    matchup: game.matchup,
    startsAt: game.startsAt,
    away: game.away,
    home: game.home
  })));

  return buildPayload({ title, html, sourceUrl, games, picks, sportLabel });
}

function buildPayload({ title, html, sourceUrl, games, picks, sportLabel }) {
  const text = htmlToLines(html);
  const intro = text.find((line) => line.startsWith(`Get free expert and computer ${sportLabel} picks`)) || "";
  const expertGames = games
    .map((game) => ({
      ...game,
      picks: game.picks.filter(isTodayExpertPick)
    }))
    .filter((game) => game.picks.length > 0);
  const expertPicks = picks.filter(isTodayExpertPick);
  const listedExpertPicks = sumListedPicks(expertGames, "expertPicks", expertPicks.length);
  const listedComputerPicks = sumListedPicks(expertGames, "computerPicks", 0);

  return {
    title,
    intro: intro
      .replace("expert and computer ", "expert ")
      .replace(" and predictive models", ""),
    sourceUrl,
    generatedAt: new Date().toISOString(),
    games: expertGames,
    picks: expertPicks,
    bestPicks: rankPicks(expertPicks).slice(0, 8),
    counts: {
      games: expertGames.length,
      picks: listedExpertPicks,
      expertPicks: listedExpertPicks,
      parsedPicks: expertPicks.length,
      computerPicks: listedComputerPicks
    }
  };
}

function sumListedPicks(games, key, fallback) {
  const total = games.reduce((sum, game) => sum + (Number(game[key]) || 0), 0);
  return total || fallback;
}

/** Keep only picks from a human expert published today (not days ago). */
function isTodayExpertPick(pick) {
  return Boolean(pick.analyst) &&
    pick.source === "Covers" &&
    !/\d+\s+days?\s+ago/i.test(pick.made || "");
}

function parseCardMarkup(html, sport) {
  const cards = html.match(/<div id="\d+" class="picks-card[\s\S]*?(?=<div id="\d+" class="picks-card|<h2|$)/g) || [];

  return cards.map((card) => parseGameCard(card, sport)).filter(Boolean);
}

function parseGameCard(cardHtml, sport) {
  const headerHtml = cardHtml.match(/<div class="picks-card-header[\s\S]*?<\/div>\s*<\/div>/i)?.[0] || cardHtml.slice(0, 5000);
  const headerLines = htmlToLines(headerHtml);
  const logoTeams = [...headerHtml.matchAll(new RegExp(`/${sport}/([a-z0-9]{2,4})\\.svg`, "gi"))].map((match) => match[1].toUpperCase());
  const teams = logoTeams.length >= 2 ? logoTeams.slice(0, 2) : headerLines.filter((line) => /^[A-Z]{2,4}$/.test(line)).slice(0, 2);
  const startsAt = headerLines.find((line) => line.includes("•") && line.includes("ET")) || "";
  const counts = htmlToLines(cardHtml.match(/pick-cards-counter-badge[\s\S]*?<\/div>/i)?.[0] || "").join(" ");
  const expert = counts.match(/(\d+)\s+Expert Picks?/i);
  const computer = counts.match(/(\d+)\s+Computer Picks?/i);
  const matchupUrl = decodeEntities(cardHtml.match(/href="([^"]+\/matchup\/\d+\/picks)"/i)?.[1] || "");

  if (teams.length < 2) {
    return null;
  }

  const game = {
    away: teams[0],
    home: teams[1],
    matchup: `${teams[0]} @ ${teams[1]}`,
    startsAt,
    expertPicks: expert ? Number(expert[1]) : 0,
    computerPicks: computer ? Number(computer[1]) : 0,
    matchupUrl,
    picks: []
  };

  game.picks = parsePickCards(cardHtml, game);
  return game;
}

function parseExpandedMarkup(html) {
  const sections = [...html.matchAll(/<!-- COVERS_EXPANDED_START ([^ ]+) -->([\s\S]*?)<!-- COVERS_EXPANDED_END -->/g)];

  return sections.map((section) => {
    const game = readExpandedGame(section[1]);
    if (!game) return null;
    return {
      ...game,
      picks: parsePickCards(section[2], game)
    };
  }).filter(Boolean);
}

function readExpandedGame(encoded) {
  try {
    const game = JSON.parse(decodeURIComponent(encoded));
    if (!game.away || !game.home) return null;
    return {
      away: game.away,
      home: game.home,
      matchup: game.matchup || `${game.away} @ ${game.home}`,
      startsAt: game.startsAt || "",
      expertPicks: Number(game.expertPicks) || 0,
      computerPicks: Number(game.computerPicks) || 0,
      matchupUrl: game.matchupUrl || ""
    };
  } catch {
    return null;
  }
}

function mergeExpandedGames(cardGames, expandedGames) {
  if (!expandedGames.length) return cardGames;

  return cardGames.map((game) => {
    const expanded = expandedGames.find((candidate) => candidate.matchup === game.matchup);
    if (!expanded || expanded.picks.length <= game.picks.length) return game;
    return {
      ...game,
      picks: dedupePicks(expanded.picks)
    };
  });
}

function dedupePicks(picks) {
  const seen = new Set();
  return picks.filter((pick) => {
    const key = `${pick.market}|${pick.selection}|${pick.analyst}|${pick.made}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parsePickCards(cardHtml, game) {
  const pickBlocks = cardHtml.match(/<div id="[a-f0-9-]+" data-pick[\s\S]*?(?=<div id="[a-f0-9-]+" data-pick|<div class="text-center"|$)/gi) || [];

  return pickBlocks
    .filter((block) => block.includes("pick-cards-expert-component") || block.includes("Betting Analyst"))
    .map((block) => parsePickCard(block, game))
    .filter(Boolean);
}

function parsePickCard(block, game) {
  const market = decodeEntities(block.match(/data-pick-types="([^"]+)"/i)?.[1] || "").trim();
  const lines = htmlToLines(block);
  const bestOddsIndex = lines.findIndex((line) => line === "Best Odds");
  const madeLine = lines.find((line) => line.startsWith("Pick made:")) || "";
  const ratingLine = lines.find((line) => line.startsWith("Star rating:"));
  const projectionLine = lines.find((line) => line.startsWith("Projection "));
  const teams = new Set([game.away, game.home]);
  const firstOddsIndex = bestOddsIndex >= 0 ? bestOddsIndex : lines.findIndex((line) => line.startsWith("Pick made:"));
  const selectionLines = lines.slice(0, firstOddsIndex).filter((line) => {
    return line !== market && !teams.has(line) && line !== "Bet now" && !line.startsWith("Projection ");
  });
  const odds = bestOddsIndex >= 0 ? lines[bestOddsIndex + 1] || "" : "";
  const analyst = readAuthor(block, lines);
  const analysis = readCardAnalysis(block);
  const selection = selectionLines.join(" ").trim();

  if (!market || (!selection && !analysis)) {
    return null;
  }

  return {
    id: slug(`${game.matchup}-${market}-${selection}-${madeLine}`),
    market,
    selection: selection || "Pick details unavailable",
    odds,
    made: madeLine.replace("Pick made:", "").trim(),
    analyst,
    rating: ratingLine ? Number(ratingLine.match(/(\d+)/)?.[1] || 0) : 0,
    projection: projectionLine ? projectionLine.replace("Projection ", "") : "",
    analysis,
    source: "Covers"
  };
}

function readAuthor(block, lines) {
  const profile = block.match(/profile-card[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>[\s\S]*?Betting Analyst/i);
  if (profile) {
    return cleanLine(profile[1].replace(/<[^>]+>/g, " "));
  }

  return "";
}

function readCardAnalysis(block) {
  const analysisBlock = block.match(/compare-odds-analysis[\s\S]*?<p>([\s\S]*?)<\/p>/i);
  return analysisBlock ? cleanLine(analysisBlock[1].replace(/<[^>]+>/g, " ")) : "";
}

function flattenPicks(games) {
  return games.flatMap((game) => game.picks.map((pick) => ({
    ...pick,
    matchup: game.matchup,
    startsAt: game.startsAt,
    away: game.away,
    home: game.home
  })));
}

function readPick(lines, startIndex, game) {
  const market = cleanLine(lines[startIndex]);
  const limit = findNextBoundary(lines, startIndex + 1);
  const block = lines.slice(startIndex + 1, limit).map(cleanLine).filter(Boolean);
  const bestOddsIndex = block.findIndex((line) => line === "Best Odds");
  const pickMadeIndex = block.findIndex((line) => line.startsWith("Pick made:"));
  const ratingLine = block.find((line) => line.startsWith("Star rating:"));
  const analysisHeading = block.findIndex((line) => line === "Analysis" || line === "Model Analysis");

  let selection = "";
  if (bestOddsIndex > 0) {
    selection = block.slice(0, bestOddsIndex).filter(notNoise).join(" ").trim();
  } else if (pickMadeIndex > 0) {
    selection = block.slice(0, pickMadeIndex).filter(notNoise).join(" ").trim();
  }

  const odds = bestOddsIndex >= 0 ? block[bestOddsIndex + 1] || "" : "";
  const made = pickMadeIndex >= 0 ? block[pickMadeIndex].replace("Pick made:", "").trim() : "";
  const analyst = readAnalyst(block, pickMadeIndex);
  const rating = ratingLine ? Number(ratingLine.match(/(\d+)/)?.[1] || 0) : 0;
  const projectionLine = block.find((line) => line.startsWith("Projection "));
  const analysis = readAnalysis(block, analysisHeading);

  if (!selection && !analysis) {
    return { pick: null, nextIndex: startIndex };
  }

  return {
    pick: {
      id: slug(`${game.matchup}-${market}-${selection}-${made}`),
      market,
      selection: selection || "Pick details unavailable",
      odds,
      made,
      analyst,
      rating,
      projection: projectionLine ? projectionLine.replace("Projection ", "") : "",
      analysis,
      source: "Covers"
    },
    nextIndex: Math.max(startIndex, limit - 1)
  };
}

function findNextBoundary(lines, fromIndex) {
  for (let index = fromIndex; index < lines.length; index += 1) {
    const line = cleanLine(lines[index]);
    if (line.match(gameLinePattern) || line.match(/^View \d+ Picks?$/) || marketNames.has(line)) {
      return index;
    }
  }
  return lines.length;
}

function readAnalyst(block, pickMadeIndex) {
  if (pickMadeIndex < 0) {
    return "";
  }

  for (let index = pickMadeIndex + 1; index < Math.min(block.length, pickMadeIndex + 5); index += 1) {
    const line = block[index];
    if (line && !line.includes("EV Model Rating") && !line.includes("Star rating") && line !== "Betting Analyst") {
      return line;
    }
  }

  return "";
}

function readAnalysis(block, analysisHeading) {
  if (analysisHeading < 0) {
    return "";
  }

  const chunks = [];
  for (let index = analysisHeading + 1; index < block.length; index += 1) {
    const line = block[index];
    if (!line || isOddsRow(line) || line === "Read Full Analysis" || line === "Bet now") {
      continue;
    }
    if (line.startsWith("+") || line.includes(" at DraftKings")) {
      continue;
    }
    chunks.push(line);
  }

  return chunks.join(" ").replace(/\s+/g, " ").trim();
}

function rankPicks(picks) {
  return [...picks].sort((a, b) => scorePick(b) - scorePick(a));
}

function scorePick(pick) {
  const ratingBoost = (pick.rating || 0) * 100;
  const made = pick.made || "";
  const madeBoost =
    /\d+\s+minutes?\s+ago/i.test(made) ? 20 :
    /^1\s+hours?\s+ago/i.test(made) ? 15 :
    /^[2-3]\s+hours?\s+ago/i.test(made) ? 10 :
    /\d+\s+hours?\s+ago/i.test(made) ? 5 :
    0;
  const oddsBoost = (pick.odds || "").includes("+") ? 6 : 0;
  const expertBoost = pick.analyst ? 8 : 0;
  return ratingBoost + madeBoost + oddsBoost + expertBoost;
}

function htmlToLines(html) {
  return html
    .replace(/\sonerror="[^"]*"/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|div|section|article|h1|h2|h3|h4|li|ul|ol|tr|td|th|span|a|button)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .split("\n")
    .map(cleanLine)
    .filter(Boolean);
}

function cleanLine(line) {
  return decodeEntities(line || "")
    .replace(/\s+/g, " ")
    .trim();
}

function isOddsRow(line) {
  return /^(o|u)?\d+(\.\d+)?\s[+-]\d+$/i.test(line) || /^[+-]\d+$/.test(line) || line === "-";
}

function notNoise(line) {
  return line !== "Bet now" && !line.startsWith("Projection ") && !line.startsWith("Star rating:");
}

function readTitle(html) {
  return decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "Covers Picks");
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}
