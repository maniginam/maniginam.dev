// WBR Budget Autofill — AI extraction endpoint.
// Protected by functions/admin/_middleware.js (admin session required).
// Reads uploaded parish financial PDFs with Claude and returns structured
// budget line items, each figure carrying both a normalized value and the
// value as printed in the source report (for the comparator).

const MODEL = 'claude-haiku-4-5';
const ANTHROPIC_VERSION = '2023-06-01';
const MAX_FILES = 8;
const MAX_TOTAL_BYTES = 25 * 1024 * 1024; // 25 MB across all uploads

const FIGURE = {
  type: 'object',
  additionalProperties: false,
  properties: {
    value: { type: ['number', 'null'] },
    printed: { type: 'string' },
  },
  required: ['value', 'printed'],
};

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    lineItems: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          fund: { type: 'string' },
          department: { type: 'string' },
          account: { type: 'string' },
          description: { type: 'string' },
          source: {
            type: 'object',
            additionalProperties: false,
            properties: {
              doc: { type: 'string' },
              page: { type: ['integer', 'null'] },
              label: { type: 'string' },
            },
            required: ['doc', 'page', 'label'],
          },
          priorYearActual: FIGURE,
          currentBudget: FIGURE,
          ytdActual: FIGURE,
          nextYearRequest: FIGURE,
        },
        required: [
          'fund', 'department', 'account', 'description', 'source',
          'priorYearActual', 'currentBudget', 'ytdActual', 'nextYearRequest',
        ],
      },
    },
    sourceDocs: { type: 'array', items: { type: 'string' } },
    warnings: { type: 'array', items: { type: 'string' } },
  },
  required: ['lineItems', 'sourceDocs', 'warnings'],
};

const INSTRUCTIONS = `You are a municipal finance data-entry assistant for West Baton Rouge Parish.
The attached PDFs are parish fund-accounting reports (revenue & expenditure, fund balance, payroll, etc.).

Extract every budget line item across all documents into the structured schema. For each line item:
- fund: the fund name (e.g. "General Fund", "Road & Bridge Fund").
- department: the department or cost center.
- account: the GL account code as printed (e.g. "001-500-6100"), or "" if none.
- description: the line description (e.g. "Salaries & Wages").
- source: { doc: the report title the row came from, page: page number if determinable else null, label: the row label exactly as printed }.
- For each figure (priorYearActual, currentBudget, ytdActual, nextYearRequest):
    - value: the number with no commas/currency symbols (e.g. 412000), or null if not present in the reports.
    - printed: the figure exactly as printed including commas and any parentheses for negatives (e.g. "412,000" or "(3,500)"), or "" if not present.

Only report figures actually present in the documents — never invent numbers. If a figure is absent for a line, use value null and printed "".
List each distinct source document title in sourceDocs. Put any extraction concerns (unreadable sections, ambiguous totals) in warnings.`;

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'X-Robots-Tag': 'noindex, nofollow',
    },
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
  if (files.length === 0) {
    return jsonResponse({ error: 'No files uploaded.' }, 400);
  }
  if (files.length > MAX_FILES) {
    return jsonResponse({ error: `Too many files (max ${MAX_FILES}).` }, 400);
  }

  const docs = [];
  let totalBytes = 0;
  for (const file of files) {
    const name = file.name || 'document.pdf';
    const isPdf = (file.type === 'application/pdf') || name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      return jsonResponse({ error: `"${name}" is not a PDF. Only PDF reports are supported.` }, 400);
    }
    const buf = new Uint8Array(await file.arrayBuffer());
    totalBytes += buf.length;
    if (totalBytes > MAX_TOTAL_BYTES) {
      return jsonResponse({ error: 'Uploads exceed the 25 MB limit.' }, 400);
    }
    docs.push({ name, data: bytesToBase64(buf) });
  }

  // One request per document, in parallel — wall time is the slowest single
  // document, not the sum. Keeps a live demo snappy even with several reports.
  const results = await Promise.all(docs.map((d) => extractDocument(d, env)));

  const merged = { lineItems: [], sourceDocs: [], warnings: [] };
  let anyOk = false;
  results.forEach((r, i) => {
    if (r.ok) {
      anyOk = true;
      merged.lineItems.push(...(r.data.lineItems || []));
      (r.data.sourceDocs || []).forEach((s) => { if (!merged.sourceDocs.includes(s)) merged.sourceDocs.push(s); });
      merged.warnings.push(...(r.data.warnings || []));
    } else {
      merged.warnings.push(`${docs[i].name}: ${r.error}`);
    }
  });

  if (!anyOk) {
    return jsonResponse({ error: 'Extraction failed — try again.', detail: merged.warnings.join(' | ').slice(0, 500) }, 502);
  }
  return jsonResponse(merged, 200);
}

async function extractDocument(doc, env) {
  const body = {
    model: MODEL,
    max_tokens: 8000,
    // Extraction is transcription, not deep reasoning — skip thinking, low effort.
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
    return { ok: true, data: JSON.parse(textBlock.text) };
  } catch {
    return { ok: false, error: 'could not parse extracted data' };
  }
}
