const https = require("https");
const trades = require("./trades.js");
const autobahn = require('autobahn');

var wsuri = "wss://api.poloniex.com";
var market = "BTC_XMR";
var connection = new autobahn.Connection({
  url: wsuri,
  realm: "realm1"
});

var cnt = 0;

/* We get trades from both the poloniex API and the websocket, so we use those variables to avoid storing the same trade twice */
var tradeIds = {};
var shouldAdd = true;
var cache = [];

connection.onopen = function (session) {
  function marketEvent (args,kwargs) {
    args.forEach(function(event) {
      if (event.type != "newTrade") {
        return;
      }
      if (shouldAdd) {
        cache.push(event.data);
      } else {
        addTrade(event.data);
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
  console.log("Websocket connection closed");
}

connection.open();

function addTrade(trade) {
  //console.log(++cnt, event.data);
  if (trade.tradeID in tradeIds) {
    return;
  }
  if (shouldAdd) {
    tradeIds[trade.tradeID] = true;
  }
  
  trades.addTrade(trade);
}

var current = Math.floor(new Date().getTime()/1000);

https.get("https://poloniex.com/public?command=returnTradeHistory&currencyPair=" + market + "&start=" + (current - (30*24*3600)) + "&end=" + current, (res) => {
  console.log(`Got response: ${res.statusCode}`);
  
  if (res.statusCode == 200) {
    var allData = "";
    res.on("data", function(chunk) {
      allData += chunk;
    });
    res.on("end", function() {
      /* Reversing because trades are in reverse order */
      allData = JSON.parse(allData).reverse();
      console.log("Trades gotten trying to go back a month: " + allData.length);
      allData.forEach(function(item) {
        addTrade(item);
      });
      shouldAdd = false;
      cache.forEach(it => addTrade(it));
    });
  } else {
    res.resume();
  }
}).on('error', (e) => {
  console.log(`Got error: ${e.message}`);
});

module.exports = {
  trades,
  market
};