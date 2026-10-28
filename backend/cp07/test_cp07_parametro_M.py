"""
CP-07: Verificar el cálculo correcto del parámetro M (HYDRO-IDF, INVIAS Ec. 2.103)

Ejecutar desde la carpeta backend (donde está manage.py):
    $env:DJANGO_SETTINGS_MODULE="config.settings"
    python -m pytest cp07/test_cp07_parametro_M.py -v -rA

Los valores esperados vienen del Manual INVIAS (ejemplo Mesetas), NO del software.
Los coeficientes de R4 están escritos aquí a propósito para que la prueba sea independiente.
"""
import importlib, os, sys
import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, os.path.dirname(__file__))
from generar_mesetas import generar, MAXIMOS, ANIO_INCOMPLETO

if os.environ.get("DJANGO_SETTINGS_MODULE"):
    import django
    django.setup()
utils = importlib.import_module(os.environ.get("HYDRO_UTILS_MODULE", "curvas_idf.utils"))

R4 = dict(a=5.53, b=0.17, c=0.63, d=0.42)  # Tabla 2.12 INVIAS
M_MANUAL = 103.55
# Valores del manual (mm/h): (T, t) -> i. La columna T=20 del manual no se compara con T=25.
MANUAL = {(2, 10): 135.1, (5, 10): 157.8, (10, 10): 177.5, (50, 10): 233.4,
          (100, 10): 262.6, (2, 60): 43.7, (10, 60): 57.4, (100, 60): 84.9,
          (2, 180): 21.9, (10, 180): 28.7, (50, 180): 37.8, (100, 180): 42.5}


def extraer_M(res):
    """calcular_M puede devolver float, tupla o dict: se normaliza y se imprime qué devolvió."""
    print(f"\n[calcular_M devolvió: {type(res).__name__} -> {res!r}]")
    if isinstance(res, dict):
        for k in ("M_mm", "M", "m"):
            if k in res:
                return float(res[k]), res
    if isinstance(res, (tuple, list)):
        return float(res[0]), res
    return float(res), res


def test_00_referencia_manual_es_consistente():
    vals = [v for a, v in MAXIMOS.items() if a != ANIO_INCOMPLETO]
    assert len(vals) == 25
    assert np.mean(vals) == pytest.approx(M_MANUAL, abs=0.01)
    for (T, t), esperado in MANUAL.items():
        i = R4["a"] * T ** R4["b"] * M_MANUAL ** R4["d"] / (t / 60) ** R4["c"]
        assert i == pytest.approx(esperado, abs=0.15), f"T={T}, t={t}"


def test_01_calcular_M_mesetas():
    """M debe ser 103.55 con 25 años válidos (2001 excluido por >10 % faltante)."""
    M, _ = extraer_M(utils.calcular_M(generar()))
    assert M == pytest.approx(M_MANUAL, abs=0.01), (
        f"M={M:.2f}. Pistas: 102.03 -> NO excluyó 2001 | 148.5 -> usó el máximo absoluto")


def test_02_M_no_es_maximo_absoluto_ni_incluye_2001():
    M, _ = extraer_M(utils.calcular_M(generar()))
    assert abs(M - 148.5) > 1
    assert abs(M - 102.03) > 0.05


def test_03_intensidades_contra_tabla_manual():
    fallos = []
    for (T, t), esperado in MANUAL.items():
        i = utils.intensidad(T, t, M_MANUAL, R4)
        if abs(i - esperado) > 0.15:
            fallos.append((T, t, round(i, 2), esperado))
    assert not fallos, f"(T, t, obtenido, manual): {fallos}"


def test_04_calcular_idf_tabla_completa():
    tabla = utils.calcular_idf(M_MANUAL, R4)
    print(f"\n[calcular_idf devolvió: {type(tabla).__name__}]")
    df = tabla if isinstance(tabla, pd.DataFrame) else pd.DataFrame(tabla)
    print(df.head(3).to_string())
    assert df.size > 0


def test_05_H06_fechas_mixtas_no_alteran_M():
    M, _ = extraer_M(utils.calcular_M(generar(mixto=True)))
    assert M == pytest.approx(M_MANUAL, abs=0.01), (
        "H-06 CONFIRMADO: fechas de formato mixto alteran M.")


def test_06_H07_estacion_fuera_de_catalogo_no_cae_en_R1_en_silencio():
    try:
        r = utils.detectar_region(99999999)
    except Exception as e:
        print(f"\n[Lanza excepción (comportamiento deseado): {e!r}]")
        return
    print(f"\n[detectar_region(99999999) devolvió: {r!r}]")
    assert r not in ("R1", "Andina", 1), "H-07 CONFIRMADO: fallback silencioso a Región Andina."


def test_07_region_mesetas_es_R4():
    try:
        r = utils.detectar_region(32075050)
    except Exception as e:
        pytest.skip(f"Mesetas no está en el catálogo o falló: {e!r}")
    assert str(r).upper() in ("R4", "4", "ORINOQUIA", "ORINOQUÍA"), f"Región detectada: {r!r}"

