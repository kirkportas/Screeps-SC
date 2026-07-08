# Module Reference & Verification Checklist

Status as of 2026-07-07, after the Manifest V3 port (Chrome + Firefox). Legend:
✅ verified working · 🔄 fixed, awaiting re-test · ⬜ not yet verified · ❌ broken

| Module | Status | Client | Where it appears |
|---|---|---|---|
| [profile.gcl](#profilegcl) | ✅ | app1 | Any player profile page |
| [map.alliance](#mapalliance) | ✅ | app1 | World map (owner layer, zoom 3) |
| [world.battle.radar](#worldbattleradar) | ✅ | app1 | Left menu button, above "World" |
| [navbar.bucket](#navbarbucket) | ✅ | app1 | Expanded profile sysbar (top-right) |
| [market.history](#markethistory) | ✅ | app2 | Market → money history |
| [market.my.resources](#marketmyresources) | ✅ | app2 | Market page |
| [market.deal](#marketdeal) | ✅ | app2 | Market → cpuUnlock / accessKey / pixel |
| [rank.leaderboard](#rankleaderboard) | ✅ | app1 | Leaderboard pages |
| [room.creep.names](#roomcreepnames) | ✅ | app1 | Room view |
| [room.console.icons](#roomconsoleicons) | ✅ | app1 | Room view console |

The **Client** column records which generation of the screeps.com web client each
module hooks — see [Client compatibility](#client-compatibility-app1--app2) below.

All LOAN-based modules require the `leagueofautomatednations.com` host permission
(in Firefox: `about:addons → Screeps SC → Permissions`).

---

## Client compatibility (app1 / app2)

The screeps.com web client exists in two generations, and every module in this
extension works by hooking that client's DOM/scope — none are truly
client-agnostic. Knowing which generation a module targets is what determines
whether it keeps working as the site evolves.

- **app1** — the legacy **AngularJS** client. Modules read the page's Angular scope
  (`module.getScopeData` / `setScopeData`, `angular.element(...).scope()`), match
  `ng-scope` / `ng-binding` classes, and manipulate the DOM through global jQuery
  (`$`) against app1 selectors like `.left-controls`, `.stats-controls`,
  `.sysbar.ng-scope`, `.console-controls`, and `.table.table-striped`.
- **app2** — the newer **Angular (Material)** client. Modules target `app-*` custom
  elements (`app-market`, `app-section-header`), the Material data grid
  (`mat-table` / `mat-row` / `mat-cell`), and CDK column classes (`.cdk-column-*`).

**Why app1 coupling is a long-term breakage risk:** as screeps.com migrates pages
from the AngularJS client to app2, the app1 scope objects, `ng-scope` markup, and
legacy selectors that these modules depend on disappear. When that happens an
app1-coupled module fails **silently** — the page still loads, but the injected
scope read returns nothing and the enhancement just never appears, with no error.
The `Status` column above reflects verification against the client generation the
module targets *today*; it is not a promise the target page will stay on app1.

**Porting backlog (still app1-dependent):**

- `profile.gcl` — reads the `profile` AngularJS scope; anchors on `.stats-controls`.
- `map.alliance` — reads the `WorldMap` scope; matches `ng-binding` / `ng-scope`
  room and sector elements.
- `world.battle.radar` — reads the `navbar` (`Top`) scope; inserts into
  `.left-controls`.
- `navbar.bucket` — inserts under `.sysbar.ng-scope .mem`, keyed off
  `.navbar-profile-btn`.
- `rank.leaderboard` — reads the leaderboard scope via
  `angular.element(...).scope()`; rewrites `.table.table-striped` rows.
- `room.creep.names` — reads the `room` (`Room.objects`) scope.
- `room.console.icons` — reads the `console` (`Console`) and `room` (`Room`) scopes
  via `angular.element(...).scope()`; anchors on `.console-controls`.

**Already on app2 (no action needed):** `market.my.resources` and `market.deal`
were ported to the Angular Material market page, and `market.history` hooks the
app2 `mat-table`. See each module's section for anchor details.

---

## profile.gcl

- **File:** `modules/profile.gcl.js`
- **Trigger:** navigating to `https://screeps.com/a/#!/profile/`
- **What it does:** adds a GCL progress bar with a "points until next level"
  calculation to any player's profile page (the site only shows this for yourself).
- **Verify:** open another player's profile; a GCL bar appears in the stats area.
- **Status:** ✅ verified 2026-07-07 (Firefox).

![GCL progress bar on a player profile](images/screeps-sc-gcl-bar.png)

## map.alliance

- **File:** `modules/map.alliance.js`
- **Trigger:** navigating to `https://screeps.com/a/#!/map`
- **Needs:** LOAN host permission (`alliances.js` + alliance logos).
- **What it does:** overlays alliance territory on the world map. Colors come from a
  fixed 56-color palette indexed by the alliance's LOAN GCL rank, drawn at 0.2 alpha.
  Hovering a room adds an "Alliance:" line under the owner name. Options page setting
  `background` switches the fill from color to the alliance's LOAN logo.
- **Caveats:** only draws on the **owner layer at zoom level 3**; colors shift when an
  alliance's GCL rank changes, and ranks 56 apart collide.
- **Verify:** world map → owner layer, zoom 3; alliance rooms get translucent color washes.
- **Status:** ✅ verified 2026-07-07 (Firefox) — after switching LOAN URLs to https.

![Alliance territory overlay on the world map](images/screeps-sc-alliance-overlay.png)

## world.battle.radar

- **File:** `modules/world.battle.radar.js` (largest module, ~1.3k lines)
- **Trigger:** any page under `https://screeps.com/a/#!/`
- **Needs:** LOAN host permission (shardX room data + alliances).
- **What it does:** adds a radar button to the left menu controls. Opens a modal with
  two tabs: **Active Nukes** (defender/attacker, alliances, launch and landing rooms,
  landing countdown) and **Current PvP** hotspots.
- **Caveats:** tracks **only shardX** — the shard is pinned via
  `module.exports.radarShard` at the top of the module (change it there to watch a
  different shard). Init logs `[battle.radar]` breadcrumbs to the page console.
- **Verify:** hard-refresh any screeps page; console shows the `[battle.radar]` trail
  ending in `button inserted: 1`; radar icon appears above "World" in the left menu.
- **Status:** ✅ verified 2026-07-07 (Firefox). The button self-heals via a
  rAF-coalesced `MutationObserver` that re-inserts it whenever Angular re-renders
  `.left-controls` (e.g. loading the room view).

![Battle radar — Active Nukes tab](images/screeps-sc-battle-radar-nukes.png)
![Battle radar — Current PvP tab](images/screeps-sc-battle-radar-pvp.png)

## navbar.bucket

- **File:** `modules/navbar.bucket.js`
- **Trigger:** completion of `https://screeps.com/api/user/world-status` (fires on login/refresh)
- **What it does:** adds a live **CPU bucket meter** ("Bucket: n / 10000") beneath the
  Memory bar in the expanded profile sysbar. Opens its own console websocket to poll
  the value; clicking the profile button again closes the socket.
- **Verify:** click your profile button in the top navbar; a Bucket bar appears under
  Memory and fills with a live value.
- **Status:** ✅ verified 2026-07-07.

![Live CPU bucket meter under the Memory bar](images/screeps-sc-bucket-bar.png)

## market.history

- **File:** `modules/market.history.js`
- **Trigger:** completion of `https://screeps.com/api/user/money-history`
- **What it does:** replaces the market money-history view with a richer table: pages
  through `/api/user/money-history` itself, de-duplicates entries, resolves your rooms
  per shard, and computes room-to-room distances for market deals.
- **Caveats:** reads your user id from `localStorage` with an `/api/auth/me` fallback;
  verbose debug logging left in from earlier work.
- **Verify:** Market → money history; the table gains extra detail/pagination beyond
  the stock view.
- **Status:** ✅ verified 2026-07-07.

![Enriched market money-history table](images/screeps-sc-order-history-ui.png)

## market.my.resources

- **File:** `modules/market.my.resources.js`
- **Trigger:** market page navigation, or completion of `/api/game/market/orders-index`
- **What it does:** a personal resource dashboard on the app2 (Angular Material)
  market page: aggregates energy, power, base minerals, and all boost tiers
  (T1/T2/T3 compounds) across your rooms' storages and terminals, with a dropdown
  (None / Storage & Terminal / Storage / Terminal) persisted to `localStorage`
  (`scMarketDropdown`). Holdings are fetched via a console expression that builds
  `window.SCMarket`, read back over a console websocket.
- **Caveats:** app2-based port. The panel is injected via a rAF-coalesced
  `MutationObserver` (self-heals when Angular re-renders the market) immediately
  **after `<app-section-header>` inside `<app-market>`** — just below the market tab
  nav (All orders / My orders / History), above the resource content (see
  `module.exports.injectionAnchor`). It is **scoped to the All-orders view**
  (`#!/market/all…`) and is torn down (panel removed + socket closed) on My orders /
  History. The holdings console expression runs on the shard embedded in a mineral
  market URL, else `module.exports.resourcesShard` (pinned to `shardX`, or
  auto-detected from your rooms) — never a silent shard0 fallback. Logs
  `[market.resources]` breadcrumbs to the page console.
- **Verify:** open the Market section; a "My resources" overview panel appears above
  the order table and the amount spans populate with your storage/terminal totals.
- **Status:** ✅ verified 2026-07-07 (ported to app2; panel anchored after
  `<app-section-header>`, boost-effect labels added).

![My resources stockpile panel above the order table](images/screeps-sc-orders-stockpile-ui.png)

## market.deal

- **File:** `modules/market.deal.js`
- **Trigger:** market page navigation (`https://screeps.com/a/#!/market/all/`), or
  completion of `https://screeps.com/api/game/market/orders`
- **What it does:** adds a green **Deal** button to every order row on the
  **account-level resource** pages only — `cpuUnlock`, `accessKey`, `pixel`
  (`.../market/all/cpuUnlock` etc.). Clicking a row's Deal button opens an inline
  form: an amount field pre-filled with the order's remaining amount, plus a
  **Confirm** button that stays disabled for a 4-second countdown (`Confirm (4)…`)
  as an anti-double-click safeguard, and a **×** cancel. Confirm runs
  `Game.market.deal(id, amount)` through the in-game console; a console websocket
  (subscribed to `user:<id>/console`) watches for the `SC-Deal:<code>:<id>`
  sentinel and flashes the row green **OK** or red with the error code
  (e.g. `-6 no resources`, `-10 invalid args`) before reverting.
- **Caveats:** intentionally does **not** appear on mineral / commodity resources,
  because `Game.market.deal` for those needs a target room this module doesn't
  handle. Both buy and sell orders get a button — `Game.market.deal(id, amount)`
  works for either. Order `_id` and remaining amount are read live from the row's
  CDK cells at click time (rows are recycled by Angular, so nothing is cached on the
  element). Injection self-heals via a rAF-coalesced `MutationObserver`. If the
  feedback socket can't open, the deal is still sent (just without the live flash).
  Logs `[market.deal]` breadcrumbs to the page console.
- **Verify:** open Market → `cpuUnlock` (or `accessKey` / `pixel`); each order row
  gets a green Deal button on the right. Click it, wait for the countdown, Confirm;
  the row flashes OK/error and the console shows the `[market.deal]` trail.
- **Status:** ✅ verified 2026-07-07 — deals execute on shardX
  (`module.exports.dealShard`) and the row flashes the result.

![Deal button on account-resource order rows](images/screeps-sc-market-deal-ui.png)
![Inline confirm form with anti-double-click countdown](images/screeps-sc-market-deal-confirm.png)

## rank.leaderboard

- **File:** `modules/rank.leaderboard.js`
- **Trigger:** navigating to `https://screeps.com/a/#!/rank/`
- **Needs:** LOAN host permission (`alliances.js` + logos).
- **What it does:** adds each player's alliance (logo + link to their LOAN page) to
  leaderboard rows.
- **Verify:** open the leaderboard; rows show an extra alliance column.
- **Status:** ✅ verified 2026-07-07.

![Alliance logos and links added to leaderboard rows](images/screeps-sc-leaderboard-enhancements.png)

## room.creep.names

- **File:** `modules/room.creep.names.js`
- **Trigger:** navigating to `https://screeps.com/a/#!/room/`
- **What it does:** draws each creep's name as a text label on the creep in the room
  view. Reads the AngularJS `Room.objects` scope, filters for creeps, and writes each
  one's `name` into its SVG `<text>` node — so hostile creeps get on-screen name tags,
  not just your own. Re-runs when the native "Show hostile names" toggle changes
  (smallest module, ~30 lines).
- **Verify:** open a room with hostile creeps and toggle "Show hostile names" in the
  room display settings; enemy creeps show name labels.
- **Status:** ✅ verified 2026-07-07.

## room.console.icons

- **File:** `modules/room.console.icons.js`
- **Trigger:** navigating to `https://screeps.com/a/#!/room/`
- **What it does:** adds customizable **console macro buttons** to the room view:
  each button fires a console command templated with the current room name, selected
  object id, and mouse x/y coordinates. Also binds keyboard shortcuts via Mousetrap.
- **Caveats:** Mousetrap v1.6.5 is vendored at `vendor/mousetrap.min.js` and loaded
  via `web_accessible_resources` (previously fetched from a third-party CDN at
  runtime).
- **Verify:** open a room; macro icon buttons appear near the console input.
- **Status:** ✅ verified 2026-07-07 (Mousetrap loads from the vendored copy).

![Console macro buttons in the room view](images/screeps-sc-console-icon-create.png)
![Adding a new console macro command](images/screeps-sc-console-icon-add-command.png)

---

## Fixes applied in the 2026-07 modernization

- Manifest V2 → V3, dual-browser (Chrome service worker / Firefox event page).
- Code-string injection replaced with `scripting.executeScript` (MV3 requirement).
- Firefox: injection no longer treated as failed when a module file's completion
  value isn't structured-clonable.
- All `leagueofautomatednations.com` URLs switched from `http://` to `https://`
  (data fetches and logo images; logos were blocked as mixed content).
- Battle radar waits for `.left-controls` to render before inserting its button.
- Modules disabled on the options page are now actually skipped (previously they
  were injected anyway, just without config).
- Battle radar pinned to shardX only (`module.exports.radarShard`); the shard0–3
  fetch chain was removed.
- Mousetrap vendored into `vendor/mousetrap.min.js` (was loaded from a third-party
  CDN at runtime); page-world modules can load vendored files via
  `module.extensionUrl` + `web_accessible_resources`.
