# GA-ERP

An enterprise-grade, high-concurrency Enterprise Resource Planning system architected for local deployment and edge access.

## Core Modules
- **Point of Sale (POS):** Atomic inventory updates, serial/barcode scanning, split tenders.
- **Workshop & Service Intake:** Hardware diagnostics, technician assignment, intake receipts.
- **Financial Accounting:** Strict double-entry ledger, balance sheet, trial balance, and P&L statements.

## Architecture
- **Backend:** Fastify, TypeScript, Prisma ORM
- **Database:** PostgreSQL 16 (Strict Constraints, Double-Entry Triggers)
- **Caching:** Redis 7 (Token Blacklisting, High-Speed Cache)
- **Reverse Proxy:** Caddy 2
- **Edge Ingress:** Cloudflare Zero Trust Tunnel
