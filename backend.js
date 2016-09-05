const https = require("https");
const trades = require("./trades.js");
const autobahn = require('autobahn');
const PoloBook = require('poloniex-orderbook');

const _ = require('lodash');

var wsuri = "wss://api.poloniex.com";
var market = null;
var connection;

var cnt = 0;

/* We get trades from both the poloniex API and the websocket, so we use those variables to avoid storing the same trade twice */
var tradeIds = {};
var shouldAdd = true;
var cache = [];

var polobook = {};

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
  if (market == config.market) {
    return;
  }
  var current = ++cnt;
  market = config.market;

  shouldAdd = true;
  cache = [];  
  tradeIds = {};
  trades.reset();
    
  makeConnection();
  
  getOldTrades();
  polobook = new PoloBook(market);
  polobook.start();
}

module.exports = {
  trades,
  market,
  currentTime : function() {
    return trades.currentTime();
  },
  init,
  bid: () => polobook && polobook.bids && polobook.bids.length > 0 ? polobook.bids[0][0] : "0",
  ask: () => polobook && polobook.asks && polobook.asks.length > 0 ? polobook.asks[0][0] : "0",
  spread: () => (+module.exports.ask())-(+module.exports.bid())
};