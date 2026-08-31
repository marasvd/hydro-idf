/* ═══════════════════════════════════════════════════════
   graficas.js — Plotly chart renderers for HYDRO-IDF
   ═══════════════════════════════════════════════════════ */

// ── Color palettes ──────────────────────────────────────
// INVIAS — teal family, T100 brightest
const TEAL_COLORS = [
  'rgba(0,229,204,0.28)',   // T2
  'rgba(0,229,204,0.42)',   // T5
  'rgba(0,229,204,0.58)',   // T10
  'rgba(0,229,204,0.72)',   // T20
  'rgba(0,229,204,0.87)',   // T50
  'rgba(0,229,204,1.00)',   // T100
];
// ERA5 — amber family
const AMBER_COLORS = [
  'rgba(255,179,0,0.28)',
  'rgba(255,179,0,0.42)',
  'rgba(255,179,0,0.58)',
  'rgba(255,179,0,0.72)',
  'rgba(255,179,0,0.87)',
  'rgba(255,179,0,1.00)',
];

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
// Gradiente por período de retorno: T2=azul → T5=verde → T10=amarillo → T20=naranja → T50=rojo → T100=morado
const INVIAS_COLORS = ['#4e9af1', '#2ecc71', '#f1c40f', '#e67e22', '#e74c3c', '#9b59b6'];

function buildTracesInvias(datos) {
  const keys  = ['T2', 'T5', 'T10', 'T20', 'T50', 'T100'];
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
 * Construye trazas Plotly para Producto C (ERA5-Gumbel).
 * @param {Array} datos - array de {duracion_min, Tr2, Tr5, Tr10, Tr20, Tr50, Tr100}
 */
function buildTracesEra5(datos) {
  const keys  = ['Tr2', 'Tr5', 'Tr10', 'Tr20', 'Tr50', 'Tr100'];
  const x = datos.map(d => d.duracion_min);
  return keys.map((k, i) => ({
    x,
    y: datos.map(d => d[k]),
    name: TR_LABELS[i],
    type: 'scatter',
    mode: 'lines+markers',
    line: { color: AMBER_COLORS[i], width: i === 5 ? 2.2 : 1.6, dash: 'dot' },
    marker: { symbol: 'diamond', size: 4, color: AMBER_COLORS[i] },
    legendgroup: 'era5',
    legendgrouptitle: i === 0 ? { text: 'ERA5', font: { color: '#ffb300', size: 10 } } : undefined,
    hovertemplate: `%{y:.2f} mm/h<extra>${TR_LABELS[i]} ERA5</extra>`,
  }));
}

/**
 * Renderiza el gráfico IDF en el panel lateral.
 * @param {string} containerId - ID del div contenedor
 * @param {Object|null} productoA - datos de Producto A
 * @param {Object|null} productoC - datos de Producto C
 * @param {string} layer - 'invias' | 'era5' | 'ambas'
 * @param {number} height - altura del chart en px
 */
function renderIDFChart(containerId, productoA, productoC, layer, height) {
  const el = document.getElementById(containerId);
  if (!el) return;

  // forzar altura en el contenedor antes de que Plotly mida el div
  const h = height || 260;
  el.style.height = h + 'px';

  // limpiar gráfico anterior para que no quede visible durante la carga del nuevo
  Plotly.purge(el);

  const traces = [];
  if ((layer === 'invias' || layer === 'ambas') && productoA) {
    traces.push(...buildTracesInvias(productoA.datos));
  }
  if ((layer === 'era5' || layer === 'ambas') && productoC) {
    // Bug 3: shape spline para suavizar los 3 puntos ERA5
    const era5Traces = buildTracesEra5(productoC.datos).map(t => ({
      ...t,
      line: { ...t.line, shape: 'spline' },
      // Bug 2: asignar eje Y secundario cuando se muestran ambas metodologías
      ...(layer === 'ambas' ? { yaxis: 'y2' } : {}),
    }));
    traces.push(...era5Traces);
  }
  if (traces.length === 0) {
    el.innerHTML = '<div style="padding:20px;text-align:center;color:#4a5568;font-size:12px;">Sin datos para la metodología seleccionada.</div>';
    return;
  }

  const layout = Object.assign({}, PLOTLY_BASE_LAYOUT, {
    height: h,
    showlegend: true,
  });

  // Bug 2: ejes Y independientes en vista 'ambas'
  // yaxis (izquierda, teal) queda en PLOTLY_BASE_LAYOUT; yaxis2 (derecha, amber) se añade aquí
  if (layer === 'ambas') {
    layout.yaxis2 = {
      title: { text: 'Intensidad ERA5 (mm/h)', standoff: 8, font: { color: '#ffb300' } },
      gridcolor: '#1e2535',
      linecolor: '#ffb300',
      tickcolor: '#ffb300',
      tickfont: { size: 10, color: '#ffb300' },
      overlaying: 'y',
      side: 'right',
      rangemode: 'tozero',
      showgrid: false,
    };
    layout.margin = { t: 12, b: 44, l: 52, r: 56 };
  }

  // acotar eje X al rango real de ERA5 (60-180 min) en vista solo ERA5
  if (layer === 'era5') {
    layout.xaxis = Object.assign({}, PLOTLY_BASE_LAYOUT.xaxis, {
      range: [50, 190],
      tickvals: [60, 120, 180],
      ticktext: ['60', '120', '180'],
    });
  }

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
 * Renderiza gráfico comparativo INVIAS vs ERA5 para Reportes.
 * @param {string} containerId
 * @param {Array} stationsData - array de objetos resumen con producto_a y producto_c
 */
function renderComparisonChart(containerId, stationsData) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const labels = stationsData.map(s => {
    // Nombre corto: primeras dos palabras del nombre IDEAM sin el código
    const raw = s.nombre_ideam.replace(/\s*\[.*?\]\s*/g, '').trim();
    const words = raw.split(' ');
    return words.slice(0, 2).join(' ');
  });

  const valA = stationsData.map(s => s.producto_a ? s.producto_a.i_T10_t60 : null);
  const valC = stationsData.map(s => s.producto_c ? s.producto_c.i_T10_60min : null);

  const traces = [
    {
      name: 'INVIAS (T10, 60min)',
      x: labels,
      y: valA,
      type: 'bar',
      marker: { color: 'rgba(0,229,204,0.7)', line: { color: '#00e5cc', width: 1 } },
    },
    {
      name: 'ERA5 (T10, 60min)',
      x: labels,
      y: valC,
      type: 'bar',
      marker: { color: 'rgba(255,179,0,0.7)', line: { color: '#ffb300', width: 1 } },
    },
  ];

  const layout = Object.assign({}, PLOTLY_BASE_LAYOUT, {
    height: 340,
    margin: { t: 12, b: 80, l: 52, r: 12 },
    barmode: 'group',
    bargap: 0.2,
    bargroupgap: 0.05,
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

/**
 * Renderiza gráfico de ratios ERA5/INVIAS.
 */
function renderRatioChart(containerId, stationsData) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const paired = stationsData.filter(s => s.producto_a && s.producto_c);
  const labels = paired.map(s => {
    const raw = s.nombre_ideam.replace(/\s*\[.*?\]\s*/g, '').trim();
    return raw.split(' ').slice(0, 2).join(' ');
  });
  const ratios = paired.map(s => {
    const r = s.producto_c.i_T10_60min / s.producto_a.i_T10_t60;
    return Math.round(r * 1000) / 1000;
  });

  const colors = ratios.map(r =>
    r < 0.15 ? 'rgba(248,113,113,0.75)' :
    r < 0.3  ? 'rgba(255,179,0,0.75)' :
               'rgba(0,229,204,0.65)'
  );

  const traces = [{
    x: labels,
    y: ratios,
    type: 'bar',
    marker: { color: colors, line: { color: 'rgba(255,255,255,0.1)', width: 0.5 } },
    hovertemplate: '%{y:.3f}<extra>%{x}</extra>',
  }, {
    x: [labels[0], labels[labels.length - 1]],
    y: [0.249, 0.249],
    type: 'scatter',
    mode: 'lines',
    name: 'Ratio mediano 0.249',
    line: { color: '#ffb300', width: 1.5, dash: 'dash' },
  }];

  const layout = Object.assign({}, PLOTLY_BASE_LAYOUT, {
    height: 260,
    margin: { t: 12, b: 80, l: 52, r: 12 },
    showlegend: true,
    xaxis: Object.assign({}, PLOTLY_BASE_LAYOUT.xaxis, {
      type: 'category',
      tickangle: -40,
      tickfont: { size: 9 },
      title: { text: '' },
    }),
    yaxis: Object.assign({}, PLOTLY_BASE_LAYOUT.yaxis, {
      title: { text: 'Ratio ERA5/INVIAS' },
      range: [0, null],
    }),
  });

  Plotly.react(el, traces, layout, PLOTLY_CONFIG);
}
