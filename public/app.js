const state = {
  consensus: []
};

const els = {
  refreshButton: document.querySelector("#refreshButton"),
  fetchedAt: document.querySelector("#fetchedAt"),
  gameCount: document.querySelector("#gameCount"),
  pickCount: document.querySelector("#pickCount"),
  consensusIntro: document.querySelector("#consensusIntro"),
  consensusList: document.querySelector("#consensusList"),
  consensusTemplate: document.querySelector("#consensusTemplate")
};

async function loadConsensus(refresh = false) {
  setLoading(true);
  try {
    const consensusResponse = await fetch(consensusUrl(refresh));
    const consensusData = await consensusResponse.json();

    if (!consensusResponse.ok) {
      throw new Error(consensusData.detail || consensusData.error || "Unable to compare picks.");
    }

    state.consensus = consensusData.consensus || [];

    els.fetchedAt.textContent = formatDate(consensusData.generatedAt);
    els.gameCount.textContent = consensusData.counts?.activeSources ?? 0;
    els.pickCount.textContent = consensusData.counts?.consensus ?? 0;
    els.consensusIntro.textContent = consensusSummary(consensusData);

    renderConsensus();
  } catch (error) {
    els.consensusList.innerHTML = `<div class="empty">Could not compare picks — ${escapeHtml(error.message)}</div>`;
  } finally {
    setLoading(false);
  }
}

function consensusUrl(refresh = false) {
  const isLocal = ["localhost", "127.0.0.1", ""].includes(window.location.hostname);
  const cacheBust = refresh ? `?t=${Date.now()}` : "";
  return isLocal ? `/api/consensus${refresh ? "?refresh=1" : ""}` : `data/consensus.json${cacheBust}`;
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

    node.querySelector(".market").textContent = market;
    node.querySelector(".agreement").textContent = pick.agreement;
    node.querySelector(".selection").textContent = pick.selection;
    node.querySelector(".matchup").textContent = pick.matchup;
    node.querySelector(".source-count") && (node.querySelector(".source-count").textContent = pick.sourceCount);
    node.querySelector(".pick-count").textContent = pick.pickCount;
    node.querySelector(".source-list").textContent = pick.sources.map((s) => s.name).join(" · ");
    node.querySelector(".example-list").textContent = sampleExamples(pick.examples);

    els.consensusList.append(node);
  });
}

function setLoading(isLoading) {
  els.refreshButton.disabled = isLoading;
  els.refreshButton.innerHTML = isLoading
    ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin 1s linear infinite"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg> Loading`
    : `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg> Refresh`;
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

els.refreshButton.addEventListener("click", () => loadConsensus(true));

loadConsensus();
