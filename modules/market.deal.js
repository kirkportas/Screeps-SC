/**
 * One-click "Deal" button for ACCOUNT-LEVEL market resources only
 * (cpuUnlock / accessKey / pixel). Adds a green Deal button to each order row on
 * the modern Angular Material market table; clicking it opens an inline confirm
 * form (amount + 4s safety countdown) that runs Game.market.deal via the console.
 *
 * Only these three resources are handled because Game.market.deal for minerals /
 * commodities needs a target room, which this feature intentionally does not do.
 */

// The only resources whose deals don't require a target room.
module.exports.accountResources = ["cpuUnlock", "accessKey", "pixel"];

// Which shard the deal expression is executed on. Account-level deals are global,
// so any shard where your code actually runs works — but it MUST be a shard with
// a live runtime, or the console expression is never evaluated. Left "" so
// resolveShard auto-detects a shard you own rooms on; set it to a shard name to
// pin manually (that override wins over auto-detection). "shardX" remains only the
// last-resort fallback in sendDeal when nothing else resolves.
module.exports.dealShard = "";

module.exports.init = function () {
  console.log("[market.deal] init");

  // The market URL carries no shard, so getCurrentShard() would fall back to
  // shard0 and the deal would never run for players not active there. Resolve
  // the shard we actually run code on up front.
  module.exports.resolveShard();

  // Re-inject the Deal buttons whenever the CDK table re-renders (Angular wipes
  // our injected cells on sort / shard change / route change). Same rAF-coalesced
  // MutationObserver + initial-pass pattern as world.battle.radar's ensureButton.
  function ensureButtons() {
    if (!module.exports.currentResource()) return; // not on an account resource page
    var rows = $("mat-row");
    var added = 0;
    rows.each(function () {
      var row = $(this);
      if (row.find(".sc-deal-cell").length) return; // already has our button
      row.append(module.exports.buttonCellHtml());
      added++;
    });
    if (added > 0) {
      console.log("[market.deal] buttons inserted: " + added + " (rows: " + rows.length + ")");
    }
  }
  module.exports.ensureButtons = ensureButtons;

  module.exports.bindHandlers();

  if (module.exports.currentResource()) {
    console.log("[market.deal] active on account resource page: " + module.exports.currentResource());
    module.exports.listenToConsole();
  }

  ensureButtons();

  if (module.exports.buttonObserver) {
    module.exports.buttonObserver.disconnect();
  }
  var checkQueued = false;
  module.exports.buttonObserver = new MutationObserver(function () {
    if (checkQueued) return;
    checkQueued = true;
    requestAnimationFrame(function () {
      checkQueued = false;
      ensureButtons();
    });
  });
  module.exports.buttonObserver.observe(document.body, { childList: true, subtree: true });

  // Leaving the market entirely -> drop the feedback socket.
  $(window).on("hashchange.scdeal", function () {
    if (window.location.href.indexOf("https://screeps.com/a/#!/market/") !== 0) {
      module.exports.closeSocket();
    } else if (module.exports.currentResource() && !module.exports.socket) {
      module.exports.listenToConsole();
    }
  });
};

module.exports.update = function () {
  if (module.exports.ensureButtons) {
    module.exports.ensureButtons();
  }
  if (module.exports.currentResource() && !module.exports.socket) {
    module.exports.listenToConsole();
  }
};

// Resolve the shard to run the deal expression on. Uses the manual override if
// set, otherwise the first shard you own rooms on (guaranteed to have a runtime).
module.exports.resolveShard = function () {
  if (module.exports.dealShard) return; // manually pinned
  try {
    var userid = JSON.parse(localStorage.getItem("users.code.activeWorld"))[0]._id;
    module.ajaxGet("https://screeps.com/api/user/rooms?id=" + userid, function (data) {
      if (data && data.shards && Object.keys(data.shards).length) {
        var shards = Object.keys(data.shards);
        // Prefer a shard you actually run on — never auto-pick shard0 when you
        // have others (a leftover shard0 room shouldn't hijack the deal target).
        module.exports.dealShard = shards.filter(function (s) { return s !== "shard0"; })[0] || shards[0];
        console.log(
          "[market.deal] deal shard resolved to " +
            module.exports.dealShard +
            " (your shards: " +
            Object.keys(data.shards).join(", ") +
            ")"
        );
      } else {
        console.warn(
          "[market.deal] could not resolve your shard from /api/user/rooms; deals will fall back to shardX. " +
            "Set module.exports.dealShard manually if that is wrong."
        );
      }
    });
  } catch (e) {
    console.warn("[market.deal] resolveShard failed: " + e);
  }
};

// Returns the account resource name for the current URL, or null if this is not
// one of the three account-level resource pages.
module.exports.currentResource = function () {
  var m = window.location.href.match(/#!\/market\/all\/(.+)$/);
  if (!m) return null;
  var parts = m[1].split("?")[0].split("/").filter(Boolean);
  var last = parts[parts.length - 1];
  return module.exports.accountResources.indexOf(last) > -1 ? last : null;
};

module.exports.buttonCellHtml = function () {
  return (
    '<div class="sc-deal-cell" style="display:flex;align-items:center;justify-content:flex-end;padding:0 6px;">' +
    '<button class="sc-deal-btn" type="button" ' +
    'style="background:#3b3;color:#fff;border:none;padding:3px 10px;border-radius:4px;cursor:pointer;font-size:12px;">' +
    "Deal</button></div>"
  );
};

module.exports.parseAmount = function (text) {
  return parseInt(String(text).replace(/[^0-9]/g, ""), 10);
};

module.exports.messageForCode = function (code) {
  if (code === 0) return "OK";
  if (code === -6) return "-6 no resources";
  if (code === -10) return "-10 invalid args";
  return String(code);
};

// Delegated click handlers so they survive Angular recycling rows.
module.exports.bindHandlers = function () {
  var body = $("body");
  body.off(".scdeal");

  // Open the inline confirm form.
  body.on("click.scdeal", ".sc-deal-btn", function () {
    var cell = $(this).closest(".sc-deal-cell");
    var row = $(this).closest("mat-row");
    // Read live from the row at the moment of interaction (rows are recycled).
    var id = row.find(".cdk-column-_id").text().trim();
    var remaining = module.exports.parseAmount(row.find(".cdk-column-remainingAmount").text());

    if (!id) {
      console.warn("[market.deal] no order _id found on row; cannot deal");
      return;
    }
    if (!(remaining > 0)) remaining = 1;

    module.exports.renderForm(cell, remaining);
  });

  // Cancel: revert to the Deal button and clear the countdown.
  body.on("click.scdeal", ".sc-deal-cancel", function () {
    var cell = $(this).closest(".sc-deal-cell");
    module.exports.clearTimer(cell);
    module.exports.revertCell(cell);
  });

  // Confirm: only fires once enabled (after the countdown).
  body.on("click.scdeal", ".sc-deal-confirm", function () {
    var btn = $(this);
    if (btn.prop("disabled")) return;

    var cell = btn.closest(".sc-deal-cell");
    var row = btn.closest("mat-row");
    // Re-read id + remaining live (never trust a cached value on a recycled row).
    var id = row.find(".cdk-column-_id").text().trim();
    var remaining = module.exports.parseAmount(row.find(".cdk-column-remainingAmount").text());
    var amount = parseInt(cell.find(".sc-deal-amount").val(), 10);

    if (!id) {
      console.warn("[market.deal] no order _id at confirm; aborting");
      return;
    }
    if (isNaN(amount) || amount < 1 || (remaining > 0 && amount > remaining) || amount % 1 !== 0) {
      cell.find(".sc-deal-amount").css("border-color", "#d33");
      return;
    }

    module.exports.clearTimer(cell);
    btn.prop("disabled", true).text("..."); // prevent double-submit
    module.exports.sendDeal(id, amount);
  });
};

module.exports.renderForm = function (cell, remaining) {
  cell.html(
    '<input type="number" class="sc-deal-amount" min="1" max="' +
      remaining +
      '" step="1" value="' +
      remaining +
      '" style="width:80px;background:#222;color:#eee;border:1px solid #555;border-radius:3px;padding:2px 4px;font-size:12px;margin-right:4px;">' +
      '<button class="sc-deal-confirm" type="button" disabled ' +
      'style="background:#2e7d32;color:#fff;border:none;padding:3px 8px;border-radius:4px;cursor:pointer;font-size:12px;margin-right:4px;">Confirm (4)</button>' +
      '<button class="sc-deal-cancel" type="button" ' +
      'style="background:#666;color:#fff;border:none;padding:3px 7px;border-radius:4px;cursor:pointer;font-size:12px;">&times;</button>'
  );

  var confirmBtn = cell.find(".sc-deal-confirm");
  var count = 4;
  var timer = setInterval(function () {
    count--;
    if (count <= 0) {
      module.exports.clearTimer(cell);
      confirmBtn.prop("disabled", false).text("Confirm");
    } else {
      confirmBtn.text("Confirm (" + count + ")");
    }
  }, 1000);
  cell.data("scDealTimer", timer);
};

module.exports.clearTimer = function (cell) {
  var timer = cell.data("scDealTimer");
  if (timer) {
    clearInterval(timer);
    cell.removeData("scDealTimer");
  }
};

module.exports.revertCell = function (cell) {
  cell.html(
    '<button class="sc-deal-btn" type="button" ' +
      'style="background:#3b3;color:#fff;border:none;padding:3px 10px;border-radius:4px;cursor:pointer;font-size:12px;">Deal</button>'
  );
};

module.exports.sendDeal = function (id, amount) {
  var command =
    "var __r = Game.market.deal('" + id + "', " + amount + "); console.log('SC-Deal:' + __r + ':' + '" + id + "');";
  // Prefer the resolved shard we run code on; the account-resource market URL has
  // no shard so getCurrentShard() returns "". Fall back to the shardX pin — NEVER
  // to shard0, which sendConsoleCommand would otherwise default to (and where the
  // bot doesn't run, so the deal would silently never execute).
  var shard = module.exports.dealShard || module.getCurrentShard() || "shardX";
  console.log("[market.deal] deal sent id=" + id + " amount=" + amount + " shard=" + shard);

  if (!module.exports.socket) {
    console.warn("[market.deal] no feedback socket open; sending deal without live result");
  }

  module.sendConsoleCommand(command, undefined, shard);
};

// Click the market page's own Refresh control. After a filled order the row is
// stale but still shown; rather than removing it ourselves we let the page
// re-fetch the order list and drop it. The button lives in <app-market-refresh>
// (its ng-generated attributes are volatile, so match the element, not those).
module.exports.triggerPageRefresh = function () {
  var btn = $("app-market-refresh button").first();
  if (btn.length) {
    btn.click();
    console.log("[market.deal] page refresh triggered");
  } else {
    console.warn("[market.deal] could not find the page Refresh button");
  }
};

// Flash the row's cell with the result, then revert to the Deal button.
module.exports.showResult = function (id, code) {
  console.log("[market.deal] result received id=" + id + " code=" + code);

  var cell = null;
  $("mat-row").each(function () {
    var row = $(this);
    if (row.find(".cdk-column-_id").text().trim() === id) {
      cell = row.find(".sc-deal-cell");
      return false; // break
    }
  });
  if (!cell || !cell.length) return;

  module.exports.clearTimer(cell);

  var ok = code === 0;
  var label = module.exports.messageForCode(code);
  cell.html(
    '<span class="sc-deal-result" style="color:#fff;background:' +
      (ok ? "#2e7d32" : "#c62828") +
      ';padding:3px 10px;border-radius:4px;font-size:12px;">' +
      (ok ? "OK" : label) +
      "</span>"
  );

  setTimeout(function () {
    module.exports.revertCell(cell);
  }, 2000);

  // A filled order is now stale in the table. A second after it lands, click the
  // page's own Refresh so the client re-fetches the list and drops it (the table
  // re-render also clears our cell). Only on success — a failed deal leaves the
  // order untouched, so there is nothing to refresh away.
  if (ok) {
    setTimeout(function () {
      module.exports.triggerPageRefresh();
    }, 1000);
  }
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
    console.warn("[market.deal] console socket error; deals will still send without live feedback");
  };

  module.exports.socket.onmessage = function (msg) {
    if (msg.data.indexOf("auth ok") > -1) {
      var subscribe = "subscribe user:" + userid + "/console";
      module.exports.socket.send(subscribe);
    } else if (msg.data.indexOf("SC-Deal:") > -1) {
      var data = JSON.parse(msg.data);
      var logArray = data[1].messages.log;
      logArray.forEach(function (log) {
        if (log.indexOf("SC-Deal:") > -1) {
          var parts = log.split(":"); // ["SC-Deal", "<code>", "<id>"]
          var code = parseInt(parts[1], 10);
          var id = parts[2];
          module.exports.showResult(id, code);
        }
      });
    }
  };
};

module.exports.closeSocket = function () {
  if (module.exports.socket) {
    console.log("[market.deal] closing console socket");
    module.exports.socket.close();
    module.exports.socket = undefined;
  }
};
