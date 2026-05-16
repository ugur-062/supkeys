#!/usr/bin/env bash
# Test DB hazırlığı: supkeys_test DB oluştur + Prisma migration deploy.
# Aynı PG container'ı kullanır; izolasyon DB level'da.
#
# Idempotent — istediğin kadar tekrar çalıştırabilirsin.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REPO_ROOT="$(cd "$ROOT_DIR/../.." && pwd)"

# Test env yükle
if [ -f "$ROOT_DIR/.env.test" ]; then
  set -a
  # shellcheck source=/dev/null
  source "$ROOT_DIR/.env.test"
  set +a
fi

# .env'den admin connection bilgilerini al (default DB üzerinden CREATE DATABASE)
if [ -f "$REPO_ROOT/.env" ]; then
  set -a
  # shellcheck source=/dev/null
  source "$REPO_ROOT/.env"
  set +a
fi

POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_USER="${POSTGRES_USER:-supkeys}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-supkeys_dev_password}"
TEST_DB="${TEST_DB:-supkeys_test}"

echo "[test:db:prepare] PG container'da $TEST_DB DB'sini oluşturuyor..."

# psql lokal'de yoksa docker container içinden çalıştır
if command -v psql >/dev/null 2>&1; then
  PSQL_CMD="psql"
  PSQL_HOST_ARGS="-h $POSTGRES_HOST -p $POSTGRES_PORT"
  PSQL_ENV="PGPASSWORD=$POSTGRES_PASSWORD"
else
  CONTAINER="${POSTGRES_CONTAINER:-supkeys-postgres}"
  if ! docker ps --format '{{.Names}}' | grep -q "^$CONTAINER$"; then
    echo "[test:db:prepare] ERR: psql yok ve $CONTAINER container çalışmıyor"
    exit 1
  fi
  PSQL_CMD="docker exec -i $CONTAINER psql"
  PSQL_HOST_ARGS=""
  PSQL_ENV=""
  echo "[test:db:prepare] psql lokal yok, docker exec ile $CONTAINER kullanılıyor"
fi

# DB var mı kontrol — yoksa oluştur
EXISTS=$(eval "$PSQL_ENV $PSQL_CMD $PSQL_HOST_ARGS -U $POSTGRES_USER -d postgres -tAc \"SELECT 1 FROM pg_database WHERE datname='$TEST_DB'\"" || echo "")
if [ "$EXISTS" != "1" ]; then
  eval "$PSQL_ENV $PSQL_CMD $PSQL_HOST_ARGS -U $POSTGRES_USER -d postgres -c \"CREATE DATABASE $TEST_DB\""
  echo "[test:db:prepare] ✓ $TEST_DB oluşturuldu"
else
  echo "[test:db:prepare] $TEST_DB zaten mevcut"
fi

echo "[test:db:prepare] Migration deploy..."

cd "$REPO_ROOT/packages/db"
DATABASE_URL="postgresql://$POSTGRES_USER:$POSTGRES_PASSWORD@$POSTGRES_HOST:$POSTGRES_PORT/$TEST_DB?schema=public" \
  npx prisma migrate deploy

echo "[test:db:prepare] ✓ Hazır: $TEST_DB"
