/**
 * Draws each creep's name as a text label in the room view: reads the AngularJS
 * Room.objects scope and writes the name into each creep's SVG <text> node (so
 * hostile creeps get name tags too), re-running when the native "Show hostile
 * names" toggle changes.
 */
module.exports.init = function () {
  $("body").on("change", '[heading="Show hostile names"] > div > div > label > input', function (e) {
    module.exports.update();
  });

  module.exports.update();
};

module.exports.update = function () {
  module.getScopeData("room", "Room", ["Room.objects"], function (Room) {
    var creeps = _.filter(Room.objects, { type: "creep" });

    creeps.forEach(function (obj) {
      if (obj._id) {
        var ele = document.getElementById(obj._id);

        if (ele) {
          var textElement = ele.getElementsByTagName("text")[0];
          if (textElement) {
            textElement.textContent = obj.name;
          }
        }
      }
    });
  });
};
