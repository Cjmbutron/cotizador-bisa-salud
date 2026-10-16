# @bisa/api — API del cotizador (NestJS 11 + PostgreSQL)

Expone el motor de precios (`@bisa/motor-precios`) con tarifas y parámetros leídos de PostgreSQL.
**No contiene reglas de precio**: toda regla está en el motor y todo valor en la base.

## Endpoints

| Método | Ruta | Roles | Qué hace |
|---|---|---|---|
| GET | `/health` | público | Responde si la API y la base están vivas |
| GET | `/me` | cualquier usuario activo | Correo, nombre y roles de quien consulta |
| GET | `/catalogo` | cualquier usuario activo | Regionales, productos, planes, parentescos (para armar el formulario) |
| POST | `/cotizaciones/calcular` | COMERCIAL, SUPERVISOR | Calcula sin guardar |
| POST | `/cotizaciones` | COMERCIAL | Calcula y guarda (estado CALCULADA, vigencia en días hábiles) |
| GET | `/cotizaciones` | COMERCIAL (propias), SUPERVISOR/AUDITOR (todas) | Lista con filtros `estado, q, desde, hasta, limite, desplazamiento` |
| GET | `/cotizaciones/:id` | ídem | Detalle: nómina, líneas con su paso a paso, totales, parámetros usados |
| POST | `/cotizaciones/:id/emitir` | COMERCIAL (dueño) | CALCULADA → EMITIDA (inmutable) |
| POST | `/cotizaciones/:id/anular` | COMERCIAL (dueño), SUPERVISOR | Exige `motivo`; queda en auditoría |

Respuestas: importes como **texto decimal** (`"66"`), nunca flotantes. Errores: `400` forma inválida (con el campo),
`422` regla de negocio (códigos V01–V07 del motor), `401/403` acceso, `404` no existe **o no es suyo**,
`409` estado incompatible, `503` sin tarifas/parámetros vigentes, `500` genérico (sin detalles internos).

### Administración de tarifas y parámetros (`/admin`)

Separación de funciones: **ADMIN_TARIFAS** prepara; **APROBADOR_TARIFAS** revisa y publica, y **nunca** sobre lo que él mismo creó
(lo exige la API y también la base). Una versión sigue BORRADOR → EN_REVISION → PUBLICADA; solo el borrador se edita.

| Método | Ruta | Roles | Qué hace |
|---|---|---|---|
| GET | `/admin/tarifas/versiones` | ADMIN_TARIFAS, APROBADOR_TARIFAS, AUDITOR | Versiones con estado, vigencia, creador y aprobador |
| POST | `/admin/tarifas/versiones` | ADMIN_TARIFAS | Crea un borrador (vigencia futura, respaldo documental obligatorio; puede copiar otra versión) |
| PUT | `/admin/tarifas/versiones/:id/tarifas` | ADMIN_TARIFAS | Cambia filas puntuales (plan/región/sexo/edad/prima; `null` = N/A). Todo o nada |
| PUT | `/admin/tarifas/versiones/:id/tarifas-hijo` | ADMIN_TARIFAS | Tarifa por hijo de Mundial Blue |
| GET | `/admin/tarifas/versiones/:id/revision` | ADMIN_TARIFAS, APROBADOR_TARIFAS | Qué falta para que la versión esté completa |
| GET | `/admin/tarifas/versiones/:id/comparacion?con=` | ídem + AUDITOR | Qué cambió por plan/región/sexo (cantidad y % mín/máx) contra la vigente |
| POST | `/admin/tarifas/versiones/:id/enviar-revision` | ADMIN_TARIFAS (el creador) | Exige versión completa |
| POST | `/admin/tarifas/versiones/:id/devolver` | APROBADOR_TARIFAS | Vuelve a borrador, con motivo |
| POST | `/admin/tarifas/versiones/:id/publicar` | APROBADOR_TARIFAS | Publica; la versión anterior termina donde empieza la nueva |
| GET/POST | `/admin/parametros` | ADMIN_TARIFAS (cambia) | Cambia un parámetro **desde una fecha futura**; nunca reescribe el pasado ni el presente. Valida el tipo y que el motor pueda cargar todo con el cambio |

Pendiente (REQUIERE VALIDACIÓN DEL NEGOCIO): hoy un solo usuario con rol ADMIN_TARIFAS cambia parámetros; evaluar si exigen doble aprobación como las tarifas.

**Propuestas en PDF (Paso 7)**

| Método | Ruta | Rol | Qué hace |
|---|---|---|---|
| POST | `/cotizaciones/:id/documentos/:producto` | COMERCIAL (propias), SUPERVISOR, AUDITOR | Genera el PDF del producto (IG, RM, AD, MB, NP). Elige la plantilla según producto, maternidad y cobertura MB. Nombre: `Titular - Producto[ CON MATERNIDAD].pdf`. Guarda hash SHA-256 y auditoría. 409 si la cotización está anulada |
| GET | `/cotizaciones/:id/documentos` | igual | Historial de PDF generados |
| GET | `/admin/plantillas` | REVISOR_COMERCIAL, ADMIN_TI, AUDITOR | Estado de aprobación de las 13 plantillas |
| POST | `/admin/plantillas/:id/aprobar` / `revocar` | REVISOR_COMERCIAL | Aprueba o revoca el texto. La aprobación guarda el hash del contenido: si el archivo de la plantilla cambia, caduca |

Las plantillas están en `plantillas/*.json` (extraídas de las hojas ocultas del Excel con sus fórmulas, imágenes y combinaciones). Mientras el texto no esté aprobado, el PDF lleva marca de agua y pie «TEXTO PROVISIONAL, PENDIENTE DE REVISIÓN COMERCIAL». El PDF se genera con Chromium: configure `CHROMIUM_PATH` (y `CHROMIUM_SIN_SANDBOX=true` solo en contenedores). Requiere aplicar `db/06_documentos.sql`.

## Seguridad

- **Autenticación**: token Bearer validado contra un proveedor OIDC (`AUTH_MODE=oidc`; solo variables de entorno, el código
  no cambia según el proveedor). El modo `dev` (HS256) es solo para desarrollo y pruebas: la API **se niega a arrancar** con `dev` en producción.
- **Autorización**: los roles salen de la base (`usuario_rol`), no del token. Un usuario que el proveedor reconoce pero que no está
  registrado y activo en `usuario` recibe 403 (queda en auditoría). No hay alta automática.
- Validación de entrada con esquemas estrictos (campos desconocidos se rechazan), consultas siempre parametrizadas,
  cuerpo máx. 100 KB, límite de peticiones por IP, `helmet`, CORS por lista blanca, y los logs no incluyen cuerpos (llevan datos personales).
- Auditoría de solo inserción (la base lo garantiza con triggers): crear, emitir, anular y accesos denegados.
- El usuario de base de datos de la aplicación debe ser **sin permisos de DDL** (ver `test/preparar-db.sh` como ejemplo de grants).

## Ejecutar

```bash
npm install                              # en la raíz del monorepo
npm run build                            # motor + API
cp apps/api/.env.example apps/api/.env   # completar valores (la API lee variables de entorno)
node apps/api/dist/main.js
# desarrollo local: AUTH_MODE=dev AUTH_DEV_SECRET=<32+ caracteres>
#   AUTH_DEV_SECRET=... npm run token:dev -w @bisa/api -- ana@bisa.test
```

## Pruebas

`npm test` (raíz) construye el motor, corre sus 62 pruebas y luego las de la API (110) contra **PostgreSQL real**:
`test/preparar-db.sh` recrea la base `cotizador_test` desde `/db`, y las pruebas publican el tarifario con creador ≠ aprobador. Las pruebas de administración publican una versión futura: para repetirlas hay que volver a correr `npm test` (recrea la base).
Lo más importante que verifican:

1. El paquete de tarifas armado desde la base es idéntico al usado en la conciliación contra el Excel.
2. Los 18 escenarios del Excel (`golden.json`) dan, vía HTTP y con tarifas de PostgreSQL, las mismas primas y totales.
3. Administración: flujo completo borrador→revisión→publicación, separación de funciones, cambios todo o nada, vigencias futuras sin tocar lo vigente.
4. Seguridad (401/403/404, roles, inyección SQL, tamaño, límite de tasa), ciclo de vida y auditoría.

## Pendientes conocidos

- **Proveedor de identidad y hosting**: definir con TI (hoy solo variables de entorno).
- **Feriados** en la vigencia de 10 días hábiles: hoy solo excluye sábados y domingos. REQUIERE VALIDACIÓN DEL NEGOCIO.
- **Suma combinada mezcla Bs. y USD** (igual que el Excel): la API avisa con `COMBINADA_MEZCLA_MONEDAS`; decisión del negocio pendiente.
- Tarifas por hijo de Mundial Blue se guardan con 6 decimales (el Excel, con el cociente completo). No cambia ningún resultado
  porque el motor redondea al entero superior (verificado en prueba).
- Generación de PDF: Paso 7. Pantallas: Pasos 5 (administración) y 6 (cotizador) en `apps/web`.
