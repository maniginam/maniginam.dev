// WBR Financials Autofill — client logic.
// Upload WBR financial statements (budget, balance sheet, income statement) ->
// AI reads each into a structure-preserving matrix (its own funds/columns and
// section-grouped rows) -> editable worksheet with an inline source-vs-AI
// comparator + focus highlighting on the report -> CSV / Excel export.

const state = {
  files: [],       // { name, file, url }
  docs: [],        // { name, file, url, ext: {title,statementType,columns,sections,warnings} }
  activeIdx: 0,    // which document tab is shown
  viewerDoc: null, // file name currently rendered in the source viewer
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
    const li = el('li', null, `<span class="doc-ico">PDF</span><span>${escapeHtml(f.name)}</span>`);
    const rm = el('button', 'rm', '&times;');
    rm.title = 'Remove';
    rm.addEventListener('click', () => { URL.revokeObjectURL(f.url); state.files.splice(i, 1); renderFileList(); });
    li.appendChild(rm);
    ul.appendChild(li);
  });
  $('#extract-btn').disabled = state.files.length === 0;
  if (state.files.length) setMsg('#intake-msg', '', '');
}

// ---- extraction -----------------------------------------------------------

async function runExtraction() {
  const n = state.files.length;
  showOverlay(`Reading ${n} statement${n === 1 ? '' : 's'} with AI…`);
  setMsg('#intake-msg', '', '');
  const form = new FormData();
  state.files.forEach((f) => form.append('files', f.file, f.name));
  try {
    const resp = await fetch('/admin/api/wbr-extract', { method: 'POST', body: form });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(payload.error || 'Extraction failed.');
    if (!payload.documents || payload.documents.length === 0) {
      throw new Error('No financial data was found in these documents.');
    }
    // Pair each returned document with its uploaded file; seed editable values.
    state.docs = payload.documents.map((d) => {
      const f = state.files.find((x) => x.name === d.name) || state.files[0];
      seedValues(d);
      return { name: d.name, file: f.file, url: f.url, ext: d };
    });
    state.activeIdx = 0;
    buildWorkspace(payload.warnings || []);
  } catch (err) {
    setMsg('#intake-msg', err.message, 'error');
  } finally {
    hideOverlay();
  }
}

// Give each cell a current (editable) value alongside the AI value + printed.
function seedValues(ext) {
  (ext.sections || []).forEach((sec) =>
    (sec.rows || []).forEach((row) =>
      (row.cells || []).forEach((c) => { c.cur = c.value; })));
}

// ---- workspace ------------------------------------------------------------

function buildWorkspace(globalWarnings) {
  state.globalWarnings = globalWarnings;
  $('#intake').setAttribute('hidden', '');
  $('#workspace').removeAttribute('hidden');
  buildDocTabs();
  selectDoc(0);
  $('#workspace').scrollIntoView({ behavior: 'smooth' });
}

function buildDocTabs() {
  const tabs = $('#doc-tabs');
  tabs.innerHTML = '';
  state.docs.forEach((d, i) => {
    const label = d.ext.statementType || d.ext.title || shortName(d.name);
    const btn = el('button', i === 0 ? 'active' : null, escapeHtml(label));
    btn.addEventListener('click', () => selectDoc(i));
    tabs.appendChild(btn);
  });
}

function selectDoc(i) {
  state.activeIdx = i;
  [...$('#doc-tabs').children].forEach((b, j) => b.classList.toggle('active', j === i));
  renderGrid();
  refreshBanner();
  showViewerDoc(state.docs[i] && state.docs[i].name);
}

const activeDoc = () => state.docs[state.activeIdx];

// ---- grid (matrix) --------------------------------------------------------

function renderGrid() {
  const doc = activeDoc();
  const ext = doc.ext;
  const cols = ext.columns || [];
  const table = el('table', 'grid');

  const thead = el('thead');
  const hr = el('tr');
  hr.appendChild(el('th', 'sticky-col', 'Line Item'));
  cols.forEach((c) => hr.appendChild(el('th', 'num', escapeHtml(c))));
  thead.appendChild(hr);
  table.appendChild(thead);

  const tbody = el('tbody');
  (ext.sections || []).forEach((sec, si) => {
    const sh = el('tr', 'section-head');
    const shtd = el('td', null, escapeHtml(sec.name));
    shtd.colSpan = cols.length + 1;
    sh.appendChild(shtd);
    tbody.appendChild(sh);
    (sec.rows || []).forEach((row, ri) => tbody.appendChild(rowTr(si, ri, row, cols.length)));
  });
  table.appendChild(tbody);

  const scroll = $('#grid-scroll');
  scroll.innerHTML = '';
  scroll.appendChild(table);
}

function rowTr(si, ri, row, ncols) {
  const tr = el('tr', row.isTotal ? 'total' : null);
  const labelTd = el('td', 'sticky-col row-label');
  labelTd.innerHTML = escapeHtml(row.label) + (row.account ? ` <span class="acct">${escapeHtml(row.account)}</span>` : '');
  tr.appendChild(labelTd);
  for (let c = 0; c < ncols; c++) tr.appendChild(cellTd(si, ri, c, (row.cells || [])[c]));
  return tr;
}

function cellTd(si, ri, ci, cell) {
  const td = el('td', 'num');
  const wrap = el('div', 'cell-money');
  if (!cell) { td.appendChild(wrap); return td; }
  const input = el('input');
  input.type = 'text';
  input.inputMode = 'numeric';
  input.value = fmtCell(cell.cur);           // formatted with commas for reading
  applyFlag(wrap, cell);
  input.addEventListener('focus', () => {
    input.value = cell.cur == null ? '' : String(cell.cur); // raw for editing
    focusHighlight(si, ri, ci);
  });
  input.addEventListener('input', () => {
    cell.cur = parseNum(input.value);
    applyFlag(wrap, cell);
    refreshBanner();
  });
  input.addEventListener('blur', () => { input.value = fmtCell(cell.cur); });
  if (state.submitted) input.disabled = true;
  wrap.appendChild(input);
  td.appendChild(wrap);
  return td;
}

function fmtCell(v) { return v == null ? '' : Number(v).toLocaleString('en-US'); }

function applyFlag(wrap, cell) {
  wrap.classList.remove('missing', 'flagged');
  if (cell.value == null) wrap.classList.add('missing');
  else if (cell.cur !== cell.value) wrap.classList.add('flagged');
}

function refreshBanner() {
  const ext = activeDoc().ext;
  let rows = 0, missing = 0, edited = 0;
  (ext.sections || []).forEach((sec) => (sec.rows || []).forEach((row) => {
    rows++;
    (row.cells || []).forEach((c) => {
      if (!c) return;
      if (c.value == null) missing++;
      else if (c.cur !== c.value) edited++;
    });
  }));
  const banner = $('#verify-banner');
  banner.innerHTML = '';
  banner.appendChild(el('span', 'tally',
    `<b>${escapeHtml(ext.title || ext.statementType || 'Statement')}</b> &middot; ${rows} rows &times; ${(ext.columns || []).length} columns`));
  if (edited === 0 && missing === 0) banner.appendChild(el('span', 'chip clean', 'All figures match source'));
  else {
    if (edited) banner.appendChild(el('span', 'chip flag', `${edited} edited`));
    if (missing) banner.appendChild(el('span', 'chip miss', `${missing} blank`));
  }
  (ext.warnings || []).concat(state.globalWarnings || []).forEach((w) =>
    banner.appendChild(el('span', 'chip flag', escapeHtml(w))));
}

// ---- pdf.js source viewer with focus-driven highlighting ------------------

const pdfjs = window.pdfjsLib;
if (pdfjs) pdfjs.GlobalWorkerOptions.workerSrc = './vendor/pdf.worker.min.js';
const renderCache = new Map(); // fileName -> { node, index }

async function showViewerDoc(name) {
  const open = $('#pdf-open');
  const doc = state.docs.find((d) => d.name === name);
  if (doc) { open.href = doc.url; open.removeAttribute('hidden'); }
  else { open.setAttribute('hidden', ''); }
  if (!name || name === state.viewerDoc) return;
  state.viewerDoc = name;
  const viewer = $('#doc-viewer');
  let cache = renderCache.get(name);
  if (!cache) {
    viewer.innerHTML = '<div class="pdf-note">Rendering report…</div>';
    try {
      cache = await renderPdf(doc);
      renderCache.set(name, cache);
    } catch {
      viewer.innerHTML = '<div class="pdf-note">Could not render inline. Use “Open full size”.</div>';
      return;
    }
    if (state.viewerDoc !== name) return;
  }
  viewer.innerHTML = '';
  viewer.appendChild(cache.node);
}

async function renderPdf(doc) {
  const buf = await doc.file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const node = el('div', 'pdf-doc');
  const index = [];
  const width = Math.max(($('#doc-viewer').clientWidth || 640) - 24, 520);
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const base = page.getViewport({ scale: 1 });
    const scale = width / base.width;
    const viewport = page.getViewport({ scale });
    const pageDiv = el('div', 'pdf-page');
    pageDiv.style.width = viewport.width + 'px';
    pageDiv.style.height = viewport.height + 'px';
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    const hl = el('div', 'pdf-hl');
    pageDiv.appendChild(canvas);
    pageDiv.appendChild(hl);
    node.appendChild(pageDiv);
    const tc = await page.getTextContent();
    for (const it of tc.items) {
      if (!it.str.trim()) continue;
      const tx = pdfjs.Util.transform(viewport.transform, it.transform);
      const h = Math.hypot(tx[2], tx[3]) || 10;
      index.push({ page: p, pageDiv, hl, str: it.str, x: tx[4], top: tx[5] - h, w: it.width * scale, h });
    }
  }
  return { node, index };
}

const norm = (s) => String(s == null ? '' : s).replace(/[\s,$()]/g, '').toLowerCase();

async function focusHighlight(si, ri, ci) {
  if (!pdfjs) return;
  const doc = activeDoc();
  await showViewerDoc(doc.name);
  const cache = renderCache.get(doc.name);
  if (!cache) return;
  clearHighlights();
  const row = doc.ext.sections[si].rows[ri];
  const cell = (row.cells || [])[ci];
  // locate the row on the page (by account code, else by label)
  const rowKey = (row.account || '').trim() || (row.label || '').trim();
  const rowItem = rowKey
    ? cache.index.find((i) => norm(i.str) === norm(rowKey)) ||
      cache.index.find((i) => norm(i.str).startsWith(norm(rowKey).slice(0, 12)) && norm(rowKey).length > 4)
    : null;
  const targets = [];
  if (rowItem) targets.push({ item: rowItem, cls: 'hl-row' });
  const printed = cell && cell.printed;
  if (printed) {
    const cands = cache.index.filter((i) => norm(i.str) === norm(printed));
    let v = rowItem ? cands.find((i) => Math.abs(i.top - rowItem.top) < rowItem.h * 1.4) : null;
    v = v || cands[0];
    if (v) targets.push({ item: v, cls: 'hl-value' });
  }
  targets.forEach((t) => drawHighlight(t.item, t.cls));
  const focusOn = targets.find((t) => t.cls === 'hl-value') || targets[0];
  if (focusOn) scrollToHighlight(focusOn.item);
}

function drawHighlight(item, cls) {
  const box = el('div', 'hl ' + cls);
  box.style.left = (item.x - 3) + 'px';
  box.style.top = (item.top - 2) + 'px';
  box.style.width = (item.w + 6) + 'px';
  box.style.height = (item.h + 4) + 'px';
  item.hl.appendChild(box);
}
function clearHighlights() { document.querySelectorAll('#doc-viewer .hl').forEach((n) => n.remove()); }
function scrollToHighlight(item) {
  const viewer = $('#doc-viewer');
  const top = item.pageDiv.offsetTop + item.top - viewer.clientHeight / 2;
  viewer.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
}

// ---- actions --------------------------------------------------------------

$('#submit-btn').addEventListener('click', () => {
  if (state.submitted) return;
  state.submitted = true;
  $('#grid-scroll').classList.add('submitted-lock');
  $('#grid-scroll').querySelectorAll('input').forEach((i) => (i.disabled = true));
  const stamp = el('span', 'done-stamp', 'SUBMITTED');
  $('#verify-banner').prepend(stamp);
  setMsg('#workspace-msg', 'Worksheet submitted. Export to CSV or generate the Excel workbook below.', 'ok');
});

$('#csv-btn').addEventListener('click', exportCsv);
$('#xlsx-btn').addEventListener('click', exportXlsx);

// Flatten one document's matrix into export rows.
function matrixRows(ext) {
  const cols = ext.columns || [];
  const out = [['Section', 'Line Item', 'Account', ...cols]];
  (ext.sections || []).forEach((sec) => {
    (sec.rows || []).forEach((row) => {
      const cells = (row.cells || []).map((c) => (c && c.cur != null ? c.cur : ''));
      out.push([sec.name, row.label, row.account || '', ...cells]);
    });
  });
  return { cols, out };
}

function exportCsv() {
  const ext = activeDoc().ext;
  const { out } = matrixRows(ext);
  const lines = out.map((r) => r.map((v, i) => csvCell(i < 3 ? csvSafeText(v) : v)).join(','));
  downloadBlob(new Blob([lines.join('\r\n')], { type: 'text/csv' }), fileBase(ext) + '.csv');
  setMsg('#workspace-msg', 'CSV exported.', 'ok');
}

async function exportXlsx() {
  if (!window.ExcelJS) { setMsg('#workspace-msg', 'Workbook library still loading — try again.', 'error'); return; }
  const wb = new ExcelJS.Workbook();
  wb.creator = 'WBR Financials Autofill';
  state.docs.forEach((d, i) => {
    const ext = d.ext;
    const cols = ext.columns || [];
    const ws = wb.addWorksheet((ext.statementType || `Statement ${i + 1}`).slice(0, 28).replace(/[\\/*?:[\]]/g, ' '));
    ws.mergeCells(1, 1, 1, cols.length + 2);
    ws.getCell(1, 1).value = 'WEST BATON ROUGE PARISH COUNCIL';
    ws.getCell(1, 1).font = { bold: true, size: 13, color: { argb: 'FF13293D' } };
    ws.mergeCells(2, 1, 2, cols.length + 2);
    ws.getCell(2, 1).value = ext.title || ext.statementType || '';
    ws.getCell(2, 1).font = { italic: true, color: { argb: 'FF6A7783' } };

    const header = ['Line Item', 'Account', ...cols];
    const hr = ws.getRow(4);
    header.forEach((h, c) => {
      const cell = hr.getCell(c + 1);
      cell.value = h;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF13293D' } };
      cell.alignment = { horizontal: c >= 2 ? 'right' : 'left' };
    });
    ws.getColumn(1).width = 34; ws.getColumn(2).width = 12;
    cols.forEach((_, c) => (ws.getColumn(c + 3).width = 15));

    let r = 5;
    const money = '#,##0;(#,##0)';
    (ext.sections || []).forEach((sec) => {
      const band = ws.getRow(r);
      band.getCell(1).value = sec.name;
      for (let c = 1; c <= cols.length + 2; c++) {
        band.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0ECE1' } };
        band.getCell(c).font = { bold: true, color: { argb: 'FF13293D' } };
      }
      r++;
      (sec.rows || []).forEach((row) => {
        const rr = ws.getRow(r);
        rr.getCell(1).value = row.label;
        rr.getCell(2).value = row.account || '';
        (row.cells || []).forEach((cl, c) => {
          const cell = rr.getCell(c + 3);
          cell.value = cl && cl.cur != null ? cl.cur : null;
          cell.numFmt = money;
        });
        if (row.isTotal) {
          for (let c = 1; c <= cols.length + 2; c++) {
            rr.getCell(c).font = { bold: true };
            rr.getCell(c).border = { top: { style: 'thin', color: { argb: 'FFB9873B' } } };
          }
        }
        r++;
      });
      r++;
    });
  });
  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    'wbr-financials.xlsx');
  setMsg('#workspace-msg', 'Excel workbook generated.', 'ok');
}

// ---- helpers --------------------------------------------------------------

function fileBase(ext) {
  return (ext.statementType || ext.title || 'wbr-statement').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
function parseNum(s) {
  if (s == null) return null;
  const cleaned = String(s).replace(/[,$\s]/g, '').replace(/^\((.*)\)$/, '-$1');
  if (cleaned === '' || cleaned === '-') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
function csvCell(v) {
  const s = String(v == null ? '' : v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function csvSafeText(v) {
  const s = String(v == null ? '' : v);
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
