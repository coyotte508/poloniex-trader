const trades = require("./trades.js");
const autobahn = require('autobahn');
var wsuri = "wss://api.poloniex.com";
var market = "BTC_XMR";
var connection = new autobahn.Connection({
  url: wsuri,
  realm: "realm1"
});

var cnt = 0;

connection.onopen = function (session) {
  function marketEvent (args,kwargs) {
    args.forEach(function(event) {
      if (event.type != "newTrade") {
        return;
      }
      console.log(++cnt);
      trades.addTrade(event.data, kwargs.seq);
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

module.exports = {
  trades,
  market
};