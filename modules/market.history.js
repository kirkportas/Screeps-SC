// Each modules/*.js is loaded into the page world as its own extension-origin script
// (see module.js). The IIFE keeps `module` private to this file so modules sharing a page
// do not overwrite each other; ScreepsSC.begin/end hand out the instance and start it.
(function () {
var module = ScreepsSC.begin(document.currentScript);

module.exports.init = function () {
  try {
    var userid = JSON.parse(localStorage.getItem("users.code.activeWorld"))[0]._id;
    module.exports.userId = userid;
  } catch (error) {
    console.error("Failed to get userId from localstorage", error);
    module.ajaxGet(window.location.origin + "/api/auth/me", function (data, error) {
      if (data) {
        module.exports.userId = data._id;
      } else {
        console.error("Failed to acquire userId", data || error);
        return;
      }
    });
  }

  module.ajaxGet("https://screeps.com/api/user/rooms?id=" + userid, function (data, error) {
    module.exports.shards = {};
    if (data && data.shards) {
      for (const [shard, rooms] of Object.entries(data.shards)) {
        module.exports.shards[shard] = { rooms };
      }
    } else {
      console.error(data || error);
    }

    for (const [shardName, shard] of Object.entries(module.exports.shards)) {
      module.ajaxGet("https://screeps.com/api/game/world-size?shard=" + shardName, function (worldSize, error) {
        shard.width = worldSize.width;
        shard.height = worldSize.height;
      });
    }

    module.exports.page = 0;
    module.exports.fetchMarketHistoryPage(module.exports.page);
  });

  var style = document.createElement("style");
  // A <style> element's CSS is plain text; set it via textContent instead of
  // innerHTML so the AMO linter does not flag an HTML sink.
  style.textContent = ".mat-row:nth-of-type(2n+1) { background-color: rgba(255, 255, 255, 0.02); }";
  style.textContent +=
    ".loadButton {place-items: center;margin: 0 20px;border: none;background: transparent;color: #4A5FD2;font-size: 12px;font-weight: 600;line-height: 26px;text-transform: uppercase;}";
  style.textContent += "._success {color: #80D47B;}";
  style.textContent += "._fail {color: #D2554A;}";
  style.textContent += "._number {text-align:right;}";
  style.textContent +=
    ".type {display:inline-block; vertical-align: middle; width: 25px;min-height: 37px;text-align: center;background-repeat: no-repeat;}";

  document.head.appendChild(style);

  module.exports.players = {
    ["Invader"]: {
      userName: "Invader",
      userBadge: "https://screeps.com/api/user/badge-svg?username=Invader"
    }
  };

  var appHistory = document.getElementsByTagName("app-history")[0];
  module.exports.container = document.createElement("div");
  module.exports.container.style = "width: 100%; max-width:1100px; margin:auto;text-align:center;";

  module.exports.marketHistory = document.createElement("table");
  module.exports.marketHistory.style = "width: 100%;";

  module.exports.marketHistory.className = "app-market-table mat-table";

  const header = document.createElement("tr");
  module.exports.marketHistory.appendChild(header);
  header.className = "mat-header-row ng-star-inserted";
  header.style = "position:stricky;";
  const dateHeaderCell = document.createElement("td");
  dateHeaderCell.textContent = "Date";
  dateHeaderCell.className = "mat-header-cell cdk-column-date mat-column-date ng-star-inserted";
  header.appendChild(dateHeaderCell);

  const shardHeaderCell = document.createElement("td");
  shardHeaderCell.textContent = "Shard";
  shardHeaderCell.className = "mat-header-cell cdk-column-shard mat-column-shard ng-star-inserted";
  header.appendChild(shardHeaderCell);

  const tickHeaderCell = document.createElement("td");
  tickHeaderCell.textContent = "Tick";
  tickHeaderCell.className = "_number mat-header-cell cdk-column-tick mat-column-tick ng-star-inserted";
  header.appendChild(tickHeaderCell);

  const changeHeaderCell = document.createElement("td");
  changeHeaderCell.textContent = "Credit Change";
  changeHeaderCell.className = "_number mat-header-cell cdk-column-change mat-column-change";
  header.appendChild(changeHeaderCell);

  const resourceHeaderCell = document.createElement("td");
  resourceHeaderCell.textContent = "Resource Change";
  resourceHeaderCell.className = "_number mat-header-cell cdk-column-change";
  header.appendChild(resourceHeaderCell);

  const descriptionHeaderCell = document.createElement("td");
  descriptionHeaderCell.textContent = "Description";
  descriptionHeaderCell.className = "mat-header-cell cdk-column-description mat-column-description ng-star-inserted";
  header.appendChild(descriptionHeaderCell);

  appHistory.parentNode.replaceChild(module.exports.container, appHistory);

  module.exports.loadNewerButton = document.createElement("button");
  module.exports.loadNewerButton.className = "loadButton";
  module.exports.loadNewerButton.textContent = "Load new orders";
  module.exports.loadNewerButton.onclick = () => {
    // TODO: handle an issue where you wait for so long that page 0..N actually contains new orders
    module.exports.fetchMarketHistoryPage(0);
  };
  module.exports.container.appendChild(module.exports.loadNewerButton);

  module.exports.container.appendChild(module.exports.marketHistory);

  module.exports.loadMoreButton = document.createElement("button");
  module.exports.loadMoreButton.className = "loadButton";
  module.exports.loadMoreButton.textContent = "Load more orders";
  module.exports.loadMoreButton.onclick = () => {
    // TODO: move focus to new orders
    module.exports.fetchMarketHistoryPage(++module.exports.page);
  };
  module.exports.container.appendChild(module.exports.loadMoreButton);
};

module.exports.fetchPlayer = function (id, history) {
  module.ajaxGet("https://screeps.com/api/user/find?id=" + id, function (data, error) {
    /*
      {
        "ok": 1,
        "user": {
            "_id": "58519b0bee6ae29347627228",
            "username": "Geir1983",
            "badge": {
                "type": 13,
                "color1": "#0066ff",
                "color2": "#0066ff",
                "color3": "#2b2b2b",
                "param": -22,
                "flip": true
            },
            "gcl": 26007686581,
            "power": 705273606
        }
      }
    */

    if (data.ok) {
      module.exports.players[id] = {
        userName: data.user.username,
        userBadge: "https://screeps.com/api/user/badge-svg?username=" + data.user.username
      };
    }

    if (
      history.market &&
      history.market.dealer &&
      ((history.market.owner && module.exports.players[history.market.owner]) || history.market.npc) &&
      module.exports.players[history.market.dealer]
    ) {
      module.exports.insertRow(history);
      module.exports.sortTable();
    }
  });
};

module.exports.sortTable = function () {
  var table, rows, switching, i, x, y, shouldSwitch;
  table = module.exports.marketHistory;
  switching = true;
  /* Make a loop that will continue until
  no switching has been done: */
  while (switching) {
    // Start by saying: no switching is done:
    switching = false;
    rows = table.rows;
    /* Loop through all table rows (except the
    first, which contains table headers): */
    for (i = 1; i < rows.length - 1; i++) {
      // Start by saying there should be no switching:
      shouldSwitch = false;
      /* Get the two elements you want to compare,
      one from current row and one from the next: */
      x = rows[i].getElementsByTagName("TD")[2];
      y = rows[i + 1].getElementsByTagName("TD")[2];
      // Check if the two rows should switch place:
      if (x.innerHTML.toLowerCase() < y.innerHTML.toLowerCase()) {
        // If so, mark as a switch and break the loop:
        shouldSwitch = true;
        break;
      }
    }
    if (shouldSwitch) {
      /* If a switch has been marked, make the switch
      and mark that a switch has been done: */
      rows[i].parentNode.insertBefore(rows[i + 1], rows[i]);
      switching = true;
    }
  }
};

module.exports.fetchMarketHistoryPage = function (page) {
  module.ajaxGet("https://screeps.com/api/user/money-history?page=" + page, function (data, error) {
    /**
     * data
     *  ok: number // 1 for success
     *  hasMore: bool // has more pages
     *  list: [
     *      balance: number
     *      change: number
     *      date: date // "2021-07-18T06:13:50.016Z"
     *      market: {
     *      'market.sell' = {amount, dealer, npc, owner, price, resourceType, roomName, targetRoomName }
     *           'market.fee' = {order: {price, resourceType,roomName,totalAmoount,type}}
     *      }
     *      shard: string
     *      tick: number
     *      type: string | 'market.fee' | 'market.sell'
     *      user: string // userId
     *      _id: string // id of transaction
     *  ]
     *
     */
    if (!data.hasMore) {
      module.exports.loadMoreButton.disabled = true;
    }

    for (const history of data.list) {
      let missingPlayer = false;
      if (history.market && history.market.dealer && !module.exports.players[history.market.dealer]) {
        module.exports.fetchPlayer(history.market.dealer, history);
        missingPlayer = true;
      }

      if (history.market && history.market.owner && !module.exports.players[history.market.owner]) {
        module.exports.fetchPlayer(history.market.owner, history);
        missingPlayer = true;
      }

      if (!missingPlayer) {
        module.exports.insertRow(history);
      }
    }
    module.exports.sortTable();
  });
};

module.exports.insertRow = function (history) {
  if (document.getElementById(history._id)) {
    return;
  }

  const row = module.exports.generateHistoryHtmlRow(history);
  module.exports.marketHistory.appendChild(row);
};

module.exports.generateHistoryHtmlRow = function (history) {
  const row = document.createElement("tr");
  row.id = history._id;
  row.className = "mat-row ng-star-inserted";
  row.style = "height:auto";

  const dateCell = document.createElement("td");
  dateCell.className = "mat-cell cdk-column-date mat-column-date ng-star-inserted";
  // childs with _date and _time classes
  row.appendChild(dateCell);

  const shardCell = document.createElement("td");
  shardCell.className = "mat-cell cdk-column-shard mat-column-shard ng-star-inserted";
  row.appendChild(shardCell);

  const tickCell = document.createElement("td");
  tickCell.className = "_number mat-cell cdk-column-tick mat-column-tick ng-star-inserted";
  row.appendChild(tickCell);

  const changeCell = document.createElement("td");
  changeCell.className = `_number mat-cell cdk-column-change mat-column-change ${
    history.change > 0 ? "_success" : "_fail"
  }`;
  row.appendChild(changeCell);
  changeCell.textContent = module.exports.nFormatter(history.change);
  var creditsIcon = document.createElement("div");
  creditsIcon.setAttribute("style", "margin-right:0px !important");
  creditsIcon.className = "type resource-credits";
  changeCell.appendChild(creditsIcon);

  const resourceCell = document.createElement("td");
  resourceCell.className = `_number mat-cell cdk-column-change mat-column-change ${
    history.type == "market.buy" ? "_success" : "_fail"
  }`;
  row.appendChild(resourceCell);

  const descriptionCell = document.createElement("td");
  descriptionCell.className = "mat-cell cdk-column-description mat-column-description ng-star-inserted";
  descriptionCell.style = "text-align:right;";
  row.appendChild(descriptionCell);

  const date = new Date(history.date);
  dateCell.textContent = `${date.getDate().toString().padStart(2, "0")}-${(date.getMonth() + 1)
    .toString()
    .padStart(2, "0")}-${date.getFullYear() + 1} ${date.getHours().toString().padStart(2, "0")}:${date
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;
  shardCell.textContent = history.shard;
  tickCell.textContent = history.tick;

  var shard = history.shard || "shard0";

  // The description/resource cells used to be built as interpolated HTML strings
  // assigned to innerHTML, which the AMO linter flags as UNSAFE_VAR_ASSIGNMENT.
  // They are now assembled from DOM nodes (see the node helpers below): text is
  // set with textContent and nodes are appended in the same order, producing the
  // same rendered markup without an HTML sink.
  try {
    if (history.type == "market.fee") {
      /*
       "market": {
          "changeOrderPrice": {
            "orderId": "6172d9cc8a185129c593b3af",
            "oldPrice": 34.751,
            "newPrice": 34.801
          }
        },
       */
      if (history.market.extendOrder) {
        var market = history.market.extendOrder;

        descriptionCell.textContent = `Extend ${module.exports.nFormatter(market.addAmount)} `;
        descriptionCell.appendChild(module.exports.infoCircleNode(market));
      } else if (history.market.changeOrderPrice) {
        var market = history.market.changeOrderPrice;
        var priceChange = Math.abs(market.newPrice - market.oldPrice);
        var priceDigits = priceChange < 0.01 ? 3 : 2;

        descriptionCell.textContent = `Change Price ${module.exports.nFormatter(
          market.oldPrice,
          priceDigits
        )} -> ${module.exports.nFormatter(market.newPrice, priceDigits)} `;
        descriptionCell.appendChild(module.exports.infoCircleNode(market));
      } else {
        var market = history.market.order;
        var type = market.resourceType;
        var roomName = market.roomName;
        var feeResourceIcon = module.exports.resourceImageLink(shard, type);
        if (feeResourceIcon) {
          resourceCell.appendChild(feeResourceIcon);
        }

        const amount = market.remainingAmount
          ? `${module.exports.nFormatter(market.remainingAmount)} remaining`
          : `${module.exports.nFormatter(market.totalAmount)} total`;

        module.exports.appendChildren(descriptionCell, [
          module.exports.roomLinkNode(shard, roomName),
          " Market fee (",
          market.type,
          ") ",
          amount,
          " ",
          module.exports.resourceImageLink(shard, type),
          " (",
          module.exports.nFormatter(market.price),
          ") ",
          module.exports.infoCircleNode(market)
        ]);
      }
    } else if (history.type == "market.buy" || history.type == "market.sell") {
      var market = history.market;
      var type = market.resourceType;
      var roomName = market.roomName;
      var targetRoomName = market.targetRoomName;
      var accountResource = !roomName || !targetRoomName;
      var transactionCost = accountResource
        ? ""
        : module.exports.calcTransactionCost(shard, market.amount, roomName, targetRoomName);

      var ownerIsMe = market.owner == module.exports.userId;
      var dealerIsMe = market.dealer == module.exports.userId;

      var targetRoomIsMine = false;

      if (module.exports.shards[shard] && module.exports.shards[shard].rooms.includes(targetRoomName)) {
        let temp = roomName;
        roomName = targetRoomName;
        targetRoomName = temp;
        targetRoomIsMine = true;
      }

      const amount = module.exports.nFormatter(market.amount);
      var priceDigits = market.price < 0.01 ? 3 : 2;
      const price = module.exports.nFormatter(market.price, priceDigits);

      module.exports.appendChildren(resourceCell, [
        history.type == "market.sell" ? "-" : "",
        amount,
        module.exports.resourceImageLink(shard, type)
      ]);

      const soldOrBought = history.type == "market.buy" ? "bought" : "sold";

      if (history.market && history.market.dealer && !module.exports.players[history.market.dealer]) {
        module.exports.fetchPlayer(history.market.dealer);
      }

      const orderOwner = history.market.npc ? "Invader" : market.owner;

      const ownerPlayerName = module.exports.players[orderOwner] ? module.exports.players[orderOwner].userName : "";
      const ownerPlayerIcon = module.exports.players[orderOwner]
        ? module.exports.playerBadge(ownerPlayerName, module.exports.players[orderOwner].userBadge)
        : "";

      const dealerPlayerName = module.exports.players[market.dealer]
        ? module.exports.players[market.dealer].userName
        : "";
      const dealerPlayerIcon = module.exports.players[market.dealer]
        ? module.exports.playerBadge(dealerPlayerName, module.exports.players[market.dealer].userBadge)
        : "";

      if (accountResource) {
        module.exports.appendChildren(descriptionCell, [
          "Account: ",
          soldOrBought,
          " ",
          amount,
          module.exports.resourceImageLink(shard, type),
          " (",
          price,
          ") ",
          module.exports.infoCircleNode(market)
        ]);
      } else if (dealerIsMe) {
        module.exports.appendChildren(descriptionCell, [
          ownerPlayerIcon,
          " at ",
          module.exports.roomLinkNode(shard, targetRoomName),
          " ",
          amount,
          module.exports.resourceImageLink(shard, type),
          " (",
          price,
          ") Dealer ",
          dealerPlayerIcon,
          " ",
          soldOrBought,
          " from ",
          module.exports.roomLinkNode(shard, roomName),
          " ",
          module.exports.transactionCostNode(shard, transactionCost),
          " ",
          module.exports.infoCircleNode(market)
        ]);
      } else {
        module.exports.appendChildren(descriptionCell, [
          ownerPlayerIcon,
          " at ",
          module.exports.roomLinkNode(shard, roomName),
          " ",
          soldOrBought,
          " ",
          amount,
          module.exports.resourceImageLink(shard, type),
          " (",
          price,
          ") Dealer ",
          dealerPlayerIcon,
          " at ",
          module.exports.roomLinkNode(shard, targetRoomName),
          " ",
          module.exports.infoCircleNode(market)
        ]);
      }
    }
  } catch (error) {
    console.error(error);
    // Match the old innerHTML-replace semantics: clear any partial content first.
    descriptionCell.replaceChildren();
    module.exports.appendChildren(descriptionCell, [
      "Error: ",
      error.message,
      " ",
      module.exports.infoCircleNode(history)
    ]);
  }
  return row;
};

// Append a mix of strings/numbers and DOM nodes to `parent`, in order. Strings
// and numbers become text nodes; empty/absent entries are skipped (matching how
// an interpolated "" or a null icon contributed nothing to the old HTML string).
module.exports.appendChildren = function (parent, children) {
  children.forEach(function (child) {
    if (child === null || child === undefined || child === "") {
      return;
    }
    if (typeof child === "string" || typeof child === "number") {
      parent.appendChild(document.createTextNode(String(child)));
    } else {
      parent.appendChild(child);
    }
  });
};

// <div class="fa fa-question-circle" title='{json}'></div>
module.exports.infoCircleNode = function (data) {
  var infoCircle = document.createElement("div");
  infoCircle.className = "fa fa-question-circle";
  infoCircle.setAttribute("title", JSON.stringify(data));
  return infoCircle;
};

// <a href="#!/room/{shard}/{roomName}">{roomName}</a>
module.exports.roomLinkNode = function (shard, roomName) {
  var link = document.createElement("a");
  link.setAttribute("href", "#!/room/" + shard + "/" + roomName);
  link.textContent = roomName;
  return link;
};

// (<span style="...">-{cost} {energyIcon}</span>)
module.exports.transactionCostNode = function (shard, transactionCost) {
  var fragment = document.createDocumentFragment();
  fragment.appendChild(document.createTextNode("("));
  var span = document.createElement("span");
  span.setAttribute("style", "color:#ff8f8f;margin-right:-12px");
  span.appendChild(document.createTextNode("-" + module.exports.nFormatter(transactionCost) + " "));
  var energyIcon = module.exports.resourceImageLink(shard, "energy");
  if (energyIcon) {
    span.appendChild(energyIcon);
  }
  fragment.appendChild(span);
  fragment.appendChild(document.createTextNode(")"));
  return fragment;
};

module.exports.resourceImageLink = function (shard, type) {
  // market-resource--battery has -10px important margin, we need to override that
  if (!type) {
    return null;
  }
  var link = document.createElement("a");
  link.setAttribute("href", "#!/market/all/" + shard + "/" + type);
  link.setAttribute("title", type);
  var icon = document.createElement("div");
  icon.setAttribute("style", "margin-right:0px !important");
  icon.className = "type market-resource--" + type;
  link.appendChild(icon);
  return link;
};

module.exports.playerBadge = function (playerName, badge) {
  var appBadge = document.createElement("app-badge");
  appBadge.setAttribute("title", playerName);
  var link = document.createElement("a");
  link.setAttribute("href", "#!/profile/" + playerName);
  var img = document.createElement("img");
  img.setAttribute("src", badge);
  img.setAttribute("width", "16");
  img.setAttribute("height", "16");
  link.appendChild(img);
  appBadge.appendChild(link);
  return appBadge;
};

module.exports.update = function () {};

module.exports.nFormatter = function (num, digits = 2) {
  let convertFromNegative = 1;
  if (num < 0) {
    convertFromNegative = -1;
    num *= convertFromNegative;
  }
  let si = [
    { value: 1, symbol: "" },
    { value: 1e3, symbol: "k" },
    { value: 1e6, symbol: "M" },
    { value: 1e9, symbol: "G" },
    { value: 1e12, symbol: "T" },
    { value: 1e15, symbol: "P" },
    { value: 1e18, symbol: "E" }
  ];
  let rx = /\.0+$|(\.[0-9]*[1-9])0+$/;
  let i;
  for (i = si.length - 1; i > 0; i--) {
    if (num >= si[i].value) {
      break;
    }
  }
  const formatted = (num / si[i].value).toFixed(digits).replace(rx, "$1") * convertFromNegative;
  return formatted + si[i].symbol;
};

/* taken from @screeps market */
module.exports.calcTransactionCost = function (shard, amount, roomName1, roomName2) {
  var distance = module.exports.calcRoomsDistance(shard, roomName1, roomName2, true);

  // TODO: export distance to render in table
  return Math.ceil(amount * (1 - Math.exp(-distance / 30)));
};

/* taken from @screeps utils */
module.exports.calcRoomsDistance = function (shard, room1, room2, continuous) {
  var _exports$roomNameToXY = module.exports.roomNameToXY(room1);

  var _exports$roomNameToXY2 = module.exports._slicedToArray(_exports$roomNameToXY, 2);

  var x1 = _exports$roomNameToXY2[0];
  var y1 = _exports$roomNameToXY2[1];

  var _exports$roomNameToXY3 = module.exports.roomNameToXY(room2);

  var _exports$roomNameToXY4 = module.exports._slicedToArray(_exports$roomNameToXY3, 2);

  var x2 = _exports$roomNameToXY4[0];
  var y2 = _exports$roomNameToXY4[1];

  var dx = Math.abs(x2 - x1);
  var dy = Math.abs(y2 - y1);
  if (continuous) {
    var { width, height } = module.exports.shards[shard];

    dx = Math.min(width - dx, dx);
    dy = Math.min(height - dy, dy);
  }
  return Math.max(dx, dy);
};

/* taken from @screeps utils */
module.exports.roomNameToXY = function (name) {
  name = name.toUpperCase();

  var match = name.match(/^(\w)(\d+)(\w)(\d+)$/);
  if (!match) {
    return [undefined, undefined];
  }

  var _match = module.exports._slicedToArray(match, 5);

  var hor = _match[1];
  var x = _match[2];
  var ver = _match[3];
  var y = _match[4];

  if (hor == "W") {
    x = -x - 1;
  } else {
    x = +x;
  }
  if (ver == "N") {
    y = -y - 1;
  } else {
    y = +y;
  }
  return [x, y];
};

/* taken from @screeps utils */
module.exports._slicedToArray = (function () {
  function sliceIterator(arr, i) {
    var _arr = [];
    var _n = true;
    var _d = false;
    var _e = undefined;
    try {
      for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) {
        _arr.push(_s.value);
        if (i && _arr.length === i) break;
      }
    } catch (err) {
      _d = true;
      _e = err;
    } finally {
      try {
        if (!_n && _i["return"]) _i["return"]();
      } finally {
        if (_d) throw _e;
      }
    }
    return _arr;
  }
  return function (arr, i) {
    if (Array.isArray(arr)) {
      return arr;
    } else if (Symbol.iterator in Object(arr)) {
      return sliceIterator(arr, i);
    } else {
      throw new TypeError("Invalid attempt to destructure non-iterable instance");
    }
  };
})();

ScreepsSC.end(module);
})();
