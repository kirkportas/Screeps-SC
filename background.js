// Cross-browser alias: Firefox (and Chrome 133+) expose the promise-based
// `browser` namespace; Chrome MV3 `chrome.*` also returns promises when no
// callback is passed, so promise-style calls work in both.
const api = globalThis.browser ?? chrome;

const activeTabPorts = {};
let injectQueue = [];

// Runs on every service worker / event page startup, so the routing arrays in
// storage.local are refreshed even after Chrome suspends the worker.
async function loadSettings() {
    const response = await fetch(api.runtime.getURL("settings.json"));
    const settings = await response.json();

    if (!settings.modules || !settings.modules.length) {
        console.error("modules is missing in settings.json");
        return;
    }

    const onUpdateArr = [];
    const onCompletedArr = [];

    for (let i = 0, len = settings.modules.length; i < len; i++) {
        const module = settings.modules[i];

        if (!module.path) {
            console.error("module at index[" + i + "] is missing path.");
            break;
        }

        if (!module.runAt || !Object.keys(module.runAt).length) {
            console.error("module at index[" + i + "] is missing runAt.");
            break;
        }

        if (module.runAt.onUpdate) {
            onUpdateArr.push({ path: module.path, url: module.runAt.onUpdate });
        }

        if (module.runAt.onCompleted) {
            onCompletedArr.push({ path: module.path, url: module.runAt.onCompleted });
        }
    }

    await api.storage.local.set({ onUpdateArr: onUpdateArr, onCompletedArr: onCompletedArr });
}

loadSettings().catch(function (e) {
    console.error("Failed to load settings.json: " + e);
});

api.action.onClicked.addListener(function () {
    api.runtime.openOptionsPage();
});

api.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
    if (changeInfo.status !== "complete") {
        return;
    }

    if (!tab.url || !tab.url.startsWith("https://screeps.com/a/#!/")) {
        return;
    }

    api.storage.local.get("onUpdateArr").then(function (data) {
        if (data.onUpdateArr) {
            runMatchingModules(tabId, data.onUpdateArr, tab.url);
        } else {
            console.error("Failed to read array from onUpdateArr in local storage.");
        }
    });
});

api.webRequest.onCompleted.addListener(function (details) {
    if (details.tabId < 0) {
        return; // request not associated with a tab (e.g. from the extension itself)
    }

    api.storage.local.get("onCompletedArr").then(function (data) {
        if (data.onCompletedArr) {
            runMatchingModules(details.tabId, data.onCompletedArr, details.url);
        } else {
            console.error("Failed to read array from onCompletedArr in local storage.");
        }
    });
}, { urls: ["*://screeps.com/*"] });

// The xhttp handler fetches with the extension's privileges, and the URL comes
// from the page world (content.js forwards a page CustomEvent). Restrict it to
// the two hosts the modules actually talk to, otherwise it is an open
// cross-origin read proxy for anything running on the page.
const XHTTP_ALLOWED_HOSTS = ["screeps.com", "leagueofautomatednations.com"];

function isAllowedXhttpUrl(rawUrl) {
    let url;
    try {
        url = new URL(rawUrl);
    } catch (e) {
        return false;
    }

    if (url.protocol !== "https:" && url.protocol !== "http:") {
        return false;
    }

    return XHTTP_ALLOWED_HOSTS.some(function (host) {
        return url.hostname === host || url.hostname.endsWith("." + host);
    });
}

api.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    // Only our own content scripts talk to the background; never another extension.
    if (sender.id !== api.runtime.id) {
        return;
    }

    if (request.action === "xhttp") {
        if (!isAllowedXhttpUrl(request.url)) {
            console.error("xhttp blocked for disallowed url: " + request.url);
            sendResponse();
            return;
        }

        // Content scripts only ever issue GETs through here.
        fetch(request.url, { method: "GET" })
            .then(function (response) {
                return response.text();
            })
            .then(function (responseText) {
                sendResponse(responseText);
            })
            .catch(function (e) {
                console.error("Error in xhttp: " + e);
                sendResponse();
            });

        return true; // keep the message channel open for the async response
    } else if (request.action === "injected") {
        injectQueue = injectQueue.filter(item => item !== request.data);
    }
});

function runMatchingModules(tabId, moduleInfos, url) {
    moduleInfos.forEach(function (info) {
        if (url.startsWith(info.url)) {
            getStorageSync(info.path).then(function (option) {
                if (option && option.enabled === false) {
                    return; // module disabled on the options page
                }

                executeModule(tabId, info, option ? option.config : undefined);
            });
        }
    });
}

function getStorageSync(path) {
    const name = path.replace("modules/", "").replace(".js", "");

    return api.storage.sync.get(name).then(function (data) {
        return data ? data[name] : undefined;
    });
}

async function executeModule(tabId, info, config, tries = 15) {
    if (!activeTabPorts[tabId]) {
        activeTabPorts[tabId] = {};
    }
    if (!activeTabPorts[tabId][info.path]) {
        activeTabPorts[tabId][info.path] = {};
    }

    if (activeTabPorts[tabId][info.path].port) {
        activeTabPorts[tabId][info.path].port.postMessage({ event: "update", module: info.path });
        return;
    }

    if (injectQueue.length !== 0) {
        if (tries <= 0) {
            console.error("Failed to inject: " + info.path);
        } else {
            setTimeout(function () {
                executeModule(tabId, info, config, tries - 1);
            }, 500);
        }
        return;
    }

    injectQueue.push(info.path);

    try {
        // Only the isolated-world relay is injected here. It guards itself against
        // double-init, then loads module.js and the module file into the page world
        // as extension-origin <script src> tags once we ask it to (see content.js:
        // the page's CSP blocks inline scripts in Chrome but allows our origin).
        await api.scripting.executeScript({
            target: { tabId: tabId },
            files: ["content.js"]
        });

        const port = api.tabs.connect(tabId, { name: info.path });

        port.onMessage.addListener(function (msg) {
            console.log("received message from tab " + tabId + ":");
            console.log(msg);
        });

        port.onDisconnect.addListener(function () {
            console.log("port disconnected");
            delete activeTabPorts[tabId][info.path];
        });

        port.postMessage({
            event: "inject",
            module: info.path,
            config: config === undefined ? null : config
        });

        activeTabPorts[tabId][info.path].port = port;
    } catch (e) {
        injectQueue = injectQueue.filter(item => item !== info.path);
        console.error("Failed to inject " + info.path + ": " + e);
    }
}
