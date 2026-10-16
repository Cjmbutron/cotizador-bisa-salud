# Base de datos del cotizador BISA Salud (PostgreSQL)

Implementa el modelo de la sección 10 del análisis (`Analisis_Cotizador_BISA_Salud`) con las decisiones del negocio ya incorporadas. **Probado en PostgreSQL 16.** Debería funcionar en 13 o superior (usa `gen_random_uuid()` y la extensión `btree_gist`).

## Archivos y orden de ejecución

| Orden | Archivo | Contenido |
|---|---|---|
| 1 | `01_schema.sql` | 19 tablas, 6 tipos, 6 grupos de reglas de integridad (triggers), 3 vistas |
| 2 | `02_catalogos.sql` | 5 regionales, 5 productos (con moneda), 3 parentescos, 6 roles, 13 plantillas de documento |
| 3 | `03_planes_y_tarifas.sql` | **Generado** por `extraer_tarifas.py`: 45 planes, 7.406 tarifas, 90 tarifas de hijo, versión en estado `BORRADOR` |
| 4 | `04_parametros.sql` | 28 parámetros con vigencia (SARS, maternidad, descuento Red Max, contado, umbrales, Naranja+) |
| – | `extraer_tarifas.py` | Lee el Excel y genera el archivo 3. Se vuelve a usar en cada actualización de tarifas |
| – | `verificar_carga.py` | Concilia **fila por fila** la base contra el Excel. Sale con error si hay una diferencia |
| – | `05_pruebas_esquema.sql` | 32 pruebas de las reglas de integridad. Termina en `ROLLBACK`: no deja datos |

```bash
createdb cotizador
for f in 01_schema 02_catalogos 03_planes_y_tarifas 04_parametros; do psql -v ON_ERROR_STOP=1 -d cotizador -f $f.sql; done
python verificar_carga.py COTIZADOR_BISA_SALUD.xlsm "dbname=cotizador" "Tarifario 2026-05"
psql -d cotizador -f 05_pruebas_esquema.sql
```

## Resultado de las pruebas hechas

- **Carga:** los 4 scripts corren sin errores.
- **Conciliación:** 7.406 tarifas y 90 tarifas de hijo comparadas contra el Excel, **0 diferencias**.
- **Reglas de integridad:** 32 de 32 pruebas pasan.

## Qué contiene la carga de tarifas

| Origen en el Excel | Destino | Filas |
|---|---|---|
| `PRIMAS IGR RMA ADV25!B4:BB103` (5 regionales × IG, RM, AD × M, F-M, F × edades 0 a 99) | `tarifa` (mensual) | 4.500 |
| `PRIMAS MBL!A6:T87` (18 combinaciones × edades 18 a 99) | `tarifa` (mensual) | 1.476 |
| `PRIMAS MBL!V6:AO12` (18 combinaciones × 1 a 5 hijos) | `tarifa_hijo` | 90 |
| `PRIMAS ALTO RIESGO` (22 combinaciones de Naranja+, edades 0 a 64) | `tarifa` (**anual**) | 1.430 |

**No se cargan** (decisión R3): `PRIMAS IGR RMA ADV25!BE:DE`, filas 106 a 208, `PRIMA FILTRADO`, `AB9` y `DATOS LISTAS` A–L.

Convenciones que conviene conocer:
- Un **"N/A" del Excel** es una fila con `prima = NULL` y `disponible = false`. Un **0 del Excel** es `prima = 0` y `disponible = true` (por ejemplo Advance F-M en Santa Cruz, 50 a 64 años).
- **Red Max 140K y 70K no tienen tarifas propias.** Apuntan con `plan_base_id` al plan `RM_700K`, y el descuento (28 y 49) está en `parametro` con clave `RM_DESCUENTO`.
- **Naranja+ se guarda tal cual está en la tabla (anual).** La fórmula `techo(anual/12) / 1,2675 × 1,3 × 1,1` la aplica el motor con parámetros.
- Las edades 65 a 84 de Naranja+ no se cargan: esas celdas están vacías en el Excel y la regla de exclusión (mayores de 64) las deja fuera de todos modos.
- El contado de Naranja+ es `techo(anual / CONTADO_DIVISOR)`, con `CONTADO_DIVISOR = 1,1`.

## Reglas que el esquema hace cumplir por sí solo

| Regla | Mecanismo |
|---|---|
| Tarifas de una versión **publicada o archivada** no se insertan, modifican ni borran | Trigger |
| Una versión publicada **solo puede pasar a archivada**; no se borra | Trigger |
| Publicar exige **aprobador y fecha**, y **el aprobador no puede ser quien la creó** | `CHECK` |
| Dos versiones publicadas **no pueden solaparse** en el tiempo | Restricción de exclusión |
| Una tarifa no se repite para la misma versión, plan, regional, sexo y edad | Restricción de exclusión |
| Un parámetro no tiene dos valores vigentes a la vez | Restricción de exclusión |
| Máximo 1 titular, 1 cónyuge, 5 dependientes, 7 asegurados; edad 0 a 99 | Trigger y `CHECK` |
| Un dependiente **no** puede tener maternidad | Trigger |
| Una cotización **emitida** no cambia sus datos ni sus resultados; solo puede anularse | Triggers |
| La auditoría es **solo inserción** | Trigger |
| Una línea `OK` tiene prima; una `NO_DISPONIBLE` o `EXCLUIDO` tiene motivo | `CHECK` |

## Cómo se actualizan las tarifas (sin tocar código)

1. Con el nuevo Excel (o una plantilla equivalente): `python extraer_tarifas.py nuevo.xlsm 03_nueva.sql --version "Tarifario 2026-11" --desde 2026-11-01`. Ejecutar el SQL generado. Queda en `BORRADOR`.
2. `python verificar_carga.py nuevo.xlsm "dbname=cotizador" "Tarifario 2026-11"`: debe terminar en 0 diferencias.
3. Revisión: comparar contra la versión vigente con `v_tarifa_detalle`.
4. Un **aprobador distinto del creador** cambia `estado` a `PUBLICADA` con `aprobado_por` y `aprobado_en`. Antes, la versión anterior debe tener `vigente_hasta` igual al `vigente_desde` de la nueva (el solapamiento se rechaza).
5. Las cotizaciones ya emitidas siguen apuntando a su versión original.

> En la aplicación final, los pasos 1 a 4 serán pantallas de administración. Estos scripts son la carga inicial y la herramienta de conciliación.

## Consultas de ejemplo (probadas)

```sql
-- Tarifa Infinity, La Paz, mujer sin maternidad, 28 años  → 71
SELECT prima FROM v_tarifa_detalle
 WHERE plan='IG' AND region='LPZ' AND sexo='F' AND 28 BETWEEN edad_desde AND edad_hasta
   AND version='Tarifario 2026-05';

-- Red Max Bs. 140.000, La Paz, hombre de 30: tarifa del plan base menos el descuento → 384
SELECT t.prima - d.valor
  FROM plan p JOIN plan b ON b.id = p.plan_base_id
  JOIN tarifa t ON t.plan_id = b.id JOIN region r ON r.id = t.region_id
  JOIN parametro d ON d.plan_id = p.id AND d.clave = 'RM_DESCUENTO'
 WHERE p.codigo='RM_140K' AND r.codigo='LPZ' AND t.sexo='M' AND t.edad_desde=30;

-- Mundial Blue, prima por hijo (1 MM, deducible 5.000, 1 hijo → 44; 2 MM, 1.000, 3 hijos → 130)
SELECT p.codigo, h.numero_hijos, h.prima_por_hijo FROM tarifa_hijo h JOIN plan p ON p.id = h.plan_id
 WHERE (p.codigo='MB_1MM_5K' AND numero_hijos=1) OR (p.codigo='MB_2MM_1K' AND numero_hijos=3);

-- Naranja+ Mundial con Bolivia, 1 MM, deducible 10.000, 30 años → 353 anual
SELECT prima, periodicidad FROM v_tarifa_detalle WHERE plan='NP_MB_1MM_10K' AND edad_desde=30;
```

## Pendientes y supuestos

- **Fecha de vigencia inicial 2026-05-01.** Se tomó de la fecha del archivo (`01-05-2026`). Ajustar con `--desde` y en `04_parametros.sql`.
- **Los parámetros con plan_id y producto_id se cargan después de las tarifas** porque dependen de los planes.
- **Usuarios y autenticación:** la tabla `usuario` queda vacía. En producción se enlaza con el proveedor de identidad corporativo (pendiente con TI).
- **Cifrado, backups y privilegios** (roles de base de datos) no están en estos scripts; dependen del entorno de despliegue.
- Un cambio de redondeo o de reglas de edad **no** requiere cambiar el esquema: son parámetros o lógica del motor.
