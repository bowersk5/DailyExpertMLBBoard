import test from "node:test";
import assert from "node:assert/strict";
import { parseCoversMlbPicks } from "../src/coversParser.js";

test("parses Covers MLB pick blocks into games and ranked picks", () => {
  const html = `
    <html><head><title>Free MLB Picks</title></head><body>
      <h1>MLB Picks</h1>
      <p>Get free expert and computer MLB picks for every game on May 30, 2026.</p>
      <div>DET @ CHW Sat, May 30 • 2:10 PM ET</div>
      <div>2 Expert Picks 10 Computer Picks</div>
      <div>Total</div>
      <div>o7.5 (-110)</div>
      <div>Best Odds</div>
      <div>o7.5 -113</div>
      <div>Pick made: 5 hours ago</div>
      <div>Eric Rosales</div>
      <div>Betting Analyst</div>
      <div>Analysis</div>
      <p>The Over has cashed in three of the last four starts.</p>
      <div>Read Full Analysis</div>
      <div>Moneyline</div>
      <div>CHW (+108)</div>
      <div>Best Odds</div>
      <div>+100</div>
      <div>Pick made: 6 minutes ago</div>
      <div>Eric Rosales</div>
      <div>Betting Analyst</div>
      <div>Analysis</div>
      <p>The White Sox have won four of the last six.</p>
      <div>View 12 Picks</div>
      <h2>What are Covers' MLB Free picks and predictions?</h2>
    </body></html>
  `;

  const result = parseCoversMlbPicks(html);

  assert.equal(result.counts.games, 1);
  assert.equal(result.counts.picks, 2);
  assert.equal(result.games[0].matchup, "DET @ CHW");
  assert.equal(result.games[0].expertPicks, 2);
  assert.equal(result.games[0].computerPicks, 10);
  assert.equal(result.picks[0].market, "Total");
  assert.equal(result.picks[0].selection, "o7.5 (-110)");
  assert.equal(result.picks[0].analyst, "Eric Rosales");
  assert.equal(result.bestPicks[0].market, "Moneyline");
});

test("filters out picks made days ago", () => {
  const html = `
    <html><head><title>Free MLB Picks</title></head><body>
      <h1>MLB Picks</h1>
      <p>Get free expert and computer MLB picks for every game.</p>
      <div>TB @ NYY Tue, Sep 22 • 1:05 PM ET</div>
      <div>1 Expert Picks 8 Computer Picks</div>
      <div>Moneyline</div>
      <div>TB (+115)</div>
      <div>Best Odds</div>
      <div></div>
      <div>Pick made: 7 days ago</div>
      <div>Aisha Quinones</div>
      <div>Betting Analyst</div>
      <div>Analysis</div>
      <p>Drew Rasmussen vs. the New York Yankees is a mismatch.</p>
      <div>Read Full Analysis</div>
      <h2>What are Covers' MLB Free picks and predictions?</h2>
    </body></html>
  `;

  const result = parseCoversMlbPicks(html);
  assert.equal(result.counts.picks, 0, "stale picks should be filtered out");
  assert.equal(result.counts.games, 0, "game with only stale picks should be dropped");
});
