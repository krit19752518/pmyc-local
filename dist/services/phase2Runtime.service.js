"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Phase2Runtime = void 0;
exports.phase2DatabaseEnvironment = phase2DatabaseEnvironment;
const child_process_1 = require("child_process");
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const net_1 = __importDefault(require("net"));
const path_1 = __importDefault(require("path"));
function phase2DatabaseEnvironment(root, env = process.env) {
    if (env.NODE_ENV === 'test') {
        return env.PHASE2_TEST_DATABASE === '1' && env.PHASE2_TEST_DSN
            ? { PHASE2_TEST_DATABASE: '1', PHASE2_TEST_DSN: env.PHASE2_TEST_DSN, PHASE2_TEST_USER: env.PHASE2_TEST_USER || 'p2test' }
            : {};
    }
    const config = path_1.default.join(root, '.runtime/database-enabled.json');
    if (!(0, fs_1.existsSync)(config))
        return {};
    const expected = JSON.parse((0, fs_1.readFileSync)(config, 'utf8'));
    const value = env.PHASE2_DATABASE_URL || env.DATABASE_URL;
    if (!value)
        throw new Error('Phase 2 database is not configured');
    const url = new URL(value);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== expected.host || (url.port || '5432') !== String(expected.port)
        || decodeURIComponent(url.pathname.slice(1)) !== expected.database)
        throw new Error('Phase 2 database target mismatch');
    if (env.NODE_ENV === 'development' && env.FOOTBALL_VPS_DEV === '1') {
        const ca = env.FOOTBALL_DEV_DB_CA_FILE || '';
        if (!path_1.default.isAbsolute(ca) || !(0, fs_1.existsSync)(ca))
            throw new Error('Dev database CA is not configured');
        // libpq verifies the dedicated self-signed server CA. The Node pool also
        // checks the certificate's DNS name; no verification is disabled.
        return { PHASE2_DATABASE_URL: value, PGSSLMODE: 'verify-ca', PGSSLROOTCERT: ca };
    }
    return { PHASE2_DATABASE_URL: value };
}
/** Local development sidecar only. No database initialization or credentials. */
class Phase2Runtime {
    root;
    secret = (0, crypto_1.randomBytes)(32).toString('hex');
    child = null;
    starting = null;
    hooked = false;
    constructor(root = process.env.PHASE2_ROOT || path_1.default.resolve(__dirname, '../../phase2')) {
        this.root = root;
    }
    close() {
        this.child?.kill();
        this.child = null;
        this.starting = null;
    }
    async port() {
        if (this.starting)
            return this.starting;
        this.starting = this.launch().catch(error => { this.starting = null; throw error; });
        return this.starting;
    }
    async launch() {
        if (process.env.NODE_ENV === 'production')
            throw new Error('Development PHP sidecar is disabled in Production');
        if (!this.hooked) {
            this.hooked = true;
            process.once('exit', () => this.close());
            for (const signal of ['SIGINT', 'SIGTERM'])
                process.once(signal, () => { this.close(); process.exit(0); });
        }
        const binary = process.env.PHASE2_PHP_BINARY || ((0, fs_1.existsSync)(path_1.default.join(this.root, '.runtime/php')) ? path_1.default.join(this.root, '.runtime/php') : 'php');
        const port = await new Promise((resolve, reject) => {
            const socket = net_1.default.createServer();
            socket.once('error', reject);
            socket.listen(0, '127.0.0.1', () => {
                const address = socket.address();
                socket.close(() => resolve(address.port));
            });
        });
        return new Promise((resolve, reject) => {
            const child = (0, child_process_1.spawn)(binary, ['-S', `127.0.0.1:${port}`, '-t', path_1.default.join(this.root, 'public'), path_1.default.join(this.root, 'public/router.php')], {
                cwd: this.root,
                env: { PATH: process.env.PATH, LANG: 'C.UTF-8', PMYC_PHASE2_BRIDGE_SECRET: this.secret, ...phase2DatabaseEnvironment(this.root) },
                stdio: ['ignore', 'ignore', 'pipe']
            });
            this.child = child;
            let settled = false;
            const fail = () => {
                if (!settled) {
                    settled = true;
                    clearTimeout(timer);
                    child.kill();
                    reject(new Error('PHP runtime unavailable'));
                }
            };
            const timer = setTimeout(fail, 5000);
            child.once('error', fail);
            child.once('exit', () => { fail(); if (this.child === child) {
                this.child = null;
                this.starting = null;
            } });
            child.stderr?.on('data', (data) => {
                if (!settled && data.toString().includes('Development Server')) {
                    settled = true;
                    clearTimeout(timer);
                    resolve(port);
                }
            });
        });
    }
}
exports.Phase2Runtime = Phase2Runtime;
