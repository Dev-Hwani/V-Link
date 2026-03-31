# V-Link

Monorepo scaffold for V-Link VAS workflow.

## Structure

- `apps/api`: NestJS + Prisma + PostgreSQL backend
- `apps/web`: Next.js frontend scaffold

## Backend implemented (phase 1)

- JWT auth (`/auth/login`, `/auth/register`)
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
- Calendar endpoints
  - `GET /calendar/events`
  - `GET /calendar/vendors`

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

## Vendor screen

- Open `http://localhost:3000/vendor` (or your Next.js dev port)
- Login with seeded vendor account and process assigned work

## Calendar screen

- Open `http://localhost:3000/calendar` (or your Next.js dev port)
- Login and filter by date/vendor/status

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

## Default seed users

- admin: `admin@vlink.local` / `admin1234`
- vendor: `vendor@vlink.local` / `vendor1234`
