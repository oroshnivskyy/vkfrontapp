'use strict';

var program = require('commander');

program
    .version('1.0.0')
    .option('-c, --config <path>', 'Path to config', '')
    .parse(process.argv);

module.exports = require(program.config);

