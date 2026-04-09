# V-Link (VAS 관리 프로그램)

V-Link는 VAS(Value Added Service) 요청을 접수하고, 관리자 승인/반려 및 업체 배정, 작업 완료, SAP 연동까지 한 흐름으로 관리하기 위한 웹 기반 업무 시스템입니다.

이 저장소는 모노레포 구조로 구성되어 있으며, API 서버와 웹 프론트엔드를 함께 관리합니다.

## 1. 프로젝트 목적

- 요청자: VAS 작업 요청 등록, 첨부 업로드, 상태 추적
- 관리자: 요청 승인/반려, 업체 배정, 작업 현황 관리, 데이터 내보내기
- 업체: 배정된 작업 조회, 작업 시작/완료 처리
- 시스템: 상태 이력 기록, SAP 연동 작업 로그/재시도, 캘린더/대시보드 제공

## 2. 기술 스택

- 프론트엔드: Next.js (App Router), React, CSS Modules
- 백엔드: NestJS
- 데이터베이스: PostgreSQL
- ORM: Prisma
- 인증/인가: JWT + RBAC (`ADMIN`, `REQUESTER`, `VENDOR`)
- 파일 업로드: Multer (로컬 저장소 `apps/api/uploads`)
- 문서/내보내기: CSV/XLSX (ExcelJS)

## 3. 저장소 구조

- `apps/api`: NestJS API 서버
- `apps/web`: Next.js 웹 앱
- `apps/api/prisma`: Prisma 스키마, 마이그레이션, 시드

## 4. 핵심 기능

### 4.1 인증/권한

- 로그인: `POST /auth/login`
- 회원가입(공개): `POST /auth/signup`
- 관리자 전용 사용자 등록: `POST /auth/register`
- 역할별 접근 제어(RBAC) 및 데이터 격리 적용

### 4.2 요청서/워크플로우

- 요청 생성/조회/상세
- 승인/반려/업체 배정
- 업체 시작/완료 처리
- 상태 변경 이력 저장
- 첨부 파일 업로드 및 메타데이터 저장

### 4.3 관리자 화면

- 필터 기반 요청 조회
- 요청 상세 표 및 처리 모달(승인/반려/배정)
- 필터 결과 건수 실시간 표시
- CSV/XLSX 내보내기
- 사이드바 `요청한 작업` 메뉴에 승인 대기 건수 배지 표시

### 4.4 캘린더/대시보드

- 캘린더 이벤트 조회 및 필터
- 대시보드 요약/상세 표/내보내기

### 4.5 SAP 연동

- OData 기반 연동 클라이언트
- 사전/사후 오더 트리거
- 작업 로그 저장, 실패 재시도, 백업 내보내기 API

## 5. 로컬 실행 방법

## 5.1 사전 준비

- Node.js 20 이상 권장
- PostgreSQL 실행 중이어야 함

## 5.2 설치

```bash
npm install
```

## 5.3 환경변수 설정

```bash
copy apps\api\.env.example apps\api\.env
```

PowerShell에서 `copy`가 안 되면:

```bash
cp apps/api/.env.example apps/api/.env
```

필수 확인:

- `DATABASE_URL`
- `JWT_SECRET`
- `PORT` (기본 `4000`)
- 웹 API 주소: `NEXT_PUBLIC_API_BASE_URL` (기본 `http://localhost:4000`)

## 5.4 Prisma 준비

```bash
npm run prisma:generate --workspace apps/api
npm run prisma:migrate --workspace apps/api
npm run prisma:seed --workspace apps/api
```

## 5.5 서버 실행

터미널 1:

```bash
npm run dev:api
```

터미널 2:

```bash
npm run dev:web
```

접속 주소:

- 웹: `http://localhost:3000`
- API: `http://localhost:4000`

## 6. 기본 계정(시드)

- 관리자: `admin@vlink.local` / `admin1234`
- 업체: `vendor@vlink.local` / `vendor1234`

## 7. 역할별 사용 흐름

### 7.1 요청자

1. 로그인
2. 요청 등록(제목/유형/마감/설명 + 첨부)
3. 내 요청 목록에서 상태 확인

### 7.2 관리자

1. 로그인 후 `요청한 작업` 진입
2. 필터 적용 후 결과 건수 확인
3. 요청별 처리 모달 열어 승인/반려/업체 배정
4. 필요 시 CSV/XLSX 내보내기

### 7.3 업체

1. 로그인
2. 배정 목록 확인
3. 시작 처리 → 완료 처리

## 8. 주요 API 요약

- 인증
  - `POST /auth/login`
  - `POST /auth/signup`
  - `POST /auth/register` (ADMIN)

- 요청
  - `POST /requests`
  - `GET /requests`
  - `GET /requests/:id`
  - `PATCH /requests/:id/approve` (ADMIN)
  - `PATCH /requests/:id/reject` (ADMIN)
  - `PATCH /requests/:id/start`
  - `PATCH /requests/:id/complete`
  - `POST /requests/:id/attachments`
  - `GET /requests/admin/table` (ADMIN)
  - `GET /requests/admin/export` (ADMIN)
  - `GET /requests/admin/pending-count` (ADMIN)

- 부가 기능
  - `GET /calendar/events`
  - `GET /calendar/vendors`
  - `GET /dashboard/summary`
  - `GET /dashboard/detail-table`
  - `GET /dashboard/export`

## 9. SAP 운영 관련 환경변수(핵심)

- 연결/인증: `SAP_ODATA_BASE_URL`, `SAP_ODATA_AUTH_MODE`, `SAP_ODATA_USERNAME`, `SAP_ODATA_PASSWORD`
- OAuth: `SAP_ODATA_TOKEN_URL`, `SAP_ODATA_CLIENT_ID`, `SAP_ODATA_CLIENT_SECRET`, `SAP_ODATA_SCOPE`
- 경로: `SAP_ODATA_PRE_ORDER_PATH`, `SAP_ODATA_POST_ORDER_PATH`
- 타임아웃/재시도: `SAP_ODATA_TIMEOUT_MS`, `SAP_MAX_RETRY_ATTEMPTS`, `SAP_RETRY_BASE_SECONDS`
- 매핑: `SAP_COMPANY_CODE`, `SAP_PLANT_CODE`, `SAP_STORAGE_LOCATION`, `SAP_REQUEST_TYPE_MAP_JSON`

## 10. 참고 사항

- 현재 파일 업로드는 로컬 저장(`apps/api/uploads`) 기준입니다.
- SAP 운영 연동은 실제 운영 스펙/인증 정보가 필요합니다.
- 개발 중에는 마이그레이션/시드 데이터를 초기화한 뒤 재실행해 테스트 시나리오를 반복할 수 있습니다.
