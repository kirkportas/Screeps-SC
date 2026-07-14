/**
 * Page-world (MAIN world) module runtime.
 *
 * Loaded once per page by content.js as an extension-origin <script src>. Browsers
 * allow the extension origin in the page's script-src (that is what
 * web_accessible_resources buys us) but Chrome blocks *inline* scripts on
 * screeps.com, so nothing in this file — or in any modules/*.js — may build a
 * script from source text.
 *
 * Each modules/*.js is its own extension-origin script that opens with
 *   var module = ScreepsSC.begin(document.currentScript);
 * and closes with
 *   ScreepsSC.end(module);
 * so every module gets a private instance and several modules can share a page
 * without overwriting each other's `module` global.
 */
(function () {
    if (window.ScreepsSC) {
        return;
    }

    // Single page -> extension channel. content.js listens for it in the isolated world.
    var TO_EXTENSION = "screepsSC:toExtension";

    var instances = {};

    // Called at the top of each modules/*.js. The seed (name/config/extensionUrl) rides
    // in on a data attribute of the module's own <script> tag, since the isolated world
    // cannot write page globals.
    function begin(currentScript) {
        var seed = JSON.parse(currentScript.dataset.scSeed);
        var existing = instances[seed.name];

        if (existing) {
            existing.config = seed.config;
            existing.extensionUrl = seed.extensionUrl;
            return existing;
        }

        return createModule(seed);
    }

    // Called at the bottom of each modules/*.js, once module.exports is populated.
    function end(module) {
        if (instances[module.name]) {
            module.exports.update();
            return;
        }

        instances[module.name] = module;
        module._init();
    }

    function createModule(seed) {
        var module = {
            name: seed.name,
            config: seed.config,
            extensionUrl: seed.extensionUrl,
            _cbEvents: {}
        };

        module.exports = {
            init: function () {
                // To be overrided
                console.warn("module.exports.init is not overrided.");
            },
            update: function () {
                // To be overrided
                console.warn("module.exports.update is not overrided.");
            }
        };

        module._init = function () {
            document.addEventListener(module.name, module._listener);

            module.exports.init();
        };

        module._listener = function (e) {
            var data = JSON.parse(e.detail);

            switch (data.event) {
                case 'update':
                    module.exports.update();
                    break;
                case 'dispose':
                    module._dispose();
                    break;
                case 'xhttp':
                    break;
                default:
                    break;
            }

            if (data._cb) {
                if (module._cbEvents[data._cb]) {
                    var cb = module._cbEvents[data._cb].cb;

                    if (cb) {
                        cb(data);
                    }

                    delete module._cbEvents[data._cb];
                } else {
                    console.error("Failed to fetch callback event: " + data._cb);
                }
            }
        };

        module._dispose = function () {
            document.removeEventListener(module.name, module._listener);
            delete instances[module.name];
        };

        module._guid = function () {
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
                var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        };

        module.dispatchEvent = function (data, cb) {
            data.module = module.name;

            if (cb) {
                var guid = module._guid();

                module._cbEvents[guid] = {
                    time: new Date().getTime(),
                    id: guid,
                    cb: cb
                };

                data._cb = guid;
            }

            var evt = new CustomEvent(TO_EXTENSION, {
                detail: JSON.stringify(data),
                bubbles: true,
                cancelable: true
            });
            document.dispatchEvent(evt);
        };

        module.getDeepValue = function (obj, path) {
            for (var i = 0, parts = path.split('.'), len = parts.length; i < len; i++) {
                if (obj === undefined || obj === null || obj[parts[i]] === undefined) {
                    return undefined;
                }

                obj = obj[parts[i]];
            }
            return obj;
        };

        module.getScopeData = function (scopeName, objectPath, mustExistPathArr, cb) {
            module.wait(module.isScopeReady.bind(module, scopeName, objectPath, mustExistPathArr), 50, function (error) {
                if (error) {
                    console.error(`condition failed for scope: ${scopeName}, path: ${objectPath}, mustExistArr: ${mustExistPathArr}`);
                } else {
                    var scope = angular.element(document.getElementsByClassName(`${scopeName} ng-scope`)).scope();
                    cb(module.getDeepValue(scope, objectPath));
                }
            });
        };

        // Writes straight to the Angular scope: this file already runs in the page world,
        // so there is no reason to round-trip through an (inline, CSP-blocked) script tag.
        module.setScopeData = function (scope, objectPath, value, cb) {
            var target = angular.element(document.getElementsByClassName(`${scope} ng-scope`)).scope();
            var parts = objectPath.split('.');
            var key = parts.pop();

            if (parts.length) {
                target = module.getDeepValue(target, parts.join('.'));
            }

            if (target !== undefined && target !== null) {
                target[key] = value;
            }

            if (cb) {
                cb();
            }
        };

        module.wait = function (condition, tries, cb) {
            if (condition()) {
                cb.bind(module)();
            } else {
                if (tries > 0) {
                    setTimeout(function () { module.wait(condition, tries - 1, cb); }, 100);
                } else {
                    cb.bind(module)("failed condition");
                }
            }
        };

        module.isScopeReady = function (scopeName, objectPath, mustExistPathArr) {
            var scope = angular.element(document.getElementsByClassName(`${scopeName} ng-scope`)).scope();
            if (scopeName === 'market-history') {
                scope = angular.element(document.getElementsByClassName(`app-market-table mat-table`)).scope();
            }
            var object = module.getDeepValue(scope, objectPath);
            var rootValid = (scope && object && Object.keys(object).length);

            if (mustExistPathArr.length) {

                if (rootValid) {
                    let ready = true;
                    mustExistPathArr.forEach(function (path) {
                        var obj = module.getDeepValue(scope, path);
                        if (obj === undefined) {
                            return ready = false;
                        } else if (obj instanceof Array && !obj.length) {
                            return ready = false;
                        } else if (typeof obj === 'object' && !Object.keys(obj).length) {
                            return ready = false;
                        }
                    });

                    return ready;
                }
            }

            return rootValid;
        };

        module.getScreepsAuth = function () {
            return JSON.parse(localStorage.getItem('auth'));
        };

        module.getScreepsAuthHeaders = function () {
            var auth = module.getScreepsAuth();
            return {
                'X-Token': auth,
                'X-Username': auth
            };
        };

        module.ajaxCall = function (data, cb) {

            // Set tokens if it's a request to @screeps
            if (data.url && data.url.startsWith("https://screeps.com/")) {
                data.headers = module.getScreepsAuthHeaders();
            }

            var request = $.ajax(data);

            request.done(function (msg) {
                if (cb) {
                    cb(msg);
                }
            });

            request.fail(function (jqXHR, msg) {
                if (cb) {
                    cb(undefined, jqXHR.status);
                }
            });
        };

        module.ajaxGet = function (url, cb) {
            module.ajaxCall({
                url: url,
                method: 'GET'
            }, cb);
        };

        module.getCurrentShard = function () {
            var url = window.location.href;

            if (url.indexOf("shard") > -1) {
                var pathArray = window.location.href.split('/');

                for (var i = 0; i < pathArray.length; i++) {
                    if (pathArray[i].startsWith("shard")) {
                        return pathArray[i].split('?')[0];
                    }
                }
            }

            return "";
        };

        module.sendConsoleCommand = function (command, cb, shard) {

            if (!shard) {
                shard = "shard0";
            }

            module.ajaxCall({
                url: "https://screeps.com/api/user/console",
                method: "POST",
                data: {
                    expression: command,
                    shard: shard
                }
            }, cb);
        };

        return module;
    }

    window.ScreepsSC = {
        channel: TO_EXTENSION,
        begin: begin,
        end: end
    };
})();
