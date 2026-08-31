/* ═══════════════════════════════════════════════════════
   upload.js — Drag-and-drop upload & Cálculo Manual
   ═══════════════════════════════════════════════════════ */

'use strict';

// ── State ─────────────────────────────────────────────────
let selectedFiles = [];   // Array<File> — accumulates across drops/selections
let calcResult = null;

// ══════════════════════════════════════════════════════════
// FILE ACCUMULATION
// ══════════════════════════════════════════════════════════
function accumulateFiles(incoming) {
  const csvFiles = incoming.filter(f => f.name.toLowerCase().endsWith('.csv'));
  const nonCsv = incoming.length - csvFiles.length;

  // Reject non-CSV
  if (nonCsv > 0 && csvFiles.length === 0) {
    showCalcError('Solo se aceptan archivos CSV (.csv). Ningún archivo válido fue seleccionado.');
    return;
  }

  // Deduplicate by filename against the existing queue
  const existingNames = new Set(selectedFiles.map(f => f.name));
  const newFiles = csvFiles.filter(f => !existingNames.has(f.name));
  const dupeCount = csvFiles.length - newFiles.length;

  // Build feedback message
  const msgs = [];
  if (nonCsv > 0) msgs.push(`${nonCsv} archivo(s) ignorado(s): no son CSV`);
  if (dupeCount > 0) msgs.push(`${dupeCount} archivo(s) ya estaban en la lista`);
  if (msgs.length > 0) showCalcError(msgs.join(' · '));
  else hideCalcError();

  if (newFiles.length === 0) return;

  // Append to queue
  selectedFiles.push(...newFiles);
  console.log(`[upload] cola: ${selectedFiles.length} archivo(s) →`, selectedFiles.map(f => f.name));
  renderFileQueue();
  syncCalcButton();
}

function removeFileByIndex(idx) {
  if (idx < 0 || idx >= selectedFiles.length) return;
  selectedFiles.splice(idx, 1);
  console.log(`[upload] eliminado idx ${idx}, cola: ${selectedFiles.length} archivo(s)`);
  renderFileQueue();
  syncCalcButton();
  if (selectedFiles.length === 0) hideCalcError();
}

function syncCalcButton() {
  const btn = document.getElementById('btn-calcular');
  if (btn) btn.disabled = selectedFiles.length === 0;
}

// ══════════════════════════════════════════════════════════
// RENDER FILE QUEUE
// ══════════════════════════════════════════════════════════
function renderFileQueue() {
  const queue = document.getElementById('file-queue');
  const listEl = document.getElementById('file-queue-list');
  const summaryEl = document.getElementById('file-queue-summary');
  if (!queue || !listEl || !summaryEl) return;

  if (selectedFiles.length === 0) {
    queue.classList.add('hidden');
    return;
  }

  // Header summary
  const count = selectedFiles.length;
  const totalKB = (selectedFiles.reduce((s, f) => s + f.size, 0) / 1024).toFixed(1);
  summaryEl.textContent = `${count} archivo${count !== 1 ? 's' : ''} · ${totalKB} KB total`;

  // File rows — build skeleton HTML with a numeric index as the key,
  // then patch in the raw filename via textContent / dataset so no
  // manual HTML-escaping is needed and any filename is safe.
  listEl.innerHTML = selectedFiles.map((f, i) => `
    <li class="file-row" data-idx="${i}">
      <svg class="file-row-check" viewBox="0 0 24 24" fill="none"
           stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
      <span class="file-row-name"></span>
      <span class="file-row-size">${(f.size / 1024).toFixed(1)} KB</span>
      <button class="file-row-remove" data-idx="${i}" title="Eliminar archivo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2.5" stroke-linecap="round">
          <line x1="18" y1="6" x2="6"  y2="18"/>
          <line x1="6"  y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </li>`).join('');

  // Patch filenames safely via textContent (bypasses any XSS risk)
  listEl.querySelectorAll('.file-row').forEach((row, i) => {
    const f = selectedFiles[i];
    row.querySelector('.file-row-name').textContent = f.name;
    row.querySelector('.file-row-name').title = f.name;
  });

  // Wire remove buttons — look up by index, not by filename string
  listEl.querySelectorAll('.file-row-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx, 10);
      removeFileByIndex(idx);
    });
  });

  queue.classList.remove('hidden');
}

// ══════════════════════════════════════════════════════════
// DROP ZONE INIT
// ══════════════════════════════════════════════════════════
function initDropZone() {
  const zone = document.getElementById('drop-zone');
  const input = document.getElementById('file-input');
  if (!zone) return;

  // Drag-and-drop
  zone.addEventListener('dragenter', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('dragover');
    accumulateFiles(Array.from(e.dataTransfer?.files || []));
  });

  // Click-to-browse
  input.addEventListener('change', () => {
    accumulateFiles(Array.from(input.files || []));
    input.value = '';   // reset so the same files can be re-added after removal
  });

  // Calculate button
  document.getElementById('btn-calcular')?.addEventListener('click', () => {
    if (selectedFiles.length === 0) return;
    runCalculation(selectedFiles);
  });
}

// ══════════════════════════════════════════════════════════
// RUN CALCULATION
// ══════════════════════════════════════════════════════════
function runCalculation(files) {
  const btn = document.getElementById('btn-calcular');
  btn.disabled = true;
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
         style="animation:spin .8s linear infinite;width:14px;height:14px">
      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
    </svg>
    Calculando…`;

  hideCalcError();
  document.getElementById('calc-placeholder').classList.remove('hidden');
  document.getElementById('calc-result').classList.add('hidden');

  console.log("FILES TO SEND:", files.length, files.map(f => f.name));

  const formData = new FormData();
  files.forEach(file => formData.append('archivos', file));

  console.log("FORMDATA entries:", [...formData.entries()].length);

  fetch('/api/calcular/', { method: 'POST', body: formData })
    .then(r => {
      if (!r.ok) return r.json().then(j => Promise.reject(j));
      return r.json();
    })
    .then(data => {
      calcResult = data;
      showCalcResult(data);
    })
    .catch(err => {
      const msg = err?.error || err?.errores?.[0]?.error || JSON.stringify(err);
      showCalcError(`Error en el cálculo: ${msg}`);
    })
    .finally(() => {
      btn.disabled = false;
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px">
          <polygon points="5,3 19,12 5,21 5,3"/>
        </svg>
        Calcular curva IDF`;
    });
}

// ══════════════════════════════════════════════════════════
// DISPLAY RESULT
// ══════════════════════════════════════════════════════════
function showCalcResult(data) {
  document.getElementById('calc-placeholder').classList.add('hidden');
  document.getElementById('calc-result').classList.remove('hidden');

  const nArchivos = data.n_archivos ?? 1;
  const fuenteLabel = nArchivos === 1
    ? 'Cálculo individual'
    : `${nArchivos} archivos combinados`;

  document.getElementById('calc-station-header').innerHTML = `
    <div class="result-station-name">${data.estacion.nombre}</div>
    <div class="result-chips">
      <span class="chip teal"><span class="chip-dot"></span>Código: ${data.estacion.codigo}</span>
      <span class="chip teal"><span class="chip-dot"></span>M = ${data.M_mm} mm</span>
      <span class="chip teal"><span class="chip-dot"></span>${data.anos_validos} años válidos</span>
      <span class="chip teal"><span class="chip-dot"></span>${fuenteLabel}</span>
    </div>
    ${data.advertencia
      ? `<div class="bias-badge" style="margin-bottom:8px">
          <svg viewBox="0 0 24 24" fill="none" class="bias-icon" stroke="#ffb300"
                stroke-width="2" stroke-linecap="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9"  x2="12"    y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
            <span>${data.advertencia}</span>
        </div>`
      : ''}`;

  // Actualizar tarjeta de parámetros con la región detectada
  const PARAMS = {
    R1: { nombre: 'Andina R1', a: 0.94, b: 0.18, c: 0.66, d: 0.83 },
    R2: { nombre: 'Caribe R2', a: 24.85, b: 0.22, c: 0.50, d: 0.10 },
    R3: { nombre: 'Pacífico R3', a: 13.92, b: 0.19, c: 0.58, d: 0.20 },
    R4: { nombre: 'Orinoquía R4', a: 5.53, b: 0.17, c: 0.63, d: 0.42 },
  };
  const region = data.region || 'R1';
  const p = PARAMS[region] || PARAMS['R1'];
  document.getElementById('param-card-title').textContent = `Parámetros INVIAS ${region}`;
  document.getElementById('param-region').textContent = p.nombre;
  document.getElementById('param-a').textContent = p.a;
  document.getElementById('param-b').textContent = p.b;
  document.getElementById('param-c').textContent = p.c;
  document.getElementById('param-d').textContent = p.d;
  renderCalcChart('calc-chart', data.datos, data.estacion.nombre);

  const headers = '<th>t (min)</th><th>T2</th><th>T5</th><th>T10</th><th>T20</th><th>T50</th><th>T100</th>';
  const rows = data.datos.map(r => `
    <tr>
      <td>${r.duracion_min}</td>
      <td>${r.T2.toFixed(1)}</td>
      <td>${r.T5.toFixed(1)}</td>
      <td class="teal-val">${r.T10.toFixed(1)}</td>
      <td>${r.T20.toFixed(1)}</td>
      <td>${r.T50.toFixed(1)}</td>
      <td class="teal-val">${r.T100.toFixed(1)}</td>
    </tr>`).join('');
  document.getElementById('calc-table').innerHTML =
    `<table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
}

// ══════════════════════════════════════════════════════════
// DOWNLOAD CALC RESULT
// ══════════════════════════════════════════════════════════
function downloadCalcCSV() {
  if (!calcResult) return;
  const { estacion, M_mm, anos_validos, datos } = calcResult;
  const lines = [
    '# Curvas IDF — HYDRO-IDF HUILA',
    `# Estacion: ${estacion.nombre}`,
    `# Codigo: ${estacion.codigo}`,
    `# Metodo: INVIAS Ec. 2.103 | ${calcResult.region || 'R1'} (${calcResult.nombre_region || 'Andina'})`,
    `# M_mm: ${M_mm}  Anos_validos: ${anos_validos}`,
    '',
    'Duracion_min,T2,T5,T10,T20,T50,T100',
  ];
  datos.forEach(r => {
    lines.push(`${r.duracion_min},${r.T2},${r.T5},${r.T10},${r.T20},${r.T50},${r.T100}`);
  });

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `IDF_calculado_${estacion.codigo}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ══════════════════════════════════════════════════════════
// ERROR HANDLING
// ══════════════════════════════════════════════════════════
function showCalcError(msg) {
  const el = document.getElementById('calc-error');
  if (el) { el.textContent = msg; el.classList.remove('hidden'); }
}

function hideCalcError() {
  document.getElementById('calc-error')?.classList.add('hidden');
}

// ══════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  initDropZone();
  document.getElementById('btn-download-calc')?.addEventListener('click', downloadCalcCSV);
});
