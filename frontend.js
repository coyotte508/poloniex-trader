const express = require('express');
const path = require('path');
const compression = require('compression');
const bodyParser = require('body-parser');
const basicAuth = require('basic-auth');
const https = require('https');
const httpsPort = 3444;
const plnx = require("plnx");
const fs = require("fs");
const moment = require("moment-timezone");
const _ = require('lodash');
const assert = require('assert');

const backend = require("./backend.js");
const app = express();

const storage = require('node-persist');

storage.initSync();

const config = _.extend(
  {market: "BTC_XMR", markets: ["BTC_XMR"], api:{}, balances: {}},
  storage.getItemSync("config") || {}
);

console.log(config);
backend.init(config);

app.set("port_https", httpsPort);

// Synchronous
var auth = function (req, res, next) {
  function unauthorized(res) {
    res.set('WWW-Authenticate', 'Basic realm=Authorization Required');
    return res.sendStatus(401);
  };

  /* No auth saved, so direct access */
  if (!config.webadmin || !config.webadmin.user) {
    return next();
  }

  if (!req.secure) {
    res.redirect('https://'+req.hostname+':'+app.get('port_https')+req.url);
  }

  var user = basicAuth(req);

  if (!user || !user.name || !user.pass) {
    return unauthorized(res);
  };

  if (user.name === config.webadmin.user && user.pass === config.webadmin.password) {
    return next();
  } else {
    return unauthorized(res);
  };
};

function analyzeBeginEnd(time) {
  var spls = time.split("-");
  var res = [];

  spls.forEach( function (spl) {
    spl = spl.trim();

    var tot = 0;

    if (spl.includes("h")) {
      tot += (+spl.substr(0, spl.indexOf("h")))*3600;
      spl = spl.substr(spl.indexOf("h") + 1);
    }
    if (spl.includes("m")) {
      tot += (+spl.substr(0, spl.indexOf("m")))*60;
      spl = spl.substr(spl.indexOf("m") + 1);
    }
    if (spl.includes("s")) {
      tot += (+spl.substr(0, spl.indexOf("s")));
      spl = spl.substr(spl.indexOf("s") + 1);
    }

    res.push(tot);
  });

  if (res.length < 1) {
    res.push(0);
  }

  if (res.length < 2) {
    res.push(0);
  }

  res[0] = res[0] || 3600;
  return res;
}

function saveConfig() {
  storage.setItemSync("config", config);

  console.log("updated saved configuration");
}

app.use(compression());

app.use( bodyParser.json() );       // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({     // to support URL-encoded bodies
  extended: true
})); 

console.log(__dirname + '/public');
app.use("/", express.static(__dirname + '/public'));
app.set('view engine', 'ejs'); 

app.get('/', auth, function(req, res) {
  config.time = req.query.time || "1h";
  var times = analyzeBeginEnd(config.time);
  config.begin = times[0];
  config.end = times[1];
  res.render('index', {config, trades: backend.trades, backend, error:null})
});

app.post("/", auth, function(req, res) {
  console.log(JSON.stringify(req.body));
  var error;
  try {
    if (req.body.action == "glconf") {
      assert(req.body.market);

      console.log("changing market to " + config.market);

      config.market = req.body.market;

      var chgd = config.api.key != req.body.apikey || config.api.secret != req.body.apisecret;
      config.api.key = req.body.apikey;
      config.api.secret = req.body.apisecret;
      backend.init(config);

      saveConfig();

      if (chgd) {
        poloTrade = makeWrapper();
      }
    }

    console.log("sending success");
  } catch(err) {
    console.log("sending back error", err);
    res.status(500);
    error = err.message;
  }

  res.render('index', {config, error, trades: backend.trades, backend});
});

app.listen(3001);

// Setup HTTPS
const ssloptions = {
  key: fs.readFileSync('app/security/private.key'),
  cert: fs.readFileSync('app/security/certificate.pem')
};
var secureServer = https.createServer(ssloptions, app).listen(httpsPort);

https.get("https://poloniex.com/public?command=returnTicker", (res) => {
  console.log(`Got response: ${res.statusCode}`);
  
  if (res.statusCode == 200) {
    var allData = "";
    res.on("data", function(chunk) {
      allData += chunk;
    });
    res.on("end", function() {
      /* Reversing because trades are in reverse order */
      allData = JSON.parse(allData);
      config.markets = _.keys(allData).sort();
    });
  } else {
    res.resume();
  }
}).on('error', (e) => {
  console.log(`Got error: ${e.message}`);
});

function updateBalances() {
  plnx.returnCompleteBalances(config.api, (err, data) => {
    if (err) {
      console.error(err);
    } else {
      config.balances = data;
      _.keys(config.balances).forEach((key) => {
        if (!+config.balances[key].btcValue) {
          delete config.balances[key];
        }
      });
      console.log(config.balances);
    }

    setTimeout(updateOrders, 500);
  });
}

function updateOrders() {
  plnx.returnOpenOrders(_.extend({currencyPair: config.market}, config.api), (err, data) => {
    if (err) {
      console.error(err);
    } else {
      config.openOrders = data;
      console.log(config.openOrders);
    }

    setTimeout(updateBalances, 1000);
  });
}

updateOrders();