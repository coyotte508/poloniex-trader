const https = require("https");
const trades = require("./trades.js");
const autobahn = require('autobahn');
const _ = require('lodash');

var wsuri = "wss://api.poloniex.com";
var market = null;
var connection;

var cnt = 0;

/* We get trades from both the poloniex API and the websocket, so we use those variables to avoid storing the same trade twice */
var tradeIds = {};
var shouldAdd = true;
var cache = [];

var orderBook = {};

var orderBookCnt = 0;
var lastSeq = 0;

var highestBid = 0;
var lowestAsk = 0;

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
      if (lastSeq == 0) {
        lastSeq = kwargs.seq;
      }
      ++orderBookCnt;
      var cBid, cAsk;
      cBid = cAsk = false;
      args.forEach(function(event) {
        if (event.type == "newTrade") {
          //console.log(shouldAdd, event.data);
          if (shouldAdd) {
            cache.push(event.data);
          } else {
            addTrade(event.data);
          }
        } else {
          // if out-of-date entry
          if (event.data.rate in orderBook && orderBook[event.data.rate].seq > kwargs.seq) {
            return;
          }
          if (event.type == "orderBookModify") {
            orderBook[event.data.rate] = {amount: event.data.amount, seq: kwargs.seq, type: event.data.type};

            if (event.data.type == "bid" && +event.data.rate > highestBid) {
              highestBid = +event.data.rate;
            } else if (event.data.type == "ask" && +event.data.rate < lowestAsk) {
              lowestAsk = +event.data.rate;
            }
          } else if (event.type == "orderBookRemove") {
            orderBook[event.data.rate] = {amount: 0, seq: kwargs.seq};

            if (event.data.rate == highestBid) {
              cBid = true;
            } 
            if (event.data.rate == lowestAsk) {
              cAsk = true;
            }
          }
        } 
      });
      if (cBid) {
        recalculateHighestBid();
      }
      if (cAsk) {
        recalculateLowestAsk();
      }
      /* Clean removed orders periodically */
      if (orderBookCnt % 500 == 0) {
        var keys = _.keys(orderBook);
        keys.forEach(function(key) {
          if (orderBook[key].amount == 0 && orderBook.seq < lastSeq) {
            delete orderBook[key];
          }
        });
        lastSeq = kwargs.seq;
      }
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

function recalculateHighestBid() {
  highestBid = 0;
  _.keys(orderBook).forEach(function(key) {
    if (+key > highestBid && orderBook[key].amount && orderBook[key].type == "bid") {
      highestBid = +key;
    }
  });
}

function recalculateLowestAsk() {
  lowestAsk = Infinity;
  _.keys(orderBook).forEach(function(key) {
    if (+key < lowestAsk && orderBook[key].amount && orderBook[key].type == "ask") {
      lowestAsk = +key;
    }
  });
}

function getOrderBook() {
  var currentCount = cnt;

  https.get("https://poloniex.com/public?command=returnOrderBook&currencyPair=" + market, (res) => {
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
        allData = JSON.parse(allData);

        allData.bids.forEach(function(bid) {
          if (bid[0] in orderBook && orderBook[bid[0]].seq > allData.seq) {
            return;
          }
          orderBook[bid[0]] = {amount: bid[1], seq: allData.seq, type: "bid"};
        });
        allData.asks.forEach(function(bid) {
          if (bid[0] in orderBook && orderBook[bid[0]].seq > allData.seq) {
            return;
          }
          orderBook[bid[0]] = {amount: bid[1], seq: allData.seq, type: "ask"};
        });
        recalculateLowestAsk();
        recalculateHighestBid();
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
  orderBook = {};
  lastSeq = 0;
  orderBookCnt = 0;
  trades.reset();
    
  makeConnection();
  
  getOldTrades();
  getOrderBook();
}

module.exports = {
  trades,
  market,
  currentTime : function() {
    return trades.currentTime();
  },
  init,
  bid: () => highestBid,
  ask: () => lowestAsk,
  spread: () => lowestAsk-highestBid
};