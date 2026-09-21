---
type: Trading Pitfall
title: On HL-native tokens the perp is the price discovery — read spot-vs-perp divergence, not just the oracle
description: Treating HYPE or PURR like BTC — for a token whose main market is Hyperliquid itself, perp OI can be many times daily spot volume, the oracle leans on that same venue, and a premium or discount between perp mark and spot says which side is forced; on BTC the same premium is arbitraged away against a deep external index.
severity: MEDIUM
appliesTo: hl-native, spot, premium, open-interest, divergence
tags: [hl-native, hype, purr, spot, oracle, divergence, oi-to-volume]
timestamp: 2026-09-21T00:00:00Z
---

## On HL-native tokens the perp is the price discovery

**Severity: MEDIUM — the premium reads correctly on BTC and backwards on HYPE.**

**The mistake**: applying the BTC playbook ("premium reverts to oracle, oracle is the truth") to a token whose oracle *is* mostly Hyperliquid. The trader waits for the perp premium to revert to a spot price that has no depth to revert to, or reads a discount as "cheap" when it is the spot holders being pulled down by perp liquidations.

**Why it happens**: for BTC, HL spot (`UBTC/USDC`, ~$62M/day on 2026-09-21) is tiny next to $1.8B of perp volume, but the oracle is an external CEX index with enormous depth — premium is arbitraged against it within the hour. For HYPE, HL spot is a primary venue (market cap $28B, ~$70M/day in `HYPE/USDC`) and the perp OI can be many times that daily volume. The oracle references this venue heavily, so perp and oracle move together, premium tells you less, and the useful number is the *direct* gap between perp mark and spot mark plus the OI-to-spot-volume ratio: it says how much leverage would have to unwind through how little spot.

**The check**:

1. `snapshot` → `spot` (the backing pair, null if none). For BTC / ETH / SOL that is the unit token (`UBTC/USDC`); treat those as majors with an external index.
2. For HL-native tokens compute:
   - `perp_vs_spot_bps = (market.markPx − spot.markPx) / spot.markPx × 10 000`
   - `oi_to_spot_vol = market.oiNotional ÷ spot.dayNtlVlm`
3. `oi_to_spot_vol > 20` → the perp is the tail wagging the dog: tag `+spot-divergence`, and read the sign of `perp_vs_spot_bps` as *which side is forced* (perp above spot: leveraged longs are the marginal buyer; perp below: leveraged shorts or liquidations are the marginal seller).
4. Do not expect mean reversion to spot — expect spot to follow the perp. Size for the perp's book ([`07-tight-spread-thin-depth.md`](07-tight-spread-thin-depth.md)), not the token's market cap.
5. On `spot` commands for these tokens, always add the perp side (`markets --coin X`) — a spot read without it is half a read.

**Example** (2026-09-21): HYPE spot $94.04, perp mark $94.10 (**+6 bps**), premium vs oracle +0.03%, spot volume $70M. If perp OI notional is, say, $700M, `oi_to_spot_vol` = 10: unwinding 10% of OI equals a whole day of spot volume. With premium so small the state is `spot-led` today — but the ratio says that when the perp crowd moves, spot cannot absorb it, and the "cheap vs oracle" read that works on BTC would be meaningless here. Compare BTC: perp $81,708 vs `UBTC/USDC` $81,668 (+5 bps) with a CEX oracle at $81,671 — the 5 bps is arbitrage residue, not information.

**See also**: [`../commands/spot.md`](../commands/spot.md); [`../perps-framework.md`](../perps-framework.md) §4; [`03-premium-plus-oi-is-leverage-stacking.md`](03-premium-plus-oi-is-leverage-stacking.md).
