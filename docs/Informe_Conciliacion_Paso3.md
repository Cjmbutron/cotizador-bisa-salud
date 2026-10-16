# Informe de conciliación masiva (Paso 3): motor de precios contra el Excel

**Fecha:** 8 de octubre de 2026 · **Motor probado:** `@bisa/motor-precios` 0.1.0 · **Excel:** `COTIZADOR_BISA_SALUD_-_01-05-2026.xlsm`

## 1. Resultado

| | |
|---|---|
| Escenarios recalculados en el Excel | **53** |
| Primas comparadas (7 asegurados × 5 productos × 53) | **1.855** |
| Idénticas | **1.768** (95,3 %) |
| Diferentes | **87**, todas explicadas por una decisión del negocio o por un defecto del Excel |
| Diferencias sin explicar | **0** |

La prueba automática `test/conciliacion.test.ts` **falla** si aparece cualquier diferencia que no esté en las cuatro categorías de la sección 3. Si un cambio futuro altera una regla, el aviso es inmediato.

**La puerta de calidad del Paso 3 se cumple** con las limitaciones de la sección 6. El motor está listo para construir la API encima.

## 2. Qué se cubrió

| Producto | Escenarios | Qué prueban |
|---|---|---|
| Mundial Blue | 18 | Las **18 combinaciones** de cobertura (1 MM, 2 MM, 5 MM) y deducible (1K a 20K). Cada una con 7 asegurados: 17, 18, 24, 25, 40, 74 y 75 años (umbrales de adulto, último año con tarifa y primer año sin tarifa) y número de hijos de 1 a 5 rotando |
| Naranja+ | 22 | Las **22 combinaciones comercializables** (Bolivia 6, Mundial incluyendo Bolivia 16). Edades 0, 1, 18 y 19 con maternidad, 30, 64 y 65 |
| Infinity, Red Max, Advance | 13 | Las **5 regionales** con SARS SI y NO, los **3 planes** de Red Max, bordes de maternidad (18, 19, 49, 50 años) y edades de 0 a 99 repartidas por sexo |

Cada escenario calcula los cinco productos a la vez, así que todos reciben además las edades de los demás. Las tarifas ya estaban conciliadas fila por fila entre la base de datos y el Excel (7.406 tarifas, 0 diferencias); este informe verifica las **fórmulas** que las usan: elección de columna, umbrales, recargos, descuentos y redondeos.

## 3. Las diferencias, por categoría

| Categoría | Cantidad | Origen | Qué hace el sistema nuevo |
|---|---|---|---|
| **Maternidad en Infinity y Red Max** | 60 | Decisión 17.5: tarifa sin maternidad + extra prima (USD 20 / Bs. 140), en lugar de la columna con maternidad | Distinto al Excel, a propósito |
| **Redondeo de la prima por hijo de Mundial Blue** | 20 | Decisión R6: entero superior (el Excel deja decimales) | Distinto al Excel, a propósito |
| **Error del Excel en Infinity con SARS = SI** | 6 | El Excel muestra `#VALUE!` | El sistema responde "No disponible" |
| **Advance con maternidad fuera de 19–49** | 1 | Decisión P1: "No disponible" en las cinco regionales (el Excel daba 0 en Santa Cruz) | Distinto al Excel, a propósito |

### 3.1 Maternidad: el cambio es más grande de lo que parecía

De las 42 mujeres con maternidad dentro de los 19 a 49 años que aparecen en la conciliación, **Red Max cambia en las 42** (el Excel nunca daba exactamente Bs. 140 de diferencia) e **Infinity cambia en 18** (en las otras 24 la diferencia del Excel era justo USD 20).

| Producto y regional | Diferencia sistema − Excel | Casos |
|---|---|---|
| Infinity, La Paz | −4 a +10 | 2 |
| Infinity, Cochabamba | −6 a +11 | 4 |
| Infinity, Santa Cruz | −13 a +11 | 4 |
| Infinity, Chuquisaca y Tarija | −7 a +14 | 8 |
| Red Max, La Paz | −32 a +73 | 26 |
| Red Max, Cochabamba | −47 a +80 | 4 |
| Red Max, Santa Cruz | −85 a +80 | 4 |
| Red Max, Chuquisaca y Tarija | −47 a +95 | 8 |

**Patrón:** el sistema nuevo cobra **menos** que el Excel a las mujeres de edad media (alrededor de 35 años) y **más** a las de 49 años. Ejemplos de las diferencias extremas: Red Max en Santa Cruz a los 35 años baja Bs. 85; Red Max en Chuquisaca o Tarija a los 49 años sube Bs. 95. Esto ocurre porque la diferencia real entre las dos tarifas del Excel crece con la edad, mientras que la extra prima nueva es fija.

> **Recomendación:** el negocio ya aceptó este cambio, pero conviene que el área técnica de seguros revise las cifras de **35 y 49 años** de Red Max antes de salir a producción. Una extra prima fija subvalora la maternidad de las mujeres de edad media y sobrevalora a las de 49 años en relación con el tarifario actual.

### 3.2 Redondeo de Mundial Blue

20 primas por hijo en 10 escenarios. La diferencia máxima es de **+0,80** por hijo (por ejemplo, 24,5 pasa a 25 y 72,5 pasa a 73). Es el efecto esperado de la decisión R6.

### 3.3 Hallazgo nuevo: el Excel falla en Infinity con SARS = SI

Cuando **SARS = SI** y algún asegurado **no tiene tarifa de Infinity** (mayor de 64 años, o mujer con maternidad fuera de 19 a 49), el Excel muestra **`#VALUE!`** en la prima de esa persona **y en todo el total de Infinity** (mensual, anual y contado).

Evidencia (escenario `IGR_SARS_FUERA_RANGO`, La Paz, SARS = SI): de 7 asegurados, 4 muestran `#VALUE!` en Infinity (65, 70, 80 y 99 años) y el total mensual de Infinity también. Con SARS = NO, esas mismas personas muestran "N/A" y el total se calcula bien.

**Causa:** la fórmula suma 10 USD de SARS a un texto "N/A". Red Max no tiene el problema porque su columna final captura los errores.

**Impacto práctico:** en el cotizador actual, una familia con un abuelo de 65 años o más, cotizada con SARS = SI, no puede ver el total de Infinity. El sistema nuevo muestra "No disponible" para esa persona y calcula el total del resto.

## 4. Lo que coincide exactamente

- **Mundial Blue:** las 18 combinaciones y los umbrales de 18 y 25 años coinciden en todos los casos, salvo el redondeo de la sección 3.2.
- **Naranja+:** las 22 combinaciones coinciden en todos los casos, incluidos edad 0 (prima 0), 64 y 65 años, y la exclusión de mujeres de 1 a 18 años con maternidad.
- **Red Max:** los tres planes (descuento de 0, 28 y 49) coinciden en todas las regionales para las personas sin maternidad.
- **Infinity y Advance:** coinciden en todas las regionales para las personas sin maternidad, con SARS SI y NO.
- **SARS:** el recargo de Infinity (+10) y Red Max (+70) coincide en todos los casos con prima disponible. Advance y Mundial Blue no lo llevan, igual que en el Excel.

## 5. Estado de las pruebas automáticas

| Suite | Pruebas | Resultado |
|---|---|---|
| Redondeo | 3 | Pasan |
| Validaciones (V01 a V07) | 9 | Pasan |
| Reglas por producto y totales | 29 | Pasan |
| Caracterización (18 escenarios del análisis y comprobación de diferencias) | 19 | Pasan |
| **Conciliación masiva (53 escenarios)** | 2 | **Pasan** |
| **Total** | **62** | **Pasan** |

## 6. Limitaciones y cómo cerrarlas

1. **El Excel se recalculó con LibreOffice, no con Excel.** Las primas coinciden con los valores que Excel dejó guardados (14 de 14 en la verificación inicial), pero hay comportamientos que pueden diferir: celdas vacías, texto en lugar de número y errores. **Qué hacer:** que una persona ejecute en Excel real estos casos y confirme el resultado:
   - `IGR_SARS_FUERA_RANGO`: ¿Infinity muestra `#VALUE!` y el total también?
   - `IGR_BORDE_SCZ`: mismo comportamiento con maternidad fuera de rango.
   - Mundial Blue con 0 hijos y un menor en la nómina.
   - Edad vacía con sexo informado.
   - Edad `NA` seleccionada de la lista.
   - Un caso de Mundial Blue 1 MM / 5K, Naranja+ Bolivia 50K / 5K y Red Max Bs. 140.000 con SARS = SI.
2. **No se barrieron todas las edades de cada tarifa por el Excel.** La coincidencia por edad la garantiza la conciliación tarifa por tarifa contra la base de datos. Aquí se verificó la lógica que elige la columna y aplica las reglas, con 7 edades por escenario.
3. **Las diferencias de maternidad están medidas en solo 42 casos**, 26 de ellos en La Paz. Para un mapa completo por regional y edad, conviene un barrido específico (se puede hacer con el motor y las tablas, sin recalcular el Excel).
4. **Moneda en la suma combinada:** sigue abierto (Red Max y Advance en Bs., el resto en USD). No afecta esta conciliación.

## 7. Siguiente paso

**Paso 4: API y seguridad (NestJS).** Cotizar, guardar, consultar, inicio de sesión, roles y auditoría. Para empezar necesito de TI el proveedor de inicio de sesión corporativo y dónde se aloja la aplicación.

En paralelo, dos acciones de tu lado: que alguien ejecute en Excel real los casos de la sección 6.1, y que el área técnica revise las cifras de maternidad de 35 y 49 años de Red Max (sección 3.1).
