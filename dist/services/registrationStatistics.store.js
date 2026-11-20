"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StatisticsStore = void 0;
exports.statisticsDirectory = statisticsDirectory;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const node_crypto_1 = require("node:crypto");
const registrationStatistics_service_1 = require("./registrationStatistics.service");
function statisticsDirectory() {
    return process.env.REGISTRATION_STATISTICS_DIR || node_path_1.default.resolve(__dirname, '../../.runtime/registration-statistics');
}
/** Private durable files, never in a static directory. No filesystem work at import time. */
class StatisticsStore {
    directory;
    constructor(directory = statisticsDirectory()) {
        this.directory = directory;
        if (!node_path_1.default.isAbsolute(directory) || directory.split(node_path_1.default.sep).some(p => ['public', 'uploads'].includes(p)))
            throw new Error('Snapshot directory must be private and absolute');
    }
    async safeDirectory(create = false) {
        // Refuse symlink ancestors, including a misconfigured data root.
        let prefix = node_path_1.default.parse(this.directory).root;
        for (const part of this.directory.slice(prefix.length).split(node_path_1.default.sep).filter(Boolean)) {
            prefix = node_path_1.default.join(prefix, part);
            if (create)
                await promises_1.default.mkdir(prefix, { mode: 0o700 }).catch((e) => { if (e.code !== 'EEXIST')
                    throw e; });
            const stat = await promises_1.default.lstat(prefix);
            if (!stat.isDirectory() || stat.isSymbolicLink())
                throw new Error('Unsafe snapshot directory');
        }
    }
    async readFile(name) {
        await this.safeDirectory();
        const target = node_path_1.default.join(this.directory, name);
        const stat = await promises_1.default.lstat(target);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2_000_000)
            throw new Error('Unsafe snapshot file');
        return JSON.parse(await promises_1.default.readFile(target, 'utf8'));
    }
    async read(id) {
        if (id !== undefined && !/^[a-f0-9]{64}$/.test(id))
            throw new Error('Invalid snapshot version');
        try {
            const value = (0, registrationStatistics_service_1.validateStatistics)(await this.readFile(id ? `${id}.json` : 'current.json'));
            if (id && id !== value.snapshotId)
                throw new Error('Snapshot filename mismatch');
            return value;
        }
        catch (e) {
            if (e.code === 'ENOENT')
                return null;
            throw e;
        }
    }
    async atomicWrite(name, value) {
        await this.safeDirectory(true);
        const temp = node_path_1.default.join(this.directory, `.pending-${(0, node_crypto_1.randomUUID)()}`);
        const handle = await promises_1.default.open(temp, 'wx', 0o600);
        try {
            await handle.writeFile(JSON.stringify(value));
            await handle.sync();
            await handle.close();
            await promises_1.default.rename(temp, node_path_1.default.join(this.directory, name));
            const directory = await promises_1.default.open(this.directory, 'r');
            try {
                await directory.sync();
            }
            finally {
                await directory.close();
            }
        }
        catch (e) {
            await handle.close().catch(() => undefined);
            await promises_1.default.unlink(temp).catch(() => undefined); // only this operation's unique temporary file
            throw e;
        }
    }
    async publish(value) {
        const snapshot = (0, registrationStatistics_service_1.validateStatistics)(value);
        if (snapshot.definitionVersion !== registrationStatistics_service_1.DEFINITION_VERSION)
            throw new Error('Cannot publish a historical statistics definition');
        const prior = await this.read();
        if (prior && prior.asOf >= snapshot.asOf)
            throw new Error('Refusing snapshot time regression');
        // Immutable versions retained for open pages/CSV. Only the current pointer changes.
        await this.atomicWrite(`${snapshot.snapshotId}.json`, snapshot);
        await this.atomicWrite('current.json', snapshot);
    }
    async recordFailure() { await this.atomicWrite('failure.json', { failedAt: new Date().toISOString() }); }
    async stale(snapshot, now = new Date()) {
        if (snapshot.jobKey < (0, registrationStatistics_service_1.dueJobKey)(now))
            return true;
        try {
            const failure = await this.readFile('failure.json');
            return typeof failure.failedAt !== 'string' || failure.failedAt > snapshot.generatedAt;
        }
        catch (e) {
            if (e.code === 'ENOENT')
                return false;
            return true;
        }
    }
}
exports.StatisticsStore = StatisticsStore;
