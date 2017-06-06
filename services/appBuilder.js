"use strict";
var Promise = require('promise');
var App = require('./app.js');
var getMongo = require('./mongodb.js');
var getRabbit = require('./rabbitmq.js');

module.exports = function (cfg) {
    var mongoPromise = getMongo(cfg.mongodb);
    var rabbitPromise = getRabbit(cfg.rabbitmq);
    return new Promise(function (resolve, reject) {
        Promise.all([mongoPromise, rabbitPromise])
            .then(function (conns) {
                var mongo = conns[0];
                var ch = conns[1];
                var apps = {};
                ch.assertQueue('new_dialog', {durable: true});
                ch.assertExchange('messages', 'direct', {durable: true});
                cfg.apps.forEach(function (appCfg) {
                    var dialogsDb = mongo.collection('dialogs');
                    apps[appCfg.name] = new App(appCfg, dialogsDb, ch);
                });
                resolve(apps);
            }, function (error) {
                reject("Can't connect: " + error);
            });
    });
};