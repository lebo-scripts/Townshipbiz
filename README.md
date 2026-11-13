# TownshipBiz — Business Management Platform for South African SMEs

TownshipBiz is a mobile-first, full-stack business management platform tailored for South African small businesses, informal traders, spaza shops, food vendors, salons, and registered SMEs.

## Implemented Architecture

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Vite, Lucide Icons (`src/`).
- **Backend API**: Node.js + Express (`server.ts`, `server/services/*`, `server/middleware/*`) with Helmet security headers, rate limiting, and Firebase ID token verification.
- **Database & Auth**: Firebase Authentication (Google Sign-In + Email/Password support) and Cloud Firestore with hardened per-business isolation security rules (`firestore.rules`, `firebase-blueprint.json`).
- **Private File Storage**: Isolated local/server private vault (`.private_storage/`) with magic-byte MIME verification, executable rejection, SHA-256 hashing, and authenticated streaming downloads (zero public URLs).
- **AI Services (`@google/genai`)**: Server-side `gemini-4-hydrogen` integration for receipt OCR & confidence scoring, document vault interpretation, and RAG-grounded Business Adviser responses.
- **Deterministic Engines**:
  - **South African Regulatory Compliance Engine** (`server/services/complianceEngine.ts`): Rules for CIPC, SARS Income Tax / Turnover Tax, VAT (R1M threshold), PAYE, UIF, COIDA, BCEA, OHS, Municipal Trading Permits, SPLUMA Zoning, R638 Food Premises COA, and POPIA.
  - **Financial Analytics & Anomaly Engine** (`server/services/analyticsEngine.ts`): Cash flow, category breakdowns, supplier history, MoM comparisons, duplicate expense detection, and CSV export with formula-injection protection.

## Environment Variables

Copy `.env.example` to `.env` for local development. In AI Studio, `GEMINI_API_KEY` and `APP_URL` are injected via Secrets/runtime.

- `GEMINI_API_KEY`: Server-side Gemini API key (never exposed to browser code).
- `PORT`: Listening port (`3000`).
- `VAULT_STORAGE_DIR`: Private directory for uploaded receipts and documents (default `.private_storage`).
- `MAX_UPLOAD_BYTES`: Maximum file upload size in bytes (default `10485760`).
- `AUTH_TOKEN_SECRET`: Secret key for signing auxiliary reset tokens.

## Backend API Endpoints

All `/api/*` endpoints (except `/api/health`, `/api/compliance/rules`, and `/api/security/validate-password`) require `Authorization: Bearer <Firebase ID Token>`.

- `GET /api/health` — Service health & AI configuration check.
- `GET /api/compliance/rules` — Structured South African compliance knowledge base.
- `POST /api/compliance/assess` — Deterministic compliance evaluation for a business profile.
- `POST /api/analytics/summary` — Financial totals, trends, supplier rankings, and pattern insights.
- `POST /api/analytics/export-csv` — Formula-injection-safe CSV export of ZAR transactions.
- `POST /api/receipts/scan` — Multipart receipt upload, magic-byte validation, OCR extraction, and duplicate detection.
- `POST /api/documents/upload` — Multipart document vault upload + AI classification, date/clause extraction, and suggested follow-up action.
- `GET /api/documents/:businessId/:docId/download` — Authenticated owner-verified private file download.
- `DELETE /api/documents/:businessId/:docId` — Authenticated private file deletion.
- `POST /api/adviser/ask` — RAG-retrieved business adviser grounded in business transactions, documents, and compliance rules.

## Commands

- `npm run dev` — Start Express + Vite full-stack development server on port 3000.
- `npm run lint` — Run TypeScript type check (`tsc --noEmit`).
- `npm test` — Run automated Vitest unit, security, and integration tests.
- `npm run build` — Build frontend bundle to `dist/`.
- `npm start` — Run production server (`node server.ts`).

## Security & POPIA Notes

- Private documents are never exposed via public URLs and require bearer token + owner verification on every download or delete.
- Firestore rules enforce `request.auth.uid == ownerUid` isolation across all business subcollections and block PII list queries on `/users`.
- AI summaries and compliance checks include plain-language disclaimers and never fabricate SARS thresholds, legal enforceability, or audited financial statements.
