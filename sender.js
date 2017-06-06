#!/usr/bin/env node
"use strict";
var amqp = require('amqplib/callback_api');
var cfg = require('./config.js');

amqp.connect(cfg.rabbitmq.url, function(err, conn) {
    conn.createChannel(function(err, ch) {
        var q = 'new_dialog';
        var msg = "Hello World!";

        ch.assertQueue(q, {durable: true});
        ch.sendToQueue(q, new Buffer(msg), {persistent: true});
        console.log(" [x] Sent '%s'", msg);
        setTimeout(function() { conn.close(); process.exit(0) }, 500);
    });
});