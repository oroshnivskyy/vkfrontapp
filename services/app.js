"use strict";
var VK = require('vksdk');
var async = require('asyncawait/async');
var await = require('asyncawait/await');
var Promise = require('promise');
var interval = require('../interval.js');
var CRC32 = require('crc-32');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

var intel = require('intel');
intel.setFormatter({
    'format': '[%(date)s] %(name)s.%(levelname)s: %(message)s',
    'strip': true
});

function App(config, dialogsDb, ch) {
    this.config = config;
    this.dialogsDb = dialogsDb;
    this.ch = ch;
    this.confVk();
}

App.prototype.confVk = function () {
    var vk = new VK({
        appId: 0,
        language: this.config.vk.lang,
        secure: true
    });
    vk.setSecureRequests(true);
    vk.setToken(this.config.vk.api_key);
    this.vk = vk;
    this.serviceVk = new VK({
        appId: 0,
        language: this.config.vk.lang,
        secure: true
    });
    this.serviceVk.setSecureRequests(true);
};

App.prototype.getClient = function () {
    return this.vk;
};

App.prototype.getDialogs = async(function (limit, offset) {
    var params = {
        count: limit,
        unanswered: 1,
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
                // if (m.unread > 0) {
                messages.push(m.message)
                // }
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
                intel.error('Error getting users %s', o.error);
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
                intel.error('Error sendMessage %s', o.error);
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

App.prototype.sendNewReply = async(function (message) {
    intel.info(JSON.stringify(message.msg));
    try {
        if (message.hasAuthor()) {
            var userId = parseInt(message.getRecipient(), 10);
            var msg = {
                user_id: userId,
                random_id: CRC32.str(message.getRecipient() + message.getCreatedAt()),
                peer_id: userId,
                message: message.getBody()
            };
            return await(this.sendMessage(msg))
        }
    } catch (e) {
        intel.error('Error sendNewReply ', e);
    }

});

App.prototype.processDialogs = async(function () {
    intel.info('Start loading dialogs for ', JSON.stringify(this.config.name));
    this.confVk();
    var limit = 10;
    var app = this;
    for (var offset = 0; offset >= 0; offset += limit) {
        var dialogs = await(this.getDialogs(limit, offset));
        intel.info('Dialog: %s', dialogs.length);
        dialogs.forEach(function (d) {
            await(app.processDialog(d))
        });
        if (dialogs.length < limit) {
            break;
        }
    }

    intel.info('Finish loading dialogs %s', JSON.stringify(this.config.name));
    return true;
});

App.prototype.processDialog = async(function (d) {
    var app = this;
    try {
        var dialog = await(app.dialogsDb.findOne({userId: d.user_id}));
        if (!dialog) {
            var user = {first_name: d.user_id, last_name: ""};
            try {
                user = await(app.getUser(d.user_id));
            } catch (e) {
                intel.error('Err processDialog: %s', e);
            }
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
        intel.info('%s', JSON.stringify(messages));
        messages
            .filter(function (m) {
                return m.user_id === m.from_id
            })
            .forEach(function (message) {
                app.ch.publish('messages', app.config.name, new Buffer(JSON.stringify({
                    message: message,
                    dialog_id: dialog._id
                })))
            });

    } catch (e) {
        intel.error(e);
    }
});

App.prototype.run = function () {
    var app = this;
    interval(app.processDialogs.bind(this), app.config.requestInterval);
};

module.exports = App;