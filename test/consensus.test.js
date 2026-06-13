import test from "node:test";
import assert from "node:assert/strict";
import { buildConsensus, normalizePick, sports } from "../src/consensus.js";

test("groups normalized picks by matchup, market, and selection", () => {
  const consensus = buildConsensus([
    {
      key: "DET @ CHW|Moneyline|CHW",
      matchup: "DET @ CHW",
      market: "Moneyline",
      selection: "CHW Moneyline",
      sourceId: "covers",
      source: "Covers",
      expert: "Analyst One"
    },
    {
      key: "DET @ CHW|Moneyline|CHW",
      matchup: "DET @ CHW",
      market: "Moneyline",
      selection: "CHW Moneyline",
      sourceId: "pickswise",
      source: "Pickswise",
      expert: "Pickswise"
    },
    {
      key: "DET @ CHW|Total|Under 8",
      matchup: "DET @ CHW",
      market: "Total",
      selection: "Under 8",
      sourceId: "action",
      source: "Action Network",
      expert: "Analyst Two"
    }
  ]);

  assert.equal(consensus[0].selection, "CHW Moneyline");
  assert.equal(consensus[0].sourceCount, 2);
  assert.equal(consensus[0].pickCount, 2);
  assert.equal(consensus[1].sourceCount, 1);
});

test("normalizes NBA player total markets as props", () => {
  const pick = normalizePick({
    matchup: "NY @ SA",
    startsAt: "Sat, Jun 13 • 8:30 PM ET",
    market: "Total Rebounds",
    selection: "Victor Wembanyama o11.5 Total Rebounds (+110)",
    odds: "o11.5 +110",
    expert: "Jason Logan",
    made: "an hour ago",
    sport: "nba"
  });

  assert.ok(pick);
  assert.equal(pick.matchup, "NYK @ SA");
  assert.equal(pick.market, "Prop");
  assert.equal(pick.selection, "Victor Wembanyama o11.5 Total Rebounds");
  assert.equal(pick.key, "NYK @ SA|Prop|victor wembanyama o11.5 total rebounds");
});

test("keeps Covers parlay cards as consensus picks", () => {
  const pick = normalizePick({
    matchup: "NY @ SA",
    market: "Moneyline",
    selection: "3 LEG PARLAY SA Moneyline Victor Wembanyama o28.5 Points Scored Points Scored Victor Wembanyama o11.5 Total Rebounds Total Rebounds +400",
    expert: "Jason Logan",
    made: "19 hours ago",
    sport: "nba"
  });

  assert.ok(pick);
  assert.equal(pick.market, "Parlay");
  assert.equal(
    pick.selection,
    "3 LEG PARLAY SA Moneyline Victor Wembanyama o28.5 Points Scored Victor Wembanyama o11.5 Total Rebounds"
  );
});

test("parses Pickswise streamed pick rows when __NEXT_DATA__ is absent", () => {
  const flight = `42:["$","tbody",null,{"children":[${[
    pickswiseFlightRow("418", "LAD vs CWS", "Run Line - Los Angeles Dodgers -1.5", "-125"),
    pickswiseFlightRow("424", "ARI vs CIN", "Moneyline - Arizona Diamondbacks", "-147")
  ].join(",")}]}]`;
  const html = `<script>self.__next_f.push([1,${JSON.stringify(flight)}])</script>`;
  const pickswise = sports.mlb.sources.find((source) => source.id === "pickswise");
  const picks = pickswise.parser(html, sports.mlb);

  assert.equal(picks.length, 2);
  assert.equal(picks[0].matchup, "LAD @ CHW");
  assert.equal(picks[0].market, "Run Line");
  assert.equal(picks[0].selection, "LAD -1.5");
  assert.equal(picks[0].odds, "-125");
  assert.equal(picks[1].selection, "ARI Moneyline");
});

function pickswiseFlightRow(id, matchup, selection, odds) {
  return [
    `["$","tr","${id}",{"className":"border-t border-border odd:bg-white even:bg-gray-light-bg","children":[`,
    `["$","td",null,{"className":"px-4 py-3","children":[["$","p",null,{"className":"text-body-bold text-primary-blue-dark","children":"${matchup}"}],["$","p",null,{"className":"text-caption text-primary-gray mt-0.5","children":""}]]}],`,
    `["$","td",null,{"className":"px-4 py-3","children":["$","p",null,{"className":"text-body-bold text-primary-blue-dark","children":"${selection}"}]}],`,
    `["$","td",null,{"className":"px-4 py-3 whitespace-nowrap","children":["$","span",null,{"className":"text-body text-yellow-danger","children":"3⭐"}]}],`,
    `["$","td",null,{"className":"px-4 py-3","children":["$","span",null,{"className":"text-body-bold text-primary-green","children":"${odds}"}]}]`,
    "]}]"
  ].join("");
}
