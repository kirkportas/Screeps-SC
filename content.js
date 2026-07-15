/**
 * Isolated-world half of a module.
 *
 * Loads the page-world runtime (module.js) and the module file as extension-origin
 * <script src> tags, and relays messages between the page-world module and the
 * background worker.
 *
 * Why <script src> and not inline source: screeps.com serves a strict
 * script-src, and Chrome enforces it against scripts a content script inserts
 * (Firefox does not, which is why the old inline-source injection only broke in
 * Chrome). The extension's own origin *is* allowed in that script-src, so loading
 * our files by URL passes — see web_accessible_resources in manifest.json.
 * chrome.scripting world:"MAIN" is not an option here: main-world injections are
 * subject to the page CSP too.
 *
 * Everything lives in a guarded IIFE because background.js re-injects this file
 * once per module; only the first run may wire up listeners.
 */
(function () {
    if (window.screepsSCContentLoaded) {
        return;
    }
    window.screepsSCContentLoaded = true;

    const TO_EXTENSION = "screepsSC:toExtension";
    const RUNTIME_ID = "screeps-sc-runtime";

    let runtimeLoad;

    // Resolves true if it added the script, false if that script was already on the page.
    function loadPageScript(id, path, seed) {
        return new Promise(function (resolve, reject) {
            if (document.getElementById(id)) {
                resolve(false);
                return;
            }

            const script = document.createElement("script");
            script.id = id;
            script.src = chrome.runtime.getURL(path);

            if (seed) {
                // The isolated world cannot write page globals, so the module reads its
                // seed back off its own tag via document.currentScript.
                script.dataset.scSeed = JSON.stringify(seed);
            }

            script.onload = function () { resolve(true); };
            script.onerror = function () { reject(new Error("failed to load " + path)); };

            (document.head || document.documentElement).appendChild(script);
        });
    }

    function ensureRuntime() {
        if (!runtimeLoad) {
            runtimeLoad = loadPageScript(RUNTIME_ID, "module.js").catch(function (e) {
                runtimeLoad = undefined; // don't cache the failure; let the next module retry
                throw e;
            });
        }

        return runtimeLoad;
    }

    async function injectModule(name, config) {
        try {
            await ensureRuntime();

            const created = await loadPageScript(name, name, {
                name: name,
                config: config,
                // lets page-world modules load vendored scripts (see web_accessible_resources)
                extensionUrl: chrome.runtime.getURL("")
            });

            if (!created) {
                toPage(name, { event: "update" });
            }
        } finally {
            // Always report back: the background worker serializes injections behind this
            // message, so a failed load must not wedge every module queued after it.
            chrome.runtime.sendMessage({ action: "injected", data: name });
        }
    }

    function toPage(name, data) {
        const evt = new CustomEvent(name, {
            detail: typeof data === "object" ? JSON.stringify(data) : data,
            bubbles: true,
            cancelable: true
        });
        document.dispatchEvent(evt);
    }

    function eventsSentFromScript(e) {
        const data = JSON.parse(e.detail);

        switch (data.event) {
            case "xhttp":
                chrome.runtime.sendMessage({
                    method: "GET",
                    action: "xhttp",
                    url: data.url
                }, function (responseText) {
                    data.data = responseText;

                    toPage(data.module, data);
                });
                break;
            case "dispose":
                toPage(data.module, { event: "dispose" });
                break;
            default:
                console.log(data);
        }
    }

    function eventsSentFromBackground(msg) {
        switch (msg.event) {
            case "inject":
                injectModule(msg.module, msg.config).catch(function (e) {
                    console.error("Failed to inject " + msg.module + ": " + e);
                });
                break;
            case "update":
                toPage(msg.module, msg);
                break;
            case "dispose":
                toPage(msg.module, { event: "dispose" });
                break;
            default:
                console.error("Unrecognized message event occured in content.js: " + msg.event);
        }
    }

    document.addEventListener(TO_EXTENSION, eventsSentFromScript);

    chrome.runtime.onConnect.addListener(function (port) {
        port.onMessage.addListener(eventsSentFromBackground);
    });
})();
