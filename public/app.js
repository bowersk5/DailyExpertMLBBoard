const state = {
  picks: [],
  bestPicks: [],
  consensus: [],
  markets: new Set(),
  view: "best",
  query: "",
  market: ""
};

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

    // Parse both bodies before checking status so we can surface the
    // server's JSON error message if available.
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
    els.pickList.innerHTML = `<div class="empty">Could not load today's Covers picks. ${escapeHtml(error.message)}</div>`;
    els.consensusList.innerHTML = `<div class="empty">Could not compare picks. ${escapeHtml(error.message)}</div>`;
  } finally {
    setLoading(false);
  }
}

function picksUrl(refresh = false) {
  const isLocalServer = ["localhost", "127.0.0.1", ""].includes(window.location.hostname);
  const cacheBust = refresh ? `?t=${Date.now()}` : "";

  if (isLocalServer) {
    return `/api/picks${refresh ? "?refresh=1" : ""}`;
  }

  return `data/picks.json${cacheBust}`;
}

function consensusUrl(refresh = false) {
  const isLocalServer = ["localhost", "127.0.0.1", ""].includes(window.location.hostname);
  const cacheBust = refresh ? `?t=${Date.now()}` : "";

  if (isLocalServer) {
    return `/api/consensus${refresh ? "?refresh=1" : ""}`;
  }

  return `data/consensus.json${cacheBust}`;
}

function renderMarketOptions() {
  const current = els.marketSelect.value;
  els.marketSelect.innerHTML = '<option value="">All markets</option>';
  [...state.markets].sort().forEach((market) => {
    const option = document.createElement("option");
    option.value = market;
    option.textContent = market;
    els.marketSelect.append(option);
  });
  els.marketSelect.value = current;
}

function renderPicks() {
  const base = state.view === "best" ? state.bestPicks : state.picks;
  const query = state.query.toLowerCase();
  const filtered = base.filter((pick) => {
    const haystack = `${pick.matchup} ${pick.market} ${pick.selection} ${pick.analyst}`.toLowerCase();
    const matchesQuery = !query || haystack.includes(query);
    const matchesMarket = !state.market || pick.market === state.market;
    return matchesQuery && matchesMarket;
  });

  els.listTitle.textContent = state.view === "best" ? "Best expert picks" : "All expert picks";
  els.pickList.innerHTML = "";

  if (!filtered.length) {
    els.pickList.innerHTML = '<div class="empty">No picks match the current filters.</div>';
    return;
  }

  filtered.forEach((pick) => {
    const node = els.template.content.cloneNode(true);
    node.querySelector(".matchup").textContent = pick.matchup;
    node.querySelector(".made").textContent = pick.made || "Fresh today";
    node.querySelector(".selection").textContent = pick.selection;
    node.querySelector(".market").textContent = pick.market;
    node.querySelector(".odds").textContent = pick.odds ? `Best odds ${pick.odds}` : "Odds unavailable";
    node.querySelector(".rating").textContent = "Expert";
    node.querySelector(".analysis").textContent = pick.analysis || "Open the source for the full write-up.";
    node.querySelector(".analyst").textContent = pick.analyst || pick.source || "Covers";
    node.querySelector(".starts").textContent = pick.startsAt || "";
    els.pickList.append(node);
  });
}

function renderConsensus() {
  const common = state.consensus.filter((pick) => pick.sourceCount > 1).slice(0, 8);
  const fallback = state.consensus.slice(0, 8);
  const picks = common.length ? common : fallback;
  els.consensusList.innerHTML = "";

  if (!picks.length) {
    els.consensusList.innerHTML = '<div class="empty">No consensus picks are available right now.</div>';
    return;
  }

  picks.forEach((pick) => {
    const node = els.consensusTemplate.content.cloneNode(true);
    node.querySelector(".matchup").textContent = pick.matchup;
    node.querySelector(".agreement").textContent = `${pick.agreement} sources`;
    node.querySelector(".selection").textContent = pick.selection;
    node.querySelector(".market").textContent = pick.market;
    node.querySelector(".source-count").textContent = `${pick.sourceCount} sites`;
    node.querySelector(".pick-count").textContent = `${pick.pickCount} experts`;
    node.querySelector(".source-list").textContent = pick.sources.map((source) => source.name).join(", ");
    node.querySelector(".example-list").textContent = sampleExamples(pick.examples);
    els.consensusList.append(node);
  });
}

function setLoading(isLoading) {
  els.refreshButton.disabled = isLoading;
  els.refreshButton.textContent = isLoading ? "Loading" : "Refresh";
}

function consensusSummary(data) {
  const sources = (data.sources || []).filter((source) => !source.error && source.picks > 0);
  const sourceNames = sources.map((source) => source.name).join(", ");
  return `Comparing ${data.counts?.picks || 0} expert picks from ${sourceNames || "available sources"}.`;
}

function sampleExamples(examples = []) {
  return examples
    .slice(0, 4)
    .map((example) => `${example.source}${example.expert ? ` (${example.expert})` : ""}${example.odds ? ` ${example.odds}` : ""}`)
    .join(" • ");
}

function formatDate(value) {
  if (!value) {
    return "Unknown";
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[char]);
}

els.refreshButton.addEventListener("click", () => loadPicks(true));
els.searchInput.addEventListener("input", (event) => {
  state.query = event.target.value;
  renderPicks();
});
els.marketSelect.addEventListener("change", (event) => {
  state.market = event.target.value;
  renderPicks();
});
els.viewSelect.addEventListener("change", (event) => {
  state.view = event.target.value;
  renderPicks();
});

loadPicks();
