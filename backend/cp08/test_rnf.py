"""
Pruebas automatizadas de Requisitos No Funcionales (RNF-03, 04, 05, 06, 08).
Ejecutar:  pytest cp08\test_rnf.py -v
"""
import inspect
import os
import re
import socket
import subprocess
import sys
import textwrap
import time
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

if os.environ.get("DJANGO_SETTINGS_MODULE"):
    import django
    django.setup()

from curvas_idf import utils
from curvas_idf.utils import calcular_M, calcular_idf, detectar_region

# ============================================================
# ADAPTADOR  -->  AJUSTAR SOLO ESTA SECCIÓN A TU CÓDIGO REAL
# ============================================================
COL_FECHA = "Fecha"          # nombre de la columna de fecha en tu DataFrame
COL_VALOR = "Valor"          # nombre de la columna de precipitación (mm)
ESTACION_R4 = "32075050"     # Mesetas, R4
ESTACION_R4_B = "37055010"   # R4
M_MESETAS = 103.548
CSV_MESETAS = None           # p.ej. Path(__file__).parent / "datos" / "32075050.csv" (None = se omite)
UMBRAL_SEGUNDOS = 10


R4_PARAMS = dict(a=5.53, b=0.17, c=0.63, d=0.42)  # Tabla 2.12 INVIAS, igual que en cp07


def ejecutar_flujo(df, codigo=ESTACION_R4):
    """Replica el flujo principal: región -> M -> tabla IDF.
    Devuelve (M, n_validos, region, tabla_idf)."""
    region = detectar_region(codigo)
    M, n_validos, outliers, adv = calcular_M(df)
    tabla = calcular_idf(M, R4_PARAMS)
    return M, n_validos, region, tabla

def separar(tabla):
    """Separa la columna de duración (min) de las intensidades (mm/h)."""
    t = np.asarray(tabla, dtype=float)
    return t[:, 0], t[:, 1:]

def a_array(tabla):
    """Convierte la tabla IDF a ndarray (filas = duraciones, columnas = T)."""
    return np.asarray(pd.DataFrame(tabla), dtype=float)
# ============================================================


def generar_serie(anios=30, semilla=42, inicio=1990):
    """Serie diaria sintética sin faltantes, fechas ISO."""
    rng = np.random.default_rng(semilla)
    fechas = pd.date_range(f"{inicio}-01-01", periods=anios * 365, freq="D")
    valores = rng.gamma(shape=0.8, scale=9.0, size=len(fechas)).round(1)
    return pd.DataFrame({COL_FECHA: fechas.strftime("%Y-%m-%d"), COL_VALOR: valores})


@pytest.fixture(scope="module")
def serie_normal():
    return generar_serie(30)


# ------------------------------------------------------------
# RNF-03 — Rendimiento (< 10 s)
# ------------------------------------------------------------
@pytest.mark.parametrize("anios", [30, 100])
def test_rnf03_tiempo_flujo_completo(anios):
    df = generar_serie(anios)
    t0 = time.perf_counter()
    ejecutar_flujo(df)
    dt = time.perf_counter() - t0
    assert dt < UMBRAL_SEGUNDOS, f"{anios} años tardó {dt:.2f}s (máx {UMBRAL_SEGUNDOS}s)"


# ------------------------------------------------------------
# RNF-04 — Confidencialidad
# ------------------------------------------------------------
def test_rnf04_no_escribe_archivos(serie_normal, tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    ejecutar_flujo(serie_normal)
    assert list(tmp_path.iterdir()) == [], "El flujo creó archivos en disco"


def test_rnf04_no_usa_red(serie_normal, monkeypatch):
    def _bloqueado(*a, **k):
        raise AssertionError("Intento de conexión de red detectado")
    monkeypatch.setattr(socket.socket, "connect", _bloqueado)
    monkeypatch.setattr(socket, "create_connection", _bloqueado)
    ejecutar_flujo(serie_normal)


def test_rnf04_no_registra_datos_en_logs(caplog):
    marcador = 987.654          # valor distintivo
    df = generar_serie(25)
    df.loc[10, COL_VALOR] = marcador
    with caplog.at_level("DEBUG"):
        ejecutar_flujo(df)
    assert "987.654" not in caplog.text, "Un dato del CSV apareció en los logs"


def test_rnf04_utils_sin_imports_de_red_ni_persistencia():
    fuente = inspect.getsource(utils)
    prohibidos = [r"\bimport requests\b", r"\burllib\b", r"http\.client",
                  r"\bimport socket\b", r"\bsqlite3\b", r"\.to_csv\(",
                  r"\.to_pickle\(", r"\.to_excel\(", r"open\([^)]*['\"]w"]
    hallados = [p for p in prohibidos if re.search(p, fuente)]
    assert not hallados, f"utils.py contiene patrones prohibidos: {hallados}"


# ------------------------------------------------------------
# RNF-05 — Integridad / reproducibilidad
# ------------------------------------------------------------
def test_rnf05_misma_entrada_mismo_resultado(serie_normal):
    r1 = ejecutar_flujo(serie_normal.copy())
    r2 = ejecutar_flujo(serie_normal.copy())
    assert r1[0] == r2[0]                      # M exacto
    assert r1[1] == r2[1] and r1[2] == r2[2]   # n_validos y región
    np.testing.assert_array_equal(a_array(r1[3]), a_array(r2[3]))


def test_rnf05_reproducible_entre_procesos():
    """Dos procesos distintos (distinto PYTHONHASHSEED) deben dar igual resultado."""
    script = textwrap.dedent(f"""
        import sys; sys.path.insert(0, r"{Path(__file__).resolve().parents[1]}")
        from cp08.test_rnf import generar_serie, ejecutar_flujo, a_array
        M, n, reg, tabla = ejecutar_flujo(generar_serie(30))
        print(repr(M), n, reg, a_array(tabla).tolist())
    """)
    salidas = []
    for seed in ("0", "12345"):
        env = {**__import__("os").environ, "PYTHONHASHSEED": seed}
        p = subprocess.run([sys.executable, "-c", script], capture_output=True,
                           text=True, env=env, timeout=60)
        assert p.returncode == 0, p.stderr
        salidas.append(p.stdout)
    assert salidas[0] == salidas[1]


def test_rnf05_orden_de_filas_no_cambia_M(serie_normal):
    barajado = serie_normal.sample(frac=1, random_state=1).reset_index(drop=True)
    assert ejecutar_flujo(serie_normal)[0] == pytest.approx(ejecutar_flujo(barajado)[0], rel=1e-12)


# Robustez ante entradas inválidas: error controlado, no cuelgue ni traza críptica
def test_rnf05_menos_de_20_anios_error_controlado():
    with pytest.raises(ValueError):
        calcular_M(generar_serie(10))


def test_rnf05_dataframe_vacio_error_controlado():
    vacio = pd.DataFrame({COL_FECHA: [], COL_VALOR: []})
    with pytest.raises((ValueError, KeyError)):
        calcular_M(vacio)


# ------------------------------------------------------------
# RNF-06 — Control de acceso (sin autenticación)
# ------------------------------------------------------------
def test_rnf06_sin_logica_de_autenticacion():
    fuente = inspect.getsource(utils).lower()
    for patron in ("jwt", "oauth", "password", "login", "api_key", "authorization"):
        assert patron not in fuente, f"utils.py menciona '{patron}'"


def test_rnf06_endpoint_accesible_sin_credenciales():
    """Solo aplica si tienes una app FastAPI/Flask. Ajusta el import."""
    try:
        from main import app                      # <-- ajusta módulo
        from fastapi.testclient import TestClient
    except ImportError:
        pytest.skip("No hay app web importable; omitido")
    r = TestClient(app).get("/")
    assert r.status_code not in (401, 403)


# ------------------------------------------------------------
# RNF-08 — Cumplimiento normativo (Ec. 2.103 / Tabla 2.12)
# Propiedades que cualquier implementación fiel de una ley potencial debe cumplir,
# sin depender de los valores de los parámetros.
# ------------------------------------------------------------
@pytest.fixture(scope="module")
def tabla_r4(serie_normal):
    return a_array(ejecutar_flujo(serie_normal)[3])


def test_rnf08_intensidad_decrece_con_duracion(tabla_r4):
    dur, I = separar(tabla_r4)
    assert np.all(np.diff(dur) > 0)
    assert np.all(np.diff(I, axis=0) < 0)

def test_rnf08_intensidad_crece_con_periodo_retorno(tabla_r4):
    _, I = separar(tabla_r4)
    assert np.all(np.diff(I, axis=1) > 0)


def test_rnf08_ley_potencial_en_T(tabla_r4):
    """Con I = a·T^b·..., log(I) es lineal en log(T): pendiente b igual para toda duración."""
    T = np.array([2, 5, 10, 20, 50, 100], dtype=float)
    _, I = separar(tabla_r4)
    assert I.shape[1] == len(T)
    pendientes = [np.polyfit(np.log(T), np.log(fila), 1)[0] for fila in I]
    np.testing.assert_allclose(pendientes, pendientes[0], rtol=1e-3)


def test_rnf08_ley_potencial_en_M():
    """I ∝ M^d: duplicar M escala toda la tabla por 2^d (constante en toda la tabla)."""
    _, I1 = separar(a_array(calcular_idf(50.0, R4_PARAMS)))
    _, I2 = separar(a_array(calcular_idf(100.0, R4_PARAMS)))
    razon = I2 / I1
    np.testing.assert_allclose(razon, razon[0, 0], rtol=1e-3)

@pytest.mark.skipif(CSV_MESETAS is None, reason="Define CSV_MESETAS para el valor dorado")
def test_rnf08_valor_dorado_mesetas():
    df = pd.read_csv(CSV_MESETAS)                 # ajusta lectura/parseo si hace falta
    M, n, outliers, adv = calcular_M(df)
    assert n == 25
    assert M == pytest.approx(M_MESETAS, abs=1e-3)


def test_rnf08_region_estaciones_referencia():
    assert detectar_region(ESTACION_R4) == detectar_region(ESTACION_R4_B)  # ambas R4


def test_rnf08_no_hay_valores_inventados_para_R5_ni_codigo_desconocido():
    with pytest.raises(ValueError):
        detectar_region("99999999")               # fuera de catálogo
    # Para R5: reemplaza por un código real de tu catálogo en R5
    # with pytest.raises(ValueError): detectar_region("<codigo_R5>")