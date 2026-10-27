# PromptShield — ShadowAI Leak Guard

Enterprise-grade AI-usage monitoring and local sensitive-data DLP protection guardrail running 100% locally in your browser.

---

## 1. Core Architecture & Privacy Invariants

- **100% Local Execution**: All cryptographic operations, database queries, and regex pattern matching occur client-side in the browser via WebAssembly (sql.js) and Web Crypto API.
- **Strict Zero-Leak Invariant**: Prompt payloads, clipboard text, matched secrets, and full redacted texts are **never** persisted to SQLite, IndexedDB, localStorage, reports, timeline, or audit logs. Only high-level metadata (categories, detection counts, rule IDs, severities, and timestamps) is stored.
- **Persistent Storage**: Client-side SQLite database binary is synchronized to IndexedDB upon every write transaction. Foreign keys are strictly enforced (`PRAGMA foreign_keys = ON`), with parameterized queries throughout.
- **Password Protection**: Master credentials hashed using Web Crypto PBKDF2-SHA256 with 16-byte random salts and $\ge 210,000$ iterations.

---

## 2. Role-Based Access Control (RBAC) Matrix

| Feature / Page | Administrator | Analyst | Manager | Auditor | End User |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **System Setup & Database Wipe** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **User & Role Administration** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Security Policy Management** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Data Retention Purge** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Dashboard** | ✅ (Full) | ✅ (Full) | ✅ (Aggregates Only) | ❌ | ❌ |
| **AI Tool Inventory & Telemetry Import** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Local Prompt Scanner** | ✅ | ✅ | ❌ | ❌ | ✅ |
| **Scan Clipboard Safeguard** | ✅ | ✅ | ❌ | ❌ | ✅ |
| **Redaction Comparison & Sanitizer** | ✅ | ✅ | ❌ | ❌ | ✅ |
| **DLP Findings & Detections** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **AI Risk Score Engine** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Active Security Alerts** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Security Incidents & Evidence Timeline** | ✅ | ✅ | ❌ | ✅ (Read-Only) | ❌ |
| **Compliance & Incident Reports** | ✅ | ✅ | ❌ | ✅ (Read-Only) | ❌ |
| **System Audit Logs Ledger** | ✅ | ❌ | ❌ | ✅ (Read-Only) | ❌ |

---

## 3. Supported Telemetry Import Formats

PromptShield operates honestly without requiring a browser extension:
1. **Browser History Import**:
   - **JSON format**: Array of objects with `{ url | domain, visitTime | timestamp }`.
   - **CSV format**: Columns containing URL/domain and timestamp (`url,visit_time`).
   - *Privacy Guarantee*: Domains and visit times are matched locally; full URL paths and query parameters are stripped before storage.
2. **Process Inventory Import**:
   - Standard output of `tasklist /FO CSV`, `tasklist`, or `ps aux`.
   - JSON array of process names: `["cursor.exe", "chatgpt.exe", "claude.exe"]`.
3. **Extension Inventory Import**:
   - Extension manifest JSON list with `{ id, name, permissions }`.
   - *Disclaimer*: Declared permissions reflect capability, not proof of prompt submission.

---

## 4. Default DLP Rules & Redaction Placeholders

- **National ID**: Pakistani CNIC (`#####-#######-#` and 13-digit numbers) &rarr; `ID: XXXXX-XXXXXXX-X`
- **Payment Cards**: 13–19 digit candidate sequences validated through the **Luhn mod 10** algorithm &rarr; `[CARD NUMBER REDACTED]`
- **Email Lists**: Single emails and bulk recipient lists (&ge;3 escalates to High severity) &rarr; `[EMAIL REDACTED]`
- **API Keys & Cryptographic Secrets**: OpenAI `sk-`, Stripe `sk_live_`, AWS `AKIA`, Google `AIza`, GitHub `ghp_`, PEM private keys &rarr; `[API KEY REDACTED]`
- **Password Assignments**: Explicit assignments (`password=`, `secret:`, `api_key=`) with placeholder filtration &rarr; `password=[REDACTED]` (preserving parameter key)
- **Confidentiality Markers**: `CONFIDENTIAL`, `INTERNAL ONLY`, `STRICTLY CONFIDENTIAL` &rarr; `[CONFIDENTIAL CONTENT REMOVED]`

---

## 5. Known Platform Limitations

- **Browser Sandbox Boundary**: Standard web browsers cannot automatically inspect OS-level network packets or background process trees. Telemetry import relies on file uploads (browser history exports, tasklist output).
- **No Background Polling**: The clipboard is only accessed when the user explicitly clicks **"Read & Scan Clipboard Now"**.
- **Cryptographic Report Hash**: All exported PDF and HTML reports generate an immutable SHA-256 digest recorded in the local database to prove authenticity.
