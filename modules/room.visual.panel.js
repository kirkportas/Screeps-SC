// Each modules/*.js is loaded into the page world as its own extension-origin script
// (see module.js). The IIFE keeps `module` private to this file so modules sharing a page
// do not overwrite each other; ScreepsSC.begin/end hand out the instance and start it.
(function () {
var module = ScreepsSC.begin(document.currentScript);

/**
 * Room Visuals panel.
 *
 * Gives RoomVisual output a place to render that doesn't block the view of the
 * room: a movable, resizable, floating panel with TWO render sources, data first.
 *
 * 1. PRIMARY — scope data. The serialized RoomVisual payload rides on the room
 *    view's Angular scope as `Room.visual` (normally a newline-delimited JSON
 *    string, one record per line: t:"t" text / "l" line / "c" circle / "r" rect
 *    / "p" poly, with style object `s`). A 500ms interval reads it via
 *    module.getScopeData into module.exports.latestVisual (never per frame —
 *    getScopeData polls with retries internally); the ~15fps rAF loop parses it
 *    (cached by payload identity) and draws the records onto the panel canvas
 *    itself, painter's-algorithm order, styled per the official RoomVisual
 *    defaults. This needs no native canvas at all, so the client's
 *    "Show room visuals" display option can stay OFF — the room stays clean and
 *    the panel is the ONLY place visuals render. An empty-but-present payload
 *    means the bot drew nothing this tick: that renders as a blank frame in
 *    data mode, never a flash to the fallback.
 *
 * 2. FALLBACK — canvas mirror. When no visual payload is found on the scope,
 *    but the native option is ON so the client's dedicated room-visual canvas
 *    exists (<canvas app-room-visual="Room.visual" class="room-visual"> — an
 *    ng-if creates/destroys it with the option), we drawImage() that canvas
 *    into ours, scaled to fit: pixel-perfect, zero knowledge of the payload.
 *
 * When neither source exists the panel shows a static hint. The active source
 * is breadcrumbed once per change: "[visual.panel] source: scope data" /
 * "source: canvas mirror".
 *
 * The "hide on room" (eye) toggle flips a class on <body> whose CSS rule sets
 * `visibility: hidden` on the native canvas. It only matters in MIRROR mode
 * (with the native option ON): visibility (not display:none, and never
 * Room.displayOptions.showRoomVisual = false) keeps the ng-if canvas alive and
 * painting, so the mirror keeps working while the room stays clean. In data
 * mode with the option OFF there is nothing on the room to hide.
 *
 * Panel position / size / collapsed / hide-on-room / closed state persist to
 * localStorage under one JSON key (scRoomVisualPanel). When the panel is closed,
 * a small toggle button in the room view's .left-controls (self-healed via a
 * rAF-coalesced MutationObserver, same as world.battle.radar's button) reopens it.
 */

var STORAGE_KEY = "scRoomVisualPanel";
var FRAME_MS = 66; // ~15fps render cadence — cheap, and RoomVisuals only change once per game tick anyway
var SCOPE_POLL_MS = 500; // Room.visual refresh cadence (a game tick is never faster than ~1s)

module.exports.init = function () {
  console.log("[visual.panel] init");

  module.exports.state = loadState();
  resetVisualCache();
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
    // Room (or route) changed: drop the cached payload so the previous room's
    // visuals can never render into the new room's panel.
    resetVisualCache();
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
    // Navigated away: stop rendering and hide (not remove — the panel lives on
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
    // The eye toggle (mirror mode only): hide the client's own room-visual
    // canvas while keeping it alive (ng-if would destroy it; display:none could
    // disturb layout), so the directive still paints every tick and the mirror
    // fallback keeps receiving frames.
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
  // textContent (or the canvas), never an HTML sink.
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
    '  <div class="sc-rv-hint">No visuals received for this room.</div>' +
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
      ? "Native room-visual canvas hidden — click to show it again (only matters in mirror mode)"
      : 'Hide the native room-visual canvas (only matters in mirror mode, i.e. with "Show room visuals" ON)';
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
// Scope data feed (PRIMARY source)
// ---------------------------------------------------------------------------

// The rAF loop only ever reads module.exports.latestVisual; this slow interval
// is the only thing that touches the Angular scope. getScopeData must never be
// called per frame — it polls with retries internally (up to ~5s when the
// scope isn't ready) and never calls back at all on failure, so we gate it
// with an in-flight flag plus a timeout that unlatches the never-called-back
// error path.
function pollScopeVisual() {
  if (!onRoomView()) return;

  var now = Date.now();
  if (module.exports.scopeReqPending && now - module.exports.scopeReqTime < 6000) return;
  module.exports.scopeReqPending = true;
  module.exports.scopeReqTime = now;

  // Stamp the request with the current route so a callback that raced a room
  // change gets discarded (stale visuals must never render into the new room).
  var requestKey = window.location.hash;

  try {
    // mustExistPathArr is deliberately [] (NOT ["Room.visual"]): an empty
    // visual payload is valid data — "the bot drew nothing" — and must not be
    // treated as "scope not ready".
    module.getScopeData("room", "Room", [], function (Room) {
      module.exports.scopeReqPending = false;
      if (window.location.hash !== requestKey) return;
      var visual = Room ? Room.visual : undefined;
      module.exports.latestVisual = {
        // present = the scope carries a visual payload at all (even an empty
        // one). Absent (undefined/null) → the mirror/hint fallbacks apply.
        present: visual !== undefined && visual !== null,
        raw: visual
      };
    });
  } catch (e) {
    // Angular scope reads can throw mid route-transition — retry next poll.
    module.exports.scopeReqPending = false;
  }
}

function resetVisualCache() {
  module.exports.latestVisual = null;
  module.exports.parsedRaw = null;
  module.exports.parsedRawLen = -1;
  module.exports.parsedRecords = null;
  module.exports.lastDrawnRaw = null;
  module.exports.lastDrawnRawLen = -1;
  module.exports.scopeReqPending = false;
}

// Room.visual arrives as a newline-delimited JSON string (the engine's wire
// format) but is handled defensively: an already-parsed array of records also
// works, and malformed lines are skipped.
function parseVisualRecords(raw) {
  var records = [];

  if (Array.isArray(raw)) {
    for (var i = 0; i < raw.length; i++) {
      if (raw[i] && typeof raw[i] === "object") records.push(raw[i]);
    }
    return records;
  }

  if (typeof raw === "string") {
    var lines = raw.split("\n");
    for (var j = 0; j < lines.length; j++) {
      var line = lines[j].trim();
      if (!line) continue;
      try {
        var rec = JSON.parse(line);
        if (rec && typeof rec === "object") records.push(rec);
      } catch (e) {
        // bad line — skip it, keep the rest
      }
    }
  }

  return records;
}

// ---------------------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------------------

function startLoop() {
  if (module.exports.loopRunning) return;
  module.exports.loopRunning = true;
  module.exports.lastDraw = 0;

  if (module.exports.scopePollTimer) clearInterval(module.exports.scopePollTimer);
  module.exports.scopePollTimer = setInterval(pollScopeVisual, SCOPE_POLL_MS);
  pollScopeVisual();

  requestAnimationFrame(loopTick);
  console.log("[visual.panel] render loop started");
}

function stopLoop() {
  if (module.exports.loopRunning) {
    console.log("[visual.panel] render loop stopped");
  }
  module.exports.loopRunning = false;
  if (module.exports.scopePollTimer) {
    clearInterval(module.exports.scopePollTimer);
    module.exports.scopePollTimer = null;
  }
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

  drawFrame(false);
}

// Breadcrumb once per source change, never per frame.
function setRenderSource(source) {
  if (module.exports.renderSource === source) return;
  module.exports.renderSource = source;
  if (source === "data") {
    console.log("[visual.panel] source: scope data");
  } else if (source === "mirror") {
    console.log("[visual.panel] source: canvas mirror");
  }
}

// Source selection per frame: scope data (primary) → canvas mirror (fallback,
// needs the native "Show room visuals" option ON) → static hint.
function drawFrame(force) {
  var panel = document.getElementById("sc-rv-panel");
  if (!panel || panel.style.display === "none") return;

  var canvas = panel.querySelector(".sc-rv-canvas");
  var hint = panel.querySelector(".sc-rv-hint");
  var latest = module.exports.latestVisual;

  // DATA MODE: the scope carried a visual payload — even an empty one ("the
  // bot drew nothing this tick" renders as a blank frame; it must not flash
  // over to the mirror/hint).
  if (latest && latest.present) {
    setRenderSource("data");
    hint.style.display = "none";

    if (!canvas.width || !canvas.height) {
      syncCanvasSize(panel);
      if (!canvas.width || !canvas.height) return;
    }

    // Unchanged payload → skip the redraw entirely (visuals change at most
    // once per game tick). A canvas resize forces one (force=true) because
    // resizing wipes the bitmap. Arrays additionally compare by length in
    // case the scope mutates one in place.
    var raw = latest.raw;
    var rawLen = Array.isArray(raw) ? raw.length : -1;
    if (!force && raw === module.exports.lastDrawnRaw && rawLen === module.exports.lastDrawnRawLen) {
      return;
    }

    // Re-parse only when the payload actually changed, not on every redraw.
    if (raw !== module.exports.parsedRaw || rawLen !== module.exports.parsedRawLen || !module.exports.parsedRecords) {
      module.exports.parsedRaw = raw;
      module.exports.parsedRawLen = rawLen;
      module.exports.parsedRecords = parseVisualRecords(raw);
    }

    var ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawRecords(ctx, canvas, module.exports.parsedRecords);
    module.exports.lastDrawnRaw = raw;
    module.exports.lastDrawnRawLen = rawLen;
    return;
  }

  // Leaving data mode (or never in it): make sure re-entering it repaints.
  module.exports.lastDrawnRaw = null;
  module.exports.lastDrawnRawLen = -1;

  // MIRROR MODE: no payload on the scope, but the client's own room-visual
  // canvas exists (native option ON) — copy its pixels. Re-query every frame:
  // room switches recreate the whole stage (and the native display-options
  // toggle creates/destroys the canvas via ng-if), so a cached reference would
  // go stale. A querySelector at 15fps is negligible.
  var source = document.querySelector("canvas.room-visual");

  if (!source || !source.width || !source.height) {
    setRenderSource(null);
    hint.style.display = "flex";
    var blankCtx = canvas.getContext("2d");
    blankCtx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }
  setRenderSource("mirror");
  hint.style.display = "none";

  if (!canvas.width || !canvas.height) {
    syncCanvasSize(panel);
    if (!canvas.width || !canvas.height) return;
  }

  var mirrorCtx = canvas.getContext("2d");
  mirrorCtx.clearRect(0, 0, canvas.width, canvas.height);

  // Fit the (square, 800x800) source into our canvas preserving aspect ratio.
  var scale = Math.min(canvas.width / source.width, canvas.height / source.height);
  var drawWidth = source.width * scale;
  var drawHeight = source.height * scale;
  var dx = (canvas.width - drawWidth) / 2;
  var dy = (canvas.height - drawHeight) / 2;

  try {
    mirrorCtx.drawImage(source, dx, dy, drawWidth, drawHeight);
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
    drawFrame(true); // repaint immediately (forced) so resizing never shows a blank panel
  }
}

// ---------------------------------------------------------------------------
// Data renderer — draws parsed RoomVisual records onto the panel canvas
// ---------------------------------------------------------------------------

// Style defaults below follow the official RoomVisual API docs
// (https://docs.screeps.com/api/#RoomVisual): shapes default to opacity 0.5,
// text to opacity 1; strokeWidth defaults 0.1 (0.15 for text stroke); circle
// radius 0.15; text font size 0.5 tiles.

function num(value, fallback) {
  return typeof value === "number" && isFinite(value) ? value : fallback;
}

// dashed/dotted use a dash unit of ~one default line-width in pixels.
function applyLineDash(ctx, lineStyle, u) {
  var d = 0.1 * u;
  if (lineStyle === "dashed") {
    ctx.setLineDash([4 * d, 4 * d]);
  } else if (lineStyle === "dotted") {
    ctx.setLineDash([1 * d, 2 * d]);
  } else {
    ctx.setLineDash([]);
  }
}

function pathRoundRect(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function drawRecords(ctx, canvas, records) {
  if (!records || !records.length) return;

  // Aspect-fit square, centered — the same fit math as the mirror path (the
  // native canvas is square too). One tile = drawSize/50 px; like the client,
  // tile coordinate n maps to the tile's CENTER at (n + 0.5) tiles.
  var drawSize = Math.min(canvas.width, canvas.height);
  var u = drawSize / 50;
  var ox = (canvas.width - drawSize) / 2;
  var oy = (canvas.height - drawSize) / 2;

  function px(x) { return ox + (x + 0.5) * u; }
  function py(y) { return oy + (y + 0.5) * u; }

  // Painter's algorithm: records draw strictly in payload order.
  for (var i = 0; i < records.length; i++) {
    try {
      drawRecord(ctx, records[i], px, py, u);
    } catch (e) {
      // one malformed record must not take down the frame
    }
    // Reset per-shape state so one record's style never leaks into the next.
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }
}

function drawRecord(ctx, rec, px, py, u) {
  var s = rec.s || {};

  switch (rec.t) {
    case "l": { // line
      ctx.globalAlpha = num(s.opacity, 0.5);
      ctx.strokeStyle = s.color || "#ffffff";
      ctx.lineWidth = num(s.width, 0.1) * u;
      applyLineDash(ctx, s.lineStyle, u);
      ctx.beginPath();
      ctx.moveTo(px(rec.x1), py(rec.y1));
      ctx.lineTo(px(rec.x2), py(rec.y2));
      ctx.stroke();
      break;
    }

    case "c": { // circle
      ctx.globalAlpha = num(s.opacity, 0.5);
      ctx.beginPath();
      ctx.arc(px(rec.x), py(rec.y), num(s.radius, 0.15) * u, 0, Math.PI * 2);
      ctx.fillStyle = s.fill || "#ffffff";
      ctx.fill();
      if (s.stroke) {
        ctx.strokeStyle = s.stroke;
        ctx.lineWidth = num(s.strokeWidth, 0.1) * u;
        applyLineDash(ctx, s.lineStyle, u);
        ctx.stroke();
      }
      break;
    }

    case "r": { // rect — w/h may be serialized under either short or long keys
      var w = num(rec.w !== undefined ? rec.w : rec.width, 0) * u;
      var h = num(rec.h !== undefined ? rec.h : rec.height, 0) * u;
      var rx = px(rec.x);
      var ry = py(rec.y);
      ctx.globalAlpha = num(s.opacity, 0.5);
      ctx.fillStyle = s.fill || "#ffffff";
      ctx.fillRect(rx, ry, w, h);
      if (s.stroke) {
        ctx.strokeStyle = s.stroke;
        ctx.lineWidth = num(s.strokeWidth, 0.1) * u;
        applyLineDash(ctx, s.lineStyle, u);
        ctx.strokeRect(rx, ry, w, h);
      }
      break;
    }

    case "p": { // poly — points may be [x,y] pairs or {x,y} objects
      var points = rec.points;
      if (!points || !points.length) break;
      ctx.globalAlpha = num(s.opacity, 0.5);
      ctx.beginPath();
      for (var i = 0; i < points.length; i++) {
        var pt = points[i];
        var x = Array.isArray(pt) ? pt[0] : pt.x;
        var y = Array.isArray(pt) ? pt[1] : pt.y;
        if (i === 0) ctx.moveTo(px(x), py(y));
        else ctx.lineTo(px(x), py(y));
      }
      if (s.fill) {
        ctx.fillStyle = s.fill;
        ctx.fill();
      }
      // Unlike the closed shapes, poly STROKES by default (fill defaults off).
      if (s.stroke === undefined || s.stroke) {
        ctx.strokeStyle = s.stroke || "#ffffff";
        ctx.lineWidth = num(s.strokeWidth, 0.1) * u;
        applyLineDash(ctx, s.lineStyle, u);
        ctx.stroke();
      }
      break;
    }

    case "t": { // text — y is the BASELINE, matching the official renderer
      var text = rec.text === undefined || rec.text === null ? "" : String(rec.text);
      if (!text) break;

      // font: a number is a size in tile units; a bare "<size> <family>"
      // string gets its size scaled the same way; any other string (a full
      // CSS font like "bold 12px serif") is used as-is — its sizes are
      // already px and we deliberately keep that translation simple.
      var fontPx = 0.5 * u;
      var fontCss;
      if (typeof s.font === "number") {
        fontPx = s.font * u;
        fontCss = fontPx + "px sans-serif";
      } else if (typeof s.font === "string") {
        var m = s.font.match(/^\s*([\d.]+)\s+(.+)$/);
        if (m) {
          fontPx = parseFloat(m[1]) * u;
          fontCss = fontPx + "px " + m[2];
        } else {
          fontCss = s.font;
        }
      } else {
        fontCss = fontPx + "px sans-serif";
      }

      ctx.globalAlpha = num(s.opacity, 1);
      ctx.font = fontCss;
      ctx.textAlign = s.align === "left" || s.align === "right" ? s.align : "center";
      ctx.textBaseline = "alphabetic";

      var tx = px(rec.x);
      var ty = py(rec.y);

      if (s.backgroundColor) {
        var pad = num(s.backgroundPadding, 0.3) * u;
        var metrics = ctx.measureText(text);
        // actualBoundingBox* gives a tight box; fall back to a font-size
        // approximation on engines without it.
        var ascent = metrics.actualBoundingBoxAscent !== undefined ? metrics.actualBoundingBoxAscent : fontPx * 0.8;
        var descent = metrics.actualBoundingBoxDescent !== undefined ? metrics.actualBoundingBoxDescent : fontPx * 0.2;
        var bw = metrics.width;
        var bx = ctx.textAlign === "left" ? tx : ctx.textAlign === "right" ? tx - bw : tx - bw / 2;
        ctx.fillStyle = s.backgroundColor;
        pathRoundRect(ctx, bx - pad, ty - ascent - pad, bw + 2 * pad, ascent + descent + 2 * pad, pad);
        ctx.fill();
      }

      if (s.stroke) {
        ctx.strokeStyle = s.stroke;
        ctx.lineWidth = num(s.strokeWidth, 0.15) * u;
        ctx.strokeText(text, tx, ty);
      }
      ctx.fillStyle = s.color || "#ffffff";
      ctx.fillText(text, tx, ty);
      break;
    }

    default:
      // unknown record type — skip
      break;
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
