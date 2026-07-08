// WBR Financials Autofill — AI extraction endpoint.
// Protected by functions/admin/_middleware.js (admin session required).
// Reads any West Baton Rouge financial statement (budget, balance sheet,
// income statement, statement of revenues & expenditures, …) and returns it as
// a structure-preserving matrix: the document's own columns (funds/periods) and
// section-grouped rows, each cell carrying both a value and its printed form.

const MODEL = 'claude-haiku-4-5';
const ANTHROPIC_VERSION = '2023-06-01';
const MAX_FILES = 8;
const MAX_TOTAL_BYTES = 25 * 1024 * 1024;

const CELL = {
  type: 'object',
  additionalProperties: false,
  properties: { value: { type: ['number', 'null'] }, printed: { type: 'string' } },
  required: ['value', 'printed'],
};

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    statementType: { type: 'string' },
    columns: { type: 'array', items: { type: 'string' } },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          rows: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                label: { type: 'string' },
                account: { type: 'string' },
                isTotal: { type: 'boolean' },
                cells: { type: 'array', items: CELL },
              },
              required: ['label', 'account', 'isTotal', 'cells'],
            },
          },
        },
        required: ['name', 'rows'],
      },
    },
    warnings: { type: 'array', items: { type: 'string' } },
  },
  required: ['title', 'statementType', 'columns', 'sections', 'warnings'],
};

const INSTRUCTIONS = `You extract financial data for West Baton Rouge Parish. The attached PDF is a West Baton Rouge financial document — a budget, budget recap, balance sheet, statement of net position, statement of revenues & expenditures, income statement, or similar.

PRESERVE THE DOCUMENT'S OWN STRUCTURE. Do not force it into a fixed shape.
- title: the statement title exactly as printed.
- statementType: a short label (e.g. "Budget Recap", "Balance Sheet", "Statement of Revenues & Expenditures", "Income Statement").
- columns: the value-column headers, left to right, exactly as printed (e.g. fund names like "General Fund", "Roads", "Drainage"; OR periods like "Original Budget", "Final Budget", "Actual", "Variance"; OR "Total"). Include a "Total" column if the report has one.
- sections: the report's natural groupings, in order (e.g. "Revenue Sources", "Expenditures"; OR "Assets", "Liabilities", "Deferred Inflows", "Fund Balances"). Each section has rows.
- Each row:
    - label: the row label exactly as printed (e.g. "Ad Valorem Tax", "Cash and cash equivalents").
    - account: the fund number or GL/account code if the row shows one, else "".
    - isTotal: true for subtotal / total lines (e.g. "Total assets", "TOTAL REVENUE").
    - cells: one entry per column in "columns", in the same left-to-right order. For each cell:
        - value: the number with no commas, no $, no parentheses; represent negatives / (parentheses) as a negative number.
        - printed: the cell exactly as printed, including commas, $, and parentheses.
        - For a blank cell use value null and printed "".

Never invent numbers — only report what is on the page. Put anything ambiguous or unreadable in warnings.`;

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'X-Robots-Tag': 'noindex, nofollow' },
  });
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.MANIGINAM_ANTHROPIC_API_KEY) {
    return jsonResponse({ error: 'Extraction is not configured on this server.' }, 500);
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return jsonResponse({ error: 'Expected multipart/form-data with PDF files.' }, 400);
  }

  const files = form.getAll('files').filter((f) => typeof f === 'object' && f.arrayBuffer);
  if (files.length === 0) return jsonResponse({ error: 'No files uploaded.' }, 400);
  if (files.length > MAX_FILES) return jsonResponse({ error: `Too many files (max ${MAX_FILES}).` }, 400);

  const docs = [];
  let totalBytes = 0;
  for (const file of files) {
    const name = file.name || 'document.pdf';
    const isPdf = (file.type === 'application/pdf') || name.toLowerCase().endsWith('.pdf');
    if (!isPdf) return jsonResponse({ error: `"${name}" is not a PDF.` }, 400);
    const buf = new Uint8Array(await file.arrayBuffer());
    totalBytes += buf.length;
    if (totalBytes > MAX_TOTAL_BYTES) return jsonResponse({ error: 'Uploads exceed the 25 MB limit.' }, 400);
    docs.push({ name, data: bytesToBase64(buf) });
  }

  // One request per document, in parallel — each statement keeps its own shape.
  const results = await Promise.all(docs.map((d) => extractDocument(d, env)));

  const documents = [];
  const warnings = [];
  results.forEach((r, i) => {
    if (r.ok) {
      documents.push({ name: docs[i].name, ...r.data });
    } else {
      warnings.push(`${docs[i].name}: ${r.error}`);
    }
  });

  if (documents.length === 0) {
    return jsonResponse({ error: 'Extraction failed — try again.', detail: warnings.join(' | ').slice(0, 500) }, 502);
  }
  return jsonResponse({ documents, warnings }, 200);
}

async function extractDocument(doc, env) {
  const body = {
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: 'disabled' },
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{
      role: 'user',
      content: [
        { type: 'document', title: doc.name, source: { type: 'base64', media_type: 'application/pdf', data: doc.data } },
        { type: 'text', text: INSTRUCTIONS },
      ],
    }],
  };

  let resp;
  try {
    resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.MANIGINAM_ANTHROPIC_API_KEY,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: 'could not reach the extraction service' };
  }
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    return { ok: false, error: `API ${resp.status} ${detail.slice(0, 200)}` };
  }
  const data = await resp.json();
  if (data.stop_reason === 'refusal') return { ok: false, error: 'reader declined this document' };
  const textBlock = (data.content || []).find((b) => b.type === 'text');
  if (!textBlock) return { ok: false, error: 'no data returned' };
  try {
    const parsed = JSON.parse(textBlock.text);
    if (data.stop_reason === 'max_tokens') {
      parsed.warnings = parsed.warnings || [];
      parsed.warnings.push('Document is large; extraction may be truncated. Try a single statement per file.');
    }
    return { ok: true, data: parsed };
  } catch {
    return { ok: false, error: 'could not parse extracted data (document may be too large)' };
  }
}
