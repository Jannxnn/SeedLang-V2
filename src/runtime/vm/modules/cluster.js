'use strict';

const { ClusterServer, ClusterClient, RemoteNode } = require('../cluster');
const { fiberToJSON, fiberFromJSON } = require('../fiber_serializer');

function createClusterModules(vmContext, helpers) {
    const OP = helpers.OP;
    let server = null;
    const client = new ClusterClient();

    return {
        cluster: {
            serve: async (args) => {
                const port = args[0] || 0;
                if (!server) {
                    server = new ClusterServer(vmContext, { port });
                }
                const actualPort = await server.start();
                return { port: actualPort, host: 'localhost' };
            },

            connect: (args) => {
                const id = args[0] || `node_${Date.now()}`;
                const host = args[1] || 'localhost';
                const port = args[2] || 9173;
                client.addNode(id, host, port);
                return { id, host, port };
            },

            disconnect: (args) => {
                const id = args[0];
                client.removeNode(id);
                return true;
            },

            ping: async (args) => {
                const id = args[0];
                const node = client.getNode(id);
                if (!node) return { error: 'node not found' };
                return await node.ping();
            },

            pingAll: async (args) => {
                return await client.pingAll();
            },

            submit: async (args) => {
                const code = args[0];
                const strategy = args[1] || 'round-robin';
                if (typeof code !== 'string') return { error: 'Expected code string' };
                try {
                    return await client.dispatchCode(code, strategy);
                } catch (e) {
                    return { ok: false, error: e.message };
                }
            },

            migrate: async (args) => {
                const coro = args[0];
                const nodeId = args[1];
                if (!coro || coro._type !== 'coroutine') return { error: 'Expected coroutine' };
                try {
                    return await client.migrateFiber(coro, nodeId);
                } catch (e) {
                    return { ok: false, error: e.message };
                }
            },

            nodes: (args) => {
                return client.listNodes();
            },

            stop: async (args) => {
                if (server) {
                    await server.stop();
                    server = null;
                }
                return true;
            },

            serialize: (args) => {
                const coro = args[0];
                if (!coro || coro._type !== 'coroutine') return null;
                return fiberToJSON(coro);
            },

            deserialize: (args) => {
                const json = args[0];
                if (typeof json !== 'string') return null;
                return fiberFromJSON(json, vmContext);
            }
        }
    };
}

module.exports = { createClusterModules };
