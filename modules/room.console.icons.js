// Each modules/*.js is loaded into the page world as its own extension-origin script
// (see module.js). The IIFE keeps `module` private to this file so modules sharing a page
// do not overwrite each other; ScreepsSC.begin/end hand out the instance and start it.
(function () {
var module = ScreepsSC.begin(document.currentScript);

/**
 * Adds new console controls
 * - custom buttons, with custom commands, using current room, selected object id and x,y mouse coords
 */
module.exports.init = function () {
  // Mousetrap is vendored inside the extension (vendor/mousetrap.min.js)
  // instead of being fetched from a third-party CDN at runtime.
  var script = document.createElement("script");
  script.src = module.extensionUrl + "vendor/mousetrap.min.js";
  script.onload = function () {
    module.exports.update();
  };
  document.head.appendChild(script);
};

module.exports.update = function () {
  module.getScopeData("console", "Console", [], function (Console) {
    // Create Remove Button
    $(`<button id="sc-btn-remove-icon" class="md-primary md-hue-1 md-button md-ink-ripple" type="button" title="Remove last added icon" style="position: absolute;bottom: 0px;display: block;">
            <i class="fa fa-minus"></i>
            <div class="md-ripple-container"></div>
        </button>`).appendTo($(".console-controls"));

    $("#sc-btn-remove-icon").click(function () {
      module.exports.removeIcon();
    });

    // Create Add Button
    $(`<button id="sc-btn-add-icon" class="md-primary md-hue-1 md-button md-ink-ripple" type="button" title="Add new icon"  style="position: absolute;bottom: 32px;display: block;">
            <i class="fa fa-plus"></i>
            <div class="md-ripple-container"></div>
        </button>`).appendTo($(".console-controls"));

    $("#sc-btn-add-icon").click(function () {
      module.exports.openModal();
    });

    // Get saved custom icons and load them into page
    var scCustomIconString = localStorage.getItem("scCustomIcons");

    if (scCustomIconString) {
      var scCustomIconArr = JSON.parse(scCustomIconString);
      var migrated = false;
      var seenUids = {};

      for (var i = 0; i < scCustomIconArr.length; i++) {
        var obj = scCustomIconArr[i];

        // Backward-compat: older entries keyed off a DOM id derived from the icon
        // HTML (which could be malformed/duplicated). Give every entry a stable,
        // unique `uid` that is independent of the icon content. Migrate in place so
        // deletions become reliable and persist across reloads.
        if (!obj.uid || seenUids[obj.uid]) {
          obj.uid = module.exports.generateUid();
          migrated = true;
        }

        seenUids[obj.uid] = true;

        module.exports.createNewIconButton(obj.uid, obj.icon, obj.code, obj.keybinding);
      }

      if (migrated) {
        localStorage.setItem("scCustomIcons", JSON.stringify(scCustomIconArr));
      }
    }
  });
};

// Generates a short, unique key that is independent of the icon markup. Used as
// both the button's DOM id suffix and the removal key in localStorage. Avoids
// relying on crypto.randomUUID being present.
module.exports.generateUid = function () {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
};

// Builds the inner icon markup for a button. The `icon` value may be a Font
// Awesome class name (e.g. "fa-circle") OR pasted raw HTML (e.g.
// '<i class="fa-solid fa-circle" style="color:#ff0"></i>'). Either way the icon
// content is confined to the button body and never leaks into the DOM id.
module.exports.buildIconMarkup = function (icon) {
  icon = icon || "";

  if (/[<>]/.test(icon)) {
    // Looks like pasted HTML markup: render it as-is.
    return icon;
  }

  return `<i class="fa ${icon}"></i>`;
};

module.exports.createNewIconButton = function (uid, icon, code, keybinding) {
  var id = "sc-btn-custom-" + uid;

  if (!document.getElementById(id)) {
    if (code) {
      code = code.replace(/(["])/g, "&quot;");
    }

    var iconMarkup = module.exports.buildIconMarkup(icon);

    var newBtnString = `<button id="${id}" data-sc-uid="${uid}" class="md-primary md-hue-1 md-button md-ink-ripple" type="button" title="${code}">
            ${iconMarkup}
            <div class="md-ripple-container"></div>
        </button>`;

    var newBtn = $(newBtnString);

    newBtn.insertBefore($("#sc-btn-add-icon"));

    $(`#${id}`).unbind("click");

    newBtn.click(function () {
      var consoleScope = angular.element(document.getElementsByClassName("console ng-scope")).scope().Console;
      var command = $(this).attr("title");

      if (command.includes("#{room}")) {
        var scope = angular.element(document.getElementsByClassName("room ng-scope")).scope();

        if (scope && scope.Room && scope.Room.roomName) {
          let roomName = angular.element(document.getElementsByClassName("room ng-scope")).scope().Room.roomName;
          command = command.replace(/#\{room\}/g, roomName);
        } else {
          command = `console.log("Error couldn't fetch room name for code: ${command} ")`;
        }
      }

      if (command.includes("#{id}")) {
        var scope = angular.element(document.getElementsByClassName("room ng-scope")).scope();

        if (scope && scope.Room && scope.Room.selectedObject && scope.Room.selectedObject._id) {
          let id = angular.element(document.getElementsByClassName("room ng-scope")).scope().Room.selectedObject._id;
          command = command.replace(/#\{id\}/g, id);
        } else {
          command = `console.log("Error couldn't fetch id for code: ${command} ")`;
        }
      }

      if (command.includes("#{x}") || command.includes("#{y}")) {
        var scope = angular.element(document.getElementsByClassName("room ng-scope")).scope();

        if (scope && scope.Room && scope.Room.cursorPos) {
          let obj = angular.element(document.getElementsByClassName("room ng-scope")).scope().Room.cursorPos;
          command = command.replace(/#\{x\}/g, obj.x);
          command = command.replace(/#\{y\}/g, obj.y);
        } else {
          command = `console.log("Error couldn't fetch coordinates for code: ${command} ")`;
        }
      }

      consoleScope.aceOptions.onChange([
        undefined,
        {
          val: command,
          getValue: function () {
            return this.val;
          },
          setValue: function (v) {
            this.val = v;
          },
          navigateLineEnd: function () {
            return true;
          }
        }
      ]);

      consoleScope.sendCommand();
    });

    if (Mousetrap && keybinding) {
      var m = undefined;

      if (window.scMousetrap) {
        m = window.scMousetrap;
      } else {
        m = new Mousetrap();
        window.scMousetrap = m;
      }

      m.unbind(keybinding).bind(keybinding, function (e) {
        $(`#${id}`).click();
      });
    }
  }
};

module.exports.removeIcon = function () {
  var elements = $('button[id^="sc-btn-custom-"]');

  if (elements.length) {
    var element = elements[elements.length - 1];

    // Map DOM element -> storage entry exactly via the stable uid. Prefer the
    // data attribute; fall back to deriving it from the id (which is always
    // "sc-btn-custom-" + uid) for any button that predates the data attribute.
    var uid = $(element).attr("data-sc-uid");

    if (uid === undefined || uid === "") {
      uid = element.id.replace(/^sc-btn-custom-/, "");
    }

    var scCustomIcons = localStorage.getItem("scCustomIcons");
    var arr = [];

    if (scCustomIcons) {
      var arr = JSON.parse(scCustomIcons);
    }

    arr = arr.filter(function (obj) {
      return obj.uid !== uid;
    });

    localStorage.setItem("scCustomIcons", JSON.stringify(arr));

    $(element).remove();
  }
};

module.exports.openModal = function () {
  $(`<div id="sc-modal-icon" class="fade modal in" modal-window="" index="0" style="display: block; z-index: 1049;" tabindex="-1">
        <div class="modal-dialog">
            <div class="modal-content" modal-window-content="">
                <section class="dlg-flag">
                    <div class="modal-body">
                        <button id="sc-modal-dismiss" class="close" type="button">×</button>
                        <div class="row">
                            <div class="col-xs-9">
                                <div class="row">
                                    <div class="col-xs-4">
                                        <label>Icon:</label>
                                    </div>
                                    <div class="col-xs-8">
                                        <input id="sc-modal-icon-input" name="icon" placeholder="fa-sticky-note">
                                        <a target="_blank" href="https://web.archive.org/web/20150822024502/http://fontawesome.io/icons" style="cursor: pointer;position: absolute;margin: 5px 0 0 10px;" tabindex="-1" title="See all icons">
                                            <i class="fa fa-question-circle" aria-hidden="true"></i>
                                        </a>
                                    </div>
                                </div>
                                <div class="row">
                                    <div class="col-xs-4">
                                        <label>Code:</label>
                                    </div>
                                    <div class="col-xs-8">
                                        <textarea id="sc-modal-icon-code" name="code" cols="40" rows="5" style="width: 255px;background: #333;border: 0;padding: 5px 8px;border-radius: 2px;outline: none;color: #ddd;" class="ace_editor"></textarea>
                                    </div>
                                </div>
                                <div class="row">
                                    <div class="col-xs-4">
                                        <label>Replaces:</label>
                                    </div>
                                    <div class="col-xs-8">
                                        <div class="row">
                                            <div class="col-xs-12">
                                            <code style="color: #A5B7C6; background-color: #2B2B2B;">#{<span style="color: #FFC66A;">room</span>}</code>
                                                <span> current room.</span>
                                            </div>
                                        </div>
                                        <div class="row">
                                            <div class="col-xs-12">
                                                <code style="color: #A5B7C6; background-color: #2B2B2B;">#{<span style="color: #FFC66A;">id</span>}</code>
                                                <span> selected object id.</span>
                                            </div>
                                        </div>
                                        <div class="row">
                                            <div class="col-xs-12">
                                                <code style="color: #A5B7C6; background-color: #2B2B2B;">#{<span style="color: #FFC66A;">x</span>}</code>
                                                <span> mouse x tile cord.</span>
                                            </div>
                                        </div>
                                        <div class="row">
                                            <div class="col-xs-12">
                                                <code style="color: #A5B7C6; background-color: #2B2B2B;">#{<span style="color: #FFC66A;">y</span>}</code>
                                                <span> mouse y tile cord.</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div class="row">
                                    <div class="col-xs-4">
                                        <label>Key binding:</label>
                                    </div>
                                    <div class="col-xs-8">
                                        <input id="sc-modal-icon-keybinding" name="icon" placeholder="ctrl+k">
                                        <a target="_blank" href="https://craig.is/killing/mice" style="cursor: pointer;position: absolute;margin: 5px 0 0 10px;" tabindex="-1" title="See types of key bindings">
                                            <i class="fa fa-question-circle" aria-hidden="true"></i>
                                        </a>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button id="sc-modal-icon-cancel" class="md-button md-ink-ripple" type="button"><span>Cancel</span></button>
                        <button id="sc-modal-icon-ok" class="md-raised md-primary md-button md-ink-ripple" type="submit"><span>OK</span></button>
                    </div>
                </section>
            </div>
        </div>
    </div>`).appendTo("body");

  $('<div id="sc-modal-background" class="modal-backdrop fade in" style="z-index: 1040;"></div>').appendTo("body");

  $("#sc-modal-icon-cancel").click(function () {
    module.exports.closeModal();
  });

  $("#sc-modal-dismiss").click(function () {
    module.exports.closeModal();
  });

  $("#sc-modal-icon-ok").click(function () {
    var icon = $("#sc-modal-icon-input").val();
    var code = $("#sc-modal-icon-code").val();
    var keybinding = $("#sc-modal-icon-keybinding").val();

    // The uid is the stable removal key; it is deliberately independent of the
    // icon HTML so pasted markup can never corrupt the DOM id or storage key.
    var uid = module.exports.generateUid();

    var scCustomIcons = localStorage.getItem("scCustomIcons");
    var arr = [];

    if (scCustomIcons) {
      var arr = JSON.parse(scCustomIcons);
    }

    arr.push({ uid: uid, icon: icon, code: code, keybinding: keybinding });
    localStorage.setItem("scCustomIcons", JSON.stringify(arr));

    module.exports.createNewIconButton(uid, icon, code, keybinding);

    module.exports.closeModal();
  });
};

module.exports.closeModal = function () {
  $("#sc-modal-icon").remove();
  $("#sc-modal-background").remove();
};

ScreepsSC.end(module);
})();
