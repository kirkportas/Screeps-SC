# <img src="icons/icon48.png" width="24"> Screeps-SC
Modular chrome extension for the game [screeps.com](https://screeps.com/).

## Installation
The extension uses Manifest V3 and works in both Chrome and Firefox from the same folder.

### Chrome
1. Go to `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select the Screeps-SC folder.

### Firefox
1. Go to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...** and select `manifest.json` in the Screeps-SC folder.
3. Firefox treats host permissions as optional in Manifest V3: open `about:addons -> Screeps SC -> Permissions` and enable access for `screeps.com` (and `leagueofautomatednations.com` if you use the alliance map), or the modules will not inject.

Note: a temporary add-on is removed when Firefox restarts. For a permanent install the extension must be signed (e.g. `web-ext sign` with an unlisted listing on addons.mozilla.org), or use Firefox Developer Edition/Nightly with `xpinstall.signatures.required` set to `false` in `about:config`.

## Module Details & Screenshots
See [MODULES.md](MODULES.md) for a description and screenshot of every module.
Credit to Stybbe and Geir for these, this fork modernizes and adds a little polish.

- [map.alliance](modules/map.alliance.js)
- [market.history](modules/market.history.js)
- [market.my.resources](modules/market.my.resources.js)
- [profile.gcl](modules/profile.gcl.js)
- [rank.leaderboard](modules/rank.leaderboard.js)
- [room.console.icons](modules/room.console.icons.js)
- [room.creep.names](modules/room.creep.names.js)
- [world.battle.radar](modules/world.battle.radar.js)

Also take a look at the [settings.json](settings.json) to see the module configuration.

## Create your own module
1. Create a new javascript file under the `/modules` folder.
2. Add these functions to your javascript file: `module.exports.init = function(){...}` and `module.exports.update = function(){...}`
3. Add your module to the `modules` array in the `settings.json` file.
   * `path` The path to your javascript file.
   * `runAt` Parameter when your module will run. It has two child parameters `onUpdate` and `onCompleted`
      * `onUpdate` The module will run when a screeps site has loaded a page that starts with the given value in this setting. For more information see [google API for onUpdated](https://developer.chrome.com/extensions/tabs#event-onUpdated).
      * `onCompleted` The module will run when any screeps webrequest is completed that starts with the given value in this setting. For more information see [google API for onCompleted](https://developer.chrome.com/extensions/webRequest#event-onCompleted).
   * `options` Not a required field. It is used to manage manual user configuration for the module
      * `image` The path to an image to be displayed for the module in the settings page
      * `config` Array with configuration elements for the settings page
4. Reload the plugin at `Settings -> Extensions -> Screeps SC -> Reload`

## How it works
1. On browser startup the extension will start listening on requests made to and from `*://screeps.com/*`.
2. When a url for a request starts with a given value in `onUpdate` or `onCompleted` the background thread will execute the module `path` connected to the `onUpdate` or `onCompleted`.
3. The `content.js` script will inject the `module.js` script together with the executed module. The executed module can access any function in the `module.js` script. Each module has their own `module.js` and it contains two module specific parameters `module.name` and `module.confg` (if you have set up a config in the `settings.json`).
4. If it's the first time the module is injected to the page session the `module.exports.init` function will be called in the module. All other `onUpdate` or `onCompleted` triggers will call the `module.exports.update` function.

## [FAQ](https://github.com/stybbe/Screeps-SC/wiki/FAQ)

## References
- [stybbe/Screeps-SC](https://github.com/stybbe/Screeps-SC) — the original extension this project is forked from
- [geir1983](https://github.com/geir1983) — intermediate fork with shard2/3 battle radar support and other fixes
