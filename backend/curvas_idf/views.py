import os
import pandas as pd
from django.conf import settings
from django.http import FileResponse, HttpResponse
from django.shortcuts import render
from django.views.decorators.http import require_GET
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status

from .utils import procesar_csvs_ideam, generar_png_idf

DATA_DIR = settings.DATA_DIR
IDEAM_CSV = DATA_DIR / 'ideam' / 'estaciones.csv'
PROD_A_DIR = DATA_DIR / 'resultados' / 'producto_a'
RESUMEN_A = PROD_A_DIR / 'tabla_M_estaciones.csv'


def _cargar_estaciones():
    return pd.read_csv(IDEAM_CSV, dtype={'codigo': str})


def index(request):
    return render(request, 'curvas_idf/index.html')


@api_view(['GET'])
def estaciones(request):
    """
    GET /api/estaciones/
    Retorna lista de las 30 estaciones con coordenadas y disponibilidad de productos.
    """
    df = _cargar_estaciones()

    archivos_a = set(os.listdir(PROD_A_DIR)) if PROD_A_DIR.exists() else set()

    resultado = []
    for _, row in df.iterrows():
        carpeta = row['carpeta']
        resultado.append({
            'codigo': str(row['codigo']),
            'carpeta': carpeta,
            'nombre_ideam': row['nombre_ideam'],
            'latitud': float(row['latitud']),
            'longitud': float(row['longitud']),
            'municipio': row['municipio'],
            'tiene_producto_a': f'IDF_{carpeta}.csv' in archivos_a,

        })

    return Response(resultado)


@api_view(['GET'])
def idf_estacion(request, carpeta):
    """
    GET /api/idf/<carpeta>/
    Retorna curvas IDF de ambos productos para una estación.
    """
    df_est = _cargar_estaciones()
    fila = df_est[df_est['carpeta'] == carpeta]

    if fila.empty:
        return Response({'error': f'Estación "{carpeta}" no encontrada.'}, status=status.HTTP_404_NOT_FOUND)

    fila = fila.iloc[0]
    estacion_info = {
        'codigo': str(fila['codigo']),
        'nombre_ideam': fila['nombre_ideam'],
        'carpeta': fila['carpeta'],
        'municipio': fila['municipio'],
        'latitud': float(fila['latitud']),
        'longitud': float(fila['longitud']),
    }

    # Producto A
    producto_a = None
    ruta_a = PROD_A_DIR / f'IDF_{carpeta}.csv'
    if ruta_a.exists():
        df_a = pd.read_csv(ruta_a)
        M_mm = float(df_a['M_mm'].iloc[0])

        anos_validos = None
        if RESUMEN_A.exists():
            df_res = pd.read_csv(RESUMEN_A)
            fila_res = df_res[df_res['carpeta'] == carpeta]
            if not fila_res.empty:
                anos_validos = int(fila_res['anos_validos'].iloc[0])

        datos_a = []
        for _, r in df_a.iterrows():
            datos_a.append({
                'duracion_min': int(r['Duracion_min']),
                'T2': round(float(r['T2']), 2),
                'T5': round(float(r['T5']), 2),
                'T10': round(float(r['T10']), 2),
                'T20': round(float(r['T20']), 2),
                'T50': round(float(r['T50']), 2),
                'T100': round(float(r['T100']), 2),
            })

        producto_a = {
            'M_mm': round(M_mm, 2),
            'anos_validos': anos_validos,
            'datos': datos_a,
        }



    return Response({
        'estacion': estacion_info,
        'producto_a': producto_a,
    })


@api_view(['GET'])
def resumen(request):
    """
    GET /api/resumen/
    Retorna datos resumen de ambos productos para todas las estaciones (para Reportes).
    """
    df_est = _cargar_estaciones()

    resumen_a = {}
    if RESUMEN_A.exists():
        df_a = pd.read_csv(RESUMEN_A)
        for _, r in df_a.iterrows():
            resumen_a[r['carpeta']] = {
                'M_mm': round(float(r['M_mm']), 2),
                'anos_validos': int(r['anos_validos']),
                'i_T10_t60': round(float(r['i_T10_t60']), 2),
                'i_T100_t10': round(float(r['i_T100_t10']), 2),
            }

 

    resultado = []
    for _, row in df_est.iterrows():
        carpeta = row['carpeta']
        resultado.append({
            'carpeta': carpeta,
            'codigo': str(row['codigo']),
            'nombre_ideam': row['nombre_ideam'],
            'municipio': row['municipio'],
            'latitud': float(row['latitud']),
            'longitud': float(row['longitud']),
            'producto_a': resumen_a.get(carpeta),
        })

    return Response(resultado)


@api_view(['POST'])
def calcular(request):
    """
    POST /api/calcular/
    Recibe uno o varios CSVs IDEAM, los concatena, aplica criterio OMM,
    detecta la región INVIAS automáticamente y retorna las curvas IDF.
    """
    archivos = request.FILES.getlist('archivos') or request.FILES.getlist('archivo')

    if not archivos:
        archivos = list(request.FILES.values())

    if not archivos:
        return Response(
            {'error': 'No se recibió ningún archivo. Envía los CSV con el campo "archivos".'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        resultado = procesar_csvs_ideam(archivos)
    except Exception as exc:
        return Response({'error': str(exc)}, status=status.HTTP_422_UNPROCESSABLE_ENTITY)

    return Response(resultado)


@api_view(['POST'])
def calcular_png(request):
    """
    POST /api/calcular/png/
    Recibe los datos IDF ya calculados (JSON) y devuelve un PNG generado
    con matplotlib con el mismo estilo que los PNGs precalculados.

    Body JSON esperado:
      {
        "estacion": {"codigo": "...", "nombre": "..."},
        "M_mm": 75.4,
        "anos_validos": 35,
        "region": "R1",
        "datos": [{"duracion_min": 10, "T2": ..., ...}, ...]
      }
    """
    body = request.data
    try:
        estacion     = body['estacion']
        codigo       = str(estacion['codigo'])
        nombre       = str(estacion['nombre'])
        M_mm         = float(body['M_mm'])
        anos_validos = int(body['anos_validos'])
        datos        = list(body['datos'])
        # region viene del resultado de /api/calcular/ — default R1 para retrocompatibilidad
        region       = str(body.get('region', 'R1'))
    except (KeyError, TypeError, ValueError) as exc:
        return Response(
            {'error': f'Datos inválidos: {exc}'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        png_bytes = generar_png_idf(datos, nombre, codigo, M_mm, anos_validos, region)
    except Exception as exc:
        return Response({'error': str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    filename = f'IDF_{codigo}.png'
    response = HttpResponse(png_bytes, content_type='image/png')
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    return response


@api_view(['GET'])
def png_producto(request, tipo, carpeta):
    """
    GET /api/png/<tipo>/<carpeta>/
    Sirve el PNG precalculado de un producto. tipo: 'a' | 'c'
    """
    if tipo == 'a':
        ruta = PROD_A_DIR / f'IDF_{carpeta}.png'
    if not ruta.exists():
        return Response({'error': 'Archivo PNG no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

    return FileResponse(open(ruta, 'rb'), content_type='image/png')


@require_GET
def imagen_producto(request, producto, carpeta):
    """
    GET /api/imagen/<producto>/<carpeta>/
    Sirve el PNG precalculado como descarga. producto: 'a' | 'c'
    """
    if producto == 'a':
        ruta = PROD_A_DIR / f'IDF_{carpeta}.png'
        filename = f'IDF_{carpeta}.png'
    if not ruta.exists():
        return HttpResponse(f'PNG no encontrado: {ruta}', status=404)

    return FileResponse(open(ruta, 'rb'), content_type='image/png', as_attachment=True, filename=filename)