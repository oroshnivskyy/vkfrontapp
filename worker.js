#!/usr/bin/env node
"use strict";

var cfg = require('./config.js');
var amqp = require('amqplib/callback_api');
var https = require('https');
var Promise = require('promise');
var async = require('asyncawait/async');
var await = require('asyncawait/await');
var mongo = require('mongodb');
var ObjectID = mongo.ObjectID;
var intel = require('intel');
intel.basicConfig({
    'format': '[%(date)s] %(name)s.%(levelname)s: %(message)s'
});

var mongoPromise = new Promise(function (resolve, reject) {
    var MongoClient = mongo.MongoClient;
    MongoClient.connect(cfg.mongodb.url, function (err, db) {
        if (err) {
            reject(err)
        }
        resolve(db);
    });
});

mongoPromise.then(function (mongo) {
    amqp.connect(cfg.rabbitmq.url, function (err, conn) {
        conn.createChannel(function (err, ch) {
            var dialogQueue = "new_dialog";
            ch.assertQueue(dialogQueue, {durable: true});
            ch.prefetch(1);
            var dialogsDb = mongo.collection('dialogs');
            ch.consume(dialogQueue, newDialog(ch, dialogsDb), {noAck: false});
        });

        conn.createChannel(function (err, ch) {
            var messageExchange = 'messages';
            ch.assertExchange(messageExchange, 'direct', {durable: true});
            ch.prefetch(1);
            var dialogsDb = mongo.collection('dialogs');
            cfg.apps.forEach(function (appCfg) {
                var queueName = 'queue-' + appCfg.name;
                ch.assertQueue(queueName, {durable: true}, function (err, q) {
                    ch.bindQueue(q.queue, messageExchange, appCfg.name);
                    ch.consume(queueName, newMessage(ch, dialogsDb), {noAck: false});
                });
            });
        });
    });
}, function (error) {
    alert("Can't connect: " + error);
});


function newDialog(ch, dialogsDb) {
    return function (data) {
        intel.info('[x] Received dialog %s', JSON.stringify(data.content.toString()));
        var d = JSON.parse(data.content);
        newChannel(d, dialogsDb)
            .then(function () {
                ch.ack(data);
            })
            .catch(function (e) {
                intel.error(e);
                ch.ack(data);
            });
    }
}

var newChannel = async(function (d, dialogsDb) {
    var dialog = await(dialogsDb.findOne({_id: new ObjectID(d.dialog_id)}));
    if (!dialog) {
        throw new Error("Dialog not found");
    }
    if (!dialog.frontapp.chan_id) {
        var result = await(createChannel({'settings': {'webhook_url': 'http://example.com'}}, dialog.frontapp.inbox_id, dialog.frontapp.token));
        return await(dialogsDb.updateOne({_id: new ObjectID(dialog._id)}, {'$set': {'frontapp.chan_id': result.id}}));
    }
});

function newMessage(ch, dialogsDb) {
    return function (data) {
        intel.info(" [x] Received message %s", JSON.stringify(data.content.toString()));
        sendMessage(JSON.parse(data.content), dialogsDb)
            .then(function () {
                ch.ack(data);
            })
            .catch(function (e) {
                intel.error(e);
                ch.ack(data);
            });
    }
}

var sendMessage = async(function (message, dialogsDb) {
    var dialog = await(dialogsDb.findOne({_id: new ObjectID(message.dialog_id)}));
    if (!dialog) {
        throw new Error("Dialog not found");
    }
    var channelId = dialog.frontapp.chan_id, token = dialog.frontapp.token;
    var data = {
        sender: {handle: "" + dialog.userId, name: dialog.user.first_name + ' ' + dialog.user.last_name},
        subject: message.message.title,
        body: message.message.body,
        options: {archive: false}
    };
    var path = '/channels/' + channelId + '/incoming_messages';
    if (dialog.frontapp.conversation_reference.length > 0) {
        path = '/conversations/' + dialog.frontapp.conversation_reference + '/messages';
    }

    var result = await(frontappRequest(data, path, token));
    if (!dialog.frontapp.conversation_reference || dialog.frontapp.conversation_reference.length === 0) {
        intel.log(result);
        await(dialogsDb.updateOne({_id: dialog._id}, {'$set': {'frontapp.conversation_reference': 'alt:ref:' + result.conversation_reference}}));
    }
    return result;
});

var createChannel = async(function (data, inboxId, token) {
    data['type'] = 'custom';
    var path = '/inboxes/' + inboxId + '/channels';
    var result = await(frontappRequest(data, path, token));
    return result;
});

var frontappRequest = async(function (data, path, token) {
    var postData = JSON.stringify(data);

    var options = {
        hostname: 'api2.frontapp.com',
        port: 443,
        path: path,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token,
            'Accept': 'application/json'
        }
    };
    return new Promise(function (resolve, reject) {
        var req = https.request(options, function (res) {
            res.setEncoding('utf8');
            var response = '';
            res.on('data', function (chunk) {
                response += chunk;
            });
            res.on('end', function () {
                console.log(response);
                var result = JSON.parse(response);
                if (result._error) {
                    reject(result._error);
                }
                resolve(result);
            });
        });

        req.on('error', function (e) {
            reject(e);
        });

        req.write(postData);
        req.end();
    });
});