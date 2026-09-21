# Rill — Claude Code 插件

[English below](#rill--claude-code-plugin)

在 Claude Code 里读 Hyperliquid 永续 / 现货数据，用 Rill 的 perp 分析框架作答：资金费率、持仓量、溢价、盘口深度、多周期结构，命名状态 + 情景 + 止损距离定仓位。每次完成的分析记到你的 Rill 账号，计入当天的 Daily catch（与浏览器插件同一条进度）。**只读**：永远不碰下单接口，不签名，不生成下单代码。

## 安装

```
/plugin marketplace add Rill-ship-it/rill-plugins
/plugin install rill@rill
```

要求 Node ≥ 20（Claude Code 自带的即可），零 npm 依赖。备选（非官方路径）：`npx plugins add Rill-ship-it/rill-plugins`。

## 命令

| 命令 | 作用 |
|---|---|
| `/rill:login` | 设备码登录：打开浏览器用钱包授权，凭据存 `~/.rill/credentials.json`（0600） |
| `/rill:trade scan` | 全市场一眼：成交量 Top、涨跌 Top、funding 两端、OI 名义额 Top |
| `/rill:trade BTC` / `/rill:trade analysis BTC` | 单标的完整读：价格 → funding（时费、APR、7 天持续性）→ OI × 价格象限 → 溢价 → 盘口 → 多周期 → **命名状态** → 情景 →（问交易时）止损距离 → 仓位 |
| `/rill:trade funding [COIN]` | 资金费率 / carry / 跨所（HL vs Binance vs Bybit）筛选，扣掉手续费、interval 错配和基差 |
| `/rill:trade book <COIN>` | 盘口：价差 bps、±1% 深度、给定 size 的滑点 |
| `/rill:trade spot [PAIR]` | 现货：价格、量、市值；HL 原生币的现货 vs 永续背离 |
| `/rill:profile [status\|logout\|open]` | 账号状态（Rill ID、钱包、今日进度）、登出、打开 Dashboard |

直接问也行："BTC 现在怎么样"、"ETH 能不能空"、"资金费率哪个最极端"都会路由到对应命令。未登录时插件不做分析，只提示 `/rill:login`。

## 登录流程

1. `/rill:login` → 插件向 Rill 申请一个设备码，打开 `https://app.rill.land/#/link?code=XXXX-XXXX`（打不开就把链接和码贴给你）。
2. 浏览器里用钱包登录 Rill，确认"把 Claude Code（这台机器）连到这个钱包"。
3. 插件每 5 秒轮询，最多等 10 分钟；通过后打印 Rill ID、钱包、今日进度和下面的隐私说明。

## 隐私说明

- 采集范围：**只有用到 Rill 数据脚本的那一轮**的提问原文、模型最终回答、拉了哪些标的；绑定到你的 Rill 账号（钱包 / uid）。
- 用途：改进分析框架、构建数据集（与官网叙事一致：数据 → 实验室 → 收益给儿童 AI 项目）、计算盲盒进度。
- 开关：`~/.rill/config.json` 里 `"share": "full" | "meta"`；`meta` 只上报标的、命令和结构化记录，不含原文（仍计进度）。默认 `full`。
- 不采集：其他对话、文件内容、cwd 路径（只上报 hash 都不要）、环境变量。

```json
{ "share": "meta" }
```

## 工作方式

- `UserPromptSubmit` hook 把本轮提问写到本地 `~/.rill/turns/<session>.json`；`hl.mjs` 每次拉数据往同一文件追加一条；`Stop` hook 读到有数据调用才 `POST /v1/analyses`（3 秒超时，失败静默），成功后打印 `Rill · BTC analysis counted · Daily catch 7/20`。没有数据调用的轮次一个字都不会离开本机。
- 数据来自 Hyperliquid 公开 `POST /info`：`metaAndAssetCtxs`、`fundingHistory`、`predictedFundings`、`l2Book`、`candleSnapshot`、`spotMetaAndAssetCtxs`，并行约 1 秒。
- 开发：`RILL_API_BASE=http://127.0.0.1:8787` 指向本地后端；`RILL_HOME` 换状态目录；`RILL_HL_INFO_URL` 指向假 Hyperliquid。

---

# Rill — Claude Code plugin

Hyperliquid perp & spot analysis inside Claude Code, in Rill's perps framework: funding, open interest, premium, book depth, multi-timeframe structure → a named state, three scenarios, and size from stop distance. Every completed analysis is recorded to your Rill account and counts toward the day's Daily catch (the same progress as the browser extension). **Read-only**: it never touches the order endpoint, never signs, never writes order code.

## Install

```
/plugin marketplace add Rill-ship-it/rill-plugins
/plugin install rill@rill
```

Node ≥ 20 (the one Claude Code ships with is fine), zero npm dependencies. Alternative (not the official path): `npx plugins add Rill-ship-it/rill-plugins`.

## Commands

| Command | What it does |
|---|---|
| `/rill:login` | Device-flow sign-in: opens the browser for a wallet login; credentials go to `~/.rill/credentials.json` (mode 0600) |
| `/rill:trade scan` | The market at a glance: volume top, gainers / losers, both funding extremes, OI notional top |
| `/rill:trade BTC` / `/rill:trade analysis BTC` | One symbol, full read: price → funding (hourly, APR, 7-day persistence) → OI × price quadrant → premium → book → multi-timeframe → **named state** → scenarios → (if a trade is asked) stop distance → size |
| `/rill:trade funding [COIN]` | Funding / carry / cross-venue screen (HL vs Binance vs Bybit) with fees, interval mismatch and basis applied |
| `/rill:trade book <COIN>` | Order book: spread bps, ±1% depth, slippage for a given size |
| `/rill:trade spot [PAIR]` | Spot: price, volume, market cap; spot-vs-perp divergence for HL-native tokens |
| `/rill:profile [status\|logout\|open]` | Account status (Rill ID, wallet, today's progress), sign out, open the dashboard |

Plain questions work too — "how is BTC", "can I short ETH", "which funding is most extreme" route to the right command. When not signed in the plugin does not analyse; it points to `/rill:login`.

## Login flow

1. `/rill:login` → the plugin requests a device code from Rill and opens `https://app.rill.land/#/link?code=XXXX-XXXX` (if the browser cannot open, it prints the link and code).
2. Sign in to Rill with your wallet in the browser and approve "connect Claude Code (this machine) to this wallet".
3. The plugin polls every 5 s for up to 10 minutes; on approval it prints your Rill ID, wallet, today's progress and the privacy notice below.

## Privacy

- Scope: **only the turns that use Rill's data scripts** — your question, the model's final answer, and which symbols were pulled; tied to your Rill account (wallet / uid).
- Use: improving the analysis framework, building the dataset (as on the website: data → labs → proceeds to children's AI projects), and counting your Daily catch.
- Switch: `~/.rill/config.json` → `"share": "full" | "meta"`; `meta` sends only symbols, command and the structured record, no question / answer text (still counts). Default `full`.
- Never collected: other conversations, file contents, working-directory paths (not even a hash), environment variables.

```json
{ "share": "meta" }
```

## How it works

- A `UserPromptSubmit` hook writes the turn's prompt to a local file (`~/.rill/turns/<session>.json`); every `hl.mjs` call appends one line to it; the `Stop` hook sends `POST /v1/analyses` only when that file holds at least one data call (3 s timeout, silent on failure) and then prints `Rill · BTC analysis counted · Daily catch 7/20`. A turn without data calls never leaves the machine.
- Data: Hyperliquid's public `POST /info` — `metaAndAssetCtxs`, `fundingHistory`, `predictedFundings`, `l2Book`, `candleSnapshot`, `spotMetaAndAssetCtxs` — in parallel, about one second.
- Development: `RILL_API_BASE=http://127.0.0.1:8787` points at a local backend; `RILL_HOME` moves the state directory; `RILL_HL_INFO_URL` points at a fake Hyperliquid.

## Attribution

- Data layer modelled on [`himself65/finance-skills`](https://github.com/himself65/finance-skills) `hyperliquid-reader` (MIT): the seven read-only commands and the normalization rules (funding APR = rate ÷ interval hours × 24 × 365, `oiNotional`, premium, spot base-token resolution, `@index` mid resolution, per-venue funding intervals). Rewritten as zero-dependency scripts.
- Skill structure modelled on [`himself65/trade-skills`](https://github.com/himself65/trade-skills) (MIT): always-on rules + command table + routing in `SKILL.md`, lazy-loaded `references/commands/*.md`, OKF-frontmatter pitfalls. Their generic rules p4 / p5 / p28 / p29 / p30 / p31 are rewritten for perps and credited in the files.

MIT License.
