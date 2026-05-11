'use strict';

const http = require('http');
const { fiberToJSON, fiberFromJSON } = require('./fiber_serializer');
const { FiberScheduler } = require('./fiber_scheduler');

class RemoteNode {
    constructor(options = {}) {
        this.host = options.host || 'localhost';
        this.port = options.port || 0;
        this.id = options.id || `node_${Date.now()}`;
        this.status = 'unknown';
        this.lastHeartbeat = null;
        this.load = 0;
        this.fiberCount = 0;
    }

    async ping() {
        try {
            const response = await this._request('GET', '/ping');
            this.status = 'online';
            this.lastHeartbeat = Date.now();
            return true;
        } catch {
            this.status = 'offline';
            return false;
        }
    }

    async submitCode(code) {
        const response = await this._request('POST', '/execute', { code });
        return response;
    }

    async migrateFiber(coro) {
        const serialized = fiberToJSON(coro);
        if (!serialized) throw new Error('Failed to serialize fiber');
        const response = await this._request('POST', '/migrate', { fiber: serialized });
        return response;
    }

    async getStatus() {
        const response = await this._request('GET', '/status');
        return response;
    }

    async _request(method, path, body) {
        return new Promise((resolve, reject) => {
            const data = body ? JSON.stringify(body) : null;
            const options = {
                hostname: this.host,
                port: this.port,
                path,
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'X-Seed-RPC': '1'
                },
                timeout: 5000
            };
            if (data) {
                options.headers['Content-Length'] = Buffer.byteLength(data);
            }
            const req = http.request(options, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(body));
                    } catch {
                        resolve({ raw: body });
                    }
                });
            });
            req.on('error', reject);
            req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
            if (data) req.write(data);
            req.end();
        });
    }
}

class ClusterServer {
    constructor(vm, options = {}) {
        this.vm = vm;
        this.port = options.port || 9173;
        this.scheduler = new FiberScheduler(vm);
        this.server = null;
        this._handlers = {
            'GET /ping': () => ({ ok: true, timestamp: Date.now() }),
            'GET /status': () => ({
                ok: true,
                scheduler: this.scheduler.getStatus(),
                uptime: process.uptime()
            }),
            'POST /execute': async (body) => {
                const result = this.vm.run(body.code);
                return {
                    ok: result.success,
                    output: result.output,
                    error: result.error,
                    value: this.vm.vm.globals.result
                };
            },
            'POST /migrate': (body) => {
                const coro = fiberFromJSON(body.fiber, this.vm.vm);
                if (!coro) return { ok: false, error: 'deserialization failed' };
                this.scheduler.spawn(coro);
                return { ok: true, fiberId: coro._schedulerId };
            },
            'POST /dispatch': async (body) => {
                const tasks = body.tasks || [];
                const results = [];
                for (const task of tasks) {
                    if (task.type === 'code') {
                        const r = this.vm.run(task.code);
                        results.push({ ok: r.success, value: this.vm.vm.globals.result, error: r.error });
                    } else if (task.type === 'fiber') {
                        const coro = fiberFromJSON(task.fiber, this.vm.vm);
                        if (coro) {
                            this.scheduler.spawn(coro);
                            results.push({ ok: true, fiberId: coro._schedulerId });
                        } else {
                            results.push({ ok: false, error: 'deserialization failed' });
                        }
                    }
                }
                if (this.scheduler._fibers.size > 0) {
                    this.scheduler.run();
                }
                return { ok: true, results };
            }
        };
    }

    start() {
        this.server = http.createServer(async (req, res) => {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Seed-RPC');

            if (req.method === 'OPTIONS') {
                res.writeHead(200);
                res.end();
                return;
            }

            const key = `${req.method} ${req.url.split('?')[0]}`;
            const handler = this._handlers[key];

            if (!handler) {
                res.writeHead(404);
                res.end(JSON.stringify({ ok: false, error: 'not found' }));
                return;
            }

            let body = null;
            if (req.method === 'POST') {
                body = await new Promise((resolve) => {
                    let data = '';
                    req.on('data', chunk => data += chunk);
                    req.on('end', () => {
                        try { resolve(JSON.parse(data)); }
                        catch { resolve({}); }
                    });
                });
            }

            try {
                const result = await handler(body);
                res.writeHead(200);
                res.end(JSON.stringify(result));
            } catch (e) {
                res.writeHead(500);
                res.end(JSON.stringify({ ok: false, error: e.message }));
            }
        });

        return new Promise((resolve) => {
            this.server.listen(this.port, () => {
                resolve(this.server.address().port);
            });
        });
    }

    async stop() {
        if (this.server) {
            return new Promise((resolve) => {
                this.server.close(() => resolve());
            });
        }
    }
}

class ClusterClient {
    constructor() {
        this.nodes = new Map();
    }

    addNode(id, host, port) {
        const node = new RemoteNode({ id, host, port });
        this.nodes.set(id, node);
        return node;
    }

    removeNode(id) {
        this.nodes.delete(id);
    }

    getNode(id) {
        return this.nodes.get(id);
    }

    listNodes() {
        return Array.from(this.nodes.entries()).map(([id, node]) => ({
            id, host: node.host, port: node.port, status: node.status, load: node.load
        }));
    }

    async pingAll() {
        const results = {};
        for (const [id, node] of this.nodes) {
            results[id] = await node.ping();
        }
        return results;
    }

    async dispatchCode(code, strategy = 'round-robin') {
        const availableNodes = Array.from(this.nodes.values()).filter(n => n.status === 'online');
        if (availableNodes.length === 0) {
            const allNodes = Array.from(this.nodes.values());
            if (allNodes.length === 0) throw new Error('No nodes available');
            const node = allNodes[0];
            return node.submitCode(code);
        }
        if (strategy === 'round-robin') {
            const node = availableNodes[this._rrIndex++ % availableNodes.length];
            return node.submitCode(code);
        } else if (strategy === 'least-loaded') {
            availableNodes.sort((a, b) => a.load - b.load);
            return availableNodes[0].submitCode(code);
        }
        return availableNodes[0].submitCode(code);
    }

    async migrateFiber(coro, nodeId) {
        const node = this.nodes.get(nodeId);
        if (!node) throw new Error(`Node ${nodeId} not found`);
        return node.migrateFiber(coro);
    }
}

ClusterClient.prototype._rrIndex = 0;

module.exports = { RemoteNode, ClusterServer, ClusterClient };
