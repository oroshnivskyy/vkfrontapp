"use strict";
var VK = require('vksdk');
var async = require('asyncawait/async');
var await = require('asyncawait/await');
var Promise = require('promise');
var interval = require('../interval.js');
var CRC32 = require('crc-32');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

function App(config, dialogsDb, ch) {
    this.config = config;
    this.dialogsDb = dialogsDb;
    this.ch = ch;
    var vk = new VK({
        appId: 0,
        language: config.vk.lang,
        secure: true
    });
    vk.setSecureRequests(true);
    vk.setToken(config.vk.api_key);
    this.vk = vk;
    this.serviceVk = new VK({
        appId: 0,
        language: config.vk.lang,
        secure: true
    });
    this.serviceVk.setSecureRequests(true);
}

App.prototype.getClient = function () {
    return this.vk;
};

App.prototype.getDialogs = async(function (offset) {
    var params = {
        count: 10,
        unread: 1,
        offset: offset
    };
    var app = this;
    return new Promise(function (resolve, reject) {
        app.getClient().request('messages.getDialogs', params, function (o) {
            if (o.error) {
                reject(o.error);
                return;
            }
            var messages = [];
            o.response.items.forEach(function (m) {
                if (m.unread > 0) {
                    messages.push(m.message)
                }
            });
            resolve(messages);
        });
    });
});

App.prototype.getHistory = async(function (userId, offset) {
    var params = {
        user_id: userId,
        offset: offset,
        count: 200,
        rev: 1
    };
    var app = this;
    return new Promise(function (resolve, reject) {
        app.getClient().request('messages.getHistory', params, function (o) {
            if (o.error) {
                reject(o.error);
                return;
            }
            var messages = [];
            o.response.items.forEach(function (m) {
                messages.push(m)
            });
            resolve(messages);
        });
    });
});

App.prototype.getUser = async(function (userId, fields) {
    var params = {
        user_id: userId,
        fields: fields
    };
    var app = this;
    return new Promise(function (resolve, reject) {
        app.serviceVk.request('users.get', params, function (o) {
            if (o.error) {
                console.log(o.error);
                reject(o.error);
                return;
            }
            var result = {first_name: '', last_name: ''};
            if (o.response.length > 0) {
                result = o.response[0];
            }
            resolve(result);
        });
    });
});

App.prototype.sendMessage = async(function (params) {
    var app = this;
    return new Promise(function (resolve, reject) {
        app.vk.request('messages.send', params, function (o) {
            if (o.error) {
                console.log(o.error);
                reject(o.error);
                return;
            }
            var result = {first_name: '', last_name: ''};
            if (o.response.length > 0) {
                result = o.response[0];
            }
            resolve(result);
        });
    });
});

App.prototype.sendNewReply = async(function(message){
    try{
        if(!message.isInbound()){
            var userId = parseInt(message.getRecipient(), 10);
            var msg = {
                user_id: userId,
                random_id: CRC32.str(message.getRecipient() + message.getBody()),
                peer_id: userId,
                message: message.getBody()
            };
            return await(this.sendMessage(msg))
        }
    } catch (e){
        console.error(e);
    }

});

App.prototype.processDialogs = async(function () {
    console.log("Start loading dialogs..");
    var dialogs = await(this.getDialogs(0));
    var app = this;
    dialogs.forEach(function (d) {
        try {
            var dialog = await(app.dialogsDb.findOne({userId: d.user_id}));
            if (!dialog) {
                var user = await(app.getUser(d.user_id));
                var newDialog = {
                    userId: d.user_id,
                    user: {first_name: user.first_name, last_name: user.last_name},
                    title: d.title,
                    offset: 0,
                    frontapp: {
                        chan_id: app.config.frontapp.channel,
                        inbox_id: app.config.frontapp.inbox,
                        token: app.config.frontapp.token,
                        conversation_reference: ''
                    }
                };
                await(app.dialogsDb.insert(newDialog));
                dialog = await(app.dialogsDb.findOne({userId: d.user_id}));
                app.ch.sendToQueue('new_dialog', new Buffer(JSON.stringify({
                    dialog_id: dialog._id
                })), {persistent: true});
            }
            var messages = await(app.getHistory(d.user_id, dialog.offset));
            dialog.offset = dialog.offset + messages.length;
            await(app.dialogsDb.updateOne({_id: dialog._id}, dialog));
            messages.forEach(function (message) {
                app.ch.publish('messages', app.config.name, new Buffer(JSON.stringify({
                    message: message,
                    dialog_id: dialog._id
                })))
            });

        } catch (e) {
            console.log(e);
        }
    });
    console.log("Finish loading dialogs..");
    return true;
});

App.prototype.run = function () {
    var app = this;
    interval(function () {
        app.processDialogs();
    }, app.config.requestInterval);
};

module.exports = App;