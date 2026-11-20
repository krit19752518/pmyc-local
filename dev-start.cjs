'use strict';
process.env.UV_THREADPOOL_SIZE='1';
process.env.VIPS_CONCURRENCY='1';
process.env.FOOTBALL_VPS_DEV_CONFIG='/home/zbpzpszw/football-dev/shared/dev.private.json';
require('./scripts/run-vps-dev.cjs').main().catch(error=>{
 console.error('Dev startup stopped:',error.code||'DEV_CONFIGURATION_OR_IDENTITY_CHECK_FAILED');
 process.exitCode=1;
});
