#!/usr/bin/env bash
# Prueba las migraciones de Supabase en un PostgreSQL desechable (Docker), sin tocar el proyecto real.
# Uso: npm run test:bd
set -euo pipefail
cd "$(dirname "$0")/.."

CONTENEDOR=bakehouse-pruebas-bd
docker rm -f "$CONTENEDOR" >/dev/null 2>&1 || true
docker run -d --name "$CONTENEDOR" -e POSTGRES_PASSWORD=solo-pruebas postgres:17-alpine >/dev/null
trap 'docker rm -f "$CONTENEDOR" >/dev/null 2>&1 || true' EXIT

# La imagen arranca, se inicializa y se reinicia: esperar al segundo "listo"
for _ in $(seq 1 60); do
  [ "$(docker logs "$CONTENEDOR" 2>&1 | grep -c 'ready to accept connections')" -ge 2 ] && break
  sleep 0.5
done

sql() { docker exec -i "$CONTENEDOR" psql -U postgres -v ON_ERROR_STOP=1 -q "$@"; }

sql < supabase/pruebas/entorno_local.sql
for migracion in supabase/migrations/*.sql; do
  echo "Aplicando $(basename "$migracion")"
  sql < "$migracion"
done
sql < supabase/pruebas/seguridad.sql 2>&1 | sed -E 's/^(psql:[^ ]* )?NOTICE:  /  /'
echo "Base de datos: todas las pruebas pasaron"
