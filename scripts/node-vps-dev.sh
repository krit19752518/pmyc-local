#!/bin/sh
# Keep native/Node pools small on the shared cPanel account.
set -eu
export UV_THREADPOOL_SIZE=1
export VIPS_CONCURRENCY=1
exec /opt/alt/alt-nodejs22/root/usr/bin/node --v8-pool-size=1 --max-old-space-size=384 "$@"
