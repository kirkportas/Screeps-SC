# Module Reference & Verification Checklist

Status as of 2026-07-07, after the Manifest V3 port (Chrome + Firefox). Legend:
✅ verified working · 🔄 fixed, awaiting re-test · ⬜ not yet verified · ❌ broken

| Module | Status | Where it appears |
|---|---|---|
| [profile.gcl](#profilegcl) | ✅ | Any player profile page |
| [map.alliance](#mapalliance) | ✅ | World map (owner layer, zoom 3) |
| [world.battle.radar](#worldbattleradar) | ✅ | Left menu button, above "World" |
| [navbar.bucket](#navbarbucket) | ✅ | Expanded profile sysbar (top-right) |
| [market.history](#markethistory) | ✅ | Market → money history |
| [market.my.resources](#marketmyresources) | ❌ | Market page |
| [market.deal](#marketdeal) | ✅ | Market → cpuUnlock / accessKey / pixel |
| [rank.leaderboard](#rankleaderboard) | ✅ | Leaderboard pages |
| [room.creep.names](#roomcreepnames) | ✅ | Room view |
| [room.console.icons](#roomconsoleicons) | ✅ | Room view console |

All LOAN-based modules require the `leagueofautomatednations.com` host permission
(in Firefox: `about:addons → Screeps SC → Permissions`).

---

## profile.gcl

- **File:** `modules/profile.gcl.js`
- **Trigger:** navigating to `https://screeps.com/a/#!/profile/`
- **What it does:** adds a GCL progress bar with a "points until next level"
  calculation to any player's profile page (the site only shows this for yourself).
- **Verify:** open another player's profile; a GCL bar appears in the stats area.
- **Status:** ✅ verified 2026-07-07 (Firefox).

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

## navbar.bucket

- **File:** `modules/navbar.bucket.js`
- **Trigger:** completion of `https://screeps.com/api/user/world-status` (fires on login/refresh)
- **What it does:** adds a live **CPU bucket meter** ("Bucket: n / 10000") beneath the
  Memory bar in the expanded profile sysbar. Opens its own console websocket to poll
  the value; clicking the profile button again closes the socket.
- **Verify:** click your profile button in the top navbar; a Bucket bar appears under
  Memory and fills with a live value.
- **Status:** ✅ verified 2026-07-07.

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

## market.my.resources

- **File:** `modules/market.my.resources.js`
- **Trigger:** market page navigation, or completion of `/api/game/market/orders-index`
- **What it does:** a personal resource dashboard on the market page: aggregates
  energy, power, base minerals, and all boost tiers (T1/T2/T3 compounds) across your
  rooms' storages and terminals.
- **Verify:** open the Market section; a "my resources" overview panel appears.
- **Status:** ❌ broken 2026-07-07 — written against the legacy AngularJS market, but
  the market is now the app2 (Angular Material) UI, so its `getScopeData("market", …)`
  hooks and `.market.ng-scope` injection anchor no longer exist. Needs an app2 port
  (like `market.deal`).

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

## rank.leaderboard

- **File:** `modules/rank.leaderboard.js`
- **Trigger:** navigating to `https://screeps.com/a/#!/rank/`
- **Needs:** LOAN host permission (`alliances.js` + logos).
- **What it does:** adds each player's alliance (logo + link to their LOAN page) to
  leaderboard rows.
- **Verify:** open the leaderboard; rows show an extra alliance column.
- **Status:** ✅ verified 2026-07-07.

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
