"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Phase2ProductionBackend = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const net_1 = require("net");
/** Managed PHP upstream; no development PHP process is spawned in production. */
class Phase2ProductionBackend {
    environment;
    cached;
    constructor(environment = process.env) {
        this.environment = environment;
    }
    configuration() {
        if (this.cached)
            return this.cached;
        const file = this.environment.PHASE2_PRODUCTION_CONFIG || path_1.default.join(this.environment.PHASE2_ROOT || path_1.default.resolve(__dirname, '../../phase2'), '.runtime/production.json');
        if (!fs_1.default.existsSync(file) && !this.environment.PHASE2_PRODUCTION_CONFIG)
            return {};
        const stat = fs_1.default.lstatSync(file);
        if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0)
            throw new Error('Phase 2 configuration must be a private regular file');
        const value = JSON.parse(fs_1.default.readFileSync(file, 'utf8'));
        if (!value || typeof value !== 'object' || Array.isArray(value))
            throw new Error('Invalid Phase 2 production configuration');
        this.cached = value;
        return value;
    }
    setting(name, key, fallback = '') {
        const value = this.environment[name] ?? this.configuration().backend?.[key] ?? fallback;
        if (typeof value !== 'string' && typeof value !== 'number')
            throw new Error('Invalid Phase 2 production configuration');
        return String(value);
    }
    get secret() {
        const value = this.environment.PMYC_PHASE2_BRIDGE_SECRET || this.configuration().bridge_secret || '';
        if (typeof value !== 'string' || !/^[a-f0-9]{64}$/i.test(value))
            throw new Error('Production Phase 2 bridge secret is not configured');
        return value;
    }
    get hostHeader() {
        const value = this.setting('PHASE2_BACKEND_HOST_HEADER', 'host_header');
        if (value && !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(value))
            throw new Error('Invalid Phase 2 backend host header');
        return value || undefined;
    }
    get address() {
        const value = this.setting('PHASE2_BACKEND_ADDRESS', 'address', '127.0.0.1');
        if (!(0, net_1.isIP)(value))
            throw new Error('Phase 2 backend address must be an explicit IP');
        return value;
    }
    get secure() {
        const protocol = this.setting('PHASE2_BACKEND_PROTOCOL', 'protocol', 'http');
        if (!['http', 'https'].includes(protocol))
            throw new Error('Invalid Phase 2 backend protocol');
        return protocol === 'https';
    }
    get entryPath() {
        const value = this.setting('PHASE2_BACKEND_ENTRY_PATH', 'entry_path');
        if (value && !/^\/[a-z0-9_/-]+\.php$/i.test(value))
            throw new Error('Invalid Phase 2 backend entry path');
        return value || undefined;
    }
    async port() {
        const value = this.setting('PHASE2_BACKEND_PORT', 'port');
        if (!/^[0-9]{1,5}$/.test(value) || Number(value) < 1 || Number(value) > 65535)
            throw new Error('Production Phase 2 backend port is not configured');
        void this.secret;
        void this.hostHeader;
        void this.entryPath;
        if (!['127.0.0.1', '::1'].includes(this.address) && !this.secure)
            throw new Error('Non-loopback Phase 2 upstream requires HTTPS');
        if (this.secure && !this.hostHeader)
            throw new Error('HTTPS Phase 2 upstream requires a verified hostname');
        return Number(value);
    }
}
exports.Phase2ProductionBackend = Phase2ProductionBackend;
