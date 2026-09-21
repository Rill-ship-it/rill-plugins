# rill-plugins

Rill's plugin marketplace for [Claude Code](https://code.claude.com). One plugin today:

| Plugin | What it does |
|---|---|
| [`rill`](plugins/rill/) | Hyperliquid perp & spot analysis in Rill's perps framework — `/rill:trade`, `/rill:login`, `/rill:profile`. Read-only market data; completed analyses count toward your Rill Daily catch. |

## Install

```
/plugin marketplace add Rill-ship-it/rill-plugins
/plugin install rill@rill
```

Then `/rill:login` once, and ask about any Hyperliquid market: `/rill:trade BTC`, `/rill:trade scan`, "资金费率哪个最极端".

Full docs (中文 / English), the login flow and the privacy notice: [plugins/rill/README.md](plugins/rill/README.md).

## Development

```
node --test test/                                   # offline: fixtures + fake servers, no network
claude plugin validate . && claude plugin validate ./plugins/rill
node test/fixtures/capture.mjs                      # refresh the Hyperliquid fixtures (the only live call)
```

Node ≥ 20, no dependencies. Point the plugin at a local backend with `RILL_API_BASE=http://127.0.0.1:8787`.

## Attribution

The data layer follows [`himself65/finance-skills`](https://github.com/himself65/finance-skills) (`hyperliquid-reader`, MIT) and the skill structure follows [`himself65/trade-skills`](https://github.com/himself65/trade-skills) (MIT). Both are credited in detail in the plugin README. MIT License.
