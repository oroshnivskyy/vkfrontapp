"use strict";

var Promise = require('promise');
var amqp = require('amqplib/callback_api');

module.exports = function (cfg) {
    return new Promise(function (resolve, reject) {
        amqp.connect(cfg.url, function (err, conn) {
            if (err) {
                reject(err)
            }
            conn.createChannel(function (err, ch) {
                if (err) {
                    reject(err)
                }

                resolve(ch)
            });
        });
    });
};
