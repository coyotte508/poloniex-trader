const express = require('express');
const path = require('path');
const compression = require('compression');
const bodyParser = require('body-parser');
const basicAuth = require('basic-auth');
const https = require('https');
const httpsPort = 3444;
const fs = require("fs");
const moment = require("moment-timezone");

const backend = require("./backend.js");
const config = {};
const app = express();

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
  res.render('index', {config, trades: backend.trades, error:null, market:backend.market})
});

app.listen(3001);

// Setup HTTPS
const ssloptions = {
  key: fs.readFileSync('app/security/private.key'),
  cert: fs.readFileSync('app/security/certificate.pem')
};
var secureServer = https.createServer(ssloptions, app).listen(httpsPort);
