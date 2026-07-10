/**
 * Adds a progressbar to the profile page, as well as a calculation untill next level
 */
module.exports.init = function () {
  var dropdown = ".stats-controls .dropdown-menu li a";
  $("body")
    .off("click", dropdown)
    .on("click", dropdown, function () {
      module.setScopeData("profile", "Profile.data.user", undefined);

      module.getScopeData("profile", "Profile.data.user", [], function (data) {
        module.exports.update();
      });
    });

  module.exports.update();
};

module.exports.update = function () {
  module.getScopeData("profile", "Profile", ["Profile.data.user", "Profile.data.stats"], function (profile) {
    var gcl = profile.data.user.gcl;
    var gclPoints = profile.data.stats.energyControl;
    var statInterval = profile.statInterval + "";

    var gclLevel = Math.floor(Math.pow((gcl || 0) / 1000000, 1 / 2.4)) + 1;
    var baseLevel = Math.pow(gclLevel - 1, 2.4) * 1000000;
    var currentProg = (gcl || 0) - baseLevel;
    var neededProg = Math.pow(gclLevel, 2.4) * 1000000 - baseLevel;
    var percentage = Math.floor((currentProg / neededProg) * 100);
    var sec_num = 0;

    if (statInterval == "8") {
      sec_num = ((neededProg - currentProg) / gclPoints) * 60 * 60;
    } else if (statInterval == "180") {
      sec_num = ((neededProg - currentProg) / gclPoints) * 60 * 60 * 24;
    } else if (statInterval == "1440") {
      sec_num = ((neededProg - currentProg) / gclPoints) * 60 * 60 * 24 * 7;
    }

    var hours = Math.floor(sec_num / 3600);
    var minutes = Math.floor((sec_num - hours * 3600) / 60);
    var seconds = Math.floor(sec_num - hours * 3600 - minutes * 60);

    var profileElement = document.getElementsByClassName("profile-title")[0];

    var displayPercentage = percentage;
    var displayCurrentProg = parseFloat(Math.round(currentProg / 10000) / 100).toFixed(2);
    var displayNeededProg = Math.round(neededProg / 1000000);

    // Build the progress bar with the DOM API rather than an interpolated HTML
    // string. The AMO linter flags dynamic HTML sinks (UNSAFE_VAR_ASSIGNMENT);
    // constructing nodes and setting text via textContent avoids that while
    // producing the same rendered markup.
    var extendedGcl = document.createElement("div");
    extendedGcl.id = "extended-gcl";

    var bar = document.createElement("div");
    bar.setAttribute("style", "margin-top: 2px;padding: 4px 10px;background: #1b1b1b;position: relative;float:left;");

    var fill = document.createElement("div");
    fill.setAttribute(
      "style",
      "width: " +
        displayPercentage +
        "%; position: absolute;left: 0;top: 0;bottom: 0;background: #009688;opacity: 0.7;filter: alpha(opacity=70);"
    );
    bar.appendChild(fill);

    var barText = document.createElement("div");
    barText.setAttribute("style", "z-index: 1;position: relative;color: white;font-size: 11px;");

    var nextLevel = document.createElement("span");
    nextLevel.setAttribute("style", "opacity: 0.5;filter: alpha(opacity=50);font-weight: 300;");
    nextLevel.textContent = "Next level: ";
    barText.appendChild(nextLevel);

    var progress = document.createElement("strong");
    progress.setAttribute("style", "font-weight: normal;");
    progress.textContent = displayCurrentProg + "M / " + displayNeededProg + "M";
    barText.appendChild(progress);

    bar.appendChild(barText);
    extendedGcl.appendChild(bar);

    var untilLevel = document.createElement("div");
    untilLevel.setAttribute("style", "color: white;font-size: 11px;float:left;padding: 5px 0 0 5px;");
    untilLevel.textContent = " ~ " + hours + "h until level";
    extendedGcl.appendChild(untilLevel);

    if (document.getElementById("extended-gcl")) {
      $("#extended-gcl").remove();
    }

    profileElement.appendChild(extendedGcl);
  });
};
