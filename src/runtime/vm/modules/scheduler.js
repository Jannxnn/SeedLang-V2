'use strict';

const { FiberScheduler } = require('../fiber_scheduler');
const { createCoroutineFromClosure, isFiberClosure } = require('../../../../dist/core/coroutine.js');

function createSchedulerModules(vmContext, helpers) {
    const OP = helpers.OP;
    const scheduler = new FiberScheduler(vmContext);

    return {
        scheduler: {
            spawn: (args) => {
                const fn = args[0];
                const fnArgs = args.slice(1);
                if (!fn) return null;
                const options = {};
                if (fnArgs.length > 0 && typeof fnArgs[fnArgs.length - 1] === 'object' && !Array.isArray(fnArgs[fnArgs.length - 1]) && fnArgs[fnArgs.length - 1]?._type !== 'closure') {
                    Object.assign(options, fnArgs.pop());
                }
                const coro = scheduler.spawn(fn, fnArgs, options);
                return coro;
            },

            run: (args) => {
                return scheduler.run();
            },

            runAsync: async (args) => {
                return scheduler.runAsync();
            },

            status: (args) => {
                return scheduler.getStatus();
            },

            list: (args) => {
                return scheduler.listFibers();
            },

            kill: (args) => {
                const id = args[0];
                return scheduler.kill(id);
            },

            killAll: (args) => {
                scheduler.killAll();
                return true;
            },

            sleep: (args) => {
                const ms = args[0] || 0;
                if (scheduler._currentFiber) {
                    scheduler.sleep(scheduler._currentFiber, ms);
                }
                return null;
            },

            currentFiber: (args) => {
                return scheduler._currentFiber;
            },

            fiberCount: (args) => {
                return scheduler._fibers.size;
            },

            result: (args) => {
                const id = args[0];
                const r = scheduler._results.get(id);
                if (!r) return null;
                return r.error ? { error: r.error } : { value: r.value };
            }
        },

        _getScheduler: () => scheduler
    };
}

module.exports = { createSchedulerModules, FiberScheduler };
