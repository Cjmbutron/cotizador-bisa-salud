#!/usr/bin/env bash
# Crea la base de pruebas "cotizador_test" desde cero con los scripts de /db y un usuario de aplicación
# sin permisos de DDL. Pensado para desarrollo y CI. Nunca apunta a la base real.
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/../../.." && pwd)"
BD="${TEST_DB_NAME:-cotizador_test}"
ROL="${TEST_DB_USER:-cotizador_app}"
CLAVE="${TEST_DB_PASSWORD:-test}"

if [ "$(id -u)" = "0" ]; then ADMIN() { su postgres -c "psql -v ON_ERROR_STOP=1 -q $*"; }; else ADMIN() { psql -v ON_ERROR_STOP=1 -q "$@"; }; fi

ADMIN "-d postgres -c \"DROP DATABASE IF EXISTS $BD\""
ADMIN "-d postgres -c \"CREATE DATABASE $BD\""
for f in 01_schema 02_catalogos 03_planes_y_tarifas 04_parametros 06_documentos; do
  ADMIN "-d $BD -f $RAIZ/db/$f.sql" > /dev/null
done
ADMIN "-d postgres" <<SQL >/dev/null
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$ROL') THEN
    CREATE ROLE $ROL LOGIN PASSWORD '$CLAVE';
  END IF;
END \$\$;
SQL
ADMIN "-d $BD" <<SQL >/dev/null
GRANT CONNECT ON DATABASE $BD TO $ROL;
GRANT USAGE ON SCHEMA public TO $ROL;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO $ROL;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO $ROL;
SQL
echo "Base de pruebas $BD lista"
