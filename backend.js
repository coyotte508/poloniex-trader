const https = require("https");
const trades = require("./trades.js");
const _ = require('lodash');
const plnx = require("plnx");
const autobahn = require('autobahn');
const PoloBook = require('poloniex-orderbook');
const vm = require('vm');

var wsuri = "wss://api.poloniex.com";
var market = null;
var connection;

var cnt = 0;

/* We get trades from both the poloniex API and the websocket, so we use those variables to avoid storing the same trade twice */
var tradeIds = {};
var shouldAdd = true;
var cache = [];

var polobook = {};
var conf;

function makeConnection() {
  if (connection) {
    try {
      connection.close();
    } catch (err) {
      console.log(err);
    }
  }
  connection = new autobahn.Connection({
    url: wsuri,
    realm: "realm1"
  });
  connection.cnt = cnt;

  connection.onopen = function (_session) {
    if (connection.cnt != cnt) {
      return;
    }
    session = _session;

    function marketEvent (args,kwargs) {
      if (cnt != connection.cnt) {
        return;
      }
      args.forEach(function(event) {
        if (event.type == "newTrade") {
          //console.log(shouldAdd, event.data);
          if (shouldAdd) {
            cache.push(event.data);
          } else {
            addTrade(event.data);
          }
        }
      });
    }
    function tickerEvent (args,kwargs) {
      if (args[0] != market) {
        return;
      }
      //console.log("ticker", args);
    }
    function trollboxEvent (args,kwargs) {
      //console.log("chat", args);
    }
    session.subscribe(market, marketEvent);
    session.subscribe('ticker', tickerEvent);
    session.subscribe('trollbox', trollboxEvent);
  }

  connection.onclose = function () {
    console.log("Websocket connection closed", arguments);
  }

  connection.open();
}

function addTrade(trade) {
  if (trade.tradeID in tradeIds) {
    return;
  }
  if (shouldAdd) {
    tradeIds[trade.tradeID] = true;
  }
  
  trades.addTrade(trade);
}

var current = Math.floor(new Date().getTime()/1000);

function getOldTrades() {
  var currentCount = cnt;

  https.get("https://poloniex.com/public?command=returnTradeHistory&currencyPair=" + market + "&start=" + (current - (30*24*3600)) + "&end=" + current, (res) => {
    console.log(`Got response: ${res.statusCode}`);
    
    if (res.statusCode == 200) {
      var allData = "";
      res.on("data", function(chunk) {
        allData += chunk;
      });
      res.on("end", function() {
        if (currentCount != cnt) {
          return;
        }
        /* Reversing because trades are in reverse order */
        allData = JSON.parse(allData).reverse();
        console.log("Trades gotten trying to go back a month: " + allData.length);
        allData.forEach(function(item) {
          addTrade(item);
        });
        shouldAdd = false;
        cache.forEach(it => addTrade(it));
        cache = [];
      });
    } else {
      res.resume();
    }
  }).on('error', (e) => {
    console.log(`Got error: ${e.message}`);
  });
}

function init(config) {
  conf = config;
  if (market == config.market) {
    return;
  }
  var current = ++cnt;
  market = config.market;
  buyOrders = config.buyOrders;
  sellOrders = config.sellOrders;

  shouldAdd = true;
  cache = [];  
  tradeIds = {};
  trades.reset();
    
  makeConnection();
  
  getOldTrades();
  polobook = new PoloBook(market);
  polobook.start();
}

function isAvailable() {
  return shouldAdd ? false : true;
}

var loopEventInternal = {
  lastUpdatedBalance: 0,
  lastUpdatedOrders: 0,
  lastTakenBuyOrder: 1,
  lastTakenSellOrder: 1
};

loopEvent = _.throttle(()=>{
  var current = Date.now();
  //console.log("looping");

  var data = loopEventInternal;

  var pairs = {
    lastTakenSellOrder: doSellOrders,
    lastTakenBuyOrder: doBuyOrders
  };

  if (current - data.lastUpdatedBalance > 1000) {
    pairs.lastUpdatedBalance = updateBalances;
  }

  if (current - data.lastUpdatedBalance > 1000) {
    pairs.lastUpdatedOrders = updateOrders;
  }

  var keys = _.keys(pairs).sort(function(k1, k2) {
    return data[k1] - data[k2];
  });

  for (let key of keys) {
    //console.log("executing", key);
    if (pairs[key]()) {
      return;
    }
  }

  //console.log("adding to back timer");
  loopEvent();

}, 205);

function doBuyOrders() {
  if (!conf) {
    return false;
  }

  if (analyzeOrders("buy", conf.buyOrders, conf.balances[conf.curr1])) {
    loopEventInternal.lastTakenBuyOrder = Date.now();
    return true;
  }

  return false;
}

function doSellOrders() {
  if (!conf) {
    return false;
  }

  if (analyzeOrders("sell", conf.sellOrders, conf.balances[conf.curr2])) {
    loopEventInternal.lastTakenSellOrder = Date.now();
    return true;
  }

  return false;
}

function analyzeOrders(type, orders, balance) {
  if (!isAvailable()) {
    return false;
  }

  try {
    balance = balance || {};
    var avail = +(balance.available || 0);
    var onOrders = +(balance.onOrders || 0);
    var total = avail+onOrders;
    var availPercent = avail == 0 ? 0 : 100*avail/total;
    for (let order of orders) {
      if (avail == 0) {
        continue;
      }
      if (availPercent < order.availPercent) {
        continue;
      }
      if (avail < order.availMin) {
        continue;
      }

      var context = {
        ask: +ask(), bid: +bid(), spread: spread(), 
        available: avail, onOrders, total     
      }
      vm.createContext(context);

      var price = vm.runInContext(order.price, context) || 0;
      
      if (!price) {
        continue;
      }

      var btcAmount = vm.runInContext(order.amount, context) || 0;

      if (!btcAmount || avail < btcAmount) {
        continue;
      }

      //Second currency's amount
      var amount = btcAmount / price;

      if (amount < 0.0001) {
        continue;
      }

      plnx[type](_.extend({currencyPair: market, rate: price, amount}, conf.api), (err, data) => {
        if (err) {
          console.error(err);
        } else {
          console.log(data);
        }

        loopEvent();
      });

      return true;
    }
  } catch (err) {
    console.error(err);
  }

  return false;
}

function updateBalances() {
  var config = conf;
  if (!config) {
    return false;
  }
  plnx.returnCompleteBalances(config.api, (err, data) => {
    if (err) {
      console.error(err);
    } else {
      loopEventInternal.lastUpdatedBalance = Date.now();

      config.balances = data;
      _.keys(config.balances).forEach((key) => {
        if (!+config.balances[key].btcValue) {
          delete config.balances[key];
        }
      });
      //console.log(config.balances);
    }

    loopEvent();
  });
  return true;
}

function updateOrders() {
  var config = conf;
  if (!config) {
    return false;
  }
  plnx.returnOpenOrders(_.extend({currencyPair: config.market}, config.api), (err, data) => {
    if (err) {
      console.error(err);
    } else {
      loopEventInternal.lastUpdatedOrders = Date.now();

      config.openOrders = data;
      //console.log(config.openOrders);
    }

    loopEvent();
  });
  return true;
}

loopEvent();

function ask() {
  return polobook && polobook.asks && polobook.asks.length > 0 ? polobook.asks[0][0] : "0";
}

function bid() {
  return polobook && polobook.bids && polobook.bids.length > 0 ? polobook.bids[0][0] : "0";
}

function spread() {
  return +ask() - (+bid());
}

module.exports = {
  trades,
  market,
  currentTime : function() {
    return trades.currentTime();
  },
  init,
  bid,
  ask,
  spread
};