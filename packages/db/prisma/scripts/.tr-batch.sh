#!/usr/bin/env bash
# Çeviri turu: doğrula → canlıya uygula → commit + push. Tek kaynak: curated tsv.
set -euo pipefail
cd /home/noah/projects/supkeys/packages/db
npx tsx prisma/scripts/check-category-translations.ts | tail -4
npx tsx prisma/scripts/check-category-translations.ts | grep -q "✅ Çakışma yok." || { echo "ÇAKIŞMA — dur"; exit 1; }
npx tsx prisma/scripts/apply-category-translations.ts | tail -2
cd /home/noah/projects/supkeys
git add -A
git commit -q -m "chore(categories): TR çeviri — $1

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QQn3uUxUMk8vpdouDRpS7X"
git push -q 2>&1 | grep -Ev 'gitleaks|INF|^\s*[○│░╲]*\s*$' || true
echo "✅ pushed"
