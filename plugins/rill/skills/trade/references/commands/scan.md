---
type: Command Reference
title: "/rill:trade scan"
description: The whole Hyperliquid perp market at a glance — volume, gainers, losers, both funding extremes, OI notional — read into where the crowd is and which symbols deserve an analysis.
tags: [command, scan, market-overview, funding, open-interest]
timestamp: 2026-09-21T00:00:00Z
---

# /rill:trade scan

**Question it answers:** where is the crowd today, and what is worth a closer look? It ends at three or four lines and a short list of candidates — not at a trade.

## Data

One call:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/hl.mjs" markets --boards --limit 10 --session ${CLAUDE_SESSION_ID}
```

Returns `count` (live perps) and six boards of ten rows (`coin markPx change24hPct fundingAprPct oiNotional dayNtlVlm premiumPct`): `topVolume topGainers topLosers fundingHigh fundingLow topOi`. This call also refreshes the local OI ledger for every coin, which is what makes tomorrow's `analysis` quadrant work.

Optional follow-ups when the user asks for them: `markets --sort premiumPct --limit 10`, `predicted --limit 10` (cross-venue gaps, see [`funding.md`](funding.md)).

## Read order

1. **Where the money is** — `topVolume` and `topOi`: name the top three by volume and whether OI concentration matches (a coin high on OI but low on volume is a stale crowd).
2. **Where it moved** — `topGainers` / `topLosers`: for the top two of each, pair the move with its funding and premium. Up 15% with funding +200% APR and premium +0.3% is a very different thing from up 15% with funding flat (spot-led).
3. **Where the crowd is paying** — `fundingHigh` / `fundingLow`: quote the extremes as APR *and* as a daily cost (`apr / 365`). Anything beyond ±60% is tagged extreme; say who is paying whom.
4. **Candidates** — up to five coins where two boards agree (e.g. gainer + funding high + premium high = crowded-long candidate; loser + funding deeply negative = crowded-short candidate). Each gets one line: why, and which `analysis` question to ask.

Do not rank by a single column and stop. Do not turn a board into a call — the framework's [state table](../perps-framework.md#7-name-the-state) needs the per-coin snapshot.

## Output

```
**Hyperliquid scan · <as_of UTC> · <count> live perps**
Volume/OI: …
Movers: …
Funding extremes: … (who pays whom, daily cost)
Worth an analysis: COIN — why · COIN — why · …
Not financial advice — Hyperliquid public data, read-only; no orders are placed.
```

Keep it under ~20 lines. Mirror the user's language.

## Record

`command: "scan"`, `symbols`: the coins you listed as candidates (may be empty if none stood out), `read.state`: `"market-scan"`, `read.bias`: the tilt of the whole board (`long` when funding extremes are mostly negative and losers dominate, `short` when the reverse, else `neutral`), `read.summary`: the one-line takeaway. `question.type: "overview"`. `scenarios` and `risk` are `null`. `pitfalls`: usually `["01"]`, add `"03"` when premium and funding extremes coincide.
