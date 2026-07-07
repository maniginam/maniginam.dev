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
5. A **comparator** shows each AI-read value side-by-side with the value as
   printed in the source report, mismatches flagged, with the rendered PDFs in
   view — so he verifies before anything is pushed.
6. He clicks **Submit** to finalize, then **Export CSV** or **Generate Excel**.
7. He downloads a formatted budget workbook resembling a WBR budget book.

## Architecture

Rides the existing Cloudflare Pages + Pages Functions site. No new auth, no new
KV, no new deployed dependencies.

### Units

| Unit | File(s) | Responsibility | Depends on |
|------|---------|----------------|------------|
| `docgen` | `tools/wbr-fintech-docgen.mjs` (dev-only, gitignored `tools/`) | Generate 3 mock financial PDFs into `samples/`. Run once, PDFs committed. | pdfkit (dev) |
| `extractor` | `functions/admin/api/wbr-extract.js` | POST endpoint. Receives uploaded PDFs, calls Anthropic Messages API with native PDF document blocks, returns structured budget line items as JSON. | `env.MANIGINAM_ANTHROPIC_API_KEY` |
| `web` | `admin/demo/wbr-fintech/{index.html,app.js,styles.css}` | Drag-drop upload UI, calls extractor, renders editable grid + comparator, wires Submit/CSV/Excel. | extractor, workbook, pdfviewer |
| `pdfviewer` | vendored `admin/demo/wbr-fintech/vendor/pdf.min.js` (+ worker) | Render uploaded PDFs in the comparator pane so the director sees the real report. | pdf.js (Mozilla) UMD |
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
- Response JSON. Each numeric field carries both a normalized number (editable in
  the grid) and the string **as printed** in the report plus its provenance, so
  the comparator can show source-vs-AI without re-reading the PDF:
  ```json
  { "lineItems": [
      { "fund": "General Fund",
        "department": "Public Works",
        "account": "001-500-6100",
        "description": "Salaries & Wages",
        "source": { "doc": "Revenue & Expenditure Report", "page": 2,
                    "label": "SALARIES & WAGES" },
        "priorYearActual":  { "value": 412000, "printed": "412,000" },
        "currentBudget":    { "value": 430000, "printed": "430,000" },
        "ytdActual":        { "value": 318500, "printed": "318,500" },
        "nextYearRequest":  { "value": 445000, "printed": "445,000" } } ],
    "sourceDocs": ["Revenue & Expenditure Report", "..."],
    "warnings": [] }
  ```
  `value` is what the grid/exports use; `printed` is the read-only comparator
  value. When the model cannot find a figure, `value` is `null` and `printed` is
  `""` — surfaced as a flag in the comparator.
- The exact model id, PDF document-block format, and required API headers/version
  will be confirmed against the `claude-api` skill before implementation.

### Budget grid columns

Fund · Department · Account · Description · Prior-Yr Actual · Current Budget ·
YTD Actual · Next-Yr Request. All editable. Numeric cells right-aligned,
currency-formatted. A totals row per fund + grand total, recomputed on edit.

### Comparator / verification

The trust step — nothing is pushed until he can confirm the AI read the report
correctly. Two coordinated views:

1. **Source viewer** — uploaded PDFs rendered in a pane via vendored pdf.js, so
   he sees the actual parish report, not a re-typed copy.
2. **Value comparison** — for every line item, each figure shows the AI-read
   value (editable) directly beside the **printed** value from the report
   (`source.printed`, read-only). Rows carry the source doc + printed label so he
   can trace each number back to its report line.

Flags:
- **Mismatch** — if he edits a grid value away from the AI's `value`, that cell is
  highlighted (he overrode the AI).
- **Missing** — `value: null` / `printed: ""` figures are highlighted as
  "not found — enter manually."
- A verification banner tallies items and unresolved flags; **Submit** is enabled
  regardless (he owns the decision) but warns if flags remain.

The comparator is read-vs-read transparency plus the rendered PDF for an
independent human check — it does not silently auto-correct.

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
  (pure functions extracted from `app.js`), asserting they use each figure's
  `.value` (not `.printed`).
- Grid totals: unit-test the totals reducer.
- Comparator: unit-test the flag logic — mismatch when edited value ≠ AI `value`,
  missing when `value` is null — as a pure function over line items.
- Manual: `wrangler pages dev` locally with a real key, drag the 3 samples,
  verify grid fills, edit a cell, export both files, open the `.xlsx`.

## Cost

- Hosting: **$0** — existing CF Pages free tier.
- Runtime: **~$0.01–0.02 per document** extracted (Sonnet 4.6). A 3-doc demo run
  ≈ 3–6¢.
- Requires `MANIGINAM_ANTHROPIC_API_KEY` in `.dev.vars` (local) and as a CF
  secret (deploy).
- Build: ~3–4 hrs Claude time (comparator + pdf.js viewer included). Deploy to
  production is manual.

## Out of scope (YAGNI)

- Persisting submissions / a real budgeting-tool integration.
- Multi-user, roles, or per-director access codes (the single admin gate suffices).
- Recorded-demo mode (explicitly dropped).
- OCR of scanned/image PDFs beyond what Claude natively handles.
