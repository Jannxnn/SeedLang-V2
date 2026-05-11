#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

class SeedPackageManager {
    constructor() {
        this.registry = 'https://registry.seedlang.org';
        this.cacheDir = path.join(process.env.HOME || process.env.USERPROFILE, '.seed', 'cache');
        this.nodeModulesDir = 'seed_modules';
        this.lockFile = 'seed-lock.json';
        this.configFile = 'seed.json';
        
        this.ensureDirectories();
    }
    
    ensureDirectories() {
        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }
    }
    
    async init(projectName) {
        const config = {
            name: projectName || path.basename(process.cwd()),
            version: '1.0.0',
            description: 'A SeedLang project',
            main: 'index.seed',
            author: '',
            license: 'MIT',
            dependencies: {},
            devDependencies: {},
            scripts: {
                start: 'seed index.seed',
                test: 'seed test.seed'
            }
        };
        
        const configPath = path.join(process.cwd(), this.configFile);
        
        if (fs.existsSync(configPath)) {
            console.log('seed.json already exists');
            return;
        }
        
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        console.log(`✓ Created ${this.configFile}`);
        
        if (!fs.existsSync(this.nodeModulesDir)) {
            fs.mkdirSync(this.nodeModulesDir);
            console.log(`✓ Created ${this.nodeModulesDir}/`);
        }
        
        const gitignore = path.join(process.cwd(), '.gitignore');
        if (!fs.existsSync(gitignore)) {
            fs.writeFileSync(gitignore, `${this.nodeModulesDir}/\n${this.lockFile}\n`);
            console.log('✓ Created .gitignore');
        }
    }
    
    async install(packages, options = {}) {
        const config = this.readConfig();
        
        if (!packages || packages.length === 0) {
            await this.installAll(config, options);
            return;
        }
        
        for (const pkg of packages) {
            const { name, version } = this.parsePackage(pkg);
            
            console.log(`Installing ${name}@${version}...`);
            
            const packageInfo = await this.fetchPackageInfo(name, version);
            await this.downloadPackage(packageInfo);
            
            config.dependencies[name] = packageInfo.version;
            
            console.log(`✓ Installed ${name}@${packageInfo.version}`);
        }
        
        this.writeConfig(config);
        await this.generateLockFile(config);
    }
    
    async installAll(config, options) {
        const dependencies = { ...config.dependencies, ...config.devDependencies };
        
        console.log('Installing dependencies...');
        
        for (const [name, version] of Object.entries(dependencies)) {
            console.log(`Installing ${name}@${version}...`);
            
            const packageInfo = await this.fetchPackageInfo(name, version);
            await this.downloadPackage(packageInfo);
            
            console.log(`✓ Installed ${name}@${packageInfo.version}`);
        }
        
        console.log('✓ All dependencies installed');
    }
    
    async publish(options = {}) {
        const config = this.readConfig();
        
        console.log(`Publishing ${config.name}@${config.version}...`);
        
        this.validatePackage(config);
        
        const tarball = await this.createTarball();
        
        await this.uploadPackage(tarball, config);
        
        console.log(`✓ Published ${config.name}@${config.version}`);
    }
    
    async update(packages) {
        const config = this.readConfig();
        
        if (!packages || packages.length === 0) {
            packages = Object.keys(config.dependencies);
        }
        
        for (const name of packages) {
            const currentVersion = config.dependencies[name];
            const latestInfo = await this.fetchPackageInfo(name, 'latest');
            
            if (latestInfo.version !== currentVersion) {
                console.log(`Updating ${name} from ${currentVersion} to ${latestInfo.version}...`);
                
                await this.downloadPackage(latestInfo);
                config.dependencies[name] = latestInfo.version;
                
                console.log(`✓ Updated ${name}@${latestInfo.version}`);
            } else {
                console.log(`${name} is already up to date`);
            }
        }
        
        this.writeConfig(config);
        await this.generateLockFile(config);
    }
    
    async remove(packages) {
        const config = this.readConfig();
        
        for (const name of packages) {
            if (config.dependencies[name]) {
                delete config.dependencies[name];
                
                const packageDir = path.join(this.nodeModulesDir, name);
                if (fs.existsSync(packageDir)) {
                    fs.rmSync(packageDir, { recursive: true });
                }
                
                console.log(`✓ Removed ${name}`);
            } else {
                console.log(`${name} is not installed`);
            }
        }
        
        this.writeConfig(config);
        await this.generateLockFile(config);
    }
    
    list() {
        const config = this.readConfig();
        
        console.log('\nDependencies:');
        for (const [name, version] of Object.entries(config.dependencies)) {
            console.log(`  ${name}@${version}`);
        }
        
        if (Object.keys(config.devDependencies).length > 0) {
            console.log('\nDev Dependencies:');
            for (const [name, version] of Object.entries(config.devDependencies)) {
                console.log(`  ${name}@${version}`);
            }
        }
    }
    
    async search(query) {
        console.log(`Searching for "${query}"...`);
        
        const results = await this.searchPackages(query);
        
        if (results.length === 0) {
            console.log('No packages found');
            return;
        }
        
        console.log('\nPackages:');
        for (const pkg of results) {
            console.log(`  ${pkg.name}@${pkg.version} - ${pkg.description}`);
        }
    }
    
    async info(packageName) {
        const info = await this.fetchPackageInfo(packageName, 'latest');
        
        console.log(`\n${info.name}@${info.version}`);
        console.log(`Description: ${info.description}`);
        console.log(`Author: ${info.author}`);
        console.log(`License: ${info.license}`);
        console.log(`Homepage: ${info.homepage}`);
        console.log(`Repository: ${info.repository}`);
        
        if (info.dependencies) {
            console.log('\nDependencies:');
            for (const [name, version] of Object.entries(info.dependencies)) {
                console.log(`  ${name}@${version}`);
            }
        }
    }
    
    parsePackage(pkg) {
        const match = pkg.match(/^(@?[^@]+)(?:@(.+))?$/);
        return {
            name: match[1],
            version: match[2] || 'latest'
        };
    }
    
    readConfig() {
        const configPath = path.join(process.cwd(), this.configFile);
        
        if (!fs.existsSync(configPath)) {
            throw new Error('seed.json not found. Run "seed init" first.');
        }
        
        return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
    
    writeConfig(config) {
        const configPath = path.join(process.cwd(), this.configFile);
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    }
    
    async fetchPackageInfo(name, version) {
        const cacheKey = `${name}@${version}`;
        const cacheFile = path.join(this.cacheDir, `${crypto.createHash('md5').update(cacheKey).digest('hex')}.json`);
        
        if (fs.existsSync(cacheFile)) {
            return JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
        }
        
        return new Promise((resolve, reject) => {
            const url = `${this.registry}/${name}/${version}`;
            
            https.get(url, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        const info = JSON.parse(data);
                        fs.writeFileSync(cacheFile, JSON.stringify(info));
                        resolve(info);
                    } else {
                        reject(new Error(`Package not found: ${name}@${version}`));
                    }
                });
            }).on('error', reject);
        });
    }
    
    async downloadPackage(packageInfo) {
        const packageDir = path.join(this.nodeModulesDir, packageInfo.name);
        
        if (fs.existsSync(packageDir)) {
            return;
        }
        
        fs.mkdirSync(packageDir, { recursive: true });
        
        const tarballUrl = packageInfo.tarball;
        const tarballPath = path.join(this.cacheDir, path.basename(tarballUrl));
        
        await new Promise((resolve, reject) => {
            const file = fs.createWriteStream(tarballPath);
            
            https.get(tarballUrl, (res) => {
                res.pipe(file);
                file.on('finish', () => {
                    file.close();
                    resolve();
                });
            }).on('error', reject);
        });
        
        const tar = require('tar');
        await tar.extract({
            file: tarballPath,
            cwd: packageDir,
            strip: 1
        });
        
        console.log(`  Downloaded ${packageInfo.name}@${packageInfo.version}`);
    }
    
    async generateLockFile(config) {
        const lockData = {
            version: 1,
            dependencies: {}
        };
        
        for (const [name, version] of Object.entries(config.dependencies)) {
            const info = await this.fetchPackageInfo(name, version);
            lockData.dependencies[name] = {
                version: info.version,
                resolved: info.tarball,
                integrity: info.integrity
            };
        }
        
        const lockPath = path.join(process.cwd(), this.lockFile);
        fs.writeFileSync(lockPath, JSON.stringify(lockData, null, 2));
    }
    
    validatePackage(config) {
        const required = ['name', 'version', 'main'];
        
        for (const field of required) {
            if (!config[field]) {
                throw new Error(`Missing required field: ${field}`);
            }
        }
        
        const mainPath = path.join(process.cwd(), config.main);
        if (!fs.existsSync(mainPath)) {
            throw new Error(`Main file not found: ${config.main}`);
        }
    }
    
    async createTarball() {
        const config = this.readConfig();
        const tarballPath = path.join(this.cacheDir, `${config.name}-${config.version}.tgz`);
        
        const tar = require('tar');
        await tar.create({
            gzip: true,
            file: tarballPath,
            cwd: process.cwd()
        }, ['.']);
        
        return tarballPath;
    }
    
    async uploadPackage(tarballPath, config) {
        return new Promise((resolve, reject) => {
            const url = `${this.registry}/publish`;
            
            const options = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/octet-stream',
                    'Authorization': `Bearer ${process.env.SEED_TOKEN}`
                }
            };
            
            const req = https.request(url, options, (res) => {
                if (res.statusCode === 200) {
                    resolve();
                } else {
                    reject(new Error('Failed to publish package'));
                }
            });
            
            fs.createReadStream(tarballPath).pipe(req);
            req.on('error', reject);
        });
    }
    
    async searchPackages(query) {
        return new Promise((resolve, reject) => {
            const url = `${this.registry}/search?q=${encodeURIComponent(query)}`;
            
            https.get(url, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        resolve(JSON.parse(data));
                    } else {
                        resolve([]);
                    }
                });
            }).on('error', reject);
        });
    }
}

const pm = new SeedPackageManager();

const command = process.argv[2];
const args = process.argv.slice(3);

(async () => {
    try {
        switch (command) {
            case 'init':
                await pm.init(args[0]);
                break;
            case 'install':
            case 'i':
                await pm.install(args);
                break;
            case 'publish':
                await pm.publish();
                break;
            case 'update':
                await pm.update(args);
                break;
            case 'remove':
            case 'uninstall':
                await pm.remove(args);
                break;
            case 'list':
            case 'ls':
                pm.list();
                break;
            case 'search':
                await pm.search(args[0]);
                break;
            case 'info':
                await pm.info(args[0]);
                break;
            default:
                console.log(`
SeedLang Package Manager

Usage:
  seed init [name]              Initialize a new project
  seed install [package...]     Install packages
  seed publish                  Publish package
  seed update [package...]      Update packages
  seed remove <package...>      Remove packages
  seed list                     List installed packages
  seed search <query>           Search packages
  seed info <package>           Show package info

Examples:
  seed init my-project
  seed install http-client
  seed install lodash@4.17.21
  seed update
  seed remove old-package
                `);
        }
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
})();

module.exports = { SeedPackageManager };
