from django.urls import path
from . import views

urlpatterns = [
    path('', views.index, name='index'),
    path('api/estaciones/', views.estaciones, name='estaciones'),
    path('api/idf/<path:carpeta>/', views.idf_estacion, name='idf_estacion'),
    path('api/calcular/', views.calcular, name='calcular'),
    path('api/calcular/png/', views.calcular_png, name='calcular_png'),
    path('api/resumen/', views.resumen, name='resumen'),
    path('api/png/<str:tipo>/<path:carpeta>/', views.png_producto, name='png_producto'),
    path('api/imagen/<str:producto>/<path:carpeta>/', views.imagen_producto, name='imagen_producto'),
]
