// Firefox exposes the promise-based `browser` namespace; Chrome MV3 `chrome.*`
// also returns promises when no callback is passed.
var api = globalThis.browser || chrome;

// Firefox MV3 treats manifest host permissions as optional and withholds them
// until the user grants access, so the modules never inject on a fresh install.
// The banner lets the user grant them from a click (a user gesture is required).
// On Chrome these are granted at install time, so the banner stays hidden.
var HOST_PERMISSIONS = {
    origins: ["*://screeps.com/*", "*://*.leagueofautomatednations.com/*"]
};

function refreshPermissionBanner() {
    api.permissions.contains(HOST_PERMISSIONS).then(function (granted) {
        document.getElementById('perms').style.display = granted ? 'none' : 'block';
    });
}

function requestPermissions() {
    api.permissions.request(HOST_PERMISSIONS).then(function (granted) {
        if (granted) {
            refreshPermissionBanner();
        }
    });
}

function save_options() {
    var storage = {}
    
    document.SCsettings.modules.forEach(function(module){
        var name = module.path.replace("modules/", "").replace(".js", "");

        var moduleEle = document.getElementById(name)
        var enableCheckBox = moduleEle.getElementsByClassName('checkbox-enabled')[0]; 

        storage[name] = {}
        storage[name].enabled = enableCheckBox.checked;

        if (module.options && module.options.config &&  module.options.config.length){

            storage[name].config = {}

            module.options.config.forEach(function(config){
                var configEle = document.getElementById(config.name);

                if (configEle){
                    var elementTag = configEle.tagName.toLowerCase();
                    switch(elementTag) {
                        case "select":{
                            storage[name].config[config.name] = configEle.options[configEle.selectedIndex].value;
                            break;
                        }
                        default:
                            console.error("Config type: " + elementTag + " is not implemented in save options.");
                    }
                }
            });
        }
    });

    console.log(storage);
    
    chrome.storage.sync.set(storage, function() {
        var status = document.getElementById('status');
        status.textContent = 'Options saved.';
        setTimeout(function() {
            status.textContent = '';
        }, 750);
    });
    
}

function addModuleOption(module){
    var div = document.createElement("div");

    var name = module.path.replace("modules/", "").replace(".js", "");
    var imgUrl = "";
    var enableChecked = true;
    var sync = document.SCsettings.sync[name];

    // The module block used to be assembled as an interpolated innerHTML string,
    // which the AMO linter flags as UNSAFE_VAR_ASSIGNMENT. Build the same markup
    // with the DOM API instead: element text goes through textContent and never
    // through an HTML sink, so no config value can inject markup.
    var moduleContent = document.createElement("div");
    moduleContent.className = "module-content";

    if (sync){
        if (!sync.enabled){
            enableChecked = false;
        }
    }

    if (module.options){
        imgUrl = module.options.image || "";

        if (module.options.config){
            module.options.config.forEach(function(config){
                var leftNodes = [];
                var rightNodes = [];
                var syncConfig;

                // get saved value from chrome sync
                if (sync && sync.config && sync.config[config.name]){
                    syncConfig = sync.config[config.name];
                }

                switch(config.type) {
                    case "select":{
                        var defaultValue = syncConfig || config.defaultValue || config.options[0];

                        var label = document.createElement("label");
                        label.setAttribute("style", "font-weight: bold;text-transform: capitalize;");
                        label.textContent = config.name;
                        leftNodes.push(label);

                        var select = document.createElement("select");
                        select.id = config.name;
                        for(var i = 0; i < config.options.length; i++){
                            var option = document.createElement("option");
                            option.textContent = config.options[i];
                            if (defaultValue === config.options[i]){
                                option.setAttribute("selected", "selected");
                            }
                            select.appendChild(option);
                        }
                        leftNodes.push(select);

                        var description = document.createElement("span");
                        description.setAttribute("style", "font-style: italic;");
                        description.textContent = config.description;
                        rightNodes.push(description);

                        break;
                    }
                    default:
                        console.error("Config type: " + config.type + " is not implemented in addModuleOption.");
                }

                var row = document.createElement("div");
                row.setAttribute("style", "display: inline-block;width: 90%;padding-bottom:10px;");

                var leftCol = document.createElement("div");
                leftCol.setAttribute("style", "width: 40%;float: left;height: 100%;");
                leftNodes.forEach(function(node){ leftCol.appendChild(node); });
                row.appendChild(leftCol);

                var rightCol = document.createElement("div");
                rightCol.setAttribute("style", "padding-top: 5px;");
                rightNodes.forEach(function(node){ rightCol.appendChild(node); });
                row.appendChild(rightCol);

                moduleContent.appendChild(row);
            });
        }
    }

    div.className ="module-block"
    div.id = name;

    var heading = document.createElement("h3");
    heading.appendChild(document.createTextNode(name + " "));

    var enableLabel = document.createElement("label");
    enableLabel.className = "enable-label";

    var checkbox = document.createElement("input");
    checkbox.className = "checkbox-enabled";
    checkbox.type = "checkbox";
    checkbox.checked = enableChecked;
    enableLabel.appendChild(checkbox);

    var checkboxText = document.createElement("span");
    checkboxText.className = "checkbox-text";
    checkboxText.textContent = "Enabled";
    enableLabel.appendChild(checkboxText);

    heading.appendChild(enableLabel);
    div.appendChild(heading);

    var moduleImage = document.createElement("div");
    moduleImage.className = "module-image";
    var img = document.createElement("img");
    img.setAttribute("src", imgUrl);
    moduleImage.appendChild(img);
    div.appendChild(moduleImage);

    div.appendChild(moduleContent);

    document.getElementById('modules').appendChild(div);

}

function loadOptions() {
    fetch(chrome.runtime.getURL('settings.json'))
        .then(function(response) { return response.json(); })
        .then(function(settings) {
            document.SCsettings = settings;

            chrome.storage.sync.get(null, function(items) {
                document.SCsettings.sync = items;

                document.SCsettings.modules.forEach(function(module){
                    addModuleOption(module);
                });
            });
        });
}

document.addEventListener('DOMContentLoaded', loadOptions);
document.addEventListener('DOMContentLoaded', refreshPermissionBanner);
document.getElementById('save').addEventListener('click', save_options);
document.getElementById('grant').addEventListener('click', requestPermissions);