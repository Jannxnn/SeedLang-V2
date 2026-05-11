'use strict';

function createPlatformNetworkModules(deps) {
    const path = deps.path;
    const http = deps.http;
    const https = deps.https;

    const isBlockedHost = (hostname) => /^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|0\.|localhost|::1|fe80:)/i.test(hostname);

    return {
        path: {
            join: (args) => path.join(...args),
            resolve: (args) => path.resolve(...args),
            dirname: (args) => path.dirname(args[0] ?? '.'),
            basename: (args) => path.basename(args[0] ?? ''),
            extname: (args) => path.extname(args[0] ?? '')
        },
        os: {
            platform: () => process.platform,
            arch: () => process.arch,
            homedir: () => require('os').homedir(),
            tmpdir: () => require('os').tmpdir()
        },
        http: {
            get: async (args) => new Promise((r) => {
                try {
                    const u = new URL(args[0]);
                    if (!['http:', 'https:'].includes(u.protocol)) {
                        r(null);
                        return;
                    }
                    if (isBlockedHost(u.hostname)) {
                        r(null);
                        return;
                    }
                } catch {
                    r(null);
                    return;
                }
                const client = args[0].startsWith('https') ? https : http;
                client.get(args[0], (res) => {
                    let d = '';
                    res.on('data', (c) => d += c);
                    res.on('end', () => r({ status: res.statusCode, body: d }));
                }).on('error', () => r(null));
            }),
            post: async (args) => new Promise((r) => {
                let u;
                try {
                    u = new URL(args[0]);
                    if (!['http:', 'https:'].includes(u.protocol)) {
                        r(null);
                        return;
                    }
                    if (isBlockedHost(u.hostname)) {
                        r(null);
                        return;
                    }
                } catch {
                    r(null);
                    return;
                }
                const client = u.protocol === 'https:' ? https : http;
                const req = client.request({
                    hostname: u.hostname,
                    port: u.port || (u.protocol === 'https:' ? 443 : 80),
                    path: u.pathname + u.search,
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                }, (res) => {
                    let d = '';
                    res.on('data', (c) => d += c);
                    res.on('end', () => r({ status: res.statusCode, body: d }));
                });
                req.write(args[1] ?? '');
                req.end();
            })
        }
    };
}

module.exports = {
    createPlatformNetworkModules
};
