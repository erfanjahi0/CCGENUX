/* ============================================================
   CardForge Pro — app.js
   ============================================================ */

/* ── State & Storage ── */
let savedBins = JSON.parse(localStorage.getItem('cf_bins') || '[]');
let savedCCs  = JSON.parse(localStorage.getItem('cf_ccs')  || '[]');
let generatedCards = [];
let outputFormat = 'pipe';

function persist() {
  localStorage.setItem('cf_bins', JSON.stringify(savedBins));
  localStorage.setItem('cf_ccs',  JSON.stringify(savedCCs));
}

/* ── Custom Select Engine ── */
class CustomSelect {
  constructor(wrapper) {
    this.wrapper  = wrapper;
    this.trigger  = wrapper.querySelector('.custom-select-trigger');
    this.dropdown = wrapper.querySelector('.custom-select-dropdown');
    this.options  = wrapper.querySelectorAll('.custom-select-option');
    this.label    = this.trigger.querySelector('.select-label');
    this._value   = wrapper.dataset.value || this.options[0]?.dataset.value || '';
    this._onChange = null;

    // Set initial display
    const initial = wrapper.querySelector(`[data-value="${this._value}"]`) || this.options[0];
    if (initial) {
      this.label.textContent = initial.querySelector('.option-text')?.textContent || initial.textContent.trim();
      initial.classList.add('selected');
      this._value = initial.dataset.value;
    }

    this.trigger.addEventListener('click', (e) => { e.stopPropagation(); this.toggle(); });

    this.options.forEach(opt => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        this.select(opt.dataset.value, opt.querySelector('.option-text')?.textContent || opt.textContent.trim());
      });
    });

    document.addEventListener('click', () => this.close());
  }

  toggle() {
    if (this.trigger.classList.contains('open')) this.close();
    else this.open();
  }

  open() {
    // Close all others
    document.querySelectorAll('.custom-select-trigger.open').forEach(t => {
      t.classList.remove('open');
      t.closest('.custom-select-wrapper').querySelector('.custom-select-dropdown').classList.remove('open');
    });
    this.trigger.classList.add('open');
    this.dropdown.classList.add('open');
  }

  close() {
    this.trigger.classList.remove('open');
    this.dropdown.classList.remove('open');
  }

  select(value, text) {
    this._value = value;
    this.label.textContent = text;
    this.options.forEach(o => o.classList.toggle('selected', o.dataset.value === value));
    this.close();
    if (this._onChange) this._onChange(value);
  }

  get value() { return this._value; }

  onChange(fn) { this._onChange = fn; return this; }
}

let selMonth, selYear;

/* ── Luhn & Core Logic ── */
function randomDigit() { return Math.floor(Math.random() * 10); }

function isValidLuhn(num) {
  let s = 0, dbl = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let d = parseInt(num[i]);
    if (dbl) { d *= 2; if (d > 9) d -= 9; }
    s += d; dbl = !dbl;
  }
  return s % 10 === 0;
}

function isAmexBin(pattern) {
  const p = pattern.replace(/\s|-/g, '');
  return p.startsWith('3') && (p[1] === '4' || p[1] === '7' || p[1] === 'x' || p[1] === '#' || p.length < 2);
}

function detectNetwork(pattern) {
  const p = pattern.replace(/[^0-9]/g, '').padEnd(6, '0');
  const n = parseInt(p.slice(0, 6));
  if (/^4/.test(p)) return 'VISA';
  if (/^5[1-5]/.test(p) || (n >= 222100 && n <= 272099)) return 'MC';
  if (/^3[47]/.test(p)) return 'AMEX';
  if (/^6011|^64[4-9]|^65/.test(p)) return 'DISC';
  if (/^35(2[89]|[3-8][0-9])/.test(p)) return 'JCB';
  if (/^36/.test(p)) return 'DINN';
  if (/^62/.test(p)) return 'UP';
  return '??';
}

function generatePattern(pattern, isAmex) {
  let clean = pattern.replace(/[\s\-]/g, '');
  const tgt = isAmex ? 15 : 16;
  if (clean.length > tgt) clean = clean.slice(0, tgt);

  for (let attempt = 0; attempt < 1000; attempt++) {
    let cand = '';
    for (const ch of clean) cand += /[xX#]/.test(ch) ? randomDigit() : ch;
    if (cand.length < tgt) {
      while (cand.length < tgt - 1) cand += randomDigit();
      for (let d = 0; d <= 9; d++) {
        const temp = cand + d;
        if (isValidLuhn(temp)) { cand = temp; break; }
      }
    }
    if (cand.length === tgt && isValidLuhn(cand)) return cand;
  }
  return null;
}

function randomNum(len) { return Array.from({ length: len }, () => randomDigit()).join(''); }

function formatCard(cc, mm, yy, cvv) {
  const seps = { pipe: '|', space: ' ', comma: ',', colon: ':', cconly: '' };
  if (outputFormat === 'cconly') return cc;
  const s = seps[outputFormat] || '|';
  return `${cc}${s}${mm}${s}${yy}${s}${cvv}`;
}

/* ── Init Year Options ── */
function buildYearOptions() {
  const base = new Date().getFullYear() % 100;
  const wrapper = document.getElementById('yearSelWrapper');
  const dropdown = wrapper.querySelector('.custom-select-dropdown');
  // "Random" is already in HTML; append years
  for (let y = base; y <= 99; y++) {
    const v = String(y).padStart(2, '0');
    const opt = document.createElement('div');
    opt.className = 'custom-select-option';
    opt.dataset.value = v;
    opt.innerHTML = `<span class="option-check"></span><span class="option-text">${v}</span>`;
    dropdown.appendChild(opt);
  }
}

/* ── Card Preview ── */
function updatePreview() {
  const bin = document.getElementById('binInput').value.trim();
  const mm  = selMonth ? selMonth.value : 'rnd';
  const yy  = selYear  ? selYear.value  : 'rnd';
  const cvv = document.getElementById('cvvInput').value;

  const displayBin = bin.replace(/[xX#]/g, '•').padEnd(16, '•');
  const chunks = displayBin.match(/.{1,4}/g) || ['••••','••••','••••','••••'];
  document.getElementById('bpcNumber').textContent = chunks.join(' ');
  document.getElementById('bpcExpiry').textContent = `${mm === 'rnd' ? 'MM' : mm}/${yy === 'rnd' ? 'YY' : yy}`;
  document.getElementById('bpcCvv').textContent = cvv || '•••';
  const net = bin.length >= 1 ? detectNetwork(bin) : '—';
  document.getElementById('bpcNetwork').textContent = net;
  document.getElementById('bpcType').textContent = net;
}

/* ── Format ── */
function setFormat(btn) {
  document.querySelectorAll('.fmt-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  outputFormat = btn.dataset.fmt;
}

/* ── Generate ── */
function generate() {
  const bin  = document.getElementById('binInput').value.trim();
  const mm   = selMonth ? selMonth.value : 'rnd';
  const yy   = selYear  ? selYear.value  : 'rnd';
  const cvvI = document.getElementById('cvvInput').value.trim();
  const qty  = Math.min(Math.max(parseInt(document.getElementById('qtyInput').value) || 10, 1), 100);

  if (bin.length < 6) {
    showToast('BIN must be at least 6 characters', 'error');
    return;
  }

  const isAmex = isAmexBin(bin);
  const now = new Date();
  const curYY = now.getFullYear() % 100;
  const curMM = now.getMonth() + 1;

  generatedCards = [];

  for (let i = 0; i < qty; i++) {
    const card = generatePattern(bin, isAmex);
    if (!card) continue;

    let genYY, genMM;
    if (yy === 'rnd') {
      genYY = Math.floor(Math.random() * 11) + curYY;
      genMM = (genYY === curYY)
        ? (mm === 'rnd' ? String(Math.floor(Math.random() * (12 - curMM + 1)) + curMM).padStart(2, '0') : mm)
        : (mm === 'rnd' ? String(Math.floor(Math.random() * 12) + 1).padStart(2, '0') : mm);
      genYY = String(genYY).padStart(2, '0');
    } else {
      genYY = yy;
      genMM = mm === 'rnd' ? String(Math.floor(Math.random() * 12) + 1).padStart(2, '0') : mm;
    }

    const cvvLen = isAmex ? 4 : 3;
    const genCVV = cvvI === '' ? randomNum(cvvLen) : cvvI;
    generatedCards.push(formatCard(card, genMM, genYY, genCVV));
  }

  renderCards();
  updatePreview();

  document.getElementById('statTotal').textContent = generatedCards.length;
  document.getElementById('statType').textContent  = detectNetwork(bin);
  document.getElementById('statBin').textContent   = bin.slice(0, 6);
  document.getElementById('statsBar').style.display = 'flex';
  document.getElementById('genCount').textContent  = `${generatedCards.length} cards`;

  showToast(`${generatedCards.length} cards generated`, 'success');
}

function renderCards() {
  const body = document.getElementById('ccTableBody');
  if (generatedCards.length === 0) {
    body.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
          </svg>
        </div>
        <p>No cards generated.</p>
      </div>`;
    return;
  }

  body.innerHTML = generatedCards.map((line, i) => {
    const ccOnly = line.split(/[|, :]/)[0];
    return `
      <div class="cc-row" style="animation-delay:${i * 18}ms">
        <span class="row-num">${i + 1}</span>
        <span class="row-data">${escHtml(line)}</span>
        <span class="row-actions">
          <button class="btn btn-ghost btn-xs" onclick="copySingle('${escAttr(ccOnly)}')" title="Copy">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
            </svg>
          </button>
          <button class="btn btn-ghost btn-xs" onclick="saveSingleCC('${escAttr(line)}')" title="Save card">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
            </svg>
          </button>
        </span>
      </div>`;
  }).join('');
}

function clearCards() {
  generatedCards = [];
  renderCards();
  document.getElementById('statsBar').style.display = 'none';
  document.getElementById('genCount').textContent = '0 cards';
  showToast('Cards cleared', 'success');
}

/* ── Copy ── */
function copySingle(ccNumber) {
  try {
    navigator.clipboard.writeText(ccNumber).then(() => {
      showToast('Copied to clipboard!', 'success');
    }).catch(() => fallbackCopy(ccNumber));
  } catch(e) { showToast('Failed to copy', 'error'); }
}

function copyAll() {
  if (generatedCards.length === 0) { showToast('Nothing to copy', 'error'); return; }
  const ccOnlyToggle = document.getElementById('ccOnlyToggle');
  const text = ccOnlyToggle.checked
    ? generatedCards.map(l => l.split(/[|, :]/)[0]).join('\n')
    : generatedCards.join('\n');
  navigator.clipboard.writeText(text)
    .then(() => showToast(`${generatedCards.length} cards copied`, 'success'))
    .catch(() => { fallbackCopy(text); showToast(`${generatedCards.length} cards copied`, 'success'); });
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
}

/* ── Download ── */
function downloadTxt() {
  if (generatedCards.length === 0) { showToast('Nothing to download', 'error'); return; }
  const ccOnlyToggle = document.getElementById('ccOnlyToggle');
  const content = ccOnlyToggle.checked
    ? generatedCards.map(l => l.split(/[|, :]/)[0]).join('\n')
    : generatedCards.join('\n');
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([content], { type: 'text/plain' })),
    download: `cards_${Date.now()}.txt`
  });
  a.click();
  showToast('Downloaded!', 'success');
}

/* ── Save BIN ── */
function saveBinDialog() {
  document.getElementById('saveBinValue').value = document.getElementById('binInput').value;
  document.getElementById('saveBinName').value  = '';
  // Pre-fill month/year/cvv from current generator state
  const mm  = selMonth ? (selMonth.value === 'rnd' ? '' : selMonth.value) : '';
  const yy  = selYear  ? (selYear.value  === 'rnd' ? '' : selYear.value)  : '';
  const cvv = document.getElementById('cvvInput').value.trim();
  document.getElementById('saveBinMonth').value = mm;
  document.getElementById('saveBinYear').value  = yy;
  document.getElementById('saveBinCvv').value   = cvv;
  openModal('modalSaveBin');
}

function confirmSaveBin() {
  const name  = document.getElementById('saveBinName').value.trim();
  const value = document.getElementById('saveBinValue').value.trim();
  if (!name || !value) { showToast('Please fill in name and BIN', 'error'); return; }
  const month = document.getElementById('saveBinMonth').value.trim();
  const year  = document.getElementById('saveBinYear').value.trim();
  const cvv   = document.getElementById('saveBinCvv').value.trim();
  savedBins.unshift({ id: Date.now(), name, value, month, year, cvv });
  persist(); renderSavedBins(); closeModal('modalSaveBin');
  showToast('BIN saved!', 'success');
}

function deleteBin(id) {
  savedBins = savedBins.filter(b => b.id != id);
  persist(); renderSavedBins();
  showToast('BIN deleted', 'success');
}

function loadBin(id) {
  const b = savedBins.find(b => b.id == id);
  if (!b) return;
  document.getElementById('binInput').value = b.value;
  // Restore month
  if (selMonth) selMonth.select(b.month || 'rnd', b.month ? b.month : 'Random');
  // Restore year
  if (selYear)  selYear.select(b.year  || 'rnd', b.year  ? b.year  : 'Random');
  // Restore CVV
  document.getElementById('cvvInput').value = b.cvv || '';
  updatePreview();
  switchTab('generator', document.querySelector('.tab-btn[data-tab="generator"]'));
  closeModal('modalBinPicker');
  showToast('BIN loaded!', 'success');
}

function openBinPicker() {
  const list = document.getElementById('binPickerList');
  list.innerHTML = savedBins.length === 0
    ? `<div class="empty-state" style="padding:20px;">
        <div class="empty-icon" style="font-size:24px;"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg></div>
        <p>No saved BINs.</p></div>`
    : savedBins.map(b => `
      <div class="saved-item" style="cursor:pointer;" onclick="loadBin(${b.id}); closeModal('modalBinPicker');">
        <span class="si-name">${escHtml(b.name)}</span>
        <span class="si-val">${escHtml(b.value)}</span>
      </div>`).join('');
  openModal('modalBinPicker');
}

function renderSavedBins() {
  const el = document.getElementById('savedBinsList');
  const no = document.getElementById('noBins');
  if (savedBins.length === 0) { el.innerHTML = ''; no.style.display = ''; return; }
  no.style.display = 'none';
  el.innerHTML = savedBins.map(b => {
    const net = b.value ? detectNetwork(b.value) : '—';
    const hasExpiry = b.month || b.year;
    const expiryText = hasExpiry ? `${b.month || 'XX'}/${b.year || 'XX'}` : 'Random';
    const cvvText = b.cvv ? b.cvv : 'Random';
    return `
      <div class="cc-card" id="bin-card-${b.id}">
        <div class="cc-card-header" onclick="toggleBinCard(${b.id})">
          <div class="cc-card-meta">
            <span class="cc-card-name">${escHtml(b.name)}</span>
            <span class="badge badge-blue">${escHtml(net)}</span>
            <span class="cc-card-preview">${escHtml(b.value)}</span>
          </div>
          <svg class="cc-card-chevron" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" width="16" height="16">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
        <div class="cc-card-body">
          <div class="cc-card-inner">
            <div class="cc-card-lines">
              <div class="cc-card-line"><span style="color:var(--muted);width:80px;display:inline-block;">BIN</span>${escHtml(b.value)}</div>
              <div class="cc-card-line"><span style="color:var(--muted);width:80px;display:inline-block;">Expiry</span>${escHtml(expiryText)}</div>
              <div class="cc-card-line"><span style="color:var(--muted);width:80px;display:inline-block;">CVV</span>${escHtml(cvvText)}</div>
              <div class="cc-card-line"><span style="color:var(--muted);width:80px;display:inline-block;">Network</span>${escHtml(net)}</div>
            </div>
            <div class="cc-card-actions">
              <button class="btn btn-primary btn-sm" onclick="loadBin(${b.id})">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                Load BIN
              </button>
              <button class="btn btn-outline btn-sm" onclick="copyBin('${escAttr(b.value)}')">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                Copy BIN
              </button>
              <button class="btn btn-danger btn-sm" onclick="deleteBin(${b.id})">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>`;
  }).join('');
}

function toggleBinCard(id) {
  const card = document.getElementById(`bin-card-${id}`);
  if (!card) return;
  const isOpen = card.classList.contains('expanded');
  document.querySelectorAll('.cc-card.expanded').forEach(c => c.classList.remove('expanded'));
  if (!isOpen) card.classList.add('expanded');
}

function copyBin(value) {
  navigator.clipboard.writeText(value).then(() => showToast('BIN copied!', 'success'));
}

/* ── Save CCs ── */
function saveSingleCC(line) {
  document.getElementById('saveCCName').value  = `Card — ${new Date().toLocaleTimeString()}`;
  document.getElementById('saveCCValue').value = line;
  openModal('modalSaveCC');
}

function saveAllCCsDialog() {
  if (generatedCards.length === 0) { showToast('No cards to save', 'error'); return; }
  document.getElementById('saveCCName').value  = `Batch ${new Date().toLocaleDateString()}`;
  document.getElementById('saveCCValue').value = generatedCards.join('\n');
  openModal('modalSaveCC');
}

function confirmSaveCC() {
  const name  = document.getElementById('saveCCName').value.trim();
  const value = document.getElementById('saveCCValue').value.trim();
  if (!name || !value) { showToast('Please fill in name and cards', 'error'); return; }
  savedCCs.unshift({ id: Date.now(), name, value }); // unshift so newest is on top
  persist(); renderSavedCCs(); closeModal('modalSaveCC');
  showToast('Cards saved! Check Saved CCs tab.', 'success');
}

function deleteCC(id) {
  savedCCs = savedCCs.filter(c => c.id != id);
  persist(); renderSavedCCs();
  showToast('Deleted', 'success');
}

function clearAllSavedCCs() {
  if (!confirm('Delete all saved cards?')) return;
  savedCCs = []; persist(); renderSavedCCs();
  showToast('All saved cards cleared', 'success');
}

function renderSavedCCs() {
  const el = document.getElementById('savedCCsList');
  const no = document.getElementById('noCCs');
  if (savedCCs.length === 0) { el.innerHTML = ''; no.style.display = ''; return; }
  no.style.display = 'none';
  el.innerHTML = savedCCs.map(c => {
    const lines = c.value.split('\n').filter(Boolean);
    const preview = lines[0].split(/[|, :]/)[0];
    const linesHtml = lines.map(l =>
      `<div class="cc-card-line">${escHtml(l)}</div>`
    ).join('');
    return `
      <div class="cc-card" id="cc-card-${c.id}">
        <div class="cc-card-header" onclick="toggleCCCard(${c.id})">
          <div class="cc-card-meta">
            <span class="cc-card-name">${escHtml(c.name)}</span>
            <span class="cc-card-preview">${escHtml(preview)}</span>
          </div>
          <svg class="cc-card-chevron" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" width="16" height="16">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
        <div class="cc-card-body">
          <div class="cc-card-inner">
            <div class="cc-card-lines">${linesHtml}</div>
            <div class="cc-card-actions">
              <button class="btn btn-green btn-sm" onclick="copySavedCCs(${c.id})">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                Copy All
              </button>
              <button class="btn btn-outline btn-sm" onclick="downloadCC(${c.id})">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                Download
              </button>
              <button class="btn btn-danger btn-sm" onclick="deleteCC(${c.id})">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>`;
  }).join('');
}

function toggleCCCard(id) {
  const card = document.getElementById(`cc-card-${id}`);
  if (!card) return;
  const isOpen = card.classList.contains('expanded');
  // Close all others smoothly
  document.querySelectorAll('.cc-card.expanded').forEach(c => c.classList.remove('expanded'));
  if (!isOpen) card.classList.add('expanded');
}

function copySavedCCs(id) {
  const entry = savedCCs.find(c => c.id == id);
  if (!entry) return;
  navigator.clipboard.writeText(entry.value).then(() => showToast('Cards copied!', 'success'));
}

function downloadCC(id) {
  const entry = savedCCs.find(c => c.id == id);
  if (!entry) return;
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([entry.value], { type: 'text/plain' })),
    download: `${entry.name.replace(/[^a-z0-9]/gi, '_')}.txt`
  });
  a.click();
  showToast('Downloaded!', 'success');
}

/* ── Tabs ── */
function switchTab(id, btn) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + id).classList.add('active');
  document.querySelector(`[data-tab="${id}"]`).classList.add('active');
  renderSavedBins();
  renderSavedCCs();
}

/* ── Modals ── */
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

document.querySelectorAll('.modal-overlay').forEach(m => {
  m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open'); });
});

/* ── Toast ── */
let toastTimer;
function showToast(msg, type = 'default') {
  const t = document.getElementById('toast');
  t.innerHTML = `
    ${type === 'success' ? '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>' : ''}
    ${type === 'error'   ? '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>' : ''}
    ${msg}`;
  t.className = 'show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.className = '', 2800);
}

/* ── Helpers ── */
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escAttr(s) {
  return String(s).replace(/'/g, '&#39;').replace(/\\/g, '\\\\');
}

/* ── Particles ── */
(function particles() {
  const canvas = document.getElementById('particles');
  const ctx = canvas.getContext('2d');
  let pts = [];

  function resize() { canvas.width = innerWidth; canvas.height = innerHeight; }
  addEventListener('resize', resize); resize();

  function init() {
    pts = Array.from({ length: 55 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 1.5 + 0.5,
      dx: (Math.random() - .5) * .35,
      dy: (Math.random() - .5) * .35,
      o: Math.random() * .35 + .05,
    }));
  }
  init();

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pts.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(99,117,255,${p.o})`;
      ctx.fill();
      p.x += p.dx; p.y += p.dy;
      if (p.x < 0 || p.x > canvas.width) p.dx *= -1;
      if (p.y < 0 || p.y > canvas.height) p.dy *= -1;
    });
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < 110) {
          ctx.beginPath();
          ctx.moveTo(pts[i].x, pts[i].y);
          ctx.lineTo(pts[j].x, pts[j].y);
          ctx.strokeStyle = `rgba(99,117,255,${0.07 * (1 - dist/110)})`;
          ctx.lineWidth = .5;
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(draw);
  }
  draw();
})();

/* ── Init ── */
document.addEventListener('DOMContentLoaded', () => {
  // Build year options dynamically
  buildYearOptions();

  // Init custom selects
  selMonth = new CustomSelect(document.getElementById('monthSelWrapper'))
    .onChange(() => updatePreview());

  selYear = new CustomSelect(document.getElementById('yearSelWrapper'))
    .onChange(() => updatePreview());

  // Render saved data
  renderSavedBins();
  renderSavedCCs();
  updatePreview();
});
