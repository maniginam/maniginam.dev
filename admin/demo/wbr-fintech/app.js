// WBR Budget Autofill — client logic.
// Upload/drag PDFs -> POST to the protected extraction endpoint -> editable
// budget grid with an inline source-vs-AI comparator -> CSV + Excel export.

const FIELDS = [
  { key: 'priorYearActual', label: 'Prior-Yr Actual' },
  { key: 'currentBudget', label: 'Current Budget' },
  { key: 'ytdActual', label: 'YTD Actual' },
  { key: 'nextYearRequest', label: 'Next-Yr Request' },
];
const SAMPLES = [
  '01-revenue-expenditure-report.pdf',
  '02-fund-balance-report.pdf',
  '03-departmental-payroll-summary.pdf',
];

const state = {
  files: [],      // { name, file, url }
  data: null,     // { lineItems, sourceDocs, warnings }
  values: [],     // per-item { field: number|null } — current (possibly edited)
  submitted: false,
};

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};

// ---- intake ---------------------------------------------------------------

const dropzone = $('#dropzone');
const fileInput = $('#file-input');

['dragenter', 'dragover'].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.add('drag'); }));
['dragleave', 'drop'].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.remove('drag'); }));
dropzone.addEventListener('drop', (e) => addFiles(e.dataTransfer.files));
fileInput.addEventListener('change', () => addFiles(fileInput.files));
$('#sample-btn').addEventListener('click', loadSamples);
$('#extract-btn').addEventListener('click', runExtraction);
$('#reset-btn').addEventListener('click', () => location.reload());

function addFiles(fileList) {
  for (const file of fileList) {
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) { setMsg('#intake-msg', `"${file.name}" is not a PDF.`, 'error'); continue; }
    state.files.push({ name: file.name, file, url: URL.createObjectURL(file) });
  }
  renderFileList();
}

function renderFileList() {
  const ul = $('#filelist');
  ul.innerHTML = '';
  state.files.forEach((f, i) => {
    const li = el('li', null,
      `<span class="doc-ico">PDF</span><span>${escapeHtml(f.name)}</span>`);
    const rm = el('button', 'rm', '&times;');
    rm.title = 'Remove';
    rm.addEventListener('click', () => { URL.revokeObjectURL(f.url); state.files.splice(i, 1); renderFileList(); });
    li.appendChild(rm);
    ul.appendChild(li);
  });
  $('#extract-btn').disabled = state.files.length === 0;
  if (state.files.length) setMsg('#intake-msg', '', '');
}

async function loadSamples() {
  setMsg('#intake-msg', 'Loading sample reports…', '');
  try {
    for (const name of SAMPLES) {
      const resp = await fetch(`./samples/${name}`);
      if (!resp.ok) throw new Error(name);
      const blob = await resp.blob();
      const file = new File([blob], name, { type: 'application/pdf' });
      state.files.push({ name, file, url: URL.createObjectURL(file) });
    }
    renderFileList();
    setMsg('#intake-msg', 'Sample reports loaded. Read them with AI when ready.', 'ok');
  } catch {
    setMsg('#intake-msg', 'Could not load sample reports.', 'error');
  }
}

// ---- extraction -----------------------------------------------------------

async function runExtraction() {
  const n = state.files.length;
  showOverlay(`Reading ${n} document${n === 1 ? '' : 's'} with AI…`);
  setMsg('#intake-msg', '', '');
  const form = new FormData();
  state.files.forEach((f) => form.append('files', f.file, f.name));
  try {
    const resp = await fetch('/admin/api/wbr-extract', { method: 'POST', body: form });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(payload.error || 'Extraction failed.');
    if (!payload.lineItems || payload.lineItems.length === 0) {
      throw new Error('No budget line items were found in these documents.');
    }
    state.data = payload;
    state.values = payload.lineItems.map((it) => {
      const v = {};
      FIELDS.forEach(({ key }) => { v[key] = it[key] ? it[key].value : null; });
      return v;
    });
    buildWorkspace();
  } catch (err) {
    setMsg('#intake-msg', err.message, 'error');
  } finally {
    hideOverlay();
  }
}

// ---- workspace ------------------------------------------------------------

function buildWorkspace() {
  $('#intake').setAttribute('hidden', '');
  $('#workspace').removeAttribute('hidden');
  buildDocViewer();
  renderGrid();
  refreshBanner();
  $('#workspace').scrollIntoView({ behavior: 'smooth' });
}

function buildDocViewer() {
  const tabs = $('#doc-tabs');
  const viewer = $('#doc-viewer');
  tabs.innerHTML = '';
  viewer.innerHTML = '';
  state.files.forEach((f, i) => {
    const btn = el('button', i === 0 ? 'active' : null, escapeHtml(shortName(f.name)));
    btn.addEventListener('click', () => showDoc(i));
    tabs.appendChild(btn);
  });
  showDoc(0);
}

function showDoc(i) {
  [...$('#doc-tabs').children].forEach((b, j) => b.classList.toggle('active', j === i));
  const f = state.files[i];
  $('#doc-viewer').innerHTML = f
    ? `<embed src="${f.url}#toolbar=1&view=FitH" type="application/pdf">`
    : '<p style="color:#ccc;padding:1rem">No source document.</p>';
}

// Group items by fund, preserving first-seen order.
function groupByFund() {
  const groups = new Map();
  state.data.lineItems.forEach((it, idx) => {
    const fund = it.fund || 'Unassigned';
    if (!groups.has(fund)) groups.set(fund, []);
    groups.get(fund).push(idx);
  });
  return groups;
}

function renderGrid() {
  const table = el('table', 'grid');
  const thead = el('thead');
  const hr = el('tr');
  hr.appendChild(el('th', null, 'Department'));
  hr.appendChild(el('th', null, 'Account'));
  hr.appendChild(el('th', null, 'Description'));
  FIELDS.forEach((f) => hr.appendChild(el('th', 'num', f.label)));
  thead.appendChild(hr);
  table.appendChild(thead);

  const tbody = el('tbody');
  const groups = groupByFund();
  for (const [fund, idxs] of groups) {
    const fh = el('tr', 'fund-head');
    const fhtd = el('td', null, escapeHtml(fund));
    fhtd.colSpan = 3 + FIELDS.length;
    fh.appendChild(fhtd);
    tbody.appendChild(fh);

    idxs.forEach((idx) => tbody.appendChild(itemRow(idx)));

    const sub = el('tr', 'total');
    sub.dataset.fund = fund;
    const std = el('td', null, `Subtotal — ${escapeHtml(fund)}`);
    std.colSpan = 3;
    sub.appendChild(std);
    FIELDS.forEach((f) => sub.appendChild(el('td', 'num sub-' + f.key, '')));
    tbody.appendChild(sub);
  }

  const grand = el('tr', 'grand');
  const gtd = el('td', null, 'GRAND TOTAL — All Funds');
  gtd.colSpan = 3;
  grand.appendChild(gtd);
  FIELDS.forEach((f) => grand.appendChild(el('td', 'num grand-' + f.key, '')));
  tbody.appendChild(grand);

  table.appendChild(tbody);
  const scroll = $('#grid-scroll');
  scroll.innerHTML = '';
  scroll.appendChild(table);
  refreshTotals();
}

function itemRow(idx) {
  const it = state.data.lineItems[idx];
  const tr = el('tr');
  tr.appendChild(textCell(idx, 'department', it.department));
  tr.appendChild(textCell(idx, 'account', it.account));
  tr.appendChild(textCell(idx, 'description', it.description));
  FIELDS.forEach(({ key }) => tr.appendChild(moneyCell(idx, key)));
  return tr;
}

function textCell(idx, field, val) {
  const td = el('td', 'cell-text');
  const input = el('input');
  input.value = val || '';
  input.addEventListener('input', () => { state.data.lineItems[idx][field] = input.value; });
  td.appendChild(input);
  return td;
}

function moneyCell(idx, key) {
  const fig = state.data.lineItems[idx][key] || { value: null, printed: '' };
  const td = el('td', 'num');
  const wrap = el('div', 'cell-money');
  const input = el('input');
  input.type = 'text';
  input.inputMode = 'numeric';
  input.dataset.idx = idx;
  input.dataset.key = key;
  input.value = fig.value == null ? '' : String(fig.value);
  const src = el('div', 'src', fig.printed ? `src: ${escapeHtml(fig.printed)}` : 'not found');
  wrap.appendChild(input);
  wrap.appendChild(src);
  applyFlag(wrap, idx, key);
  input.addEventListener('input', () => {
    state.values[idx][key] = parseNum(input.value);
    applyFlag(wrap, idx, key);
    refreshTotals();
    refreshBanner();
  });
  td.appendChild(wrap);
  return td;
}

// missing = AI found nothing; flagged = user edited away from the AI value.
function applyFlag(wrap, idx, key) {
  const ai = state.data.lineItems[idx][key];
  const aiVal = ai ? ai.value : null;
  const cur = state.values[idx][key];
  wrap.classList.remove('missing', 'flagged');
  if (aiVal == null) wrap.classList.add('missing');
  else if (cur !== aiVal) wrap.classList.add('flagged');
}

function refreshTotals() {
  const groups = groupByFund();
  const grand = {};
  FIELDS.forEach((f) => (grand[f.key] = 0));
  for (const [fund, idxs] of groups) {
    const subRow = $(`tr.total[data-fund="${CSS.escape(fund)}"]`);
    FIELDS.forEach((f) => {
      let sum = 0;
      idxs.forEach((i) => { sum += Number(state.values[i][f.key]) || 0; });
      grand[f.key] += sum;
      if (subRow) subRow.querySelector('.sub-' + f.key).textContent = fmtMoney(sum);
    });
  }
  FIELDS.forEach((f) => {
    const cell = document.querySelector('.grand-' + f.key);
    if (cell) cell.textContent = fmtMoney(grand[f.key]);
  });
}

function refreshBanner() {
  const total = state.data.lineItems.length;
  let missing = 0, overrides = 0;
  state.data.lineItems.forEach((it, idx) => {
    FIELDS.forEach(({ key }) => {
      const ai = it[key] ? it[key].value : null;
      if (ai == null) missing++;
      else if (state.values[idx][key] !== ai) overrides++;
    });
  });
  const banner = $('#verify-banner');
  banner.innerHTML = '';
  banner.appendChild(el('span', 'tally',
    `<b>${total}</b> line items across <b>${groupByFund().size}</b> funds &middot; read from <b>${state.data.sourceDocs.length}</b> report(s)`));
  if (overrides === 0 && missing === 0) {
    banner.appendChild(el('span', 'chip clean', 'All figures match source'));
  } else {
    if (overrides) banner.appendChild(el('span', 'chip flag', `${overrides} edited`));
    if (missing) banner.appendChild(el('span', 'chip miss', `${missing} not found`));
  }
  (state.data.warnings || []).forEach((w) =>
    banner.appendChild(el('span', 'chip flag', escapeHtml(w))));
}

// ---- actions --------------------------------------------------------------

$('#submit-btn').addEventListener('click', () => {
  if (state.submitted) return;
  state.submitted = true;
  $('#grid-scroll').classList.add('submitted-lock');
  $('#grid-scroll').querySelectorAll('input').forEach((i) => (i.disabled = true));
  const banner = $('#verify-banner');
  const stamp = el('span', 'done-stamp', 'SUBMITTED');
  banner.prepend(stamp);
  setMsg('#workspace-msg',
    'Worksheet submitted. Export to CSV or generate the Excel workbook below.', 'ok');
});

$('#csv-btn').addEventListener('click', exportCsv);
$('#xlsx-btn').addEventListener('click', exportXlsx);

function rowsForExport() {
  return state.data.lineItems.map((it, idx) => ({
    fund: it.fund || '',
    department: it.department || '',
    account: it.account || '',
    description: it.description || '',
    priorYearActual: state.values[idx].priorYearActual,
    currentBudget: state.values[idx].currentBudget,
    ytdActual: state.values[idx].ytdActual,
    nextYearRequest: state.values[idx].nextYearRequest,
  }));
}

function exportCsv() {
  const head = ['Fund', 'Department', 'Account', 'Description',
    'Prior Year Actual', 'Current Budget', 'YTD Actual', 'Next Year Request'];
  const lines = [head.map(csvCell).join(',')];
  rowsForExport().forEach((r) => {
    lines.push([
      csvCell(csvSafeText(r.fund)), csvCell(csvSafeText(r.department)),
      csvCell(csvSafeText(r.account)), csvCell(csvSafeText(r.description)),
      csvCell(r.priorYearActual ?? ''), csvCell(r.currentBudget ?? ''),
      csvCell(r.ytdActual ?? ''), csvCell(r.nextYearRequest ?? ''),
    ].join(','));
  });
  downloadBlob(new Blob([lines.join('\r\n')], { type: 'text/csv' }), 'wbr-budget.csv');
  setMsg('#workspace-msg', 'CSV exported.', 'ok');
}

async function exportXlsx() {
  if (!window.ExcelJS) { setMsg('#workspace-msg', 'Workbook library still loading — try again.', 'error'); return; }
  const wb = new ExcelJS.Workbook();
  wb.creator = 'WBR Budget Autofill';
  const ws = wb.addWorksheet('Proposed Budget', {
    views: [{ state: 'frozen', ySplit: 5 }],
  });

  ws.mergeCells('A1:H1');
  ws.getCell('A1').value = 'WEST BATON ROUGE PARISH COUNCIL';
  ws.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF13293D' } };
  ws.getCell('A1').alignment = { horizontal: 'center' };
  ws.mergeCells('A2:H2');
  ws.getCell('A2').value = 'Proposed Budget — Fiscal Year 2026';
  ws.getCell('A2').alignment = { horizontal: 'center' };
  ws.getCell('A2').font = { italic: true, color: { argb: 'FF6A7783' } };

  const header = ['Fund', 'Department', 'Account', 'Description',
    'Prior-Yr Actual', 'Current Budget', 'YTD Actual', 'Next-Yr Request', 'Variance', '% Change'];
  const headerRow = ws.getRow(4);
  header.forEach((h, i) => {
    const c = headerRow.getCell(i + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF13293D' } };
    c.alignment = { horizontal: i >= 4 ? 'right' : 'left' };
  });

  const widths = [18, 22, 16, 30, 16, 16, 14, 16, 14, 12];
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));

  const money = '#,##0;(#,##0)';
  const groups = groupByFund();
  const rows = rowsForExport();
  let r = 5; // first data row (row 5 is frozen boundary too)

  for (const [fund, idxs] of groups) {
    // fund band
    const band = ws.getRow(r);
    band.getCell(1).value = fund;
    band.getCell(1).font = { bold: true, color: { argb: 'FF13293D' } };
    for (let c = 1; c <= 10; c++) {
      band.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0ECE1' } };
    }
    r++;

    const firstDataRow = r;
    idxs.forEach((idx) => {
      const d = rows[idx];
      const row = ws.getRow(r);
      row.getCell(1).value = d.fund;
      row.getCell(2).value = d.department;
      row.getCell(3).value = d.account;
      row.getCell(4).value = d.description;
      row.getCell(5).value = d.priorYearActual;
      row.getCell(6).value = d.currentBudget;
      row.getCell(7).value = d.ytdActual;
      row.getCell(8).value = d.nextYearRequest;
      row.getCell(9).value = { formula: `H${r}-F${r}` };            // Variance
      row.getCell(10).value = { formula: `IF(F${r}=0,"",(H${r}-F${r})/F${r})` }; // % Change
      [5, 6, 7, 8, 9].forEach((c) => (row.getCell(c).numFmt = money));
      row.getCell(10).numFmt = '0.0%';
      r++;
    });
    const lastDataRow = r - 1;

    // fund subtotal
    const sub = ws.getRow(r);
    sub.getCell(4).value = `Subtotal — ${fund}`;
    sub.getCell(4).font = { bold: true };
    [5, 6, 7, 8].forEach((c) => {
      const col = String.fromCharCode(64 + c);
      sub.getCell(c).value = { formula: `SUM(${col}${firstDataRow}:${col}${lastDataRow})` };
      sub.getCell(c).numFmt = money;
      sub.getCell(c).font = { bold: true };
    });
    for (let c = 1; c <= 10; c++) {
      sub.getCell(c).border = { top: { style: 'thin', color: { argb: 'FFB9873B' } } };
      sub.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAF7EF' } };
    }
    r += 2;
  }

  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    'wbr-budget-workbook.xlsx');
  setMsg('#workspace-msg', 'Excel workbook generated.', 'ok');
}

// ---- helpers --------------------------------------------------------------

function parseNum(s) {
  if (s == null) return null;
  const cleaned = String(s).replace(/[,$\s]/g, '').replace(/^\((.*)\)$/, '-$1');
  if (cleaned === '' || cleaned === '-') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
function fmtMoney(n) {
  const v = Math.round(Number(n) || 0);
  const s = Math.abs(v).toLocaleString('en-US');
  return v < 0 ? `(${s})` : s;
}
function csvCell(v) {
  const s = String(v ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
// Neutralize spreadsheet formula injection in text cells opened by Excel/Sheets.
function csvSafeText(v) {
  const s = String(v ?? '');
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}
function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = el('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function setMsg(sel, text, cls) {
  const n = $(sel);
  n.textContent = text;
  n.className = 'msg' + (cls ? ' ' + cls : '');
}
let overlayTimer = null;
function showOverlay(text) {
  const node = $('#overlay-text');
  const start = Date.now();
  node.textContent = text;
  clearInterval(overlayTimer);
  overlayTimer = setInterval(() => {
    node.textContent = `${text} (${Math.floor((Date.now() - start) / 1000)}s)`;
  }, 500);
  $('#overlay').removeAttribute('hidden');
}
function hideOverlay() { clearInterval(overlayTimer); $('#overlay').setAttribute('hidden', ''); }
function shortName(name) { return name.replace(/^\d+-/, '').replace(/\.pdf$/i, '').replace(/-/g, ' '); }
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
