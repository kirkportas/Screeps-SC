# Submitting to addons.mozilla.org

Build the packages with `./build.sh` (produces `screeps-sc-firefox.zip` containing only the
files the extension ships). Validate with `npx addons-linter@latest screeps-sc-firefox.zip`
before uploading. `./build.sh` also emits `screeps-sc-chrome.zip` for the Chrome Web Store.

## Notes for the reviewer

Paste into the "Notes to reviewer" field.

Screeps SC adds UI conveniences to the browser client of the game screeps.com
(alliance overlays, market helpers, a battle radar, console shortcuts). It is a
Manifest V3 fork of Stybbe and Geir's original Screeps-SC, modernized with a few
new modules.

**Testing.** All modules run on the logged-in game client, so a screeps.com
account is required (free signup at https://screeps.com). After installing, open
the extension's options page and click "Enable access" to grant the screeps.com
host permission — Firefox withholds it on install — then reload screeps.com.

**No remote code.** Three modules fetch `alliances.js` / `rooms.js` from
leagueofautomatednations.com. Despite the `.js` extension these are JSON data
files; every call site parses them with `JSON.parse` and never executes them
(map.alliance.js, world.battle.radar.js, rank.leaderboard.js). content.js injects
a `<script>` into the page world, but it is the extension's own bundled module
code being placed where it can reach the game's Angular scope — nothing fetched is
executed.

**Third-party code.** The only bundled library is vendor/mousetrap.min.js
(v1.6.5, unmodified, https://craig.is/killing/mice), a small keyboard-shortcut
library. The room.console.icons module uses it to let the user bind their own
hotkeys to in-game console commands — a convenience while playing. The `$`,
`angular`, and `_` globals the modules use belong to the screeps.com page itself
and are not shipped.

**Data.** Nothing is sent to the developer. The auth token is read from
screeps.com's own localStorage and returned only to screeps.com's API (as
`X-Token`) to carry out actions the logged-in user initiates, such as market
deals. `data_collection_permissions` is set to `none`.

**Permissions.**
- `storage` — per-module enable/config state.
- `tabs` + `webRequest` — detect screeps.com page and API navigation to know when
  to inject a module.
- `scripting` — inject the module code into the page.
- host `screeps.com` — the application itself.
- host `leagueofautomatednations.com` — public alliance/room data (above).

The battle radar and the market helpers follow whichever shard the user is
viewing or owns rooms on; the shard "shardX" is only a fallback used when none
can be resolved.

## Listing metadata

- **Name:** Screeps SC — unofficial UI tools
- **Summary:** UI conveniences for the screeps.com game client. Not affiliated
  with Screeps.
- **Categories:** Games / Other
- **Description:**

**Screeps SC** adds UI conveniences to the **screeps.com** browser client — alliance map overlays, a battle radar, market helpers, and console shortcuts — rendered directly into the game's own pages. An actively maintained Manifest V3 fork of Stybbe & Geir's original Screeps-SC.

**Modules**

- **Alliance map overlay** - washes alliance territory across the world map and adds an "Alliance" line under room owners.
- **Battle radar** - a left-menu radar with two tabs: active nukes (attacker/defender, launch & landing rooms, landing countdown) and current PvP hotspots, following the shard you're viewing.
- **Market helpers** - money-history charts, a "my resources / open orders" overview, and one-click cpuUnlock / access-key / pixel deal shortcuts.
- **Profile & leaderboard** - a GCL progress bar (with "points to next level") on any player's profile, plus leaderboard enhancements.
- **Room extras** - creep name labels in the room view and bindable hotkey icons for your console commands.
- **Bucket bar** - a CPU-bucket readout in the profile sysbar.

Every module can be toggled and configured on the extension's options page.

**Setup:** after installing, open the options page and click **Enable access** to grant the screeps.com host permission (Firefox withholds it on install), then reload screeps.com.

Unofficial - not affiliated with or endorsed by Screeps. No data is collected; the extension sends nothing to the developer.
- **License:** MIT (see LICENSE).
- **Privacy policy:** This add-on does not collect, store, or transmit any
  personal data to the developer or any third party. It reads your screeps.com
  session token from the page only to make requests back to the screeps.com API
  on your behalf.
