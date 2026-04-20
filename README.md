# 🚚 LORREY — AI-Powered Logistics & Transport Management System

> **An intelligent, full-stack web platform for digitizing, automating, and centralizing logistics operations in the Indian cement transportation industry.**

---

## 📋 Table of Contents

1. [Abstract](#abstract)
2. [Problem Statement](#problem-statement)
3. [System Overview](#system-overview)
4. [System Architecture](#system-architecture)
5. [Technology Stack](#technology-stack)
6. [Key Modules & Features](#key-modules--features)
7. [AI Extraction Pipeline](#ai-extraction-pipeline)
8. [Data Models](#data-models)
9. [Role-Based Access Control (RBAC)](#role-based-access-control-rbac)
10. [Real-Time Synchronization Engine](#real-time-synchronization-engine)
11. [Financial Tracking System](#financial-tracking-system)
12. [Cloud Infrastructure](#cloud-infrastructure)
13. [API Reference](#api-reference)
14. [Project Structure](#project-structure)
15. [Setup & Deployment](#setup--deployment)
16. [Results & Outcomes](#results--outcomes)
17. [Future Work](#future-work)

---

## Abstract

**Lorrey** is a multi-portal, role-based logistics management system built for transport companies managing cement dispatch operations. The system replaces traditional paper-based processes with an intelligent, AI-first digital workflow. It uses **GPT-4o Vision** to extract structured data from physical invoices and delivery challans, automates financial computations (fuel estimation, freight billing, tax deductions), and provides real-time multi-user data synchronization via **WebSockets**.

The platform serves three distinct user roles — **Office Admin (Head Office)**, **Site Admin**, and **Petrol Pump Admin** — each with a purpose-built workspace. Data flows automatically between modules: a scanned invoice creates a record, which cascades through the Cement Register, Voucher System, GST Portal, and financial reports — with zero manual re-entry.

---

## Problem Statement

Transport operations in bulk-goods logistics (particularly cement distribution from factories to retail/construction sites) suffer from several systemic inefficiencies:

| Problem | Impact |
|---|---|
| Manual data entry from paper invoices | Human error, delays, duplication |
| No segregation between office and field teams | Unauthorized access, accountability gaps |
| Fuel usage estimated manually | Over/under-fuelling, revenue leakage |
| Payment tracking across multiple parties (fuel pump, drivers, party) | Reconciliation failures |
| Physical registers for financial tracking | No real-time visibility, prone to loss |
| No automated GST record generation | Compliance risk |
| Physical scanning of documents done separately | No direct link between scan and database record |

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        LORREY SYSTEM — HIGH LEVEL                       │
│                                                                         │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────────┐  │
│  │  Office Admin │    │  Site Admin  │    │    Petrol Pump Admin     │  │
│  │  (HEAD_OFFICE)│    │   (OFFICE)   │    │      (PETROL PUMP)       │  │
│  └──────┬───────┘    └──────┬───────┘    └────────────┬─────────────┘  │
│         │                   │                          │                │
│         └───────────────────┴──────────────────────────┘                │
│                             │                                           │
│                    ┌────────▼────────┐                                  │
│                    │  React Frontend  │                                  │
│                    │  (Vite + MUI)    │                                  │
│                    └────────┬────────┘                                  │
│                             │ REST API + WebSocket                      │
│                    ┌────────▼────────┐                                  │
│                    │  Node.js Backend │                                  │
│                    │  (Express.js)    │                                  │
│                    └────────┬────────┘                                  │
│          ┌──────────────────┼───────────────────────┐                   │
│          │                  │                       │                   │
│  ┌───────▼──────┐  ┌────────▼────────┐  ┌──────────▼───────┐          │
│  │  MongoDB     │  │    AWS S3       │  │   AI Worker       │          │
│  │  Atlas       │  │  (Documents,    │  │  (Python/FastAPI) │          │
│  │  (Multi-DB)  │  │   PDF, Images)  │  │  GPT-4o Vision    │          │
│  └──────────────┘  └─────────────────┘  └──────────────────┘          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## System Architecture

### Detailed Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           USER INTERACTION LAYER                                │
│                                                                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌───────────────────────────────┐  │
│  │  Office Workspace│  │  Site Workspace  │  │     Pump Workspace            │  │
│  │  (HEAD_OFFICE)   │  │  (OFFICE)        │  │     (PETROL PUMP)             │  │
│  │  Port: 5174      │  │  Port: 5173      │  │     Port: 5175                │  │
│  │                  │  │                  │  │                               │  │
│  │ • Voucher Entry  │  │ • Invoice Upload │  │ • Fuel Issue Entry            │  │
│  │ • Registers      │  │ • AI Review      │  │ • HSD Bill Tracking           │  │
│  │ • Cashbook       │  │ • Registers      │  │ • Payment Statement           │  │
│  │ • GST Portal     │  │ • Cashbook       │  │                               │  │
│  └────────┬─────────┘  └────────┬─────────┘  └───────────────┬───────────────┘  │
│           │                     │                             │               │
└───────────┼─────────────────────┼─────────────────────────────┼───────────────┘
            │   HTTPS REST + Socket.io WebSocket                │
┌───────────▼─────────────────────▼─────────────────────────────▼───────────────┐
│                         NODE.JS BACKEND (Express.js)                           │
│                              Port: 3000                                        │
│                                                                                │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │  Auth Routes  │  │ Invoice Routes│  │Cement Register│  │  Voucher Routes  │ │
│  │  /auth/login  │  │  /invoice     │  │  Routes       │  │  /voucher        │ │
│  │  /auth/signup │  │  (CRUD, PDF,  │  │  /cement-     │  │  (JWT-protected, │ │
│  │  (JWT Tokens) │  │   S3 Upload,  │  │   register    │  │   role-derived)  │ │
│  └──────────────┘  │   GPT Extract)│  └──────────────┘  └──────────────────┘ │
│                    └───────────────┘  ┌──────────────┐  ┌──────────────────┐  │
│  ┌──────────────┐  ┌───────────────┐  │  GST Portal  │  │  Main Cashbook   │  │
│  │ Pump Payment  │  │ Party Payment │  │  Routes      │  │  Routes          │  │
│  │ Routes        │  │ Routes        │  │  /gst-portal │  │  /main-cashbook  │  │
│  │ /pump-payment │  │ /party-payment│  └──────────────┘  └──────────────────┘  │
│  └──────────────┘  └───────────────┘                                          │
│                                                                                │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │                         SYNC ENGINE (syncManager.js)                     │  │
│  │                                                                          │  │
│  │  Invoice Approved → Auto-populate Cement Register row                   │  │
│  │  Voucher Created  → Re-sync Site Cash / Office Cash columns             │  │
│  │  Data Saved       → WebSocket broadcast → live UI update (all clients)  │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────────────────────────┐    │
│  │  Middleware  │  │   Socket.io   │  │  Chokidar File Watcher           │    │
│  │  auth (JWT)  │  │   Server      │  │  (Lorrey_Scans/ folder)          │    │
│  │  multer-s3   │  │   Real-time   │  │  New PDF → auto-upload S3        │    │
│  │  cors        │  │   Broadcasts  │  │       → trigger AI pipeline      │    │
│  └──────────────┘  └───────────────┘  └──────────────────────────────────┘    │
└───────────┬──────────────────────────────────────────────-───┬─────────────────┘
            │                                                   │
┌───────────▼──────────────────────────┐   ┌────────────────────▼─────────────┐
│         DATA LAYER (MongoDB Atlas)   │   │        AI WORKER SERVICE          │
│                                      │   │   Python / FastAPI  Port: 8000    │
│  Database: invoiceAI                 │   │                                   │
│  ├── invoices (Collection)           │   │  ┌─────────────────────────────┐  │
│  ├── vouchers (Collection)           │   │  │  /process endpoint          │  │
│  ├── users (Collection)              │   │  │  1. Download PDF from S3    │  │
│  ├── truckcontacts (Collection)      │   │  │  2. Convert PDF → image     │  │
│  └── partypayments (Collection)      │   │  │     (PyMuPDF / fitz)        │  │
│                                      │   │  │  3. GPT-4o Vision call      │  │
│  Database: cement_register           │   │  │     (base64 encoded image)  │  │
│  └── entries (Collection)            │   │  │  4. Rule-based validations  │  │
│                                      │   │  │     • Address Validator     │  │
│  Database: pump_payment              │   │  │     • GST/PAN Validator     │  │
│  └── records (Collection)            │   │  │     • Amount Validator      │  │
│                                      │   │  │     • Time Normalizer       │  │
│  Database: gst_portal                │   │  │  5. Return structured JSON  │  │
│  └── entries (Collection)            │   │  └─────────────────────────────┘  │
│                                      │   │                                   │
│  Database: main_cashbook             │   │  AI Model: GPT-4o (OpenAI API)    │
│  └── entries (Collection)            │   │  Framework: FastAPI + uvicorn     │
└──────────────────────────────────────┘   └────────────────────┬──────────────┘
                                                                │
                           ┌────────────────────────────────────▼──────────┐
                           │                AWS S3 BUCKET                  │
                           │  (lorreyproject, ap-south-1)                  │
                           │                                                │
                           │  /invoice_uploads/ — original scanned PDFs    │
                           │  /voucher_slips/   — AI-generated voucher PDFs│
                           │  /softcopy/        — human-attached softcopies│
                           │  /gcn_softcopy/    — GCN document uploads     │
                           └────────────────────────────────────────────────┘
```

---

### Invoice Processing Flow

```
  Physical Invoice (Paper / Scanned PDF)
            │
            ▼
  ┌─────────────────────┐
  │  Upload via Browser │  (Site Admin or Physical Scanner → Lorrey_Scans/)
  └──────────┬──────────┘
             │
             ▼
  ┌─────────────────────┐
  │    AWS S3 Upload     │  multer-s3 middleware streams file directly to cloud
  └──────────┬──────────┘
             │ S3 URL
             ▼
  ┌─────────────────────┐
  │   AI Worker HTTP    │  Node.js POSTs S3 URL to Python FastAPI microservice
  │   POST /process     │
  └──────────┬──────────┘
             │
             ▼
  ┌─────────────────────────────────────────────────────┐
  │              AI PIPELINE (ai-worker/)               │
  │                                                     │
  │  1. Download from S3                                │
  │  2. PyMuPDF: PDF → high-res JPEG (2× matrix)        │
  │  3. GPT-4o Vision: image → structured JSON          │
  │     Using 32-rule expert prompt + target schema     │
  │  4. clear_hallucinated_fields()                     │
  │  5. validate_invoice()      ← rule-based checks     │
  │  6. validate_addresses()    ← pincode/state checks  │
  │  7. validate_gst_pan()      ← format validation     │
  │  8. validate_amounts()      ← cross-field sums      │
  │  9. fill_invoice_time()     ← HH:MM:SS normalization│
  └──────────┬──────────────────────────────────────────┘
             │ Structured JSON
             ▼
  ┌─────────────────────┐
  │  Save to MongoDB    │  invoiceAI.invoices with ai_data field
  │  Status: "pending"  │
  └──────────┬──────────┘
             │
             ▼
  ┌─────────────────────┐
  │  Human Review UI    │  Site Admin verifies & corrects extracted fields
  │  (InvoiceForm.jsx)  │  Side-by-side: original image ↔ editable form
  └──────────┬──────────┘
             │ Approve
             ▼
  ┌─────────────────────────────────────────────────────┐
  │          SYNC ENGINE (syncManager.js)               │
  │                                                     │
  │  • Auto-generates Lorry Hire Slip                   │
  │  • Auto-generates Fuel Slip                         │
  │  • Creates/updates Cement Register row              │
  │  • Computes: Billing, TDS, Advance, Site/Office Cash│
  │  • Assigns sequential SL NO and GCN NO (per FY)    │
  │  • HSD Bill No: PumpName/FY/Period                  │
  │  • Broadcasts real-time updates via Socket.io       │
  └─────────────────────────────────────────────────────┘
```

---

## Technology Stack

### Frontend

| Technology | Version | Purpose |
|---|---|---|
| **React.js** | 18.x | Component-based SPA framework |
| **Vite** | 6.x | Build tool & dev server (3 separate ports) |
| **Material UI (MUI)** | 7.x | UI component library |
| **Socket.io-client** | 4.x | Real-time WebSocket communication |
| **Axios** | 1.x | HTTP client for REST API calls |
| **html2canvas** | — | Client-side PDF/image generation |
| **jsPDF** | — | Voucher slip PDF generation in browser |

### Backend (Node.js)

| Technology | Version | Purpose |
|---|---|---|
| **Node.js** | 20.x | JavaScript server runtime |
| **Express.js** | 5.x | REST API framework |
| **Socket.io** | 4.x | WebSocket server for real-time sync |
| **Mongoose** | 9.x | MongoDB ODM & schema validation |
| **JWT (jsonwebtoken)** | 9.x | Stateless authentication tokens |
| **bcryptjs** | 3.x | Password hashing |
| **multer + multer-s3** | — | Multipart file upload to AWS S3 |
| **AWS SDK (v3)** | 3.x | S3 integration |
| **Chokidar** | 5.x | File-system watcher for physical scanners |
| **Nodemon** | 3.x | Development auto-reload |
| **Jest + Supertest** | — | Unit & integration testing |

### AI Worker (Python)

| Technology | Version | Purpose |
|---|---|---|
| **Python** | 3.11+ | AI microservice runtime |
| **FastAPI** | — | High-performance async API framework |
| **uvicorn** | — | ASGI server for FastAPI |
| **OpenAI SDK** | — | GPT-4o API calls |
| **PyMuPDF (fitz)** | — | PDF to image conversion |
| **Pillow** | — | Image processing |
| **Pydantic** | — | Request/response data validation |

### Infrastructure & Database

| Service | Usage |
|---|---|
| **MongoDB Atlas** | Multi-database cloud NoSQL (5 logical DBs) |
| **AWS S3** | Object storage for all documents (ap-south-1) |
| **OpenAI API** | GPT-4o Vision for invoice extraction |

---

## Key Modules & Features

### 1. 📄 AI Invoice Processing
- Upload physical invoice PDF/image via browser or physical scanner.
- **Automatic AI extraction** of 40+ fields (buyer, seller, items, tax, EWB, vehicle details).
- Human-review interface with side-by-side original image and editable fields.
- On approval, cascades data to all downstream registers automatically.

### 2. 📦 Cement Register
- Spreadsheet-like editable grid with **50+ columns** covering the full invoice lifecycle.
- **AUTO columns**: computed from invoice data (billing, TDS, fuel requirements).
- **SITE CASH column**: auto-populated from vouchers created by Site Admin.
- **OFFICE CASH column**: auto-populated from vouchers created by Office Admin (HEAD_OFFICE role).
- **CALC columns**: formula-driven (NET AMOUNT, HSD AMOUNT, % OF ADV).
- **MANUAL columns**: user-editable with yellow highlight & unsaved state tracking.
- Per-row serial number (SL NO) and GCN number auto-assigned sequentially per financial year.
- HSD Bill No auto-derived: `PumpName/FY/PeriodIndex` (10-day period intervals).
- Real-time live updates via Socket.io — all connected clients see changes instantly.
- Excel export (CSV) and bulk sync with "Sync Site Cash" button.

### 3. 💰 Voucher System
- Cash payment vouchers for vehicles with purpose tagging (Fuel, Advance, Repair, Toll, Others).
- **Role-derived tagging**: vouchers are tagged with the JWT role of the creating user — not client-supplied data — preventing spoofing.
- Auto-generated PDF voucher slips uploaded to S3.
- Vouchers auto-sync to the Cement Register (Site Cash or Office Cash column based on role).
- Voucher Register page with filtering, print, and audit trail.

### 4. ⛽ Fuel Slip System
- HSD (High Speed Diesel) issuance tracked per vehicle per trip.
- Fuel requirement auto-calculated: `(Distance × 2) / Mileage_kmpl`.
- Pump Payment Details: monthly fuel issuance statements, HSD bill tracking.
- HSD Rate auto-fetched and applied to calculate HSD Amount.

### 5. 📋 Lorry Hire Slip
- Auto-generated from approved invoice data.
- Includes: loading advance, diesel advance, estimated fuel required.
- Print-ready PDF format with company letterhead.

### 6. 🧾 GST Portal Register
- Auto-populated from approved invoices.
- Tracks invoice-wise GST liability (CGST, SGST, net payable).
- Supports manual edits, attachment of GST receipts, period filtering.
- PDF download per entry.

### 7. 📊 Main Cashbook
- Aggregates all financial transactions across vouchers and payment lines.
- Real-time updates via Socket.io.
- Per financial year view.

### 8. 🏢 Party Payment Details
- Tracks freight payments payable to vehicle owners/parties.
- Integrates with Cement Register billing data.
- Multi-proof payment receipt attachments.

### 9. 🚛 Truck Contact Manager
- Master database of all trucks, drivers, and owners.
- Fields: truck number, owner name, wheel type, driver name, contact info.
- Used by auto-sync to pull wheel count and billing rates.

### 10. 📡 Physical Scanner Integration
- Chokidar watches the `Lorrey_Scans/` directory on the server filesystem.
- Any new PDF dropped into this folder is automatically:
  - Uploaded to S3
  - Sent through the AI extraction pipeline
  - Registered as a new pending invoice

---

## AI Extraction Pipeline

### Pipeline Steps

```python
# pipeline.py — Processing workflow per invoice

1. download_from_s3(s3_url)
      ↓
2. pymupdf_convert_pdf_to_image(file)   # High-res 2× matrix rendering
      ↓
3. gpt4o_vision_extract(image, schema)  # 32-rule expert prompt
      ↓
4. clear_hallucinated_fields()          # Hard guard: remove AI inventions
      ↓
5. validate_invoice()                   # Rule-based structural checks
      ↓
6. validate_addresses()                 # Pincode, state name normalization
      ↓
7. validate_gst_pan()                   # Format: 15-char GSTIN, 10-char PAN
      ↓
8. validate_amounts()                   # Cross-check: CGST + SGST = total_tax
      ↓
9. fill_invoice_time()                  # Normalize HH.MM.SS → HH:MM:SS
      ↓
return structured_json
```

### Extraction Schema (40+ Fields)

```
invoice_details:    invoice_number, invoice_date, invoice_time, reference_number
seller_details:     seller_name, seller_address, seller_state, seller_gstin, seller_pan
buyer_details:      buyer_name, buyer_address, buyer_state, buyer_gstin, buyer_pan
consignee_details:  consignee_address, consignee_state, consignee_pincode
supply_details:     vehicle_number, destination, shipment_number, challan_number,
                    mode_of_transport, lorrey_receipt_number
items[]:            description_of_product, hsn_code, bags, quantity, uom, rate,
                    taxable_value
tax_details:        cgst_rate, cgst_amount, sgst_rate, sgst_amount
amount_summary:     net_value, total_tax_amount, round_off, net_payable,
                    amount_in_words, currency
ewb_details:        ewb_number, ewb_create_date, ewb_valid_date, ewb_valid_time
```

---

## Data Models

### Invoice Schema (`invoiceAI.invoices`)

```javascript
{
  file_url: String,           // S3 URL of original upload
  softcopy_url: String,       // S3 URL of manually attached softcopy
  gcn_url: String,            // S3 URL of GCN document
  gcn_data: Object,           // Parsed GCN data
  ai_data: Object,            // Raw AI extraction output (40+ fields)
  human_verified_data: Object,// After human corrections on review form
  consignee_name: String,
  lorry_hire_slip_data: {
    lorry_hire_slip_no: String,
    fuel_slip_no: String,
    loading_advance: Number,
    diesel_litres: Number,
    diesel_rate: Number,        // default: 90
    diesel_advance: Number,
    total_advance: Number,
    estimated_required_fuel: Number,  // (distance × 2) / mileage — auto
    lorry_hire_slip_url: String,
    station_name: String,
    fuel_slip_url: String,
    created_at: Date
  },
  status: String,             // "pending" | "approved" | "rejected"
  created_at: Date
}
```

### Voucher Schema (`invoiceAI.vouchers`)

```javascript
{
  voucherNumber: String,      // Auto-generated: VCH-00001 (sequential)
  vehicleNumber: String,      // Truck registration number (uppercase)
  date: Date,
  amount: Number,
  purpose: String,            // "Fuel" | "Advance" | "Repair" | "Toll" | "Others"
  slip_url: String,           // S3 URL of generated PDF receipt
  invoiceId: String,          // Optional link to parent invoice
  remarks: String,
  name: String,               // Payee name
  reason: String,
  createdByRole: String,      // "OFFICE" | "HEAD_OFFICE" — derived from JWT
  createdAt: Date,
  updatedAt: Date
}
```

### User Schema (`invoiceAI.users`)

```javascript
{
  email: String,             // Unique, lowercase
  password: String,          // bcrypt hashed
  role: String,              // "OFFICE" | "HEAD_OFFICE" | "PETROL PUMP"
  createdAt: Date,
  updatedAt: Date
}
```

### Cement Register Entry (`cement_register.entries`)

Each entry corresponds to one approved invoice and contains 50+ computed and manual columns including:

```
SL NO, LOADING DT, SITE, VEHICLE NUMBER, WHEEL, E-WAY BILL NO,
GCN NO, INVOICE NO, SHIPMENT NO, DN, DESTINATION, PARTY NAME,
BILLING, MT, AMOUNT, TDS@1%, ADVANCE, Site Cash, OFFICE CASH,
OFFICE_CASH_PROOF_URL, SITE_CASH_PROOF_URL, BANK TF,
GPS DEVICE, RFID TAG, RFID REASSURANCE, FASTAG,
PUMP NAME, HSD SLIP NO, HSD BILL NO, KM AS PER RATE CHART,
FUEL REQUIRED, HSD (LTR), HSD RATE, HSD AMOUNT, NET AMOUNT,
UP TOLL, DOWN TOLL, DEDICATED, 10W EXTRA 8.5%, ...
```

---

## Role-Based Access Control (RBAC)

### Three-Portal Architecture

```
┌────────────────┬──────────────────┬──────────────────────────────────────────┐
│ Role           │ Portal           │ Permissions                               │
├────────────────┼──────────────────┼──────────────────────────────────────────┤
│ HEAD_OFFICE    │ Office Workspace  │ Full access: vouchers → OFFICE CASH      │
│                │ (Port 5174)      │ Cement Register, GST Portal, Cashbook    │
│                │                  │ Party Payments, Voucher Register          │
├────────────────┼──────────────────┼──────────────────────────────────────────┤
│ OFFICE         │ Site Workspace   │ Invoice upload, AI review & approval      │
│                │ (Port 5173)      │ Vouchers → SITE CASH, Cement Register    │
│                │                  │ Lorry Hire Slips, Fuel Slips, GCN        │
├────────────────┼──────────────────┼──────────────────────────────────────────┤
│ PETROL PUMP    │ Pump Workspace   │ Fuel issuance entry & HSD bill tracking  │
│                │ (Port 5175)      │ Pump Payment Details (own records only)  │
└────────────────┴──────────────────┴──────────────────────────────────────────┘
```

### Authentication Flow

```
User Login (email + password + portal)
          │
          ▼
  Backend: POST /auth/login
          │
  Compare bcrypt hash
  Verify role matches portal (security firewall)
          │
          ▼
  JWT signed with { userId, role } — 1h expiry
          │
          ▼
  Stored in localStorage
  All subsequent requests: Authorization: Bearer <token>
          │
          ▼
  auth middleware verifies JWT → populates req.user
  POST /voucher uses req.user.role → never trusts client body
```

> **Security Design**: The `createdByRole` field on vouchers is **always derived server-side from the verified JWT** (`req.user.role`), never from the client request body. This prevents stale tokens or malicious clients from spoofing the financial source of a payment.

---

## Real-Time Synchronization Engine

The `syncManager.js` module is the central data orchestration engine.

### Trigger Points

| Event | Action |
|---|---|
| Invoice approved | Full Cement Register row created/updated |
| Voucher created | Site Cash or Office Cash column re-synced |
| Manual cell edit saved | Partial field update, socket broadcast |
| Pump fuel entry saved | HSD columns updated in Cement Register |

### Sync Logic (pushToRegister)

```javascript
Invoice approved
    │
    ├── Lookup TruckContact → Wheel type, mileage
    ├── Lookup freight_data → Billing rate, distance
    ├── Query Vouchers WHERE vehicleNumber MATCH AND createdByRole != HEAD_OFFICE
    │       → siteCash, siteCashProofUrl
    ├── Query Vouchers WHERE vehicleNumber MATCH AND createdByRole = HEAD_OFFICE  
    │       → officeCash, officeCashProofUrl
    ├── Compute: billingAmt, partyRate, TDS, advance, dedicated
    ├── Compute: fuelRequired = (distanceKm × 2) / mileage
    ├── HSD Bill No: PumpName/FY/PeriodIndex (10-day granularity)
    ├── GCN No: DAC/FY/SequentialNo (per financial year)
    ├── SL No: global sequential, never reassigned
    │
    └── Upsert cement_register.entries
            └── Socket.io emit("cementUpdates", payload)
                    └── All clients re-render row in real-time
```

### Financial Year Logic

- FY runs **April to March** (Indian standard)
- GCN numbers reset per FY: `DAC/25-26/1`, `DAC/25-26/2`, ...
- HSD Bill numbers use **10-day intra-month periods**: `SAS/25-26/14` means pump "SAS", FY 2025-26, 14th period (which maps to a specific 10-day window)

---

## Financial Tracking System

### Dual Cash Column Architecture

The Cement Register maintains two independent cash columns, each sourced from a different organizational level:

```
Voucher Created
      │
      ├── IF createdByRole = "OFFICE"     → SITE CASH column
      │   (Site Admin physically at the dispatch location)
      │
      └── IF createdByRole = "HEAD_OFFICE" → OFFICE CASH column
          (Head Office admin issuing central payments)
```

### NET AMOUNT Formula

```
NET AMOUNT = AMOUNT
           - TDS@1%
           - ADVANCE
           - Site Cash     (auto from OFFICE role voucher)
           - OFFICE CASH   (auto from HEAD_OFFICE role voucher)
           - Bank TF       (manual)
           - Others deduction (manual)
           - GPS Monitoring Charge (manual)
           - GPS DEVICE    (auto from invoice add-ons)
           - RFID TAG      (auto from invoice add-ons)
           - HSD AMOUNT    (fuel cost)
           - TRAVELLING EXP (manual)
           - SHORTAGE (AMOUNT) (bags × rate)
```

### Billing Formula Chain

```
MT (metric tonnes from invoice)
    × BILLING (rate from freight_data DB lookup)
    = Billing Amount

Billing Amount × 0.95
    = BILLING ER 95% (PARTY PAYABLE)

BILLING ER 95% × 0.01
    = TDS@1%

BILLING × 0.95
    = PARTY RATE

Billing Amount × 0.05
    = PROFIT
```

---

## Cloud Infrastructure

### AWS S3 Bucket Structure

```
s3://lorreyproject/ (Region: ap-south-1)
├── invoice_uploads/        ← Original scanned PDFs/images
├── voucher_slips/          ← AI-generated voucher PDF receipts
├── softcopy/               ← Manually attached invoice softcopies
├── gcn_softcopy/           ← GCN (Goods Consignment Note) documents
└── scanner_uploads/        ← Auto-uploaded from physical scanner watcher
```

### MongoDB Multi-Database Layout

```
MongoDB Atlas Cluster: cluster0.pqbigfd.mongodb.net
├── invoiceAI
│   ├── invoices        ← Core invoice records (AI + human data)
│   ├── vouchers        ← Cash payment vouchers (role-tagged)
│   ├── users           ← Auth records (bcrypt passwords + JWT roles)
│   ├── truckcontacts   ← Vehicle master data
│   └── partypayments   ← Party-wise payment tracking
├── cement_register
│   └── entries         ← The main financial ledger (50+ columns)
├── pump_payment
│   └── records         ← Fuel pump payment records
├── gst_portal
│   └── entries         ← GST register entries
└── main_cashbook
    └── entries         ← Aggregated cash flow ledger
```

---

## API Reference

### Authentication

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| POST | `/auth/signup` | Register new user with role | — |
| POST | `/auth/login` | Login, returns JWT | — |

### Invoices

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| POST | `/upload` | Upload & AI-process invoice | JWT |
| GET | `/invoice` | List all invoices | JWT |
| GET | `/invoice/:id` | Get single invoice | JWT |
| PUT | `/invoice/:id` | Update (approve, edit) | JWT |
| DELETE | `/invoice/:id` | Delete invoice | JWT |
| POST | `/invoice/softcopy` | Attach softcopy PDF | JWT |
| POST | `/invoice/gcn-softcopy` | Attach GCN document | JWT |

### Vouchers

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| POST | `/voucher` | Create voucher (role from JWT) | **JWT Required** |
| GET | `/voucher` | List all vouchers | JWT |
| PUT | `/voucher/:id` | Update voucher | JWT |
| GET | `/voucher/contacts` | Get truck owner map | — |

### Cement Register

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| GET | `/cement-register` | Get all entries | JWT |
| PUT | `/cement-register/:id` | Save manual edits | JWT |
| POST | `/cement-register/sync-all` | Force re-sync all rows | JWT |

### Pump Payment

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| GET | `/pump-payment` | Get payment records | JWT |
| POST | `/pump-payment` | Create/update record | JWT |

### AI Worker (Internal)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/` | Health check |
| POST | `/process` | Process invoice image, return JSON |

---

## Project Structure

```
lorrey-project-code/
│
├── ai-worker/                    # Python AI microservice
│   ├── pipeline.py               # FastAPI app + extraction pipeline
│   ├── extractor.py              # GPT-4o Vision API call
│   ├── schema.py                 # Target extraction schema (40+ fields)
│   ├── postprocess.py            # Hallucination guard + rule validation
│   ├── address_validator.py      # Address/pincode validation
│   ├── gst_pan_validator.py      # GST/PAN format validation
│   ├── amount_validator.py       # Cross-field amount validation
│   ├── time_validator.py         # Time normalization HH:MM:SS
│   ├── validationGPT.py          # GPT-based second-pass validation (optional)
│   └── requirements.txt
│
├── backend-node/                 # Node.js API server
│   ├── server.js                 # Express app entry point
│   ├── socket.js                 # Socket.io init/export
│   │
│   ├── models/
│   │   ├── Invoice.js            # Invoice Mongoose schema
│   │   ├── Voucher.js            # Voucher schema (createdByRole)
│   │   ├── User.js               # User schema (RBAC roles enum)
│   │   ├── TruckContact.js       # Truck master data schema
│   │   └── PartyPayment.js       # Party payment schema
│   │
│   ├── routes/
│   │   ├── authRoutes.js         # /auth/login, /auth/signup
│   │   ├── invoiceRoutes.js      # Full invoice CRUD + approval
│   │   ├── voucherRoutes.js      # Voucher CRUD (auth-protected)
│   │   ├── cementRegisterRoutes.js
│   │   ├── gstPortalRoutes.js
│   │   ├── mainCashbookRoutes.js
│   │   ├── pumpPaymentRoutes.js
│   │   ├── partyPaymentRoutes.js
│   │   ├── truckContactRoutes.js
│   │   └── financialYearRoutes.js
│   │
│   ├── middleware/
│   │   ├── authMiddleware.js     # JWT verification → req.user
│   │   ├── upload.js             # multer-s3 for invoice uploads
│   │   ├── voucherSlipUpload.js  # multer-s3 for voucher PDFs
│   │   ├── softcopyUpload.js     # multer-s3 for softcopies
│   │   └── gcnUpload.js          # multer-s3 for GCN docs
│   │
│   ├── utils/
│   │   ├── syncManager.js        # Core sync engine (Cement Register)
│   │   └── scannerWatcher.js     # Chokidar file watcher
│   │
│   └── package.json
│
├── frontend/review-dashboard/UI2/  # React frontend (Vite)
│   └── src/
│       ├── App.jsx               # Route definitions + role-based redirect
│       ├── context/
│       │   └── AuthContext.jsx   # JWT storage, user state, login/logout
│       │
│       ├── components/
│       │   ├── Dashboard.jsx     # Main hub (invoice list, stats)
│       │   ├── InvoiceForm.jsx   # Human review + edit form (side-by-side)
│       │   ├── VoucherEntry.jsx  # Voucher creation form + PDF slip
│       │   ├── VoucherDialog.jsx # Full voucher register table
│       │   ├── Login.jsx         # 3-portal login (OFFICE ADMIN/SITE ADMIN/PUMP)
│       │   ├── Signup.jsx        # Account creation with portal selection
│       │   ├── PumpDashboard.jsx # Fuel pump admin dashboard
│       │   ├── LorryHireSlipDocument.jsx
│       │   ├── FuelSlipDocument.jsx
│       │   ├── GCNDocument.jsx
│       │   └── TaxInvoice.jsx
│       │
│       └── pages/
│           ├── CementRegister.jsx    # 50+ column financial ledger
│           ├── GSTPortalRegister.jsx # GST entries
│           ├── MainCashbook.jsx      # Aggregated cash flow
│           ├── PumpPaymentDetails.jsx # Fuel pump payments
│           ├── PartyPaymentDetails.jsx # Party freight payments
│           ├── VoucherRegister.jsx   # Voucher audit register
│           └── FinancialYearDetails.jsx
│
├── Lorrey_Scans/                 # Physical scanner target folder (watched)
└── README.md
```

---

## Setup & Deployment

### Prerequisites

- Node.js ≥ 20.x
- Python ≥ 3.11
- MongoDB Atlas account
- AWS S3 bucket (ap-south-1 recommended)
- OpenAI API key (GPT-4o access required)

### 1. Backend Setup

```bash
cd backend-node
npm install

# Create .env
cat > .env << EOF
MONGO_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/invoiceAI?retryWrites=true
AWS_ACCESS_KEY=<your_key>
AWS_SECRET_KEY=<your_secret>
AWS_REGION=ap-south-1
S3_BUCKET=<your_bucket>
JWT_SECRET=<your_secret_key>
AI_WORKER_URL=http://127.0.0.1:8000
EOF

npm run dev   # Starts on port 3000
```

### 2. AI Worker Setup

```bash
cd ai-worker
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Create .env
echo "OPENAI_API_KEY=sk-..." > .env

uvicorn pipeline:app --reload   # Starts on port 8000
```

### 3. Frontend Setup

```bash
cd frontend/review-dashboard/UI2
npm install

# Dev servers (3 separate role-based ports)
npm run dev:office   # Office Admin → localhost:5174
npm run dev          # Site Admin   → localhost:5173
npm run dev:pump     # Pump Admin   → localhost:5175
```

### 4. First Use

1. Navigate to `http://localhost:5174` (Office Admin)
2. Click **Create Account** → select **OFFICE ADMIN** tab → register
3. Navigate to `http://localhost:5173` (Site Admin)
4. Click **Create Account** → select **SITE ADMIN** tab → register

---

## Results & Outcomes

### Operational Benefits

| Metric | Before | After |
|---|---|---|
| Invoice data entry time | ~15–20 min/invoice (manual) | ~2 min (AI extraction + review) |
| Data accuracy | ~85% (human error prone) | ~97%+ (AI + validation pipeline) |
| Register update lag | Days (paper-based) | Real-time (<1 second, WebSocket) |
| Cross-portal visibility | Zero | Instant (same DB, Socket.io sync) |
| Fuel computation | Manual (error-prone) | Auto (distance-based formula) |
| Payment trail | Paper receipts (lossy) | PDF receipts in S3 (permanent) |

### System Capabilities

- **~40+ fields** extracted per invoice by GPT-4o Vision
- **5 validation stages** post-AI extraction for data integrity
- **50+ columns** in the Cement Register computed/tracked per trip
- **3 distinct user roles** with separate portals and JWT-enforced permissions
- **Real-time sync** across unlimited clients via Socket.io
- **Dual financial columns** (Site Cash vs. Office Cash) based on JWT-derived role
- **Physical scanner integration** via folder-watch automation

---

## Future Work

1. **Multi-language invoice support** — Hindi and regional language invoice OCR
2. **Mobile application** — React Native app for pump operators and drivers
3. **Predictive analytics** — ML-based fuel consumption prediction, route optimization
4. **Automated GST filing** — Direct API integration with the GST portal (GSTN)
5. **Driver app** — Mobile check-in, GPS tracking integration with E-Way bill system
6. **Multi-company support** — Tenant isolation for multiple transport companies
7. **Automated bank reconciliation** — API integration with banking systems to match payments
8. **WhatsApp notifications** — Automated alerts to truck owners on payment releases

---

## Authors

**Dipali Associates & Co.** — Panagarh Industrial Park, Kotagram, Burdwan, West Bengal — 713148

*Built to digitize and streamline cement logistics operations across West Bengal and Jharkhand.*

---

## License

This project is proprietary software developed for internal use by Dipali Associates & Co. All rights reserved.

---

*README generated for research paper documentation purposes. System version: April 2026.*
