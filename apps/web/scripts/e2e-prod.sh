#!/usr/bin/env bash
# ⚠️ CANLI ORTAMA KARŞI Playwright (2026-09-13). `e2e-staging.sh`in canlı ikizi.
#
# NEDEN VAR: staging paketi yeşil olsa bile canlı FARKLI yapılandırmayla
# çalışıyor — ayrı veritabanı, ayrı alan adı, ayrı çerez alanı, ayrı gönderen
# adresi, ayrı Supabase projesi. "Müşteri numarası bir"in yaşayacağı yol canlıda
# HİÇ koşulmadı. Bu betik onu koşar.
#
# ⚠️ BU BETİK CANLIYA GERÇEK VERİ YAZAR VE GERÇEK E-POSTA GÖNDERİR.
#    · Yalnız ELLE ve bilerek çalıştırılır; CI'a BAĞLANMAZ.
#    · Yalnız kendi verisini temizleyen spec'ler verilmelidir (kayıt turu
#      `afterAll` içinde firmayı, kullanıcıyı ve Supabase hesabını siler).
#    · Kazandırma/sipariş gibi GERİ ALINAMAZ akışlar için önce temizlik
#      yolunun var olduğundan emin ol — kazandırma geri alınamaz (CLAUDE.md).
#
#   apps/web/scripts/e2e-prod.sh e2e/staging-signup.spec.ts
#
# Sırlar gitignore'lu `.env.prod.local`den. Vercel bypass başlığı VERİLMEZ:
# canlı zaten herkese açık, başlık gönderilirse gereksiz yere sızdırılır.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"

if [ $# -eq 0 ]; then
  echo "Kullanım: $0 <spec dosyası> [...]" >&2
  echo "Canlıya yazan bir koşum için spec'i AÇIKÇA vermek zorunludur." >&2
  exit 1
fi

oku() { grep -h "^$1=" "$ROOT/.env.prod.local" | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }

export PLAYWRIGHT_BASE_URL="${PLAYWRIGHT_BASE_URL:-https://www.rothern.com}"
export E2E_API_URL="${E2E_API_URL:-https://api.rothern.com/api}"
export E2E_DATABASE_URL="$(oku DATABASE_URL)"
export E2E_SUPABASE_URL="$(oku SUPABASE_URL)"
export E2E_SUPABASE_SERVICE_KEY="$(oku SUPABASE_SERVICE_ROLE_KEY)"
export E2E_PASSWORD="${E2E_PASSWORD:-Canli1234!}"

[ -n "$E2E_DATABASE_URL" ] || { echo ".env.prod.local: DATABASE_URL yok" >&2; exit 1; }

# Hedefi EKRANA YAZ: yanlış ortamda koşmayı zorlaştırır (wipe aracıyla aynı emniyet).
echo "⚠️  CANLI ORTAM"
echo "    web : $PLAYWRIGHT_BASE_URL"
echo "    api : $E2E_API_URL"
echo "    db  : $(echo "$E2E_DATABASE_URL" | sed -E 's#://[^@]*@#://<gizli>@#; s#\?.*##')"
echo

cd "$ROOT/apps/web"
exec npx playwright test --project=chromium --reporter=line "$@"
