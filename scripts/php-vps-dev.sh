#!/bin/sh
# Enable the installed PostgreSQL driver only for the Dev PHP process.
set -eu
exec /opt/alt/php84/usr/bin/php -d extension=/opt/alt/php84/usr/lib64/php/modules/pdo_pgsql.so -d display_errors=0 -d display_startup_errors=0 "$@"
