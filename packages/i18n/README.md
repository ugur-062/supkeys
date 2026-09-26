# @rothern/i18n

Tek katalog, tek biçim (ICU MessageFormat JSON), tek çalışma zamanı (`use-intl`).
Web `next-intl` ile `common + web`, API/e-posta `createApiTranslator` ile
`common + api + email` ad alanlarını okur. Plan ve kurallar: `docs/plan-i18n.md`.

```
src/messages/<dil>/<ad-alanı>.json   kataloglar (kaynak dil tr)
src/status/<dil>.json                anahtar → { hash, status: machine|reviewed, at }
src/glossary.json                    terim + yasaklı sözcük (dil başına)
baseline/hardcoded.json              sabit Türkçe literal cırcırı
```

- `pnpm --filter @rothern/i18n check` — CI kapısı (orphan · yer tutucu · yasaklı ·
  EN %100 · cırcır). `--update-baseline` tabanı yalnız düşürür; `--force` artışı kabul eder.
- `pnpm --filter @rothern/i18n sync [--locale ru] [--out iş.json]` — eksik/bayat anahtarları
  Türkçe kaynakla listeler; `--apply iş.json` çevirileri uygular (`reviewed`);
  `--mark-reviewed <önek>` onaylar. **Makine çevirisi yok** — çeviriyi Claude yazar
  (kullanıcı kararı 2026-09-23).
- Geliştirici YALNIZ `tr` yazar. Eksik çeviri çalışma zamanında `ru → en → tr` düşer.
