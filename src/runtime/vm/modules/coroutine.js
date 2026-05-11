'use strict';

function createCoroutineModules(vmContext, helpers) {
    const OP = helpers.OP;

    return {
        coroutine: {
            resume: (args) => {
                const coro = args[0];
                const arg = args[1];
                if (coro?._type !== 'coroutine') return null;
                if (coro.state === 'done') return null;
                const result = vmContext._coroutineResume(coro, arg);
                if (result && result._coroPending) {
                    return result._coroPending.then(resolvedValue => {
                        coro.stack.push(resolvedValue);
                        coro._pendingPromise = null;
                        return vmContext._coroutineResume(coro, null);
                    }).then(r => {
                        if (r && r._coroPending) {
                            return r._coroPending;
                        }
                        return r;
                    }).catch(() => {
                        coro.state = 'done';
                        return null;
                    });
                }
                return result;
            },
            status: (args) => {
                const coro = args[0];
                if (coro?._type !== 'coroutine') return 'invalid';
                return coro.state;
            },
            done: (args) => {
                const coro = args[0];
                if (coro?._type !== 'coroutine') return true;
                return coro.state === 'done';
            },
            running: (args) => {
                const coro = args[0];
                if (coro?._type !== 'coroutine') return false;
                return coro.state === 'running';
            }
        }
    };
}

module.exports = {
    createCoroutineModules
};
