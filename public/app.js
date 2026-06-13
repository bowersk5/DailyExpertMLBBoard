const state = {
  sport: currentSport(),
  consensus: [],
  activeMarket: "all",
  // Each parlay item stores: key, selection, matchup, market, and odds.
  parlay: [],
  theme: currentTheme()
};

const sports = {
  mlb: { label: "MLB", sourceUrl: "https://www.covers.com/picks/mlb" },
  nba: { label: "NBA", sourceUrl: "https://www.covers.com/picks/nba" },
  nhl: { label: "NHL", sourceUrl: "https://www.covers.com/picks/nhl" }
};

const STALE_THRESHOLD_HOURS = 10;

const els = {
  refreshButton: document.querySelector("#refreshButton"),
  sourceLink: document.querySelector("#sourceLink"),
  fetchedAt: document.querySelector("#fetchedAt"),
  gameCount: document.querySelector("#gameCount"),
  pickCount: document.querySelector("#pickCount"),
  sportTitle: document.querySelector("#sportTitle"),
  consensusIntro: document.querySelector("#consensusIntro"),
  consensusList: document.querySelector("#consensusList"),
  consensusTemplate: document.querySelector("#consensusTemplate"),
  sportLinks: document.querySelectorAll("[data-sport-link]"),
  staleWarning: document.querySelector("#staleWarning"),
  marketFilters: document.querySelector("#marketFilters"),
  themeToggle: document.querySelector("#themeToggle"),
  themeToggleText: document.querySelector("#themeToggleText"),
  parlayDrawer: document.querySelector("#parlayDrawer"),
  parlayCount: document.querySelector("#parlayCount"),
  parlayList: document.querySelector("#parlayList"),
  parlayOdds: document.querySelector("#parlayOdds"),
  parlayPayout: document.querySelector("#parlayPayout"),
  parlayStake: document.querySelector("#parlayStake"),
  clearParlay: document.querySelector("#clearParlay"),
  parlayToggle: document.querySelector("#parlayToggle")
};

// Set up the saved light or dark theme.

function currentTheme() {
  const savedTheme = readSavedTheme();
  if (savedTheme) return savedTheme;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function readSavedTheme() {
  try {
    const savedTheme = localStorage.getItem("theme");
    return ["light", "dark"].includes(savedTheme) ? savedTheme : "";
  } catch {
    return "";
  }
}

function saveTheme(theme) {
  try {
    localStorage.setItem("theme", theme);
  } catch {
    // Storage can fail in private browsing; the visual toggle still works.
  }
}

function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.dataset.theme = theme;

  if (!els.themeToggle) return;
  const isLight = theme === "light";
  els.themeToggle.setAttribute("aria-pressed", String(isLight));
  els.themeToggle.setAttribute("aria-label", `Switch to ${isLight ? "dark" : "light"} mode`);
  if (els.themeToggleText) {
    els.themeToggleText.textContent = isLight ? "Light" : "Dark";
  }
}

function toggleTheme() {
  const nextTheme = state.theme === "light" ? "dark" : "light";
  applyTheme(nextTheme);
  saveTheme(nextTheme);
}

// Load consensus data and update the page.

async function loadConsensus(refresh = false) {
  setLoading(true);
  try {
    const [consensusResponse, picksResult] = await Promise.all([
      fetch(consensusUrl(refresh)),
      fetch(picksUrl(refresh))
        .then(async (response) => response.ok ? response.json() : null)
        .catch(() => null)
    ]);
    const consensusData = await consensusResponse.json();

    if (!consensusResponse.ok) {
      throw new Error(consensusData.detail || consensusData.error || "Unable to compare picks.");
    }

    state.consensus = consensusData.consensus || [];
    state.sport = consensusData.sport || state.sport;

    renderSportChrome();
    els.fetchedAt.textContent = formatDate(consensusData.generatedAt);
    els.gameCount.textContent = consensusData.counts?.activeSources ?? 0;

    checkStale(consensusData.generatedAt);
    renderMarketFilters();
    renderConsensus();

    els.consensusIntro.textContent = consensusSummary(consensusData, picksResult);
  } catch (error) {
    els.consensusList.innerHTML = `<div class="empty">Could not compare picks — ${escapeHtml(error.message)}</div>`;
  } finally {
    setLoading(false);
  }
}

// Show a warning when the generated data is old.

function checkStale(generatedAt) {
  if (!generatedAt || !els.staleWarning) return;
  const ageHours = (Date.now() - new Date(generatedAt).getTime()) / 3_600_000;
  els.staleWarning.hidden = ageHours <= STALE_THRESHOLD_HOURS;
}

// Build the market filter buttons from the available picks.

const MARKET_ORDER = ["all", "Moneyline", "Total", "Run Line", "Spread", "Prop", "Parlay"];

function availableMarkets() {
  const seen = new Set(state.consensus.map((p) => p.market));
  return MARKET_ORDER.filter((m) => m === "all" || seen.has(m));
}

function renderMarketFilters() {
  if (!els.marketFilters) return;
  const markets = availableMarkets();

  els.marketFilters.innerHTML = markets.map((m) => {
    const active = state.activeMarket === m ? " is-active" : "";
    const label = m === "all" ? "All" : m;
    return `<button class="market-filter-btn${active}" data-market="${m}">${label}</button>`;
  }).join("");

  els.marketFilters.querySelectorAll("[data-market]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.activeMarket = btn.dataset.market;
      els.marketFilters.querySelectorAll("[data-market]").forEach((b) => {
        b.classList.toggle("is-active", b.dataset.market === state.activeMarket);
      });
      renderConsensus();
    });
  });
}

// Render the visible consensus cards.

function renderConsensus() {
  const filtered = state.consensus
    .filter((p) => state.activeMarket === "all" || p.market === state.activeMarket)
    .filter((p) => p.sourceCount > 1 || state.consensus.filter((x) => x.sourceCount > 1).length === 0)
    .slice(0, 12);

  const fallback = state.consensus
    .filter((p) => state.activeMarket === "all" || p.market === state.activeMarket)
    .slice(0, 12);

  const picks = filtered.length ? filtered : fallback;

  els.consensusList.innerHTML = "";
  els.pickCount.textContent = picks.length;

  if (!picks.length) {
    els.consensusList.innerHTML = '<div class="empty">No consensus picks available right now.</div>';
    return;
  }

  picks.forEach((pick, i) => {
    const node = els.consensusTemplate.content.cloneNode(true);
    const card = node.querySelector(".consensus-card");
    const market = pick.market || "Other";
    card.style.animationDelay = `${i * 40}ms`;
    card.setAttribute("data-market", market);

    // Mark picks that are already in the parlay slip.
    const inParlay = state.parlay.some((p) => p.key === pick.key);
    card.classList.toggle("in-parlay", inParlay);

    node.querySelector(".market").textContent = market;
    node.querySelector(".agreement").textContent = pick.agreement;
    node.querySelector(".selection").textContent = pick.selection;
    node.querySelector(".matchup").textContent = pick.matchup;
    node.querySelector(".source-count") && (node.querySelector(".source-count").textContent = pick.sourceCount);
    node.querySelector(".pick-count").textContent = pick.pickCount;
    node.querySelector(".source-list").textContent = pick.sources.map((s) => s.name).join(" · ");
    node.querySelector(".example-list").textContent = sampleExamples(pick.examples);

    // Let users expand the first available analysis note.
    const fullAnalysis = pick.examples?.find((e) => e.analysis)?.analysis || "";
    const expandBtn = node.querySelector(".expand-analysis");
    const fullBlock = node.querySelector(".full-analysis");

    if (fullAnalysis && expandBtn && fullBlock) {
      fullBlock.textContent = fullAnalysis;
      expandBtn.hidden = false;
      expandBtn.addEventListener("click", () => {
        const open = fullBlock.hidden === false;
        fullBlock.hidden = open;
        expandBtn.textContent = open ? "Read analysis ↓" : "Close ↑";
      });
    } else if (expandBtn) {
      expandBtn.hidden = true;
    }

    // Add or remove this pick from the parlay slip.
    const parlayBtn = node.querySelector(".add-parlay-btn");
    if (parlayBtn) {
      parlayBtn.textContent = inParlay ? "− Remove" : "+ Parlay";
      parlayBtn.classList.toggle("in-parlay", inParlay);
      parlayBtn.addEventListener("click", () => toggleParlay(pick));
    }

    els.consensusList.append(node);
  });
}

// Keep the parlay slip in sync with selected picks.

function toggleParlay(pick) {
  const idx = state.parlay.findIndex((p) => p.key === pick.key);
  if (idx >= 0) {
    state.parlay.splice(idx, 1);
  } else {
    state.parlay.push({
      key: pick.key,
      selection: pick.selection,
      matchup: pick.matchup,
      market: pick.market,
      odds: pick.odds?.[0] || ""
    });
  }
  renderConsensus();
  renderParlayDrawer();
}

function renderParlayDrawer() {
  if (!els.parlayDrawer) return;

  const count = state.parlay.length;
  els.parlayCount.textContent = count;
  els.parlayDrawer.hidden = count === 0;

  if (count === 0) return;

  // Render each pick in the slip.
  els.parlayList.innerHTML = state.parlay.map((leg, i) => `
    <div class="parlay-leg">
      <div class="parlay-leg__info">
        <span class="parlay-leg__selection">${escapeHtml(leg.selection)}</span>
        <span class="parlay-leg__matchup">${escapeHtml(leg.matchup)}</span>
      </div>
      <div class="parlay-leg__right">
        ${leg.odds ? `<span class="parlay-leg__odds">${escapeHtml(leg.odds)}</span>` : ""}
        <button class="parlay-remove" data-idx="${i}" aria-label="Remove">✕</button>
      </div>
    </div>
  `).join("");

  els.parlayList.querySelectorAll(".parlay-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.parlay.splice(Number(btn.dataset.idx), 1);
      renderConsensus();
      renderParlayDrawer();
    });
  });

  // Calculate combined American odds and estimated profit.
  const combinedDecimal = state.parlay.reduce((acc, leg) => {
    const decimal = americanToDecimal(leg.odds);
    return decimal ? acc * decimal : acc;
  }, 1);

  const combinedAmerican = decimalToAmerican(combinedDecimal);
  els.parlayOdds.textContent = combinedAmerican || "—";

  const stake = parseFloat(els.parlayStake?.value) || 100;
  const payout = ((combinedDecimal - 1) * stake).toFixed(2);
  els.parlayPayout.textContent = isFinite(payout) && combinedDecimal > 1
    ? `$${Number(payout).toLocaleString()} profit on $${stake}`
    : "—";
}

function americanToDecimal(odds) {
  const n = parseFloat(odds);
  if (!isFinite(n) || n === 0) return null;
  return n > 0 ? n / 100 + 1 : 100 / Math.abs(n) + 1;
}

function decimalToAmerican(decimal) {
  if (!isFinite(decimal) || decimal <= 1) return "";
  const american = decimal >= 2
    ? `+${Math.round((decimal - 1) * 100)}`
    : `-${Math.round(100 / (decimal - 1))}`;
  return american;
}

// Shared helper functions.

function consensusUrl(refresh = false) {
  const isLocal = ["localhost", "127.0.0.1", ""].includes(window.location.hostname);
  const params = new URLSearchParams({ sport: state.sport });
  if (refresh) params.set("refresh", "1");
  if (isLocal) return `/api/consensus?${params}`;
  const cacheBust = refresh ? `?t=${Date.now()}` : "";
  return staticConsensusUrl(cacheBust);
}

function staticConsensusUrl(cacheBust = "") {
  const base = siteRoot();
  return state.sport === "mlb"
    ? `${base}data/consensus.json${cacheBust}`
    : `${base}data/${state.sport}/consensus.json${cacheBust}`;
}

function picksUrl(refresh = false) {
  const isLocal = ["localhost", "127.0.0.1", ""].includes(window.location.hostname);
  const params = new URLSearchParams({ sport: state.sport });
  if (refresh) params.set("refresh", "1");
  if (isLocal) return `/api/picks?${params}`;
  const cacheBust = refresh ? `?t=${Date.now()}` : "";
  return staticPicksUrl(cacheBust);
}

function staticPicksUrl(cacheBust = "") {
  const base = siteRoot();
  return state.sport === "mlb"
    ? `${base}data/picks.json${cacheBust}`
    : `${base}data/${state.sport}/picks.json${cacheBust}`;
}

function siteRoot() {
  const { protocol, host, pathname } = window.location;
  const parts = pathname.split("/").filter(Boolean);
  const sportSegments = new Set(["mlb", "nba", "nhl"]);
  const rootParts = parts.filter((p) => !sportSegments.has(p));
  const rootPath = rootParts.length ? `/${rootParts.join("/")}/` : "/";
  return `${protocol}//${host}${rootPath}`;
}

function setLoading(isLoading) {
  els.refreshButton.disabled = isLoading;
  els.refreshButton.innerHTML = isLoading
    ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin 1s linear infinite"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg> Loading`
    : `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg> Refresh`;
}

function consensusSummary(data, picksData = null) {
  const sources = (data.sources || []).filter((s) => !s.error && s.picks > 0);
  const names = sources.map((s) => s.name).join(", ");
  const listedPicks = picksData?.counts?.expertPicks;
  const parsedPicks = picksData?.counts?.parsedPicks ?? data.counts?.picks ?? 0;
  const sportLabel = data.sportLabel || sports[state.sport].label;

  if (listedPicks && listedPicks !== parsedPicks) {
    return `${listedPicks} ${sportLabel} expert picks listed on Covers; ${parsedPicks} currently available for consensus cards across ${names || "available sources"}.`;
  }

  return `${parsedPicks} ${sportLabel} expert picks across ${names || "available sources"}.`;
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

function currentSport() {
  const pathParts = window.location.pathname.split("/").filter(Boolean);
  const sportFromPath = pathParts.find((part) => ["mlb", "nba", "nhl"].includes(part));
  if (sportFromPath) return sportFromPath;
  const querySport = new URLSearchParams(window.location.search).get("sport");
  if (["mlb", "nba", "nhl"].includes(querySport)) return querySport;
  return "mlb";
}

function renderSportChrome() {
  const sport = sports[state.sport] || sports.mlb;
  els.sportTitle.textContent = `${sport.label} Most Agreed Picks`;
  els.sourceLink.href = sport.sourceUrl;
  els.sportLinks.forEach((link) => {
    const isActive = link.dataset.sportLink === state.sport;
    link.classList.toggle("is-active", isActive);
    link.setAttribute("aria-current", isActive ? "page" : "false");
  });
}

// Add the refresh-button spinner animation.

const style = document.createElement("style");
style.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
document.head.append(style);

// Start the page.

renderSportChrome();
applyTheme(state.theme);
els.refreshButton.addEventListener("click", () => loadConsensus(true));
els.themeToggle?.addEventListener("click", toggleTheme);

if (els.clearParlay) {
  els.clearParlay.addEventListener("click", () => {
    state.parlay = [];
    renderConsensus();
    renderParlayDrawer();
  });
}

if (els.parlayStake) {
  els.parlayStake.addEventListener("input", renderParlayDrawer);
}

if (els.parlayToggle) {
  els.parlayToggle.setAttribute("aria-expanded", String(!els.parlayDrawer.classList.contains("is-collapsed")));
  els.parlayToggle.addEventListener("click", () => {
    const collapsed = els.parlayDrawer.classList.toggle("is-collapsed");
    els.parlayToggle.setAttribute("aria-expanded", String(!collapsed));
  });
}

loadConsensus();
