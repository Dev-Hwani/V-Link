# V-Link

Monorepo scaffold for V-Link VAS workflow.

## Structure

- `apps/api`: NestJS + Prisma + PostgreSQL backend
- `apps/web`: Next.js frontend scaffold

## Backend implemented (phase 1)

- JWT auth (`/auth/login`, `/auth/register`)
- Public requester signup (`/auth/signup`)
- RBAC roles: `ADMIN`, `REQUESTER`, `VENDOR`
- VAS request workflow endpoints
  - `POST /requests`
  - `GET /requests`
  - `GET /requests/:id`
  - `PATCH /requests/:id/approve`
  - `PATCH /requests/:id/reject`
  - `PATCH /requests/:id/start`
  - `PATCH /requests/:id/complete`
  - `POST /requests/:id/attachments`
- Local file upload storage (`apps/api/uploads`)
- Assignment history model (`Assignment`)
- SAP OData adapter + queue/retry worker + job logging
- SAP operational APIs (admin)
  - `GET /sap/jobs`
  - `POST /sap/jobs/:id/retry`
  - `GET /sap/backup/export`
- Calendar endpoints
  - `GET /calendar/events`
  - `GET /calendar/vendors`
- Dashboard endpoint
  - `GET /dashboard/summary`

## Quick start

1. Install dependencies

```bash
npm install
```

2. Set backend environment

```bash
copy apps\\api\\.env.example apps\\api\\.env
```

3. Generate Prisma client

```bash
npm run prisma:generate --workspace apps/api
```

4. Run DB migration (requires local PostgreSQL)

```bash
npm run prisma:migrate --workspace apps/api -- --name init
```

5. Seed default users

```bash
npm run prisma:seed --workspace apps/api
```

6. Run backend

```bash
npm run dev:api
```

7. Run frontend

```bash
npm run dev:web
```

Default ports:

- Web: `http://localhost:3000`
- API: `http://localhost:4000` (configured by `PORT` in `apps/api/.env`)
- Optional web env override: `NEXT_PUBLIC_API_BASE_URL` (default `http://localhost:4000`)

Login entry:

- `http://localhost:3000/login`
- `http://localhost:3000/signup` (public requester signup)
- One login redirects by role:
  - `ADMIN` -> `/admin/requests`
  - `REQUESTER` -> `/requester`
  - `VENDOR` -> `/vendor`

## Vendor screen

- Open `http://localhost:3000/vendor` (or your Next.js dev port)
- Process assigned work (session-based)

## Calendar screen

- Open `http://localhost:3000/calendar` (or your Next.js dev port)
- Filter by date/vendor/status

## Dashboard screen

- Open `http://localhost:3000/dashboard` (or your Next.js dev port)
- Inspect request/vendor/SAP metrics

## SAP queue/retry env

- `SAP_MAX_RETRY_ATTEMPTS` (default `3`)
- `SAP_RETRY_BASE_SECONDS` (default `30`, exponential backoff)
- `SAP_ALERT_CHANNEL` (default `log-only`)
- `SAP_ALERT_WEBHOOK_URL` (optional HTTP webhook)

## SAP operational env (phase 2 hardening)

- Auth mode: `SAP_ODATA_AUTH_MODE` = `NONE | BASIC | BEARER | CLIENT_CREDENTIALS`
- Bearer token: `SAP_ODATA_BEARER_TOKEN`
- OAuth client credentials: `SAP_ODATA_TOKEN_URL`, `SAP_ODATA_CLIENT_ID`, `SAP_ODATA_CLIENT_SECRET`, `SAP_ODATA_SCOPE`
- Mapping: `SAP_COMPANY_CODE`, `SAP_PLANT_CODE`, `SAP_STORAGE_LOCATION`, `SAP_CURRENCY`, `SAP_PRE_ORDER_TYPE`, `SAP_POST_ORDER_TYPE`, `SAP_REQUEST_TYPE_MAP_JSON`
- Error policy override: `SAP_RETRYABLE_CODES`, `SAP_NON_RETRYABLE_CODES`

## Notification env

- Enable flags: `NOTIFY_EMAIL_ENABLED`, `NOTIFY_ALIMTALK_ENABLED`
- Email: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `NOTIFY_EMAIL_TO`
- AlimTalk webhook: `ALIMTALK_WEBHOOK_URL`, `ALIMTALK_API_KEY`

## Default seed users

- admin: `admin@vlink.local` / `admin1234`
- vendor: `vendor@vlink.local` / `vendor1234`
