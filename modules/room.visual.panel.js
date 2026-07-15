// Each modules/*.js is loaded into the page world as its own extension-origin script
// (see module.js). The IIFE keeps `module` private to this file so modules sharing a page
// do not overwrite each other; ScreepsSC.begin/end hand out the instance and start it.
(function () {
var module = ScreepsSC.begin(document.currentScript);

/**
 * Room Visuals panel.
 *
 * Gives RoomVisual output a place to render that doesn't block the view of the
 * room: a movable, resizable, floating panel that MIRRORS the client's dedicated
 * room-visual canvas, plus a toggle that hides the visuals on the room itself.
 *
 * How it works — mirror, don't parse. The room view draws serialized RoomVisual
 * data onto its own canvas, separate from the PIXI game canvas:
 *   <canvas app-room-visual="Room.visual" class="room-visual" width="800" height="800">
 * (it exists only while the native "Show room visuals" display option is ON —
 * an ng-if creates/destroys it). Each animation frame (throttled to ~15fps) we
 * drawImage() that canvas into our own panel canvas, scaled to fit. That mirrors
 * any bot's visuals pixel-perfectly with zero knowledge of the bot.
 *
 * The "hide on room" (eye) toggle works by flipping a class on <body> whose CSS
 * rule sets `visibility: hidden` on the source canvas. visibility (not
 * display:none, and never Room.displayOptions.showRoomVisual = false) keeps the
 * ng-if canvas alive and the directive still paints it, so our mirror keeps
 * working while the room stays clean.
 *
 * Panel position / size / collapsed / hide-on-room / closed state persist to
 * localStorage under one JSON key (scRoomVisualPanel). When the panel is closed,
 * a small toggle button in the room view's .left-controls (self-healed via a
 * rAF-coalesced MutationObserver, same as world.battle.radar's button) reopens it.
 */

var STORAGE_KEY = "scRoomVisualPanel";
var FRAME_MS = 66; // ~15fps mirror cadence — cheap, and RoomVisuals only change once per game tick anyway

module.exports.init = function () {
  console.log("[visual.panel] init");

  module.exports.state = loadState();
  ensureStyle();
  applyHideOnRoom();

  // Re-assert the panel / left-controls button whenever Angular re-renders the
  // view (room switches recreate the stage; route changes evict the button).
  // Same rAF-coalesced MutationObserver pattern as market.my.resources /
  // world.battle.radar: mutation bursts collapse into one cheap check per frame.
  if (module.exports.panelObserver) {
    module.exports.panelObserver.disconnect();
  }
  var checkQueued = false;
  module.exports.panelObserver = new MutationObserver(function () {
    if (checkQueued) return;
    checkQueued = true;
    requestAnimationFrame(function () {
      checkQueued = false;
      ensureAll();
    });
  });
  module.exports.panelObserver.observe(document.body, { childList: true, subtree: true });

  $(window).off("hashchange.scrv").on("hashchange.scrv", function () {
    ensureAll();
  });

  ensureAll();
};

module.exports.update = function () {
  // Fired by the background worker on every matching URL change.
  if (module.exports.state) {
    ensureAll();
  }
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

function defaultState() {
  return {
    left: Math.max(10, window.innerWidth - 360),
    top: 90,
    width: 320,
    height: 340,
    collapsed: false,
    hideOnRoom: false,
    closed: false
  };
}

function loadState() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      // Merge over defaults so new fields added later still get a value.
      var saved = JSON.parse(raw);
      var state = defaultState();
      for (var key in saved) {
        state[key] = saved[key];
      }
      return state;
    }
  } catch (e) {
    console.warn("[visual.panel] failed to load saved state: " + e);
  }
  return defaultState();
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(module.exports.state));
  } catch (e) {
    console.warn("[visual.panel] failed to save state: " + e);
  }
}

function onRoomView() {
  return window.location.href.indexOf("#!/room/") > -1;
}

// ---------------------------------------------------------------------------
// Lifecycle — the single re-entrant "make the world right" pass
// ---------------------------------------------------------------------------

function ensureAll() {
  var state = module.exports.state;
  var panel = document.getElementById("sc-rv-panel");

  if (!onRoomView()) {
    // Navigated away: stop mirroring and hide (not remove — the panel lives on
    // document.body with position:fixed, so it survives Angular route renders
    // and resumes instantly when a room view returns).
    stopLoop();
    if (panel) panel.style.display = "none";
    var button = document.getElementById("sc-rv-toggle-btn");
    if (button) button.remove();
    return;
  }

  ensureStyle();
  ensureToggleButton();

  if (state.closed) {
    stopLoop();
    if (panel) panel.style.display = "none";
    return;
  }

  if (!panel) {
    panel = buildPanel();
    console.log("[visual.panel] panel injected");
  } else if (panel.style.display === "none") {
    // Resuming from hidden (navigated back / reopened) — re-apply saved
    // geometry. Deliberately NOT on every pass: ensureAll runs on every
    // coalesced mutation frame, and re-imposing saved position/size while the
    // user is mid-drag or mid-resize would snap the panel out of their hands.
    panel.style.display = "";
    applyGeometry(panel);
    applyCollapsed(panel);
  }
  applyHideOnRoom(); // idempotent class/icon sync — safe to re-assert
  startLoop();
}

// ---------------------------------------------------------------------------
// Static style (injected once; contains no dynamic data)
// ---------------------------------------------------------------------------

function ensureStyle() {
  if (document.getElementById("sc-rv-style")) return;

  var style = document.createElement("style");
  style.id = "sc-rv-style";
  style.textContent = [
    "#sc-rv-panel { position: fixed; z-index: 2000; display: flex; flex-direction: column;",
    "  background: rgba(28, 30, 32, 0.95); border: 1px solid #444; border-radius: 4px;",
    "  box-shadow: 0 2px 14px rgba(0,0,0,0.55); overflow: hidden; resize: both;",
    "  min-width: 170px; min-height: 30px; pointer-events: auto; }",
    "#sc-rv-panel.sc-rv-collapsed { resize: none; height: auto !important; min-height: 0; }",
    "#sc-rv-panel.sc-rv-collapsed .sc-rv-body { display: none; }",
    ".sc-rv-header { display: flex; align-items: center; justify-content: space-between;",
    "  padding: 3px 4px 3px 8px; background: #2b2d2f; cursor: move; user-select: none;",
    "  -webkit-user-select: none; flex: 0 0 auto; }",
    ".sc-rv-title { color: #ccc; font-size: 12px; letter-spacing: 0.4px; }",
    ".sc-rv-buttons { display: flex; }",
    ".sc-rv-buttons button { background: none; border: none; color: #999; cursor: pointer;",
    "  padding: 2px 6px; font-size: 12px; line-height: 1; }",
    ".sc-rv-buttons button:hover { color: #fff; }",
    ".sc-rv-buttons button.sc-rv-active { color: #e8e863; }",
    ".sc-rv-body { flex: 1 1 auto; position: relative; min-height: 0; background: #1b1d1e; }",
    ".sc-rv-canvas { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }",
    ".sc-rv-hint { position: absolute; top: 0; left: 0; right: 0; bottom: 0; display: none;",
    "  align-items: center; justify-content: center; text-align: center;",
    "  color: #888; font-size: 12px; padding: 12px; }",
    // The eye toggle: hide the client's own room-visual canvas while keeping it
    // alive (ng-if would destroy it; display:none could disturb layout), so the
    // directive still paints every tick and our mirror keeps receiving frames.
    "body.sc-rv-hide-on-room canvas.room-visual { visibility: hidden !important; }"
  ].join("\n");
  document.head.appendChild(style);
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

function buildPanel() {
  var panel = document.createElement("div");
  panel.id = "sc-rv-panel";

  // Static skeleton only — every dynamic string in this module goes through
  // textContent, never an HTML sink.
  panel.innerHTML =
    '<div class="sc-rv-header">' +
    '  <span class="sc-rv-title">Room Visuals</span>' +
    '  <span class="sc-rv-buttons">' +
    '    <button id="sc-rv-btn-eye" type="button"><i class="fa fa-eye"></i></button>' +
    '    <button id="sc-rv-btn-collapse" type="button"><i class="fa fa-chevron-up"></i></button>' +
    '    <button id="sc-rv-btn-close" type="button" title="Close panel"><i class="fa fa-times"></i></button>' +
    "  </span>" +
    "</div>" +
    '<div class="sc-rv-body">' +
    '  <canvas class="sc-rv-canvas"></canvas>' +
    '  <div class="sc-rv-hint">Enable "Show room visuals" in the room\'s Display options to mirror visuals here.</div>' +
    "</div>";

  document.body.appendChild(panel);

  panel.querySelector(".sc-rv-header").addEventListener("pointerdown", onHeaderPointerDown);

  panel.querySelector("#sc-rv-btn-eye").addEventListener("click", function () {
    module.exports.state.hideOnRoom = !module.exports.state.hideOnRoom;
    saveState();
    applyHideOnRoom();
  });

  panel.querySelector("#sc-rv-btn-collapse").addEventListener("click", function () {
    module.exports.state.collapsed = !module.exports.state.collapsed;
    saveState();
    applyCollapsed(panel);
  });

  panel.querySelector("#sc-rv-btn-close").addEventListener("click", function () {
    module.exports.closePanel();
  });

  // Keep the canvas bitmap matched to the body's on-screen size (the panel has
  // CSS resize:both) and persist the panel size the user settles on.
  if (module.exports.resizeObserver) {
    module.exports.resizeObserver.disconnect();
  }
  module.exports.resizeObserver = new ResizeObserver(function () {
    syncCanvasSize(panel);
    if (!module.exports.state.collapsed && panel.style.display !== "none") {
      var rect = panel.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        module.exports.state.width = Math.round(rect.width);
        module.exports.state.height = Math.round(rect.height);
        saveState();
      }
    }
  });
  module.exports.resizeObserver.observe(panel.querySelector(".sc-rv-body"));

  applyGeometry(panel);
  applyCollapsed(panel);
  syncCanvasSize(panel);

  return panel;
}

function applyGeometry(panel) {
  var state = module.exports.state;

  // Clamp to the viewport so a stale saved position can't strand the panel
  // off-screen (e.g. after a window/monitor change).
  var left = Math.min(Math.max(0, state.left), Math.max(0, window.innerWidth - 60));
  var top = Math.min(Math.max(0, state.top), Math.max(0, window.innerHeight - 30));

  panel.style.left = left + "px";
  panel.style.top = top + "px";
  panel.style.width = state.width + "px";
  if (!state.collapsed) {
    panel.style.height = state.height + "px";
  }
}

function applyCollapsed(panel) {
  var state = module.exports.state;
  var icon = panel.querySelector("#sc-rv-btn-collapse i");

  panel.classList.toggle("sc-rv-collapsed", state.collapsed);
  if (!state.collapsed) {
    panel.style.height = state.height + "px";
    syncCanvasSize(panel);
  }

  icon.className = state.collapsed ? "fa fa-chevron-down" : "fa fa-chevron-up";
  panel.querySelector("#sc-rv-btn-collapse").title = state.collapsed ? "Expand panel" : "Collapse panel";
}

function applyHideOnRoom() {
  var state = module.exports.state;

  document.body.classList.toggle("sc-rv-hide-on-room", state.hideOnRoom);

  var panel = document.getElementById("sc-rv-panel");
  if (panel) {
    var button = panel.querySelector("#sc-rv-btn-eye");
    var icon = button.querySelector("i");
    icon.className = state.hideOnRoom ? "fa fa-eye-slash" : "fa fa-eye";
    button.classList.toggle("sc-rv-active", state.hideOnRoom);
    button.title = state.hideOnRoom
      ? "Visuals hidden on the room canvas — click to show them again"
      : "Hide visuals on the room canvas (they keep rendering here)";
  }
}

module.exports.closePanel = function () {
  module.exports.state.closed = true;
  saveState();
  stopLoop();
  var panel = document.getElementById("sc-rv-panel");
  if (panel) panel.style.display = "none";
  console.log("[visual.panel] panel closed (reopen via the left-controls button)");
};

module.exports.openPanel = function () {
  module.exports.state.closed = false;
  saveState();
  ensureAll();
};

// ---------------------------------------------------------------------------
// Dragging
// ---------------------------------------------------------------------------

function onHeaderPointerDown(e) {
  if (e.target.closest("button")) return; // header buttons are clicks, not drags
  if (e.button !== undefined && e.button !== 0) return;

  var panel = document.getElementById("sc-rv-panel");
  if (!panel) return;

  var rect = panel.getBoundingClientRect();
  var offsetX = e.clientX - rect.left;
  var offsetY = e.clientY - rect.top;

  function onMove(ev) {
    var left = Math.min(Math.max(0, ev.clientX - offsetX), Math.max(0, window.innerWidth - 60));
    var top = Math.min(Math.max(0, ev.clientY - offsetY), Math.max(0, window.innerHeight - 30));
    panel.style.left = left + "px";
    panel.style.top = top + "px";
  }

  function onUp() {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    var r = panel.getBoundingClientRect();
    module.exports.state.left = Math.round(r.left);
    module.exports.state.top = Math.round(r.top);
    saveState();
  }

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  e.preventDefault();
}

// ---------------------------------------------------------------------------
// Mirror loop
// ---------------------------------------------------------------------------

function startLoop() {
  if (module.exports.loopRunning) return;
  module.exports.loopRunning = true;
  module.exports.lastDraw = 0;
  requestAnimationFrame(loopTick);
  console.log("[visual.panel] mirror loop started");
}

function stopLoop() {
  if (module.exports.loopRunning) {
    console.log("[visual.panel] mirror loop stopped");
  }
  module.exports.loopRunning = false;
}

function loopTick(timestamp) {
  if (!module.exports.loopRunning) return;
  requestAnimationFrame(loopTick);

  if (timestamp - module.exports.lastDraw < FRAME_MS) return;
  module.exports.lastDraw = timestamp;

  // Skip all work when nothing would be seen.
  if (document.hidden) return;
  var state = module.exports.state;
  if (state.closed || state.collapsed) return;

  drawFrame();
}

function drawFrame() {
  var panel = document.getElementById("sc-rv-panel");
  if (!panel || panel.style.display === "none") return;

  var canvas = panel.querySelector(".sc-rv-canvas");
  var hint = panel.querySelector(".sc-rv-hint");

  // Re-query every frame: room switches recreate the whole stage (and the
  // native display-options toggle creates/destroys the canvas via ng-if), so a
  // cached reference would go stale. A querySelector at 15fps is negligible.
  var source = document.querySelector("canvas.room-visual");

  if (!source || !source.width || !source.height) {
    hint.style.display = "flex";
    var blankCtx = canvas.getContext("2d");
    blankCtx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }
  hint.style.display = "none";

  if (!canvas.width || !canvas.height) {
    syncCanvasSize(panel);
    if (!canvas.width || !canvas.height) return;
  }

  var ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Fit the (square, 800x800) source into our canvas preserving aspect ratio.
  var scale = Math.min(canvas.width / source.width, canvas.height / source.height);
  var drawWidth = source.width * scale;
  var drawHeight = source.height * scale;
  var dx = (canvas.width - drawWidth) / 2;
  var dy = (canvas.height - drawHeight) / 2;

  try {
    ctx.drawImage(source, dx, dy, drawWidth, drawHeight);
  } catch (e) {
    // The source can be mid-teardown during a room switch; just skip the frame.
  }
}

function syncCanvasSize(panel) {
  var body = panel.querySelector(".sc-rv-body");
  var canvas = panel.querySelector(".sc-rv-canvas");
  if (!body || !canvas) return;

  var ratio = window.devicePixelRatio || 1;
  var width = Math.max(0, Math.round(body.clientWidth * ratio));
  var height = Math.max(0, Math.round(body.clientHeight * ratio));

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    drawFrame(); // repaint immediately so resizing never shows a blank panel
  }
}

// ---------------------------------------------------------------------------
// Left-controls toggle button (reopen affordance)
// ---------------------------------------------------------------------------

// A small button in the room view's .left-controls (same insertion + self-heal
// approach as world.battle.radar): always available on the room view, it
// toggles the panel open/closed — so a closed panel is always one click away.
function ensureToggleButton() {
  var controls = document.getElementsByClassName("left-controls")[0];
  if (!controls) return; // nav not rendered yet — the MutationObserver retries
  if (document.getElementById("sc-rv-toggle-btn")) return;

  var button = document.createElement("a");
  button.id = "sc-rv-toggle-btn";
  button.className = "md-raised md-button ng-scope md-ink-ripple";
  button.title = "Toggle Room Visuals panel";
  // Static picture-in-picture glyph.
  button.innerHTML =
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
    '<rect x="2" y="4" width="20" height="16" rx="2"></rect>' +
    '<rect x="11" y="11" width="8" height="6" rx="1" fill="currentColor" stroke="none"></rect>' +
    "</svg>";

  button.addEventListener("click", function () {
    if (module.exports.state.closed) {
      module.exports.openPanel();
    } else {
      module.exports.closePanel();
    }
  });

  controls.prepend(button);
  console.log("[visual.panel] toggle button inserted");
}

ScreepsSC.end(module);
})();
