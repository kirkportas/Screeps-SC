# Module Reference & Verification Checklist

Status as of 2026-07-07, after the Manifest V3 port (Chrome + Firefox). Legend:
✅ verified working · 🔄 fixed, awaiting re-test · ⬜ not yet verified

| Module | Status | Where it appears |
|---|---|---|
| [profile.gcl](#profilegcl) | ✅ | Any player profile page |
| [map.alliance](#mapalliance) | ✅ | World map (owner layer, zoom 3) |
| [world.battle.radar](#worldbattleradar) | 🔄 | Left menu button, above "World" |
| [navbar.bucket](#navbarbucket) | ⬜ | Expanded profile sysbar (top-right) |
| [market.history](#markethistory) | ⬜ | Market → money history |
| [market.my.resources](#marketmyresources) | ⬜ | Market page |
| [rank.leaderboard](#rankleaderboard) | ⬜ | Leaderboard pages |
| [room.creep.names](#roomcreepnames) | ⬜ | Room view |
| [room.console.icons](#roomconsoleicons) | ⬜ | Room view console |

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
- **Status:** 🔄 fixed 2026-07-07 (waits for `.left-controls` to render before
  inserting the button) — awaiting re-test.

## navbar.bucket

- **File:** `modules/navbar.bucket.js`
- **Trigger:** completion of `https://screeps.com/api/user/world-status` (fires on login/refresh)
- **What it does:** adds a live **CPU bucket meter** ("Bucket: n / 10000") beneath the
  Memory bar in the expanded profile sysbar. Opens its own console websocket to poll
  the value; clicking the profile button again closes the socket.
- **Verify:** click your profile button in the top navbar; a Bucket bar appears under
  Memory and fills with a live value.
- **Status:** ⬜ not yet verified.

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
- **Status:** ⬜ not yet verified.

## market.my.resources

- **File:** `modules/market.my.resources.js`
- **Trigger:** market page navigation, or completion of `/api/game/market/orders-index`
- **What it does:** a personal resource dashboard on the market page: aggregates
  energy, power, base minerals, and all boost tiers (T1/T2/T3 compounds) across your
  rooms' storages and terminals.
- **Verify:** open the Market section; a "my resources" overview panel appears.
- **Status:** ⬜ not yet verified.

## rank.leaderboard

- **File:** `modules/rank.leaderboard.js`
- **Trigger:** navigating to `https://screeps.com/a/#!/rank/`
- **Needs:** LOAN host permission (`alliances.js` + logos).
- **What it does:** adds each player's alliance (logo + link to their LOAN page) to
  leaderboard rows.
- **Verify:** open the leaderboard; rows show an extra alliance column.
- **Status:** ⬜ not yet verified.

## room.creep.names

- **File:** `modules/room.creep.names.js`
- **Trigger:** navigating to `https://screeps.com/a/#!/room/`
- **What it does:** hooks the room-view "Show hostile names" setting so enemy creeps
  get visible name labels (smallest module, ~30 lines).
- **Verify:** open a room with hostile creeps and toggle "Show hostile names" in the
  room display settings.
- **Status:** ⬜ not yet verified.

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
- **Status:** ⬜ not yet verified.

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
