/* ═══════════════════════════════════════════════════════
   graficas.js — Plotly chart renderers for HYDRO-IDF
   ═══════════════════════════════════════════════════════ */

// ── Color palette INVIAS ────────────────────────────────
// Gradiente por período de retorno: T2=azul → T5=verde → T10=amarillo → T20=naranja → T50=rojo → T100=morado
const INVIAS_COLORS = ['#4e9af1', '#2ecc71', '#f1c40f', '#e67e22', '#e74c3c', '#9b59b6'];

const TR_LABELS = ['Tr=2a', 'Tr=5a', 'Tr=10a', 'Tr=20a', 'Tr=50a', 'Tr=100a'];

const PLOTLY_BASE_LAYOUT = {
  paper_bgcolor: 'transparent',
  plot_bgcolor: '#0d1117',
  font: { family: 'Inter, system-ui, sans-serif', color: '#94a3b8', size: 11 },
  margin: { t: 12, b: 44, l: 52, r: 12 },
  xaxis: {
    title: { text: 'Duración (min)', standoff: 8 },
    type: 'linear',
    tickmode: 'array',
    tickvals: [10, 20, 30, 45, 60, 90, 120, 150, 180],
    ticktext: ['10', '20', '30', '45', '60', '90', '120', '150', '180'],
    range: [5, 190],
    gridcolor: '#1e2535',
    linecolor: '#1e2535',
    tickcolor: '#1e2535',
    tickfont: { size: 10 },
  },
  yaxis: {
    title: { text: 'Intensidad (mm/h)', standoff: 8 },
    gridcolor: '#1e2535',
    linecolor: '#1e2535',
    tickcolor: '#1e2535',
    tickfont: { size: 10 },
    rangemode: 'tozero',
  },
  legend: {
    bgcolor: 'rgba(10,14,26,0.7)',
    bordercolor: '#1e2535',
    borderwidth: 1,
    font: { size: 10 },
    x: 0.01,
    y: 0.99,
    xanchor: 'left',
    yanchor: 'top',
    orientation: 'v',
  },
  hovermode: 'x unified',
  hoverlabel: {
    bgcolor: '#111827',
    bordercolor: '#253047',
    font: { size: 11, color: '#e2e8f0' },
  },
};

const PLOTLY_CONFIG = {
  displayModeBar: false,
  responsive: true,
};

/**
 * Construye trazas Plotly para Producto A (INVIAS).
 * @param {Array} datos - array de {duracion_min, T2, T5, T10, T20, T50, T100}
 */
function buildTracesInvias(datos) {
  const keys = ['T2', 'T5', 'T10', 'T20', 'T50', 'T100'];
  const x = datos.map(d => d.duracion_min);
  return keys.map((k, i) => ({
    x,
    y: datos.map(d => d[k]),
    name: TR_LABELS[i],
    type: 'scatter',
    mode: 'lines+markers',
    line: { color: INVIAS_COLORS[i], width: i === 5 ? 2.2 : 1.6, shape: 'spline', smoothing: 1.3 },
    marker: { size: 5, color: INVIAS_COLORS[i] },
    legendgroup: 'invias',
    legendgrouptitle: i === 0 ? { text: 'INVIAS', font: { color: '#00e5cc', size: 10 } } : undefined,
    hovertemplate: `%{y:.1f} mm/h<extra>${TR_LABELS[i]} INVIAS</extra>`,
  }));
}

/**
 * Renderiza el gráfico IDF en el panel lateral.
 * @param {string} containerId - ID del div contenedor
 * @param {Object|null} productoA - datos de Producto A
 * @param {number} height - altura del chart en px
 */
function renderIDFChart(containerId, productoA, height) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const h = height || 260;
  el.style.height = h + 'px';
  Plotly.purge(el);

  if (!productoA) {
    el.innerHTML = '<div style="padding:20px;text-align:center;color:#4a5568;font-size:12px;">Sin datos disponibles.</div>';
    return;
  }

  const traces = buildTracesInvias(productoA.datos);
  const layout = Object.assign({}, PLOTLY_BASE_LAYOUT, {
    height: h,
    showlegend: true,
  });

  Plotly.react(el, traces, layout, PLOTLY_CONFIG);
}

/**
 * Renderiza el gráfico IDF para el Cálculo Manual.
 * @param {string} containerId
 * @param {Array} datos - array de {duracion_min, T2, ..., T100}
 * @param {string} estacionNombre
 */
function renderCalcChart(containerId, datos, estacionNombre) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const traces = buildTracesInvias(datos);
  const layout = Object.assign({}, PLOTLY_BASE_LAYOUT, {
    height: 300,
    title: {
      text: `IDF — ${estacionNombre}`,
      font: { size: 12, color: '#94a3b8' },
      x: 0.5,
    },
  });

  Plotly.react(el, traces, layout, PLOTLY_CONFIG);
}

/**
 * Renderiza gráfico de intensidades INVIAS por estación para Reportes.
 * Muestra i(T10, 60min) por estación como barras.
 * @param {string} containerId
 * @param {Array} stationsData - array de objetos resumen con producto_a
 */
function renderComparisonChart(containerId, stationsData) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const labels = stationsData.map(s => {
    const raw = s.nombre_ideam.replace(/\s*\[.*?\]\s*/g, '').trim();
    return raw.split(' ').slice(0, 2).join(' ');
  });

  const valA = stationsData.map(s => s.producto_a ? s.producto_a.i_T10_t60 : null);

  const traces = [
    {
      name: 'INVIAS i(T10, 60min)',
      x: labels,
      y: valA,
      type: 'bar',
      marker: { color: 'rgba(0,229,204,0.7)', line: { color: '#00e5cc', width: 1 } },
    },
  ];

  const layout = Object.assign({}, PLOTLY_BASE_LAYOUT, {
    height: 340,
    margin: { t: 12, b: 80, l: 52, r: 12 },
    bargap: 0.2,
    xaxis: Object.assign({}, PLOTLY_BASE_LAYOUT.xaxis, {
      type: 'category',
      tickangle: -40,
      tickfont: { size: 9 },
      title: { text: '' },
    }),
    yaxis: Object.assign({}, PLOTLY_BASE_LAYOUT.yaxis, {
      title: { text: 'i (mm/h)' },
    }),
  });

  Plotly.react(el, traces, layout, PLOTLY_CONFIG);
}

/**
 * Renderiza histograma de M_mm para Reportes.
 * @param {string} containerId
 * @param {Array} stationsData
 */
function renderMDistChart(containerId, stationsData) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const values = stationsData
    .filter(s => s.producto_a)
    .map(s => s.producto_a.M_mm);

  const traces = [{
    x: values,
    type: 'histogram',
    nbinsx: 12,
    marker: { color: 'rgba(0,229,204,0.65)', line: { color: '#00e5cc', width: 1 } },
    hovertemplate: '%{y} estaciones<br>M = %{x:.1f} mm<extra></extra>',
  }];

  const layout = Object.assign({}, PLOTLY_BASE_LAYOUT, {
    height: 260,
    showlegend: false,
    xaxis: Object.assign({}, PLOTLY_BASE_LAYOUT.xaxis, {
      type: 'linear',
      tickmode: 'auto',
      tickvals: undefined,
      ticktext: undefined,
      title: { text: 'M (mm)', standoff: 6 },
    }),
    yaxis: Object.assign({}, PLOTLY_BASE_LAYOUT.yaxis, {
      title: { text: 'N° estaciones' },
    }),
  });

  Plotly.react(el, traces, layout, PLOTLY_CONFIG);
}