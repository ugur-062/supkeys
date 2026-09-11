# Rol × yetki matrisi (staging, otomatik)

Üretim: `pnpm --filter @rothern/web e2e:staging e2e/staging-role-matrix.spec.ts`.
Beklentiler API kaynağından türetilir (`@RequireCompanyPermission`, `@RequireTier`);
bu tablo **çalışan staging'in gerçek yanıtıdır**. ✅ erişti · 🔒 403 · sayı = başka durum.

- **alıcı · kurucu** — paket GOLD, izinler: buy:view, buy:listing:manage, buy:award, buy:order:manage, buy:inquiry:send, buy:reports:view, sell:view, sell:bid:submit, sell:order:manage, sell:product:manage, sell:inquiry:reply, approval:act, approvals:manage, company:manage, users:manage, connections:manage, templates:manage, addresses:manage, insights:view, billing:manage, company:delete, ownership:transfer
- **alıcı · yönetici** — paket GOLD, izinler: buy:view, buy:reports:view, sell:view, approval:act, approvals:manage, company:manage, users:manage, connections:manage, templates:manage, addresses:manage, insights:view
- **alıcı · satın almacı** — paket GOLD, izinler: buy:view, buy:listing:manage, buy:award, buy:order:manage, buy:inquiry:send, buy:reports:view, connections:manage, templates:manage, addresses:manage
- **alıcı · satışçı** — paket GOLD, izinler: sell:view, sell:bid:submit, sell:order:manage, sell:product:manage, sell:inquiry:reply, connections:manage, addresses:manage, insights:view
- **alıcı · onaylayıcı** — paket GOLD, izinler: approval:act
- **alıcı · görüntüleyici** — paket GOLD, izinler: buy:view, buy:reports:view, sell:view
- **tedarikçi · kurucu** — paket SILVER, izinler: buy:view, buy:listing:manage, buy:award, buy:order:manage, buy:inquiry:send, buy:reports:view, sell:view, sell:bid:submit, sell:order:manage, sell:product:manage, sell:inquiry:reply, approval:act, approvals:manage, company:manage, users:manage, connections:manage, templates:manage, addresses:manage, insights:view, billing:manage, company:delete, ownership:transfer
- **tedarikçi · satışçı** — paket SILVER, izinler: sell:view, sell:bid:submit, sell:order:manage, sell:product:manage, sell:inquiry:reply, connections:manage, addresses:manage, insights:view
- **tedarikçi · görüntüleyici** — paket SILVER, izinler: buy:view, buy:reports:view, sell:view
- **tedarikçi2 · kurucu** — paket SILVER, izinler: buy:view, buy:listing:manage, buy:award, buy:order:manage, buy:inquiry:send, buy:reports:view, sell:view, sell:bid:submit, sell:order:manage, sell:product:manage, sell:inquiry:reply, approval:act, approvals:manage, company:manage, users:manage, connections:manage, templates:manage, addresses:manage, insights:view, billing:manage, company:delete, ownership:transfer
- **ücretsiz · kurucu** — paket STANDART, izinler: buy:view, buy:listing:manage, buy:award, buy:order:manage, buy:inquiry:send, buy:reports:view, sell:view, sell:bid:submit, sell:order:manage, sell:product:manage, sell:inquiry:reply, approval:act, approvals:manage, company:manage, users:manage, connections:manage, templates:manage, addresses:manage, insights:view, billing:manage, company:delete, ownership:transfer

| Uç (GET) | Gereken izin | Paket | alıcı · kurucu | alıcı · yönetici | alıcı · satın almacı | alıcı · satışçı | alıcı · onaylayıcı | alıcı · görüntüleyici | tedarikçi · kurucu | tedarikçi · satışçı | tedarikçi · görüntüleyici | tedarikçi2 · kurucu | ücretsiz · kurucu |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `company/activity-log` | users:manage · company:manage | SILVER | ✅ | ✅ | 🔒 | 🔒 | 🔒 | 🔒 | ✅ | 🔒 | 🔒 | ✅ | 🔒 |
| `company/addresses` | addresses:manage · buy:view · sell:view | — | ✅ | ✅ | ✅ | ✅ | 🔒 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `company/ai/assistant/sessions` | buy:listing:manage · buy:award · buy:order:manage · buy:inquiry:send · sell:bid:submit · sell:order:manage · sell:product:manage · sell:inquiry:reply | SILVER | ✅ | 🔒 | ✅ | ✅ | 🔒 | 🔒 | ✅ | ✅ | 🔒 | ✅ | 🔒 |
| `company/ai/usage` | users:manage · company:manage · buy:listing:manage · buy:award · buy:order:manage · buy:inquiry:send · sell:bid:submit · sell:order:manage · sell:product:manage · sell:inquiry:reply | SILVER | ✅ | ✅ | ✅ | ✅ | 🔒 | 🔒 | ✅ | ✅ | 🔒 | ✅ | 🔒 |
| `company/approvals/all` | approval:act · approvals:manage | — | ✅ | ✅ | 🔒 | 🔒 | ✅ | 🔒 | ✅ | 🔒 | 🔒 | ✅ | ✅ |
| `company/approvals/flows` | approvals:manage | — | ✅ | ✅ | 🔒 | 🔒 | 🔒 | 🔒 | ✅ | 🔒 | 🔒 | ✅ | ✅ |
| `company/approvals/history` | approval:act | — | ✅ | ✅ | 🔒 | 🔒 | ✅ | 🔒 | ✅ | 🔒 | 🔒 | ✅ | ✅ |
| `company/approvals/pending` | approval:act | — | ✅ | ✅ | 🔒 | 🔒 | ✅ | 🔒 | ✅ | 🔒 | 🔒 | ✅ | ✅ |
| `company/approvals/pending/count` | approval:act | — | ✅ | ✅ | 🔒 | 🔒 | ✅ | 🔒 | ✅ | 🔒 | 🔒 | ✅ | ✅ |
| `company/bank-accounts` | billing:manage · company:manage · buy:view · sell:view | — | ✅ | ✅ | ✅ | ✅ | 🔒 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `company/blocks` | connections:manage · buy:view · sell:view | — | ✅ | ✅ | ✅ | ✅ | 🔒 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `company/complaints` | connections:manage · buy:view · sell:view | — | ✅ | ✅ | ✅ | ✅ | 🔒 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `company/connections` | connections:manage · buy:view · sell:view | — | ✅ | ✅ | ✅ | ✅ | 🔒 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `company/connections/discover` | connections:manage · buy:view · sell:view | — | ✅ | ✅ | ✅ | ✅ | 🔒 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `company/connections/incoming` | connections:manage · buy:view · sell:view | — | ✅ | ✅ | ✅ | ✅ | 🔒 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `company/connections/outgoing` | connections:manage · buy:view · sell:view | — | ✅ | ✅ | ✅ | ✅ | 🔒 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `company/connections/referral-invites` | connections:manage · buy:view · sell:view | — | ✅ | ✅ | ✅ | ✅ | 🔒 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `company/connections/self` | connections:manage · buy:view · sell:view | — | ✅ | ✅ | ✅ | ✅ | 🔒 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `company/dashboard/action-center` | buy:view · sell:view | — | ✅ | ✅ | ✅ | ✅ | 🔒 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `company/dashboard/satinalma` | buy:view | — | ✅ | ✅ | ✅ | 🔒 | 🔒 | ✅ | ✅ | 🔒 | ✅ | ✅ | ✅ |
| `company/dashboard/satinalma/analytics` | buy:view | — | ✅ | ✅ | ✅ | 🔒 | 🔒 | ✅ | ✅ | 🔒 | ✅ | ✅ | ✅ |
| `company/dashboard/satinalma/tasarruf` | buy:view | — | ✅ | ✅ | ✅ | 🔒 | 🔒 | ✅ | ✅ | 🔒 | ✅ | ✅ | ✅ |
| `company/dashboard/satinalma/tedarikci` | buy:view | — | ✅ | ✅ | ✅ | 🔒 | 🔒 | ✅ | ✅ | 🔒 | ✅ | ✅ | ✅ |
| `company/dashboard/satis/aktivite` | sell:view | — | ✅ | ✅ | 🔒 | ✅ | 🔒 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `company/dashboard/satis/analytics` | sell:view | — | ✅ | ✅ | 🔒 | ✅ | 🔒 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `company/dashboard/satis/stats` | sell:view | — | ✅ | ✅ | 🔒 | ✅ | 🔒 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `company/dashboard/time-savings` | buy:view | — | ✅ | ✅ | ✅ | 🔒 | 🔒 | ✅ | ✅ | 🔒 | ✅ | ✅ | ✅ |
| `company/directory` | buy:view · sell:view | — | ✅ | ✅ | ✅ | ✅ | 🔒 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `company/directory/facets` | buy:view · sell:view | — | ✅ | ✅ | ✅ | ✅ | 🔒 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `company/directory/search` | buy:view · sell:view | — | ✅ | ✅ | ✅ | ✅ | 🔒 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `company/directory/search/facets` | buy:view · sell:view | — | ✅ | ✅ | ✅ | ✅ | 🔒 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `company/docs` | company:manage | — | ✅ | ✅ | 🔒 | 🔒 | 🔒 | 🔒 | ✅ | 🔒 | 🔒 | ✅ | ✅ |
| `company/inbox` | buy:view · sell:view | — | ✅ | ✅ | ✅ | ✅ | 🔒 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `company/inquiries/received` | sell:view | — | ✅ | ✅ | 🔒 | ✅ | 🔒 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `company/inquiries/sent` | buy:view | — | ✅ | ✅ | ✅ | 🔒 | 🔒 | ✅ | ✅ | 🔒 | ✅ | ✅ | ✅ |
| `company/items` | buy:view · sell:view | — | ✅ | ✅ | ✅ | ✅ | 🔒 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `company/items/discover` | buy:view | — | ✅ | ✅ | ✅ | 🔒 | 🔒 | ✅ | ✅ | 🔒 | ✅ | ✅ | ✅ |
| `company/items/discover/facets` | buy:view | — | ✅ | ✅ | ✅ | 🔒 | 🔒 | ✅ | ✅ | 🔒 | ✅ | ✅ | ✅ |
| `company/items/discover/search` | buy:view | — | ✅ | ✅ | ✅ | 🔒 | 🔒 | ✅ | ✅ | 🔒 | ✅ | ✅ | ✅ |
| `company/items/import/template` | sell:product:manage | — | ✅ | 🔒 | 🔒 | ✅ | 🔒 | 🔒 | ✅ | ✅ | 🔒 | ✅ | ✅ |
| `company/listing-item-import/template` | buy:listing:manage | — | 500 | 🔒 | 500 | 🔒 | 🔒 | 🔒 | 500 | 🔒 | 🔒 | 500 | 500 |
| `company/listing-templates` | buy:view | GOLD | ✅ | ✅ | ✅ | 🔒 | 🔒 | ✅ | 🔒 | 🔒 | 🔒 | 🔒 | 🔒 |
| `company/listings` | buy:view | — | ✅ | ✅ | ✅ | 🔒 | 🔒 | ✅ | ✅ | 🔒 | ✅ | ✅ | ✅ |
| `company/listings/discover-facets` | sell:view | — | ✅ | ✅ | 🔒 | ✅ | 🔒 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `company/listings/my-bids` | sell:view | — | ✅ | ✅ | 🔒 | ✅ | 🔒 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `company/listings/seller-tenders` | sell:view | — | ✅ | ✅ | 🔒 | ✅ | 🔒 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `company/listings/seller-tenders/locked-summary` | sell:view | — | ✅ | ✅ | 🔒 | ✅ | 🔒 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `company/listings/tenders` | buy:view | — | ✅ | ✅ | ✅ | 🔒 | 🔒 | ✅ | ✅ | 🔒 | ✅ | ✅ | ✅ |
| `company/messages/threads` | buy:view · sell:view | — | 400 | 400 | 400 | 400 | 🔒 | 400 | 400 | 400 | 400 | 400 | 400 |
| `company/messages/unread-count` | buy:view · sell:view | — | ✅ | ✅ | ✅ | ✅ | 🔒 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `company/orders` | buy:view · sell:view | — | ✅ | ✅ | ✅ | ✅ | 🔒 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `company/profile` | company:manage · buy:view · sell:view | — | ✅ | ✅ | ✅ | ✅ | 🔒 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `company/question-templates` | buy:view | GOLD | ✅ | ✅ | ✅ | 🔒 | 🔒 | ✅ | 🔒 | 🔒 | 🔒 | 🔒 | 🔒 |
| `company/request-defaults` | buy:view | — | ✅ | ✅ | ✅ | 🔒 | 🔒 | ✅ | ✅ | 🔒 | ✅ | ✅ | ✅ |
| `company/supplier-templates` | buy:view | GOLD | ✅ | ✅ | ✅ | 🔒 | 🔒 | ✅ | 🔒 | 🔒 | 🔒 | 🔒 | 🔒 |
| `company/users` | users:manage | — | ✅ | ✅ | 🔒 | 🔒 | 🔒 | 🔒 | ✅ | 🔒 | 🔒 | ✅ | ✅ |
| `company/users/invitations` | users:manage | — | ✅ | ✅ | 🔒 | 🔒 | 🔒 | 🔒 | ✅ | 🔒 | 🔒 | ✅ | ✅ |
| `company/users/permission-catalog` | users:manage | — | ✅ | ✅ | 🔒 | 🔒 | 🔒 | 🔒 | ✅ | 🔒 | 🔒 | ✅ | ✅ |
| `company/users/seats` | users:manage | — | ✅ | ✅ | 🔒 | 🔒 | 🔒 | 🔒 | ✅ | 🔒 | 🔒 | ✅ | ✅ |
| `company/views/insights` | insights:view | SILVER | ✅ | ✅ | 🔒 | ✅ | 🔒 | 🔒 | ✅ | ✅ | 🔒 | ✅ | 🔒 |
| `company/views/visitors` | insights:view | — | ✅ | ✅ | 🔒 | ✅ | 🔒 | 🔒 | ✅ | ✅ | 🔒 | ✅ | ✅ |
