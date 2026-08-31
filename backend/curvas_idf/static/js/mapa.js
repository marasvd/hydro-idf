/* ═══════════════════════════════════════════════════════
   mapa.js — Leaflet map, station panel & navigation
   ═══════════════════════════════════════════════════════ */

'use strict';

// ── App state ────────────────────────────────────────────
let MAP = null;
let STATIONS = [];
let MARKERS = {};
let CURRENT_DATA = null;
let CURRENT_LAYER = 'ambas';
let SELECTED_MARKER = null;
let REPORTES_LOADED = false;
let ESTACIONES_LOADED = false;

// ══════════════════════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════════════════════
function switchView(viewName) {
  document.querySelectorAll('.view').forEach(v => {
    v.classList.add('hidden');
    v.classList.remove('active');
  });
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const view = document.getElementById(`view-${viewName}`);
  if (view) {
    view.classList.remove('hidden');
    view.classList.add('active');
  }
  const navItem = document.querySelector(`.nav-item[data-view="${viewName}"]`);
  if (navItem) navItem.classList.add('active');

  if (viewName === 'reportes' && !REPORTES_LOADED) {
    loadReportes();
    REPORTES_LOADED = true;
  }
  if (viewName === 'estaciones' && !ESTACIONES_LOADED) {
    loadEstacionesTable();
    ESTACIONES_LOADED = true;
  }
  if (viewName === 'mapa' && MAP) {
    setTimeout(() => MAP.invalidateSize(), 50);
  }
}

// ══════════════════════════════════════════════════════════
// MAP INITIALIZATION
// ══════════════════════════════════════════════════════════
function initMap() {
  MAP = L.map('map', {
    center: [2.52, -75.62],
    zoom: 9,
    zoomControl: true,
    attributionControl: true,
  });

  L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }
  ).addTo(MAP);

  MAP.zoomControl.setPosition('bottomright');
  loadStations();
}

// ── Station markers ──────────────────────────────────────
function makeIcon(hasA, hasC, selected) {
  let cls = 'station-marker';
  if (!hasA && !hasC) cls += ' dim-mk';
  else if (!hasA && hasC) cls += ' amber-mk';
  if (selected) cls += ' selected';

  return L.divIcon({
    className: '',
    html: `<div class="${cls}"><div class="marker-dot"></div></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    tooltipAnchor: [12, 0],
  });
}

function loadStations() {
  fetch('/api/estaciones/')
    .then(r => r.json())
    .then(data => {
      STATIONS = data;
      const badge = document.getElementById('badge-count');
      if (badge) badge.textContent = `${data.length} estaciones`;

      data.forEach(station => {
        const marker = L.marker(
          [station.latitud, station.longitud],
          { icon: makeIcon(station.tiene_producto_a, station.tiene_producto_c, false) }
        );

        marker.bindTooltip(
          `<strong>${cleanName(station.nombre_ideam)}</strong><br>${station.municipio}`,
          { direction: 'right', className: 'hydro-tooltip', offset: [10, 0] }
        );

        marker.on('click', () => openPanel(station.carpeta, marker));
        marker.addTo(MAP);
        MARKERS[station.carpeta] = { marker, data: station };
      });
    })
    .catch(err => console.error('Error cargando estaciones:', err));
}

function cleanName(nombre) {
  return nombre.replace(/\s*\[.*?\]\s*/g, '').trim();
}

// ══════════════════════════════════════════════════════════
// STATION PANEL
// ══════════════════════════════════════════════════════════
function openPanel(carpeta, markerRef) {
  if (SELECTED_MARKER) {
    const prev = MARKERS[SELECTED_MARKER];
    if (prev) {
      prev.marker.setIcon(makeIcon(prev.data.tiene_producto_a, prev.data.tiene_producto_c, false));
    }
  }
  SELECTED_MARKER = carpeta;
  const cur = MARKERS[carpeta];
  if (cur) {
    cur.marker.setIcon(makeIcon(cur.data.tiene_producto_a, cur.data.tiene_producto_c, true));
  }

  CURRENT_LAYER = 'ambas';
  document.querySelectorAll('#layer-toggles .toggle-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.layer === 'ambas');
  });

  const panel = document.getElementById('station-panel');
  document.getElementById('panel-name').textContent = 'Cargando…';
  document.getElementById('panel-meta').textContent = '';
  document.getElementById('panel-chips').innerHTML = '';
  document.getElementById('idf-chart').innerHTML =
    '<div style="height:260px;display:flex;align-items:center;justify-content:center;color:#4a5568;font-size:12px">Cargando datos…</div>';
  document.getElementById('intensity-table').innerHTML = '';
  document.getElementById('era5-bias').classList.add('hidden');
  panel.classList.add('open');

  fetch(`/api/idf/${encodeURIComponent(carpeta)}/`)
    .then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then(data => {
      CURRENT_DATA = data;
      populatePanel(data);
    })
    .catch(err => {
      document.getElementById('panel-name').textContent = 'Error al cargar';
      document.getElementById('idf-chart').innerHTML =
        `<div style="padding:16px;color:#f87171;font-size:12px">${err.message}</div>`;
    });
}

function closePanel() {
  document.getElementById('station-panel').classList.remove('open');
  if (SELECTED_MARKER) {
    const prev = MARKERS[SELECTED_MARKER];
    if (prev) {
      prev.marker.setIcon(makeIcon(prev.data.tiene_producto_a, prev.data.tiene_producto_c, false));
    }
    SELECTED_MARKER = null;
  }
  CURRENT_DATA = null;
}

function populatePanel(data) {
  const { estacion, producto_a, producto_c } = data;

  document.getElementById('panel-name').textContent = cleanName(estacion.nombre_ideam);
  document.getElementById('panel-meta').textContent =
    `${estacion.municipio} · ${estacion.latitud.toFixed(4)}°N  ${Math.abs(estacion.longitud).toFixed(4)}°W · Cód. ${estacion.codigo}`;

  const chipsEl = document.getElementById('panel-chips');
  chipsEl.innerHTML = '';
  if (producto_a) {
    chipsEl.innerHTML += `
      <span class="chip teal">
        <span class="chip-dot"></span>
        INVIAS · M=${producto_a.M_mm} mm · ${producto_a.anos_validos ?? '—'} años
      </span>`;
  }
  if (producto_c) {
    chipsEl.innerHTML += `
      <span class="chip amber">
        <span class="chip-dot"></span>
        ERA5 · dist=${producto_c.dist_era5_km ?? '—'} km · ${producto_c.n_anios ?? '—'} años
      </span>`;
  }

  renderIDFChart('idf-chart', producto_a, producto_c, CURRENT_LAYER, 260);
  renderIntensityTable(producto_a, producto_c);

  if (producto_c) {
    document.getElementById('era5-bias').classList.remove('hidden');
  }
}

function renderIntensityTable(productoA, productoC) {
  const el = document.getElementById('intensity-table');
  if (!productoA && !productoC) { el.innerHTML = ''; return; }

  const DURATIONS = [10, 30, 60, 120, 180];

  const getA = (dur, key) => {
    if (!productoA) return null;
    const row = productoA.datos.find(d => d.duracion_min === dur);
    return row ? row[key] : null;
  };
  const getC = (dur, key) => {
    if (!productoC) return null;
    const row = productoC.datos.find(d => d.duracion_min === dur);
    return row ? row[key] : null;
  };

  let headerCols = '<th>t (min)</th>';
  if (productoA) headerCols += '<th>INVIAS T10</th><th>INVIAS T100</th>';
  if (productoC) headerCols += '<th>ERA5 Tr10</th><th>ERA5 Tr100</th>';

  let rows = '';
  DURATIONS.forEach(dur => {
    let cols = `<td>${dur}</td>`;
    if (productoA) {
      const t10 = getA(dur, 'T10');
      const t100 = getA(dur, 'T100');
      cols += t10 !== null ? `<td class="teal-val">${t10.toFixed(1)}</td>` : '<td>—</td>';
      cols += t100 !== null ? `<td class="teal-val">${t100.toFixed(1)}</td>` : '<td>—</td>';
    }
    if (productoC) {
      const tr10 = getC(dur, 'Tr10');
      const tr100 = getC(dur, 'Tr100');
      cols += tr10 !== null ? `<td class="amber-val">${tr10.toFixed(2)}</td>` : '<td>—</td>';
      cols += tr100 !== null ? `<td class="amber-val">${tr100.toFixed(2)}</td>` : '<td>—</td>';
    }
    rows += `<tr>${cols}</tr>`;
  });

  el.innerHTML = `
    <table>
      <thead><tr>${headerCols}</tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ── Layer toggle ─────────────────────────────────────────
function setLayer(layer) {
  CURRENT_LAYER = layer;
  document.querySelectorAll('#layer-toggles .toggle-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.layer === layer);
  });
  if (CURRENT_DATA) {
    renderIDFChart('idf-chart', CURRENT_DATA.producto_a, CURRENT_DATA.producto_c, CURRENT_LAYER, 260);
  }
}

// ══════════════════════════════════════════════════════════
// DOWNLOADS
// ══════════════════════════════════════════════════════════
function _triggerDownload(href, filename) {
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function downloadStationPNG() {
  if (!CURRENT_DATA) return;
  const { estacion, producto_a, producto_c } = CURRENT_DATA;
  const slug = encodeURIComponent(estacion.carpeta);
  const nombre = estacion.carpeta.replace(/\s+/g, '_');

  const bajarA = (CURRENT_LAYER === 'invias' || CURRENT_LAYER === 'ambas') && producto_a;
  const bajarC = (CURRENT_LAYER === 'era5' || CURRENT_LAYER === 'ambas') && producto_c;

  if (bajarA) _triggerDownload(`/api/imagen/a/${slug}/`, `IDF_${nombre}.png`);
  if (bajarC) setTimeout(() => _triggerDownload(`/api/imagen/c/${slug}/`, `IDF_ERA5_${nombre}.png`), 300);
}

function downloadStationCSV() {
  if (!CURRENT_DATA) return;
  const { estacion, producto_a, producto_c } = CURRENT_DATA;

  const incluirA = (CURRENT_LAYER === 'invias' || CURRENT_LAYER === 'ambas') && producto_a;
  const incluirC = (CURRENT_LAYER === 'era5' || CURRENT_LAYER === 'ambas') && producto_c;

  const lines = [];
  lines.push('# Curvas IDF — HYDRO-IDF HUILA');
  lines.push(`# Estacion: ${cleanName(estacion.nombre_ideam)}`);
  lines.push(`# Municipio: ${estacion.municipio}`);
  lines.push(`# Codigo: ${estacion.codigo}`);
  lines.push('');

  if (incluirA) {
    lines.push('## Producto A — INVIAS Ec. 2.103 Region Andina R1');
    lines.push(`# M_mm: ${producto_a.M_mm}  Anos_validos: ${producto_a.anos_validos}`);
    lines.push('Duracion_min,T2,T5,T10,T20,T50,T100');
    producto_a.datos.forEach(r => {
      lines.push(`${r.duracion_min},${r.T2},${r.T5},${r.T10},${r.T20},${r.T50},${r.T100}`);
    });
    lines.push('');
  }

  if (incluirC) {
    lines.push('## Producto C — ERA5 Gumbel L-Momentos');
    lines.push(`# Dist_ERA5_km: ${producto_c.dist_era5_km}  N_anios: ${producto_c.n_anios}`);
    lines.push('# ADVERTENCIA: ERA5 subestima precipitaciones maximas en zonas montanosas. Ratio ERA5/INVIAS ~0.249');
    lines.push('Duracion_min,Tr2,Tr5,Tr10,Tr20,Tr50,Tr100');
    producto_c.datos.forEach(r => {
      lines.push(`${r.duracion_min},${r.Tr2},${r.Tr5},${r.Tr10},${r.Tr20},${r.Tr50},${r.Tr100}`);
    });
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `IDF_${estacion.carpeta.replace(/\s+/g, '_')}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ══════════════════════════════════════════════════════════
// ESTACIONES TABLE
// ══════════════════════════════════════════════════════════
function loadEstacionesTable() {
  if (STATIONS.length === 0) {
    fetch('/api/estaciones/')
      .then(r => r.json())
      .then(data => { STATIONS = data; buildEstacionesTable(data); });
  } else {
    buildEstacionesTable(STATIONS);
  }
}

function buildEstacionesTable(data) {
  const tbody = document.getElementById('stations-tbody');
  if (!tbody) return;

  const renderRows = (list) => {
    tbody.innerHTML = list.map(s => `
      <tr>
        <td class="td-code">${s.codigo}</td>
        <td class="td-name">${cleanName(s.nombre_ideam)}</td>
        <td>${s.municipio}</td>
        <td class="text-right">${s.latitud.toFixed(4)}</td>
        <td class="text-right">${Math.abs(s.longitud).toFixed(4)}</td>
        <td class="text-center">
          ${s.tiene_producto_a
        ? '<span class="badge-yes teal">✓ INVIAS</span>'
        : '<span class="badge-no">—</span>'}
        </td>
        <td class="text-center">
          ${s.tiene_producto_c
        ? '<span class="badge-yes amber">✓ ERA5</span>'
        : '<span class="badge-no">—</span>'}
        </td>
        <td>
          <button class="btn-table-action" data-carpeta="${s.carpeta}">
            Ver en mapa
          </button>
        </td>
      </tr>`).join('');

    tbody.querySelectorAll('.btn-table-action').forEach(btn => {
      btn.addEventListener('click', () => {
        const carpeta = btn.dataset.carpeta;
        switchView('mapa');
        const entry = MARKERS[carpeta];
        if (entry) {
          MAP.setView([entry.data.latitud, entry.data.longitud], 12, { animate: true });
          setTimeout(() => openPanel(carpeta, entry.marker), 400);
        }
      });
    });
  };

  renderRows(data);

  const searchInput = document.getElementById('station-search');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.toLowerCase();
      const filtered = data.filter(s =>
        s.nombre_ideam.toLowerCase().includes(q) ||
        s.municipio.toLowerCase().includes(q) ||
        s.codigo.includes(q)
      );
      renderRows(filtered);
    });
  }
}

// ══════════════════════════════════════════════════════════
// REPORTES REGIONALES
// ══════════════════════════════════════════════════════════
function loadReportes() {
  const loadingEl = document.getElementById('reportes-loading');
  if (loadingEl) loadingEl.classList.remove('hidden');

  fetch('/api/resumen/')
    .then(r => r.json())
    .then(data => {
      if (loadingEl) loadingEl.classList.add('hidden');
      renderComparisonChart('report-comparison', data);
      renderMDistChart('report-m-dist', data);
      renderRatioChart('report-ratio', data);
    })
    .catch(err => {
      if (loadingEl) {
        loadingEl.innerHTML = `<span style="color:#f87171">Error cargando datos: ${err.message}</span>`;
      }
    });
}

// ══════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {

  document.querySelectorAll('.nav-item[data-view]').forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      switchView(item.dataset.view);
    });
  });

  initMap();

  document.getElementById('panel-close')?.addEventListener('click', closePanel);

  document.getElementById('layer-toggles')?.addEventListener('click', e => {
    const btn = e.target.closest('.toggle-btn');
    if (btn) setLayer(btn.dataset.layer);
  });

  document.getElementById('btn-download')?.addEventListener('click', downloadStationCSV);
  document.getElementById('btn-download-png')?.addEventListener('click', downloadStationPNG);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closePanel();
  });
});