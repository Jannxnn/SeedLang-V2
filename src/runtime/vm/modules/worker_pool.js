'use strict';

const { getWorkerPool, MAX_WORKERS } = require('../worker_pool');

function createWorkerPoolModules(vmContext, helpers) {
    const OP = helpers.OP;

    return {
        worker: {
            submit: async (args) => {
                const code = args[0];
                if (typeof code !== 'string') return { error: 'Expected code string' };
                const pool = getWorkerPool();
                const result = await pool.submit(code);
                return result;
            },

            map: async (args) => {
                const arr = args[0] ?? [];
                const fnCode = args[1];
                if (typeof fnCode !== 'string') return arr;
                const pool = getWorkerPool();
                const results = await pool.map(arr, fnCode);
                return results;
            },

            status: (args) => {
                const pool = getWorkerPool();
                return pool.getStatus();
            },

            stats: (args) => {
                const pool = getWorkerPool();
                return pool.getStats();
            },

            workerStats: (args) => {
                const pool = getWorkerPool();
                return pool.getWorkerStats();
            },

            maxWorkers: MAX_WORKERS,

            shutdown: async (args) => {
                const pool = getWorkerPool();
                await pool.shutdown();
                return true;
            }
        }
    };
}

module.exports = { createWorkerPoolModules };
