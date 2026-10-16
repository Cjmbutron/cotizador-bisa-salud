# Cotizador BISA Salud

Reemplazo del cotizador de seguros de salud en Excel por una aplicación interna.
Stack: **TypeScript · Next.js · NestJS · PostgreSQL**.

## Estructura

| Carpeta | Contenido | Estado |
|---|---|---|
| `packages/motor-precios` | Motor de precios: librería TypeScript pura, sin base de datos ni HTTP | **Listo y probado** |
| `db` | Esquema PostgreSQL, carga de tarifas desde el Excel, conciliación y pruebas de integridad | **Listo y probado** |
| `apps/api` (NestJS) | API REST, autenticación, roles, auditoría | **Listo y probado** (ver `apps/api/README.md`) |
| `apps/web` (Next.js) | Cotizador (asistente de 6 pasos, listado, detalle) | **Listo y probado** en navegador (ver `apps/web/README.md`). Incluye pantallas de administración de tarifas y parámetros |

## Motor de precios

```bash
npm install
npm test                 # motor (62 pruebas) + API contra PostgreSQL real (109 pruebas, incluye administración de tarifas)
npm run build
```

```ts
import { cotizar } from '@bisa/motor-precios';
const r = cotizar(entrada, paqueteTarifas);   // parámetros opcionales: PARAMETROS_INICIALES
if (r.ok) r.resultado.totales; else r.errores;
```

- Función pura: mismos datos, mismo resultado.
- Aritmética decimal (`decimal.js`). Redondeos: `redondear` (mitad hacia arriba) y `techo` (entero superior, decisión R6).
- Un dato sin tarifa no es un error: la línea sale `NO_DISPONIBLE` o `EXCLUIDO` y no afecta los totales.
- Datos inválidos: devuelve `V01`–`V07` y no calcula.

### Cómo se prueba contra el Excel

`fixtures/excel_escenarios.json` guarda los resultados del Excel para 22 escenarios (recalculados con LibreOffice y contrastados con los valores guardados por Excel). `scripts/generar_fixtures.py` los transforma, junto con las tarifas, en `fixtures/tarifas.json` y `fixtures/golden.json` usando un motor de referencia en Python.

La prueba `golden.test.ts` exige dos cosas: (1) el motor TypeScript coincide con el esperado del sistema, y (2) **toda** diferencia contra el Excel es una de las dos diferencias intencionales (maternidad en Infinity y Red Max, decisión 17.5; redondeo de la prima por hijo de Mundial Blue, R6). Hoy son 25 diferencias en 602 comparaciones, y ninguna sin explicar. La conciliación masiva (`test/conciliacion.test.ts`, 53 escenarios, 1.855 primas) tiene 87 diferencias, todas clasificadas en cuatro categorías; informe en `docs/`.

Para publicar el MVP (Supabase + Vercel) vea **DESPLIEGUE.md**.

## Propuestas en PDF
Las 13 plantillas del Excel están en `apps/api/plantillas/` y se dibujan con las mismas celdas, fórmulas e imágenes. Cada fórmula del Excel se evalúa con los datos de la cotización y se comprobó contra los valores que Excel dejó guardados (`apps/api/test/documentos.spec.ts`). El texto contractual es **provisional** hasta que el rol REVISOR_COMERCIAL lo apruebe (pantalla *Plantillas*).

## Pendiente de decidir

- **Decididos:** P1 (Advance con maternidad fuera de 19 a 49 años: "No disponible" en las cinco regionales; parámetro `advanceMaternidadUsaTabla = false`), P2 (extra prima de Red Max de Bs. 140 en los tres planes) y P3 (contado de la suma combinada redondeado una sola vez sobre la suma).
- **Abierto:** la suma combinada suma importes en Bs. (Red Max, Advance) y USD (Infinity, Mundial Blue, Naranja+) como si fueran la misma moneda, igual que el Excel. Hay que definir con el negocio si se convierte, se separa por moneda o se mantiene.
