"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const db_1 = require("../db");
const registrationStatistics_refresh_1 = require("../services/registrationStatistics.refresh");
const registrationStatistics_store_1 = require("../services/registrationStatistics.store");
/** Run by an external singleton scheduler, never on web startup or public GET. */
async function main() {
    try {
        const result = await (0, registrationStatistics_refresh_1.refreshStatistics)(db_1.pool, new registrationStatistics_store_1.StatisticsStore(), new Date(), { force: process.argv.slice(2).includes('--force') });
        console.log(JSON.stringify(result)); // aggregate metadata only
    }
    catch {
        console.error('Registration statistics refresh failed; last-good snapshot retained.');
        process.exitCode = 1;
    }
    finally {
        await db_1.pool.end();
    }
}
if (require.main === module)
    void main();
