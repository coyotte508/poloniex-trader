var autobahn = require('autobahn');
var wsuri = "wss://api.poloniex.com";
var market = "BTC_XMR";
var connection = new autobahn.Connection({
  url: wsuri,
  realm: "realm1"
});

connection.onopen = function (session) {
  function marketEvent (args,kwargs) {
    args.forEach(function(event) {
      if (event.type != "newTrade") {
        return;
      }
      console.log("market", event, kwargs);
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