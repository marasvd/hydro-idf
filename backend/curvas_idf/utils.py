"""
Pipeline INVIAS Ec. 2.103 — Multi-región Colombia
Cálculo de curvas IDF a partir de datos IDEAM (máximos anuales diarios).
Soporta R1–R4 según Tabla 2.12 Manual de Drenaje INVIAS.
R5 (Amazonía) bloqueada con aviso explícito — parámetros pendientes de confirmación.
"""
import io
import os
import pandas as pd
import numpy as np
import matplotlib
matplotlib.use('Agg')   # sin GUI — debe ir ANTES de importar pyplot
import matplotlib.pyplot as plt
import matplotlib.ticker as mticker

# ── Parámetros INVIAS por región (Tabla 2.12 Manual de Drenaje INVIAS) ────────
# Cuando el profesor confirme R5, agregar aquí y eliminar el bloqueo en detectar_region()
REGIONES_INVIAS = {
    'R1': {'nombre': 'Andina',    'a': 0.94,  'b': 0.18, 'c': 0.66, 'd': 0.83},
    'R2': {'nombre': 'Caribe',    'a': 24.85, 'b': 0.22, 'c': 0.50, 'd': 0.10},
    'R3': {'nombre': 'Pacífico',  'a': 13.92, 'b': 0.19, 'c': 0.58, 'd': 0.20},
    'R4': {'nombre': 'Orinoquía','a': 5.53,  'b': 0.17, 'c': 0.63, 'd': 0.42},
    # 'R5': {'nombre': 'Amazonía', 'a': ???, 'b': ???, 'c': ???, 'd': ???},
}

# ── Mapeo departamento → región INVIAS ────────────────────────────────────────
DEPARTAMENTO_A_REGION = {
    # R1 — Andina
    'Antioquia': 'R1', 'Bogotá': 'R1', 'Boyacá': 'R1', 'Caldas': 'R1',
    'Cauca': 'R1', 'Cundinamarca': 'R1', 'Huila': 'R1', 'Nariño': 'R1',
    'Norte De Santander': 'R1', 'Quindío': 'R1', 'Risaralda': 'R1',
    'Santander': 'R1', 'Tolima': 'R1', 'Valle Del Cauca': 'R1',
    # R2 — Caribe
    'Archipielago De San Andres, Providencia Y Santa Catalina': 'R2',
    'Atlantico': 'R2', 'Bolivar': 'R2', 'Cesar': 'R2', 'Cordoba': 'R2',
    'La Guajira': 'R2', 'Magdalena': 'R2', 'Sucre': 'R2',
    # R3 — Pacífico
    'Choco': 'R3',
    # R4 — Orinoquía
    'Arauca': 'R4', 'Casanare': 'R4', 'Meta': 'R4', 'Vichada': 'R4',
    # R5 — Amazonía (parámetros pendientes)
    'Amazonas': 'R5', 'Caqueta': 'R5', 'Guainía': 'R5',
    'Guaviare': 'R5', 'Putumayo': 'R5', 'Vaupes': 'R5',
}

# ── Catálogo IDEAM ─────────────────────────────────────────────────────────────
_CATALOGO_PATH = os.path.normpath(os.path.join(
    os.path.dirname(__file__), '..', '..', 'data', 'ideam', 'catalogo_ideam.csv'
))

_catalogo_cache = None


def _cargar_catalogo():
    """
    Carga el catálogo IDEAM y retorna {codigo_estacion: departamento}.
    Se cachea en memoria tras la primera lectura.
    """
    global _catalogo_cache
    if _catalogo_cache is not None:
        return _catalogo_cache
    if not os.path.exists(_CATALOGO_PATH):
        print(f"[WARN] Catálogo IDEAM no encontrado en {_CATALOGO_PATH}.")
        _catalogo_cache = {}
        return _catalogo_cache
    df = pd.read_csv(_CATALOGO_PATH, dtype=str, low_memory=False)
    df.columns = df.columns.str.strip().str.lower()
    # Normalizar: quitar ceros a la izquierda para unificar formato 8 y 10 dígitos
    codigos_norm = df['codigo'].str.strip().str.lstrip('0')
    _catalogo_cache = dict(zip(codigos_norm, df['departamento'].str.strip()))
    print(f"[INFO] Catálogo IDEAM cargado: {len(_catalogo_cache)} estaciones.")
    return _catalogo_cache


def detectar_region(codigo_estacion):
    """
    Detecta la región INVIAS a partir del código de estación IDEAM.

    Flujo:
      1. Busca el código en el catálogo -> obtiene departamento
      2. Mapea departamento -> región INVIAS
      3. Si no encuentra -> usa R1 como fallback con advertencia en consola

    Lanza ValueError si la región detectada es R5 (parámetros pendientes).
    """
    catalogo = _cargar_catalogo()
    # Normalizar: quitar ceros a la izquierda para unificar formato 8 y 10 dígitos
    codigo = str(codigo_estacion).strip().lstrip('0')

    departamento = catalogo.get(codigo)
    if not departamento:
        print(f"[WARN] Código {codigo} no encontrado en catálogo. Usando R1 por defecto.")
        return 'R1'

    region = DEPARTAMENTO_A_REGION.get(departamento)
    if not region:
        print(f"[WARN] Departamento '{departamento}' sin región asignada. Usando R1 por defecto.")
        return 'R1'

    if region == 'R5':
        raise ValueError(
            f"Región R5 (Amazonía) — departamento '{departamento}'.\n"
            "Los parámetros INVIAS para esta región están pendientes de confirmación "
            "con fuente oficial. El cálculo no está disponible aún para esta zona."
        )

    print(f"[INFO] Estación {codigo} -> {departamento} -> {region} ({REGIONES_INVIAS[region]['nombre']})")
    return region


PERIODOS_T = [2, 5, 10, 20, 50, 100]
DURACIONES_MIN = [10, 20, 30, 45, 60, 90, 120, 150, 180]

# Colores por período de retorno — misma paleta que los PNGs precalculados
COLORES_T = {
    2:   '#1f77b4',   # azul
    5:   '#2ca02c',   # verde
    10:  '#bcbd22',   # amarillo-verde
    20:  '#ff7f0e',   # naranja
    50:  '#d62728',   # rojo
    100: '#9467bd',   # morado
}


def calcular_M(df):
    """
    Calcula M = promedio multianual de máximos anuales válidos.

    Criterio OMM: descarta años con más del 10 % de días faltantes (>36 días/año).

    Parámetros
    ----------
    df : DataFrame con columnas estándar IDEAM:
         CodigoEstacion, NombreEstacion, Variable, Parametro, Fecha, Unidad, Valor, NivelAprobacion

    Retorna
    -------
    M_mm      : float — precipitación máxima media multianual (mm)
    n_validos : int   — número de años válidos usados
    """
    df = df.copy()
    fechas = pd.to_datetime(df['Fecha'], format='%Y-%m-%d %H:%M:%S', errors='coerce')
    if fechas.isna().all():
        fechas = pd.to_datetime(df['Fecha'], errors='coerce')
    df['Fecha'] = fechas
    df = df.dropna(subset=['Fecha', 'Valor'])
    df['Valor'] = pd.to_numeric(df['Valor'], errors='coerce')
    df = df.dropna(subset=['Valor'])
    df['anio'] = df['Fecha'].dt.year

    maximos = []
    for anio, grupo in df.groupby('anio'):
        dias_con_dato = grupo['Fecha'].dt.date.nunique()
        dias_en_anio = 366 if (anio % 4 == 0 and (anio % 100 != 0 or anio % 400 == 0)) else 365
        dias_faltantes = dias_en_anio - dias_con_dato
        if dias_faltantes / dias_en_anio > 0.10:
            continue
        maximos.append(grupo['Valor'].max())

    if len(maximos) < 10:
        raise ValueError(
            f"Serie insuficiente: menos de 10 años válidos tras criterio OMM "
            f"({len(maximos)} año(s) válido(s) encontrado(s))."
        )

    return float(np.mean(maximos)), len(maximos)


def intensidad(T, t_min, M_mm, params):
    """
    Calcula intensidad de lluvia usando INVIAS Ec. 2.103.

    i = (a * T^b * M^d) / (t/60)^c

    Parámetros
    ----------
    T      : período de retorno (años)
    t_min  : duración (minutos)
    M_mm   : precipitación máxima media multianual (mm)
    params : dict con claves a, b, c, d (de REGIONES_INVIAS)
    """
    a, b, c, d = params['a'], params['b'], params['c'], params['d']
    return (a * (T ** b) * (M_mm ** d)) / ((t_min / 60) ** c)


def calcular_idf(M_mm, params):
    """
    Genera la tabla IDF completa para todos los períodos y duraciones.

    Parámetros
    ----------
    M_mm   : precipitación máxima media multianual (mm)
    params : dict con claves a, b, c, d (de REGIONES_INVIAS)

    Retorna lista de dicts con keys: duracion_min, T2, T5, T10, T20, T50, T100
    """
    filas = []
    for t in DURACIONES_MIN:
        fila = {'duracion_min': t}
        for T in PERIODOS_T:
            fila[f'T{T}'] = round(intensidad(T, t, M_mm, params), 2)
        filas.append(fila)
    return filas


def procesar_csvs_ideam(archivos):
    """
    Procesa una lista de archivos CSV IDEAM concatenando sus datos en un único
    DataFrame, detecta la región INVIAS automáticamente desde el catálogo,
    aplica el criterio OMM sobre el conjunto unificado y calcula M.

    Parámetros
    ----------
    archivos : iterable de objetos tipo file (Django InMemoryUploadedFile o similar)

    Retorna
    -------
    dict con claves: estacion, n_archivos, M_mm, anos_validos, region,
                     nombre_region, datos, advertencia
    """
    archivos = list(archivos)
    if not archivos:
        raise ValueError("No se proporcionaron archivos.")

    dfs = []
    codigo = None
    nombre = None

    for archivo in archivos:
        try:
            df = pd.read_csv(archivo, sep=',', encoding='utf-8', low_memory=False)
        except UnicodeDecodeError:
            archivo.seek(0)
            df = pd.read_csv(archivo, sep=',', encoding='latin-1', low_memory=False)

        df.columns = df.columns.str.strip()

        columnas_requeridas = {'CodigoEstacion', 'NombreEstacion', 'Fecha', 'Valor'}
        faltantes = columnas_requeridas - set(df.columns)
        if faltantes:
            nombre_archivo = getattr(archivo, 'name', str(archivo))
            raise ValueError(
                f"'{nombre_archivo}' no tiene las columnas requeridas: {faltantes}. "
                f"Columnas encontradas: {set(df.columns)}"
            )

        if codigo is None:
            codigo = str(df['CodigoEstacion'].iloc[0]).strip()
            nombre = str(df['NombreEstacion'].iloc[0]).strip()

        dfs.append(df)

    combinado = pd.concat(dfs, ignore_index=True)

    # ── DEBUG ──────────────────────────────────────────────────────────────────
    print("[DEBUG] Columnas:", list(combinado.columns))
    print("[DEBUG] dtype Fecha:", combinado['Fecha'].dtype)
    print("[DEBUG] Primeras 3 filas:\n", combinado[['Fecha', 'Valor']].head(3).to_string())
    print("[DEBUG] Muestra Fecha (raw):", combinado['Fecha'].dropna().head(5).tolist())

    fechas_parseadas = pd.to_datetime(combinado['Fecha'], format='%Y-%m-%d %H:%M:%S', errors='coerce')
    n_coerce = fechas_parseadas.isna().sum()
    if n_coerce == len(combinado):
        fechas_parseadas = pd.to_datetime(combinado['Fecha'], errors='coerce')
        n_coerce2 = fechas_parseadas.isna().sum()
        print(f"[DEBUG] Formato explícito falló para TODOS. Fallback inferido: {n_coerce2} NaT de {len(combinado)}")
    else:
        print(f"[DEBUG] Parseadas con formato explícito: {n_coerce} NaT de {len(combinado)}")
    combinado = combinado.copy()
    combinado['Fecha'] = fechas_parseadas
    combinado['Valor'] = pd.to_numeric(combinado['Valor'], errors='coerce')
    combinado_valido = combinado.dropna(subset=['Fecha', 'Valor'])
    print(f"[DEBUG] Filas tras dropna(Fecha,Valor): {len(combinado_valido)} de {len(combinado)}")
    anios_unicos = sorted(combinado_valido['Fecha'].dt.year.unique().tolist())
    print(f"[DEBUG] Años únicos encontrados ({len(anios_unicos)}): {anios_unicos}")
    # ── FIN DEBUG ──────────────────────────────────────────────────────────────

    # ── Detección automática de región ────────────────────────────────────────
    region = detectar_region(codigo)   # lanza ValueError si es R5
    params = REGIONES_INVIAS[region]
    nombre_region = params['nombre']

    M_mm, anos_validos = calcular_M(combinado)
    datos = calcular_idf(M_mm, params)

    return {
        'estacion': {'codigo': codigo, 'nombre': nombre},
        'n_archivos': len(archivos),
        'M_mm': round(M_mm, 2),
        'anos_validos': anos_validos,
        'region': region,
        'nombre_region': nombre_region,
        'datos': datos,
        'advertencia': (
            f'Resultado calculado con método INVIAS Ec. 2.103, '
            f'parámetros {region} ({nombre_region}). '
            f'a={params["a"]}, b={params["b"]}, c={params["c"]}, d={params["d"]}.'
        ),
    }


def procesar_csv_ideam(archivo):
    """
    Procesa un archivo CSV IDEAM y retorna las curvas IDF calculadas.

    Parámetros
    ----------
    archivo : objeto similar a file (Django InMemoryUploadedFile o ruta)

    Retorna
    -------
    dict con claves: estacion, M_mm, anos_validos, region, nombre_region,
                     datos, advertencia
    """
    try:
        df = pd.read_csv(archivo, sep=',', encoding='utf-8', low_memory=False)
    except UnicodeDecodeError:
        archivo.seek(0)
        df = pd.read_csv(archivo, sep=',', encoding='latin-1', low_memory=False)

    df.columns = df.columns.str.strip()

    columnas_requeridas = {'CodigoEstacion', 'NombreEstacion', 'Fecha', 'Valor'}
    if not columnas_requeridas.issubset(set(df.columns)):
        raise ValueError(
            f"El CSV no tiene las columnas esperadas. "
            f"Se requieren: {columnas_requeridas}. "
            f"Se encontraron: {set(df.columns)}"
        )

    codigo = str(df['CodigoEstacion'].iloc[0]).strip()
    nombre = str(df['NombreEstacion'].iloc[0]).strip()

    region = detectar_region(codigo)   # lanza ValueError si es R5
    params = REGIONES_INVIAS[region]
    nombre_region = params['nombre']

    M_mm, anos_validos = calcular_M(df)
    datos = calcular_idf(M_mm, params)

    return {
        'estacion': {'codigo': codigo, 'nombre': nombre},
        'M_mm': round(M_mm, 2),
        'anos_validos': anos_validos,
        'region': region,
        'nombre_region': nombre_region,
        'datos': datos,
        'advertencia': (
            f'Resultado calculado con método INVIAS Ec. 2.103, '
            f'parámetros {region} ({nombre_region}). '
            f'a={params["a"]}, b={params["b"]}, c={params["c"]}, d={params["d"]}.'
        ),
    }


def generar_png_idf(datos, nombre, codigo, M_mm, anos_validos, region='R1'):
    """
    Genera un PNG de curvas IDF con el mismo estilo que los PNGs precalculados
    del Producto A. Muestra la región detectada en título y footer.

    Parámetros
    ----------
    datos        : lista de dicts con keys duracion_min, T2, T5, T10, T20, T50, T100
    nombre       : nombre de la estación
    codigo       : código de la estación
    M_mm         : precipitación máxima media multianual
    anos_validos : número de años válidos usados en el cálculo
    region       : código de región INVIAS (default 'R1' para retrocompatibilidad)

    Retorna
    -------
    bytes del PNG listo para enviar como respuesta HTTP
    """
    params = REGIONES_INVIAS.get(region, REGIONES_INVIAS['R1'])
    nombre_region = params['nombre']
    a, b, c, d = params['a'], params['b'], params['c'], params['d']

    duraciones = [row['duracion_min'] for row in datos]

    fig, ax = plt.subplots(figsize=(12, 7))
    fig.patch.set_facecolor('white')
    ax.set_facecolor('white')

    # ── Curvas ──────────────────────────────────────────────────────────────
    for T in PERIODOS_T:
        key = f'T{T}'
        intensidades = [row[key] for row in datos]
        color = COLORES_T[T]
        ax.plot(
            duraciones, intensidades,
            color=color, linewidth=1.8, marker='o', markersize=5,
            label=f'Tr = {T} años',
        )
        ax.annotate(
            f'{T} años',
            xy=(duraciones[-1], intensidades[-1]),
            xytext=(4, 0), textcoords='offset points',
            color=color, fontsize=7.5, fontweight='bold', va='center',
        )

    # ── Ejes ────────────────────────────────────────────────────────────────
    ax.set_xticks(DURACIONES_MIN)
    ax.xaxis.set_major_formatter(mticker.FormatStrFormatter('%g'))
    ax.set_xlabel('Duración (min)', fontsize=12)
    ax.set_ylabel('Intensidad (mm/h)', fontsize=12)
    ax.set_xlim(left=DURACIONES_MIN[0] - 2)

    # ── Grid ────────────────────────────────────────────────────────────────
    ax.grid(True, linestyle='--', linewidth=0.5, color='#cccccc', alpha=0.8)
    ax.set_axisbelow(True)

    # ── Leyenda ─────────────────────────────────────────────────────────────
    ax.legend(
        title='Período de retorno', loc='upper right',
        fontsize=9, title_fontsize=9, framealpha=0.9, edgecolor='#cccccc',
    )

    # ── Título — ahora muestra región detectada ──────────────────────────────
    titulo_line1 = f'Curvas IDF — {nombre} [{codigo}]'
    titulo_line2 = f'Método INVIAS Ec. 2.103 | Región {region} ({nombre_region}) | M = {M_mm} mm'
    ax.set_title(f'{titulo_line1}\n{titulo_line2}', fontsize=13, fontweight='bold', pad=14)

    # ── Footer — ahora muestra parámetros de la región correcta ─────────────
    fig.text(
        0.5, 0.01,
        f'Parámetros {region} ({nombre_region}): a={a}, b={b}, c={c}, d={d} | '
        f'Fuente: IDEAM | {anos_validos} años válidos',
        ha='center', fontsize=8, color='#555555',
    )

    plt.tight_layout(rect=[0, 0.04, 1, 1])

    buf = io.BytesIO()
    fig.savefig(buf, format='png', dpi=150, bbox_inches='tight')
    plt.close(fig)
    buf.seek(0)
    return buf.read()