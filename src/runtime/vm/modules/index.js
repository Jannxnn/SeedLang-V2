'use strict';

const { createSystemModules } = require('./system');
const { createPlatformNetworkModules } = require('./platform_network');
const { createWebHtmlModules } = require('./web_html');
const { createParallelModules } = require('./parallel');
const { createConcurrencyModules } = require('./concurrency');
const { createCoroutineModules } = require('./coroutine');
const { createSchedulerModules } = require('./scheduler');
const { createWorkerPoolModules } = require('./worker_pool');
const { createClusterModules } = require('./cluster');
const { createGPUModules } = require('./gpu');

module.exports = {
    createSystemModules,
    createPlatformNetworkModules,
    createWebHtmlModules,
    createParallelModules,
    createConcurrencyModules,
    createCoroutineModules,
    createSchedulerModules,
    createWorkerPoolModules,
    createClusterModules,
    createGPUModules
};
