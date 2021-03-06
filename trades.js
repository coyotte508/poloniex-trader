const TradeMaker = require("./averager.js");
var trades = TradeMaker();

/* Functions analyzing trades in a time range */
const internals = {};
var lastTrade = null;

function addTrade(trade, order) {
  trades.addData(trade, {date: trade.date, order});
  lastTrade = trade;
}

function getHigh(trades) {
  var high = 0;

  trades.forEach(function(trade) {
    if (trade.rate > high) {
      high = trade.rate;
    }
  });

  return high;
};

function getLow(trades) {
  var low = 0;

  trades.forEach(function(trade) {
    if (low == 0 || trade.rate < low) {
      low = trade.rate;
    }
  });

  return low;
};

/* Todo: collate several trades into one and so on. Flawed when tons of trades. */
function averageRate(trades) {
  var total = 0;
  var cnt = 0;

  trades.forEach(function(trade) {
    total += +trade.rate*(+trade.amount);
    cnt += +trade.amount;
  });

  try {
    return total/cnt;
  } catch(error) {
    return 0;
  }
}

/* Todo: collate several trades into one and so on. Flawed when tons of trades. */
function volume(trades) {
  var cnt = 0;

  trades.forEach(function(trade) {
    cnt += +trade.amount;
  });

  return cnt;
}

function rate() {
  return getLastTrade().rate;
}

/* Utility functions */
function getLastTrade() {
  return lastTrade || {};
}

function makeAveragingFunction(identifier, baseFunc, propName, filter) {
  return function(trades, averages) {
    averages = (averages || []).map(av => av.data[identifier]);

    //console.log(averages);
    var newTrades = trades.map(it => it.object).concat(averages.map(function(item) {
      var fakeTrade = {amount: item.weight};
      fakeTrade[propName] = item.data;

      return fakeTrade;
    }));

    if (filter) {
      newTrades = newTrades.filter(el =>  !el.type || el.type == filter);
    }

    var data = baseFunc(newTrades);
    var weight = newTrades.map(el => el.amount).reduce((prev, cur) => prev + (+cur), 0);

    return {data, weight};
  };
}

function generateFunctions(args) {
  args.forEach(function(arg) {
    var func = arg.averagingFunction = (arg.averagingFunction || makeAveragingFunction(arg.id, arg.func, arg.prop, arg.filter));
    trades.addAveragingFunction(arg.id, func);
    internals[arg.id] = internals[arg.id] || function(begin, end) {
      begin = begin === undefined ? 3600 : begin;
      end = end || 0;
      var tradeData = trades.getAveragedDataTimeRange(trades.currentTime-begin, trades.currentTime-end);
      //console.log(begin, end, tradeData);

      return func(tradeData.trades, tradeData.averages).data;
    }
  });
}

var functions = [
  {id: "low", func: getLow, prop: "rate"},
  {id: "high", func: getHigh, prop: "rate"},
  {id: "volume", func: volume, prop: "amount"},
  {id: "average", func: averageRate, prop: "rate"},
  {id: "averageSell", func: averageRate, prop: "rate", filter: "sell"},
  {id: "averageBuy", func: averageRate, prop: "rate", filter: "buy"}
];

generateFunctions(functions);

internals["lastPrice"] = rate;


console.log(internals);

/* Exports */

module.exports = {
  addTrade,
  currentTime: function() { 
    return trades.currentTime;
  },
  reset: function() {
    trades = TradeMaker(); 
    lastTrade = null;
    generateFunctions(functions);
  }
};

for (key in internals) {
  module.exports[key] = internals[key];
}