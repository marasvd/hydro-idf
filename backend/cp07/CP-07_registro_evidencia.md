# CP-07 - Verificar el calculo correcto del parametro M

Referencia: Manual de Drenaje INVIAS, 2.6.6.3, Ec. 2.103, Tabla 2.12, ejemplo Mesetas.
Formula: i = (a * T^b * M^d) / (t/60)^c - R4: a=5.53, b=0.17, c=0.63, d=0.42
Evidencia: resultado_pytest.txt y dataset mesetas_sintetico.csv (estacion 32075050).

## Resultados
| ID | Verificacion | Esperado | Obtenido | Estado |
|---|---|---|---|---|
| CP-07.0 | Referencia del manual coherente | M=103.55 | Coherente | Aprobado |
| CP-07.1 | calcular_M con Mesetas | M=103.55; 25 anios | M=103.548; 25 anios | Aprobado |
| CP-07.2 | M distinto de 148.5 y de 102.03 | Se cumple | 2001 excluido | Aprobado |
| CP-07.3 | intensidad() vs 12 pares del manual | Dif <= 0.15 mm/h | Cumple | Aprobado |
| CP-07.4 | calcular_idf() | Tabla = manual | 135.05/157.82/177.55/199.76/233.43/262.62 (t=10) | Aprobado |
| CP-07.5 | Fechas de formato mixto (H-06) | M=103.55 | ValueError: 0 anios validos | Fallado |
| CP-07.6 | Estacion fuera de catalogo (H-07) | Error o aviso | Devuelve R1 con print en consola | Fallado |
| CP-07.7 | Region de 32075050 | R4 | Ver resultado_pytest.txt (test_07) | COMPLETAR |

## Alcance y limitaciones
- Se probaron calcular_M e intensidad() por separado. No se probo el flujo completo /api/calcular/.
- Dataset sintetico (un dia pico por anio). No valida datos reales de DHIME.
- Rosner no detecto atipicos en este dataset; su deteccion no fue probada.

## Decisiones pendientes
1. RF-06 dice T=25; el software entrega T=20 (coincide con el manual).
2. Criterio de anio incompleto (>10 % faltante): decision del proyecto.
3. H-06 y H-07: corregir o aceptar como limitacion documentada.

## Dictamen
CP-07 aprobado para el calculo de M y su uso en la Ec. 2.103, con las limitaciones anteriores.
Hallazgos abiertos: H-06 (parcial) y H-07 (confirmado, afecta RF-04).
