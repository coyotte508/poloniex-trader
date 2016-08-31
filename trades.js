var trades = [];

function addTrade(trade, order) {
  trades.push(trade);
}

function getHigh(type) {
  var high = 0;

  applyTrades(type, function(trade) {
    if (trade.rate > high) {
      high = trade.rate;
    }
  });

  return high;
}

function getLow(type) {
  var low = 0;

  applyTrades(type, function(trade) {
    if (low === 0 || trade.rate < low) {
      low = trade.rate;
    }
  });

  return low;
}

/* Todo: collate several trades into one and so on. Flawed when tons of trades. */
function averageRate(type) {
  var total = 0;
  var cnt = 0;

  applyTrades(type, function(trade) {
    total += trade.rate;
    cnt += trade.amount;
  });

  try {
    return total/cnt;
  } catch(error) {
    return 0;
  }
}

/* Todo: collate several trades into one and so on. Flawed when tons of trades. */
function volume(type) {
  var cnt = 0;

  applyTrades(type, function(trade) {
    cnt += trade.amount;
  });

  return cnt;
}

module.exports = {
  addTrade,
  getHigh,
  getLow,
  averageRate,
  volume
};