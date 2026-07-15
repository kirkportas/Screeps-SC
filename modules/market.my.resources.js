// Each modules/*.js is loaded into the page world as its own extension-origin script
// (see module.js). The IIFE keeps `module` private to this file so modules sharing a page
// do not overwrite each other; ScreepsSC.begin/end hand out the instance and start it.
(function () {
var module = ScreepsSC.begin(document.currentScript);

/**
 * "My resources" market panel (app2 port).
 *
 * Renders a personal holdings overview on the modern Angular Material ("app2")
 * market page: how much of each resource you hold across your rooms' storages &
 * terminals, grouped into Base minerals/energy/power and boost Tier1/Tier2/Tier3,
 * with a dropdown (None / Storage & Terminal / Storage / Terminal) so you can see
 * your stock while trading.
 *
 * The holdings themselves are fetched framework-agnostically: a console expression
 * builds window.SCMarket (per-room storage + terminal stores) and a console
 * websocket eval's the returned <script> payload. That round-trip is unchanged in
 * spirit from the legacy version — only the shard it runs on and the DOM injection
 * were ported off AngularJS.
 */

// Which shard the holdings expression is executed on. Must be a shard with a live
// runtime or the console expression is never evaluated. The active shard is chosen
// by module.exports.activeShard() with this priority:
//   1. resourcesShard below — a hard code-level pin (normally "" / unset).
//   2. the in-panel Shard dropdown selection, persisted in localStorage
//      ("scMarketShard", shared with market.deal so both pages track one choice).
//   3. autoShard — the shard you own the MOST rooms on (filled by resolveShard);
//      that is where your stockpile lives, so it is the sensible default.
//   4. "shardX" as a last resort.
module.exports.resourcesShard = "";
module.exports.autoShard = "";

// localStorage key + document-event name shared with market.deal so the two shard
// dropdowns (both visible together on e.g. #!/market/all/pixel) stay in sync.
module.exports.SHARD_KEY = "scMarketShard";
module.exports.SHARD_EVENT = "sc-market-shard-changed";

module.exports.init = function () {
  console.log("[market.resources] init");

  module.exports.base = ["energy", "power", "H", "O", "U", "L", "K", "Z", "X"];
  module.exports.tier1 = ["UH", "UO", "KH", "KO", "LH", "LO", "ZH", "ZO", "GH", "GO", "OH", "ZK", "UL", "G"];
  module.exports.tier2 = ["UH2O", "UHO2", "KH2O", "KHO2", "LH2O", "LHO2", "ZH2O", "ZHO2", "GH2O", "GHO2"];
  module.exports.tier3 = ["XUH2O", "XUHO2", "XKH2O", "XKHO2", "XLH2O", "XLHO2", "XZH2O", "XZHO2", "XGH2O", "XGHO2"];

  // The market URL usually carries no shard, so getCurrentShard() would fall back
  // to shard0 and the fetch would never run for players not active there. Resolve
  // the shard we actually run code on up front (mirrors market.deal.resolveShard).
  module.exports.resolveShard();

  // Re-inject the panel whenever app2 re-renders the market (Angular wipes our
  // injected node on sort / shard change / route change). Same rAF-coalesced
  // MutationObserver + initial-pass pattern as market.deal's ensureButtons.
  function ensurePanel() {
    // Only the "All orders" market view gets the panel. On My orders / History
    // (or off-market) it must not be present — tear it down if a previous view
    // left it behind, and drop the now-useless holdings socket.
    if (!module.exports.onAllOrdersView()) {
      if (document.getElementById("sc-my-resources")) {
        $("#sc-my-resources").remove();
        console.log("[market.resources] panel removed (left All orders view)");
      }
      module.exports.closeSocket();
      return;
    }
    if (document.getElementById("sc-my-resources")) return; // already injected

    var anchor = module.exports.injectionAnchor();
    if (!anchor) return; // section header not rendered yet — try again on next mutation

    // Land the panel right after <app-section-header> inside <app-market>, i.e.
    // just below the tab nav and above the resource content.
    module.exports.buildPanel().insertAfter(anchor);
    // Fill the shard dropdown now that it is in the DOM (options come from the async
    // resolveShard; refresh again here so a re-injected panel gets them immediately).
    module.exports.refreshShardDropdown();
    module.exports.updateResourceLinks();
    console.log("[market.resources] panel injected");

    // Open the holdings feedback socket once (reopened here if it was closed by a
    // previous hashchange away from the market).
    if (!module.exports.socket) {
      module.exports.listenToConsole();
    }
  }
  module.exports.ensurePanel = ensurePanel;

  // Delegated so it survives Angular recycling the panel node.
  var body = $("body");
  body.off(".scres");
  body.on("change.scres", "#sc-dropdown", function () {
    if (this.value == "None") {
      $("#container4").hide();
    } else {
      $("#container4").show();
      module.exports.fetchResources();
    }
    localStorage.setItem("scMarketDropdown", this.value);
  });

  // Shard dropdown: persist the choice (shared with market.deal), re-point the tab
  // links, refetch the holdings for the new shard, and tell the other module.
  body.on("change.scres", "#sc-shard-dropdown", function () {
    localStorage.setItem(module.exports.SHARD_KEY, this.value);
    module.exports.applyShardSelection();
    document.dispatchEvent(
      new CustomEvent(module.exports.SHARD_EVENT, { detail: this.value })
    );
  });

  // Another market module (market.deal) changed the shared shard — mirror it here.
  document.removeEventListener(module.exports.SHARD_EVENT, module.exports.onShardEvent);
  module.exports.onShardEvent = function () {
    module.exports.refreshShardDropdown();
    module.exports.applyShardSelection();
  };
  document.addEventListener(module.exports.SHARD_EVENT, module.exports.onShardEvent);

  ensurePanel();

  if (module.exports.panelObserver) {
    module.exports.panelObserver.disconnect();
  }
  var checkQueued = false;
  module.exports.panelObserver = new MutationObserver(function () {
    if (checkQueued) return;
    checkQueued = true;
    requestAnimationFrame(function () {
      checkQueued = false;
      ensurePanel();
    });
  });
  module.exports.panelObserver.observe(document.body, { childList: true, subtree: true });

  // Leaving the All orders view (to another tab or off-market) -> tear down the
  // panel and drop the console socket. ensurePanel handles both, so just re-run it.
  $(window).on("hashchange.scres", function () {
    ensurePanel();
  });
};

module.exports.update = function () {
  if (module.exports.ensurePanel) {
    module.exports.ensurePanel();
  }
};

module.exports.onMarketPage = function () {
  return window.location.href.indexOf("https://screeps.com/a/#!/market/") === 0;
};

// True only on the "All orders" market view (#!/market/all...). The panel is
// scoped to this view; My orders (#!/market/my) and History (#!/market/history)
// must never show it.
module.exports.onAllOrdersView = function () {
  return window.location.href.indexOf("https://screeps.com/a/#!/market/all") === 0;
};

// The DOM node to insert the "My resources" panel immediately AFTER.
//
// TUNE THIS SELECTOR against the live app2 market DOM. app2 renders the market as
//   <app-market>
//     <app-section-header> ... tab nav (All orders / My orders / History) ...
//     <app-market-resource> ... resource content ...
// We anchor on <app-section-header> INSIDE <app-market> and drop the panel right
// after it (see ensurePanel's insertAfter), so it sits just below the tab nav and
// above the resource content. If the header hasn't rendered yet, return null and
// let the MutationObserver retry — never fall back to a wrong location.
module.exports.injectionAnchor = function () {
  var header = $("app-market app-section-header").first();
  if (header.length) return header[0];
  return null;
};

// The shard the holdings panel currently acts on. See the priority chain documented
// on module.exports.resourcesShard above.
module.exports.activeShard = function () {
  return (
    module.exports.resourcesShard ||
    localStorage.getItem(module.exports.SHARD_KEY) ||
    module.exports.autoShard ||
    "shardX"
  );
};

// Fetch the shards you own rooms on, ranked by room count, so the dropdown can list
// them (with counts) and autoShard can default to the one you own the most rooms on.
// Mirrors market.deal.resolveShard.
module.exports.resolveShard = function () {
  module.getOwnedShards(function (ranked) {
    if (ranked && ranked.length) {
      module.exports.shards = ranked;
      module.exports.autoShard = ranked[0].name;
      console.log(
        "[market.resources] shards " +
          ranked.map(function (s) { return s.name + "(" + s.count + ")"; }).join(", ") +
          "; active " +
          module.exports.activeShard()
      );
      module.exports.refreshShardDropdown();
      module.exports.updateResourceLinks();
    } else {
      console.warn(
        "[market.resources] could not resolve your shards from /api/user/rooms; fetch will fall back to " +
          module.exports.activeShard() +
          ". Set module.exports.resourcesShard manually if that is wrong."
      );
    }
  });
};

// (Re)populate the in-panel Shard dropdown from module.exports.shards and select the
// active shard. Built with the DOM API (not innerHTML) so shard names are never
// interpreted as markup. No-op until the panel and the shard list both exist.
module.exports.refreshShardDropdown = function () {
  var dd = document.getElementById("sc-shard-dropdown");
  if (!dd) return;

  var active = module.exports.activeShard();
  var shards = module.exports.shards;

  // Not resolved yet — keep a single option for the current active shard.
  var list = shards && shards.length ? shards : [{ name: active, count: null }];

  dd.textContent = "";
  list.forEach(function (s) {
    var opt = document.createElement("option");
    opt.value = s.name;
    opt.textContent = s.count === null ? s.name : s.name + " (" + s.count + ")";
    if (s.name === active) opt.selected = true;
    dd.appendChild(opt);
  });
};

// Point the resource tab links at the active shard's market pages.
module.exports.updateResourceLinks = function () {
  var shard = module.exports.activeShard();
  $("#sc-my-resources a.market-resource").each(function () {
    var res = this.id.replace("sc-", "");
    this.href = "https://screeps.com/a/#!/market/all/" + shard + "/" + res;
  });
};

// React to the active shard changing: re-point the links and refetch holdings
// (unless the display dropdown is None, in which case there is nothing to show).
module.exports.applyShardSelection = function () {
  module.exports.updateResourceLinks();
  if (localStorage.getItem("scMarketDropdown") !== "None") {
    module.exports.fetchResources();
  }
};

// Builds the "My resources" panel (dropdown + loading SVG + the four resource
// columns) as a detached jQuery element, applying the saved dropdown state.
module.exports.buildPanel = function () {
  var svg = module.exports.getLoadingSVG();

  // Self-contained block: float:none / position:static / box-sizing so the panel
  // never leaks layout onto app2's flexbox siblings (e.g. the .__resources card
  // row). The four resource columns are a plain flex row, not the old
  // float + relative-offset hacks that displaced the app2 layout.
  var bodyElement =
    $(`<div id="sc-my-resources" style="float:none;clear:both;position:static;box-sizing:border-box;width:100%;padding:20px 30px;">
            <div style="font-size: 15px;">My resources:</div>
            <select id="sc-dropdown" style="border-color: transparent;background: #444;color: #ccc;">
              <option value="None">None</option>
              <option value="Storage & Terminal" selected>Storage & Terminal</option>
              <option value="Storage">Storage</option>
              <option value="Terminal">Terminal</option>
            </select>
            <select id="sc-shard-dropdown" title="Shard the holdings are read from" style="border-color: transparent;background: #444;color: #ccc;margin-left: 6px;"></select>
            ${svg}
            <div id="container4" style="display:flex;flex-wrap:wrap;gap:20px;width:100%;margin-top:10px;box-sizing:border-box;">
                <div id="col1" style="flex:1;min-width:120px;overflow:hidden;">
                    <div style="color: #999;">Base: </div>
                </div>
                <div id="col2" style="flex:1;min-width:120px;overflow:hidden;">
                    <div style="color: #999;">Tier 1: </div>
                </div>
                <div id="col3" style="flex:1;min-width:120px;overflow:hidden;">
                    <div style="color: #999;">Tier 2: </div>
                </div>
                <div id="col4" style="flex:1;min-width:120px;overflow:hidden;">
                    <div style="color: #999;">Tier 3: </div>
                </div>
            </div>
        </div>`);

  var savedDrop = localStorage.getItem("scMarketDropdown");
  if (savedDrop) {
    var dropdownElement = bodyElement.find("#sc-dropdown");
    dropdownElement.val(savedDrop);

    if (savedDrop == "None") {
      bodyElement.find("#container4").hide();
    }
  }

  for (let i = 0; i < module.exports.base.length; i++) {
    bodyElement.find("#col1").append(module.exports.getTabElement(module.exports.base[i]));
  }

  for (let i = 0; i < module.exports.tier1.length; i++) {
    bodyElement.find("#col2").append(module.exports.getTabElement(module.exports.tier1[i]));
  }

  for (let i = 0; i < module.exports.tier2.length; i++) {
    bodyElement.find("#col3").append(module.exports.getTabElement(module.exports.tier2[i]));
  }

  for (let i = 0; i < module.exports.tier3.length; i++) {
    bodyElement.find("#col4").append(module.exports.getTabElement(module.exports.tier3[i]));
  }

  return bodyElement;
};

// Short boost-effect label shown after each boost compound in the panel, keyed by
// compound. Carry boosts are flat capacity; the rest are percentages; tough is
// damage reduction. Base minerals/energy have no entry (no label rendered).
module.exports.boostInfo = {
  // Tier 1
  UH: "Attack +100%", UO: "Harvest +200%", KH: "Carry +50", KO: "Ranged +100%",
  LH: "Build/Repair +50%", LO: "Heal +100%", ZH: "Dismantle +100%", ZO: "Move +100%",
  GH: "Upgrade +50%", GO: "Tough -30% dmg",
  // Tier 2
  UH2O: "Attack +200%", UHO2: "Harvest +400%", KH2O: "Carry +100", KHO2: "Ranged +200%",
  LH2O: "Build/Repair +80%", LHO2: "Heal +200%", ZH2O: "Dismantle +200%", ZHO2: "Move +200%",
  GH2O: "Upgrade +80%", GHO2: "Tough -50% dmg",
  // Tier 3
  XUH2O: "Attack +300%", XUHO2: "Harvest +600%", XKH2O: "Carry +150", XKHO2: "Ranged +300%",
  XLH2O: "Build/Repair +100%", XLHO2: "Heal +300%", XZH2O: "Dismantle +300%", XZHO2: "Move +300%",
  XGH2O: "Upgrade +100%", XGHO2: "Tough -70% dmg"
};

// A resource tab: an icon + (for boosts) an effect label + amount span. The href
// navigates to the app2 resource page (a plain link — no AngularJS scope poking);
// updateResourceAmount() fills the #sc-val-<resource> span.
module.exports.getTabElement = function (resource) {
  var shard = module.exports.activeShard();

  var desc = module.exports.boostInfo[resource];
  var descHtml = desc
    ? `<div class="sc-boost-desc" title="${desc}" style="flex:1;min-width:0;text-align:left;color:#9c9;font-size:11px;margin:0 6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${desc}</div>`
    : "";

  var tabElementText = `<a id="sc-${resource}" class="market-resource" href="https://screeps.com/a/#!/market/all/${shard}/${resource}" style="background: #333;padding: 8px 10px;margin-top: 3px;display: flex;align-items: center;justify-content: space-between;font-size: 14px;cursor: pointer;text-decoration: none;color: #eee;" onmouseover="this.style.backgroundColor='#444'" onmouseout="this.style.backgroundColor='#333'">
        <div class="resource-name" style="flex:0 0 auto;">
        <img src="https://s3.amazonaws.com/static.screeps.com/upload/mineral-icons/${resource}.png" style="margin-right: 3px;">
        </div>
        ${descHtml}
        <div id="sc-val-${resource}" style="flex:0 0 auto;margin-bottom:-6px">
            <svg class="uil-ellipsis" height="20px" preserveaspectratio="xMidYMid" viewbox="0 0 100 100" width="20px" xmlns="http://www.w3.org/2000/svg">
              <use xlink:href="#sc-svg-loading">
            </svg>
        </div>
        </a>`;

  return $(tabElementText);
};

module.exports.updateResourceAmount = function () {
  if (window.SCMarket) {
    var flag = localStorage.getItem("scMarketDropdown");
    var sum = {};

    $('div[id^="sc-val-"]').html("0");

    for (let roomName in window.SCMarket) {
      let room = window.SCMarket[roomName];

      if (flag == "Storage & Terminal" || flag == "Storage") {
        for (let mineral in room.storage) {
          if (!sum[mineral]) {
            sum[mineral] = 0;
          }

          if (room.storage[mineral]) {
            sum[mineral] += room.storage[mineral];
          }
        }
      }

      if (flag == "Storage & Terminal" || flag == "Terminal") {
        for (let mineral in room.terminal) {
          if (!sum[mineral]) {
            sum[mineral] = 0;
          }

          if (room.terminal[mineral]) {
            sum[mineral] += room.terminal[mineral];
          }
        }
      }
    }

    for (let mineral in sum) {
      if (sum[mineral] > 0) {
        var l10nEN = new Intl.NumberFormat("en-US");
        var amount = l10nEN.format(sum[mineral]);
        $(`#sc-val-${mineral}`).text(amount);
      }
    }
  }
};

module.exports.fetchResources = function () {
  var command =
    'console.log("SC-Resources:"+(function(){var a={};for(var b in Game.rooms){var c=Game.rooms[b];c&&c.controller&&c.controller.my&&c.controller.level>=4&&(a[b]={},a[b].storage=c.storage?c.storage.store:{},a[b].terminal=c.terminal?c.terminal.store:{})}return JSON.stringify(a)})());';

  $('div[id^="sc-val-"]')
    .html(`<svg class="uil-ellipsis" height="20px" preserveaspectratio="xMidYMid" viewbox="0 0 100 100" width="20px" xmlns="http://www.w3.org/2000/svg">
          <use xlink:href="#sc-svg-loading">
        </svg>`);

  // The shard chosen in the panel (dropdown selection, else most-owned default, else
  // shardX). Never silently fall back to shard0 (which sendConsoleCommand defaults to).
  var shard = module.exports.activeShard();
  console.log("[market.resources] fetch sent (shard=" + shard + ")");

  module.sendConsoleCommand(command, undefined, shard);
};

module.exports.listenToConsole = function () {
  var auth = module.getScreepsAuth();
  var userid = JSON.parse(localStorage.getItem("users.code.activeWorld"))[0]._id;
  var host = "wss://screeps.com/socket/websocket";

  module.exports.socket = new WebSocket(host);

  module.exports.socket.onopen = function () {
    module.exports.socket.send("auth " + auth);
  };

  module.exports.socket.onerror = function () {
    console.warn("[market.resources] console socket error; holdings will not populate");
  };

  module.exports.socket.onmessage = function (msg) {
    if (msg.data.indexOf("auth ok") > -1) {
      var subscribe = "subscribe user:" + userid + "/console";
      module.exports.socket.send(subscribe);
    } else if (msg.data.indexOf("SC-Resources:") > -1) {
      // The console websocket delivers log text HTML-escaped, so unescape it and
      // JSON.parse — never eval (which chokes on the leading '&' and, running
      // inside Angular's zone.js, would break the whole page). Wrapped so no throw
      // can escape this handler into the Angular zone.
      try {
        var data = JSON.parse(msg.data);
        var logArray = data[1].messages.log;
        logArray.forEach(function (log) {
          if (log.indexOf("SC-Resources:") > -1) {
            var json = module.exports.htmlUnescape(log.replace("SC-Resources:", ""));
            window.SCMarket = JSON.parse(json);
            console.log("[market.resources] holdings received (" + Object.keys(window.SCMarket || {}).length + " rooms)");
            module.exports.updateResourceAmount();
          }
        });
      } catch (e) {
        console.warn("[market.resources] failed to parse holdings: " + e);
      }
    } else if (msg.data.indexOf("/console") > -1) {
      if (this.recievedConsole === undefined) {
        var savedDrop = localStorage.getItem("scMarketDropdown");
        if (savedDrop !== "None") {
          module.exports.fetchResources();
        }

        this.recievedConsole = true;
      }
    }
  };
};

module.exports.closeSocket = function () {
  if (module.exports.socket) {
    console.log("[market.resources] closing console socket");
    module.exports.socket.close();
    module.exports.socket = undefined;
  }
};

// The console websocket HTML-escapes log text (e.g. " -> &quot;, & -> &amp;).
// Decode it back to raw JSON before parsing. Parsing the string with DOMParser
// (text/html) decodes every entity and never executes scripts, and it avoids the
// innerHTML sink the AMO linter flags as UNSAFE_VAR_ASSIGNMENT. The input is
// fully HTML-escaped JSON, so it contains no live markup - only entities to decode.
module.exports.htmlUnescape = function (s) {
  var doc = new DOMParser().parseFromString(s, "text/html");
  return doc.documentElement.textContent;
};

module.exports.getLoadingSVG = function () {
  return `<svg xmlns="http://www.w3.org/2000/svg" style="display: none;">
        <symbol id="sc-svg-loading" viewbox="0 0 100 100" width="20px" height="20px" preserveaspectratio="xMidYMid" class="uil-ellipsis">
            <circle cx="84" cy="50" fill="#fff" r="2.10574" transform="rotate(0 50 50)">
                <animate attributename="r" begin="0s;anir14.end" dur="0.1875s" fill="freeze" from="0" id="anir11" to="8"></animate>
                <animate attributename="r" begin="anir11.end" dur="0.9375s" fill="freeze" from="8" id="anir12" to="8"></animate>
                <animate attributename="r" begin="anir12.end" dur="0.1875s" fill="freeze" from="8" id="anir13" to="0"></animate>
                <animate attributename="r" begin="anir13.end" dur="0.1875s" fill="freeze" from="0" id="anir14" to="0"></animate>
                <animate attributename="cx" begin="0s;anix18.end" dur="0.1875s" fill="freeze" from="16" id="anix11" to="16"></animate>
                <animate attributename="cx" begin="anix11.end" dur="0.1875s" fill="freeze" from="16" id="anix12" to="16"></animate>
                <animate attributename="cx" begin="anix12.end" dur="0.1875s" fill="freeze" from="16" id="anix13" to="50"></animate>
                <animate attributename="cx" begin="anix13.end" dur="0.1875s" fill="freeze" from="50" id="anix14" to="50"></animate>
                <animate attributename="cx" begin="anix14.end" dur="0.1875s" fill="freeze" from="50" id="anix8" to="84"></animate>
                <animate attributename="cx" begin="anix8.end" dur="0.1875s" fill="freeze" from="84" id="anix16" to="84"></animate>
                <animate attributename="cx" begin="anix16.end" dur="0.1875s" fill="freeze" from="84" id="anix17" to="84"></animate>
                <animate attributename="cx" begin="anix17.end" dur="0.1875s" fill="freeze" from="84" id="anix18" to="16"></animate>
            </circle>
            <circle cx="16" cy="50" fill="#cccccc" r="5.89426" transform="rotate(0 50 50)">
                <animate attributename="r" begin="0s;anir25.end" dur="0.75s" fill="freeze" from="8" id="anir21" to="8"></animate>
                <animate attributename="r" begin="anir21.end" dur="0.1875s" fill="freeze" from="8" id="anir22" to="0"></animate>
                <animate attributename="r" begin="anir22.end" dur="0.1875s" fill="freeze" from="0" id="anir23" to="0"></animate>
                <animate attributename="r" begin="anir23.end" dur="0.1875s" fill="freeze" from="0" id="anir24" to="8"></animate>
                <animate attributename="r" begin="anir24.end" dur="0.1875s" fill="freeze" from="8" id="anir25" to="8"></animate>
                <animate attributename="cx" begin="0s;anix28.end" dur="0.1875s" fill="freeze" from="16" id="anix21" to="50"></animate>
                <animate attributename="cx" begin="anix21.end" dur="0.1875s" fill="freeze" from="50" id="anix22" to="50"></animate>
                <animate attributename="cx" begin="anix22.end" dur="0.1875s" fill="freeze" from="50" id="anix23" to="84"></animate>
                <animate attributename="cx" begin="anix23.end" dur="0.1875s" fill="freeze" from="84" id="anix24" to="84"></animate>
                <animate attributename="cx" begin="anix24.end" dur="0.1875s" fill="freeze" from="84" id="anix25" to="84"></animate>
                <animate attributename="cx" begin="anix25.end" dur="0.1875s" fill="freeze" from="84" id="anix26" to="16"></animate>
                <animate attributename="cx" begin="anix26.end" dur="0.1875s" fill="freeze" from="16" id="anix27" to="16"></animate>
                <animate attributename="cx" begin="anix27.end" dur="0.1875s" fill="freeze" from="16" id="anix28" to="16"></animate>
            </circle>
            <circle cx="41.0506" cy="50" fill="#fff" r="8" transform="rotate(0 50 50)">
                <animate attributename="r" begin="0s;anir35.end" dur="0.375s" fill="freeze" from="8" id="anir31" to="8"></animate>
                <animate attributename="r" begin="anir31.end" dur="0.1875s" fill="freeze" from="8" id="anir32" to="0"></animate>
                <animate attributename="r" begin="anir32.end" dur="0.1875s" fill="freeze" from="0" id="anir33" to="0"></animate>
                <animate attributename="r" begin="anir33.end" dur="0.1875s" fill="freeze" from="0" id="anir34" to="8"></animate>
                <animate attributename="r" begin="anir34.end" dur="0.5625s" fill="freeze" from="8" id="anir35" to="8"></animate>
                <animate attributename="cx" begin="0s;anix38.end" dur="0.1875s" fill="freeze" from="50" id="anix31" to="84"></animate>
                <animate attributename="cx" begin="anix31.end" dur="0.1875s" fill="freeze" from="84" id="anix32" to="84"></animate>
                <animate attributename="cx" begin="anix32.end" dur="0.1875s" fill="freeze" from="84" id="anix33" to="84"></animate>
                <animate attributename="cx" begin="anix33.end" dur="0.1875s" fill="freeze" from="84" id="anix34" to="16"></animate>
                <animate attributename="cx" begin="anix34.end" dur="0.1875s" fill="freeze" from="16" id="anix35" to="16"></animate>
                <animate attributename="cx" begin="anix35.end" dur="0.1875s" fill="freeze" from="16" id="anix36" to="16"></animate>
                <animate attributename="cx" begin="anix36.end" dur="0.1875s" fill="freeze" from="16" id="anix37" to="50"></animate>
                <animate attributename="cx" begin="anix37.end" dur="0.1875s" fill="freeze" from="50" id="anix38" to="50"></animate>
            </circle>
            <circle cx="75.0506" cy="50" fill="#cccccc" r="8" transform="rotate(0 50 50)">
                <animate attributename="r" begin="0s;anir44.end" dur="0.1875s" fill="freeze" from="8" id="anir41" to="0"></animate>
                <animate attributename="r" begin="anir41.end" dur="0.1875s" fill="freeze" from="0" id="anir42" to="0"></animate>
                <animate attributename="r" begin="anir42.end" dur="0.1875s" fill="freeze" from="0" id="anir43" to="8"></animate>
                <animate attributename="r" begin="anir43.end" dur="0.9375s" fill="freeze" from="8" id="anir44" to="8"></animate>
                <animate attributename="cx" begin="0s;anix48.end" dur="0.1875s" fill="freeze" from="84" id="anix41" to="84"></animate>
                <animate attributename="cx" begin="anix41.end" dur="0.1875s" fill="freeze" from="84" id="anix42" to="16"></animate>
                <animate attributename="cx" begin="anix42.end" dur="0.1875s" fill="freeze" from="16" id="anix43" to="16"></animate>
                <animate attributename="cx" begin="anix43.end" dur="0.1875s" fill="freeze" from="16" id="anix44" to="16"></animate>
                <animate attributename="cx" begin="anix44.end" dur="0.1875s" fill="freeze" from="16" id="anix45" to="50"></animate>
                <animate attributename="cx" begin="anix45.end" dur="0.1875s" fill="freeze" from="50" id="anix46" to="50"></animate>
                <animate attributename="cx" begin="anix46.end" dur="0.1875s" fill="freeze" from="50" id="anix47" to="84"></animate>
                <animate attributename="cx" begin="anix47.end" dur="0.1875s" fill="freeze" from="84" id="anix48" to="84"></animate>
            </circle>
        </symbol>
    </svg>`;
};

ScreepsSC.end(module);
})();
