const state = {
  picks: [],
  bestPicks: [],
  consensus: [],
  markets: new Set(),
  view: "best",
  query: "",
  market: ""
};

const teamAliases = {
  ARI: ["ARI", "ARZ", "AZ", "Arizona", "Arizona Diamondbacks", "Diamondbacks", "D-backs", "Dbacks"],
  ATH: ["ATH", "OAK", "Oakland", "Oakland Athletics", "Athletics", "A's", "As"],
  ATL: ["ATL", "Atlanta", "Atlanta Braves", "Braves"],
  BAL: ["BAL", "Baltimore", "Baltimore Orioles", "Orioles"],
  BOS: ["BOS", "Boston", "Boston Red Sox", "Red Sox"],
  CHC: ["CHC", "CHN", "Chicago Cubs", "Cubs"],
  CHW: ["CHW", "CWS", "CHA", "Chicago White Sox", "White Sox"],
  CIN: ["CIN", "Cincinnati", "Cincinnati Reds", "Reds"],
  CLE: ["CLE", "Cleveland", "Cleveland Guardians", "Guardians"],
  COL: ["COL", "Colorado", "Colorado Rockies", "Rockies"],
  DET: ["DET", "Detroit", "Detroit Tigers", "Tigers"],
  HOU: ["HOU", "Houston", "Houston Astros", "Astros"],
  KC: ["KC", "KCR", "Kansas City", "Kansas City Royals", "Royals"],
  LAA: ["LAA", "ANA", "Los Angeles Angels", "LA Angels", "Angels"],
  LAD: ["LAD", "LA", "LAN", "Los Angeles Dodgers", "LA Dodgers", "Dodgers"],
  MIA: ["MIA", "MI", "FLA", "Miami", "Miami Marlins", "Marlins"],
  MIL: ["MIL", "Milwaukee", "Milwaukee Brewers", "Brewers"],
  MIN: ["MIN", "Minnesota", "Minnesota Twins", "Twins"],
  NYM: ["NYM", "NY Mets", "New York Mets", "Mets"],
  NYY: ["NYY", "NY Yankees", "New York Yankees", "Yankees"],
  PHI: ["PHI", "Philadelphia", "Philadelphia Phillies", "Phillies"],
  PIT: ["PIT", "Pittsburgh", "Pittsburgh Pirates", "Pirates"],
  SD: ["SD", "SDP", "San Diego", "San Diego Padres", "Padres"],
  SEA: ["SEA", "Seattle", "Seattle Mariners", "Mariners"],
  SF: ["SF", "SFG", "San Francisco", "San Francisco Giants", "Giants"],
  STL: ["STL", "SLN", "St. Louis", "Saint Louis", "St Louis Cardinals", "St. Louis Cardinals", "Cardinals"],
  TB: ["TB", "TBR", "Tampa Bay", "Tampa Bay Rays", "Rays"],
  TEX: ["TEX", "Texas", "Texas Rangers", "Rangers"],
  TOR: ["TOR", "Toronto", "Toronto Blue Jays", "Blue Jays"],
  WAS: ["WAS", "WSH", "WSN", "Washington", "Washington Nationals", "Nationals"]
};

const abbreviationAliases = Object.fromEntries(
  Object.entries(teamAliases).flatMap(([canonical, aliases]) =>
    aliases
      .filter((alias) => /^[A-Z]{2,4}$/.test(alias))
      .map((alias) => [alias, canonical])
  )
);

const els = {
  refreshButton: document.querySelector("#refreshButton"),
  fetchedAt: document.querySelector("#fetchedAt"),
  gameCount: document.querySelector("#gameCount"),
  pickCount: document.querySelector("#pickCount"),
  searchInput: document.querySelector("#searchInput"),
  marketSelect: document.querySelector("#marketSelect"),
  viewSelect: document.querySelector("#viewSelect"),
  listTitle: document.querySelector("#listTitle"),
  intro: document.querySelector("#intro"),
  pickList: document.querySelector("#pickList"),
  consensusIntro: document.querySelector("#consensusIntro"),
  consensusList: document.querySelector("#consensusList"),
  template: document.querySelector("#pickTemplate"),
  consensusTemplate: document.querySelector("#consensusTemplate")
};

async function loadPicks(refresh = false) {
  setLoading(true);
  try {
    const [picksResponse, consensusResponse] = await Promise.all([
      fetch(picksUrl(refresh)),
      fetch(consensusUrl(refresh))
    ]);

    const data = await picksResponse.json();
    const consensusData = await consensusResponse.json();

    if (!picksResponse.ok) {
      throw new Error(data.detail || data.error || "Unable to load picks.");
    }
    if (!consensusResponse.ok) {
      throw new Error(consensusData.detail || consensusData.error || "Unable to compare picks.");
    }

    state.picks = data.picks || [];
    state.bestPicks = data.bestPicks || [];
    state.consensus = consensusData.consensus || [];
    state.markets = new Set(state.picks.map((pick) => pick.market).filter(Boolean));

    els.fetchedAt.textContent = formatDate(data.fetchedAt || data.generatedAt);
    els.gameCount.textContent = data.counts?.games ?? 0;
    els.pickCount.textContent = data.counts?.picks ?? 0;
    els.intro.textContent = data.intro || "";
    els.consensusIntro.textContent = consensusSummary(consensusData);

    renderMarketOptions();
    renderConsensus();
    renderPicks();
  } catch (error) {
    els.pickList.innerHTML = `<div class="empty">Could not load today's picks — ${escapeHtml(error.message)}</div>`;
    els.consensusList.innerHTML = `<div class="empty">Could not compare picks — ${escapeHtml(error.message)}</div>`;
  } finally {
    setLoading(false);
  }
}

function picksUrl(refresh = false) {
  const isLocal = ["localhost", "127.0.0.1", ""].includes(window.location.hostname);
  const cacheBust = refresh ? `?t=${Date.now()}` : "";
  return isLocal ? `/api/picks${refresh ? "?refresh=1" : ""}` : `data/picks.json${cacheBust}`;
}

function consensusUrl(refresh = false) {
  const isLocal = ["localhost", "127.0.0.1", ""].includes(window.location.hostname);
  const cacheBust = refresh ? `?t=${Date.now()}` : "";
  return isLocal ? `/api/consensus${refresh ? "?refresh=1" : ""}` : `data/consensus.json${cacheBust}`;
}

function renderMarketOptions() {
  const current = els.marketSelect.value;
  els.marketSelect.innerHTML = '<option value="">All markets</option>';
  [...state.markets].sort().forEach((market) => {
    const opt = document.createElement("option");
    opt.value = market;
    opt.textContent = market;
    els.marketSelect.append(opt);
  });
  els.marketSelect.value = current;
}

function renderPicks() {
  const base = state.view === "best" ? state.bestPicks : state.picks;
  const query = state.query.toLowerCase();
  const filtered = base.filter((pick) => {
    const hay = searchablePickText(pick);
    return (!query || hay.includes(query)) && (!state.market || pick.market === state.market);
  });

  els.listTitle.textContent = state.view === "best" ? "Best Expert Picks" : "All Expert Picks";
  els.pickList.innerHTML = "";

  if (!filtered.length) {
    els.pickList.innerHTML = '<div class="empty">No picks match the current filters.</div>';
    return;
  }

  filtered.forEach((pick, i) => {
    const node = els.template.content.cloneNode(true);
    const card = node.querySelector(".pick-card");

    const market = pick.market || "Other";
    card.setAttribute("data-market", market);
    card.style.animationDelay = `${i * 40}ms`;

    node.querySelector(".matchup").textContent = pick.matchup;
    node.querySelector(".starts").textContent = pick.startsAt || "";
    node.querySelector(".made").textContent = pick.made || "Fresh today";
    node.querySelector(".selection").textContent = pick.selection;
    node.querySelector(".market").textContent = market;

    const oddsEl = node.querySelector(".odds");
    const oddsText = pick.odds ? pick.odds : "—";
    oddsEl.textContent = oddsText;
    if (pick.odds) {
      const firstNum = pick.odds.match(/([+-]?\d+)/)?.[1];
      if (firstNum) {
        oddsEl.classList.add(Number(firstNum) > 0 ? "positive" : "negative");
      }
    }

    node.querySelector(".analysis").textContent = pick.analysis || "Open the source for the full write-up.";
    node.querySelector(".analyst").textContent = pick.analyst || pick.source || "Covers";
    node.querySelector(".rating").textContent = pick.rating ? `★ ${pick.rating}` : "";

    els.pickList.append(node);
  });
}

function searchablePickText(pick) {
  const teamText = expandTeamAliases(`${pick.matchup} ${pick.selection}`);
  return `${pick.matchup} ${teamText} ${pick.market} ${pick.selection} ${pick.analyst}`.toLowerCase();
}

function expandTeamAliases(value = "") {
  const abbreviations = `${value}`.match(/\b[A-Z]{2,4}\b/g) || [];
  const canonicalTeams = new Set(abbreviations.map((abbr) => abbreviationAliases[abbr]).filter(Boolean));
  return [...canonicalTeams].flatMap((team) => teamAliases[team]).join(" ");
}

function renderConsensus() {
  const common = state.consensus.filter((pick) => pick.sourceCount > 1).slice(0, 8);
  const fallback = state.consensus.slice(0, 8);
  const picks = common.length ? common : fallback;

  els.consensusList.innerHTML = "";

  if (!picks.length) {
    els.consensusList.innerHTML = '<div class="empty">No consensus picks available right now.</div>';
    return;
  }

  picks.forEach((pick, i) => {
    const node = els.consensusTemplate.content.cloneNode(true);
    const card = node.querySelector(".consensus-card");
    const market = pick.market || "Other";
    card.style.animationDelay = `${i * 50}ms`;
    card.setAttribute("data-market", market);

    node.querySelector(".market-badge").textContent = market;
    node.querySelector(".agreement").textContent = pick.agreement;
    node.querySelector(".selection").textContent = pick.selection;
    node.querySelector(".matchup").textContent = pick.matchup;
    node.querySelector(".source-count").textContent = pick.sourceCount;
    node.querySelector(".pick-count").textContent = pick.pickCount;
    node.querySelector(".source-list").textContent = pick.sources.map((s) => s.name).join(" · ");
    node.querySelector(".example-list").textContent = sampleExamples(pick.examples);

    els.consensusList.append(node);
  });
}

function setLoading(isLoading) {
  els.refreshButton.disabled = isLoading;
  els.refreshButton.innerHTML = isLoading
    ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin 1s linear infinite"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg> Loading`
    : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg> Refresh`;
}

function consensusSummary(data) {
  const sources = (data.sources || []).filter((s) => !s.error && s.picks > 0);
  const names = sources.map((s) => s.name).join(", ");
  return `${data.counts?.picks || 0} expert picks across ${names || "available sources"}.`;
}

function sampleExamples(examples = []) {
  return examples
    .slice(0, 3)
    .map((e) => `${e.source}${e.expert ? ` (${e.expert})` : ""}${e.odds ? ` ${e.odds}` : ""}`)
    .join(" · ");
}

function formatDate(value) {
  if (!value) return "Unknown";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function escapeHtml(value) {
  return `${value}`.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
}

const style = document.createElement("style");
style.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
document.head.append(style);

els.refreshButton.addEventListener("click", () => loadPicks(true));
els.searchInput.addEventListener("input", (e) => { state.query = e.target.value; renderPicks(); });
els.marketSelect.addEventListener("change", (e) => { state.market = e.target.value; renderPicks(); });
els.viewSelect.addEventListener("change", (e) => { state.view = e.target.value; renderPicks(); });

loadPicks();
