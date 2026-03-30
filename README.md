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
  - `PATCH /requests/:id/approve`
  - `PATCH /requests/:id/reject`
  - `PATCH /requests/:id/start`
  - `PATCH /requests/:id/complete`
  - `POST /requests/:id/attachments`
- Local file upload storage (`apps/api/uploads`)
- SAP OData adapter abstraction with job logging

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

## Default seed users

- admin: `admin@vlink.local` / `admin1234`
- vendor: `vendor@vlink.local` / `vendor1234`
