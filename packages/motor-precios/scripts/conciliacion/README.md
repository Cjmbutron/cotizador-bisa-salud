# Conciliación masiva contra el Excel

1. `escenarios.py` define los 52 escenarios: 18 de Mundial Blue (todas las combinaciones de cobertura y deducible), 22 de Naranja+ (todas las combinaciones comercializables) y 12 de Infinity/Red Max/Advance (5 regionales, SARS SI/NO, 3 planes de Red Max, bordes de maternidad).
2. `ejecutar_excel.py` modifica una copia del cotizador, la recalcula con LibreOffice (`recalc.py` de la skill xlsx) y guarda lo que calcula el Excel. Cada escenario tarda unos 20 segundos. Las rutas internas (`/tmp/sc`, `/tmp/c3`) son las del entorno donde se generó y deben ajustarse.
3. `../generar_conciliacion.py` convierte esos resultados en `fixtures/conciliacion_excel.json`.
4. `test/conciliacion.test.ts` compara el motor contra el Excel y **falla si hay una diferencia que no sea una de las tres intencionales**.

Los resultados del Excel están ya guardados en `fixtures/conciliacion_excel.json`: las pruebas no necesitan LibreOffice.
