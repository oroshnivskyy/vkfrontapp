"use strict";
var Promise = require('promise');

module.exports = function (cfg) {
    return new Promise(function (resolve, reject) {
        var MongoClient = require('mongodb').MongoClient;
        MongoClient.connect(cfg.url, function (err, db) {
            if (err) {
                reject(err)
            }
            resolve(db);
        });
    });
};
