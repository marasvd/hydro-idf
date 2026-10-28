"""
Genera el dataset sintético de Mesetas (Manual de Drenaje INVIAS, ejemplo 2.6.6.3).
- Datos diarios, un día pico por año = máximo anual del manual; resto 0.0
- 2001: se elimina cerca del 18 % de los días (>10 % faltante) -> debe descartarse
- Resultado esperado de M: 103.55 mm con 25 años válidos
Uso: python generar_mesetas.py   (escribe mesetas_sintetico.csv en la carpeta actual)
"""
import pandas as pd

MAXIMOS = {1983: 87.6, 1984: 104.3, 1985: 88.0, 1986: 91.6, 1987: 90.4,
           1988: 99.5, 1989: 145.0, 1990: 118.0, 1991: 148.5, 1992: 84.0,
           1993: 104.0, 1994: 88.0, 1995: 120.8, 1996: 95.0, 1997: 99.0,
           1998: 83.0, 1999: 135.0, 2000: 81.0, 2001: 64.0, 2002: 88.0,
           2004: 96.0, 2005: 140.0, 2006: 101.0, 2007: 91.0, 2008: 110.0,
           2009: 100.0}
ANIO_INCOMPLETO = 2001
CODIGO, NOMBRE = 32075050, "MESETAS"


def generar(formato="%Y-%m-%d %H:%M:%S", mixto=False):
    filas = []
    for anio, pico in MAXIMOS.items():
        dias = pd.date_range(f"{anio}-01-01", f"{anio}-12-31", freq="D")
        df = pd.DataFrame({"Fecha": dias, "Valor": 0.0})
        df.loc[df.index[180], "Valor"] = pico  # día pico (~1 de julio)
        if anio == ANIO_INCOMPLETO:  # quitar días conservando el pico
            quitar = df.index[::7].difference([180])
            quitar = quitar.union(df.index[3::25].difference([180]))
            df = df.drop(quitar)
        filas.append(df)
    df = pd.concat(filas, ignore_index=True)
    df.insert(0, "NombreEstacion", NOMBRE)
    df.insert(0, "CodigoEstacion", CODIGO)
    df["Fecha"] = df["Fecha"].dt.strftime(formato)
    if mixto:  # H-06: primera fila con hora, el resto solo fecha
        df.loc[df.index[1:], "Fecha"] = pd.to_datetime(
            df.loc[df.index[1:], "Fecha"]).dt.strftime("%Y-%m-%d")
    return df


if __name__ == "__main__":
    df = generar()
    df.to_csv("mesetas_sintetico.csv", index=False)
    d = pd.to_datetime(df["Fecha"])
    f2001 = 1 - (d.dt.year == 2001).sum() / 365
    print(f"Filas: {len(df)}  | Faltante 2001: {f2001:.1%}")
    valores = [v for a, v in MAXIMOS.items() if a != ANIO_INCOMPLETO]
    print(f"M esperado (manual): {sum(valores) / 25:.3f}")

