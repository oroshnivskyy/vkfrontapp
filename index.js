#!/usr/bin/env node
"use strict";
var cfg = require('./config.js');
var Server = require('./server.js');
var appBuilder = require('./services/appBuilder.js');
var appPromise = appBuilder(cfg);

appPromise.then(
    function (apps) {
        var server = new Server(cfg.server, apps);
        server.run();
        for (var key in apps) {
            apps[key].run();
        }
    }
    ,
    function (error) {
        alert("Can't connect: " + error);
    }
)
;