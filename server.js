"use strict";

var Server = function (cfg, apps) {
    this.cfg = cfg;
    this.apps = apps;

};

module.exports = Server;

Server.prototype.run = function () {
    var port = this.cfg.port,
        express = require('express'),
        app = express(),
        bodyParser = require('body-parser');
    app.use(bodyParser.urlencoded({extended: true}));
    app.use(bodyParser.json());
    app.listen(port);
    app.route('/:appName/message')
        .post(this.saveMessage.bind(this));
    app.use(function (req, res) {
        res.status(404).send({url: req.originalUrl + ' not found'})
    });
    console.log('RESTful API server started on: ' + port);
};

Server.prototype.saveMessage = function (req, res) {
    var appName = req.params.appName;
    if (!this.apps.hasOwnProperty(appName)) {
        res.status(404);
        res.send('App ' + appName + ' not found');
        return;
    }
    this.apps[appName].sendNewReply(new Message(req.body))
        .then(function (res) {
            console.log(res);
        })
        .catch(function (error) {
            console.error(error);
        });
    res.json({status: "accepted"});
};

var Message = function (message) {
    this.msg = message;
};

Message.prototype.getRecipient = function () {
    var rcp = this.msg.recipients.filter(function (msg) {
        if (msg.role === 'to') {
            return true;
        }
    });
    if (rcp.length >= 1) {
        return rcp[0].handle;
    }
    throw new Error("Recipient not found");
};

Message.prototype.isInbound = function () {
    return this.msg.is_inbound;
};

Message.prototype.hasAuthor = function () {
    return !!this.msg.author
};

Message.prototype.getBody = function () {
    return this.msg.text;
};

Message.prototype.getCreatedAt = function () {
    return this.msg.created_at;
};