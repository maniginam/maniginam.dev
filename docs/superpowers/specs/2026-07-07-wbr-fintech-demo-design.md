# WBR Budget Autofill — Demo Design

**Date:** 2026-07-07
**Location:** `admin/demo/wbr-fintech/` on maniginam.dev (Cloudflare Pages)
**Audience:** West Baton Rouge Parish Council Financial Director

## Purpose

Show the financial director that his most tedious task — pulling reports out of
CivicPlus and re-keying the numbers into Excel and a budgeting tool during
budget season (late Aug–late Nov) — can be automated. He drops the reports in,
AI reads them, the budget worksheet fills itself, and he exports a CSV and a
formatted WBR-style Excel workbook.

## User story

1. Financial director opens `maniginam.dev/admin/demo/wbr-fintech/` (behind the
   existing admin gate — access code, or Gina logs in in person).
2. He drags in the sample parish financial reports (or clicks to upload).
3. AI extracts every budget line item across all documents.
4. An editable budget grid fills in. He can correct any cell (human-in-the-loop,
   like real budgeting).
5. He clicks **Submit** to finalize, then **Export CSV** or **Generate Excel**.
6. He downloads a formatted budget workbook resembling a WBR budget book.

## Architecture

Rides the existing Cloudflare Pages + Pages Functions site. No new auth, no new
KV, no new deployed dependencies.

### Units

| Unit | File(s) | Responsibility | Depends on |
|------|---------|----------------|------------|
| `docgen` | `tools/wbr-fintech-docgen.mjs` (dev-only, gitignored `tools/`) | Generate 3 mock financial PDFs into `samples/`. Run once, PDFs committed. | pdfkit (dev) |
| `extractor` | `functions/admin/api/wbr-extract.js` | POST endpoint. Receives uploaded PDFs, calls Anthropic Messages API with native PDF document blocks, returns structured budget line items as JSON. | `env.MANIGINAM_ANTHROPIC_API_KEY` |
| `web` | `admin/demo/wbr-fintech/{index.html,app.js,styles.css}` | Drag-drop upload UI, calls extractor, renders editable grid, wires Submit/CSV/Excel. | extractor, workbook |
| `workbook` | vendored `admin/demo/wbr-fintech/vendor/exceljs.min.js` + logic in `app.js` | Build formatted `.xlsx` client-side (fund sections, variance + %-change formulas, totals). | exceljs UMD |
| `samples` | `admin/demo/wbr-fintech/samples/*.pdf` | The 3 mock reports the director drags in. | docgen output |

### Auth / gating

The demo lives under `/admin/`, which the existing `functions/admin/_middleware.js`
already protects with an HMAC session cookie. Reaching the demo requires logging
in at `/admin/login.html` with `ADMIN_TOKEN`. The extraction endpoint
`/admin/api/wbr-extract` is under the same protected tree, so it inherits auth
automatically. No new auth code.

### Extraction contract

`POST /admin/api/wbr-extract`
- Request: `multipart/form-data`, one or more `files` fields (PDF).
- Server converts each PDF to a base64 `document` content block and sends a
  single Anthropic Messages call instructing structured extraction.
- Model: `claude-sonnet-4-6` (fast, accurate, ~10x cheaper than Opus for this).
- Response JSON:
  ```json
  { "lineItems": [
      { "fund": "General Fund",
        "department": "Public Works",
        "account": "001-500-6100",
        "description": "Salaries & Wages",
        "priorYearActual": 412000,
        "currentBudget": 430000,
        "ytdActual": 318500,
        "nextYearRequest": 445000 } ],
    "sourceDocs": ["Revenue & Expenditure Report", "..."],
    "warnings": [] }
  ```
- The exact model id, PDF document-block format, and required API headers/version
  will be confirmed against the `claude-api` skill before implementation.

### Budget grid columns

Fund · Department · Account · Description · Prior-Yr Actual · Current Budget ·
YTD Actual · Next-Yr Request. All editable. Numeric cells right-aligned,
currency-formatted. A totals row per fund + grand total, recomputed on edit.

### Excel workbook

Client-side via exceljs UMD. Sheet resembling a parish budget book:
- Title block (parish name, "Proposed Budget FY", generated date passed in from
  client — Workers/scripts avoid `Date.now()` server-side).
- Grouped rows per fund with a subtotal.
- Columns matching the grid, plus computed **Variance** (`Next-Yr − Current`) and
  **% Change** as real spreadsheet formulas so the director can keep editing.
- Header styling, bold totals, frozen header row, currency number formats.

### CSV export

Flat CSV of the grid rows (header + one row per line item), client-side Blob
download. UTF-8, quoted fields.

### Submit

Finalizes the worksheet: locks visual state to "Submitted", surfaces a
confirmation, keeps exports enabled. No persistence needed for the demo (YAGNI);
Submit exists to complete the story, not to store data.

## Sample documents (mock, generated)

1. **Revenue & Expenditure Report** — CivicPlus-style, GL account codes, current
   budget vs YTD actual across funds/departments.
2. **Fund Balance Report** — fund balances, beginning/ending, transfers.
3. **Departmental Payroll Summary** — salaries/wages/benefits by department.

Styled to look like real parish fund-accounting exports so extraction is
meaningful. Numbers are fabricated.

## Error handling

- No files / non-PDF: 400 with a clear message rendered in the UI.
- Anthropic API error or non-JSON model output: 502, UI shows "Extraction
  failed — try again," grid stays empty and editable (user can hand-enter).
- Partial extraction: `warnings[]` surfaced above the grid; user edits as needed.
- Missing `MANIGINAM_ANTHROPIC_API_KEY`: 500 with an operator-facing message
  (never leaks the key).

## Testing

- `extractor`: unit-test the PDF→content-block mapping and response-shape
  validation with a mocked `fetch` to the Anthropic API (vitest, matching the
  repo's existing vitest setup). No live API calls in tests.
- `workbook`/CSV: unit-test the row→CSV and row→worksheet-model transforms
  (pure functions extracted from `app.js`).
- Grid totals: unit-test the totals reducer.
- Manual: `wrangler pages dev` locally with a real key, drag the 3 samples,
  verify grid fills, edit a cell, export both files, open the `.xlsx`.

## Cost

- Hosting: **$0** — existing CF Pages free tier.
- Runtime: **~$0.01–0.02 per document** extracted (Sonnet 4.6). A 3-doc demo run
  ≈ 3–6¢.
- Requires `MANIGINAM_ANTHROPIC_API_KEY` in `.dev.vars` (local) and as a CF
  secret (deploy).
- Build: ~2–3 hrs Claude time. Deploy to production is manual.

## Out of scope (YAGNI)

- Persisting submissions / a real budgeting-tool integration.
- Multi-user, roles, or per-director access codes (the single admin gate suffices).
- Recorded-demo mode (explicitly dropped).
- OCR of scanned/image PDFs beyond what Claude natively handles.
