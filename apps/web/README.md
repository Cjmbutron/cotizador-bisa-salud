# @bisa/web — Cotizador (Next.js 15)

Interfaz interna del cotizador. **No calcula nada**: arma la entrada, la envía a la API y muestra lo que devuelve el motor.
El navegador habla solo con este servidor: `/api/*` se reenvía a la API (`API_URL`), sin CORS y sin exponer su dirección.

## Pantallas

- **Nueva cotización** (`/cotizar`): asistente de 6 pasos — Titular y regional · Productos · Asegurados · Configuración (Red Max, Mundial Blue, Naranja+) · Resultado · Guardar.
  El resultado muestra totales por producto (con su moneda), prima por asegurado con el **paso a paso del cálculo**, y avisos (p. ej. la suma combinada mezcla Bs. y USD).
  Los errores de negocio del motor (V01–V07) se muestran por asegurado, en español.
- **Cotizaciones** (`/cotizaciones`): listado con búsqueda por titular/número y filtro por estado. Cada rol ve lo que la API le permite.
- **Detalle** (`/cotizaciones/:id`): resultado guardado, emitir (solo el dueño) y anular (con motivo).

Las opciones de Mundial Blue, Naranja+ y Red Max salen del catálogo de la API (planes activos), no del código.

- **Tarifas** (`/admin/tarifas`, roles de tarifas y auditor): versiones con estado; crear borrador (partiendo de otra versión), cambiar una tarifa, **importar muchas desde Excel/CSV** (columnas `plan,region,sexo,edad,prima`, por lotes, con errores por línea), ver si la versión está completa y **qué cambió contra la vigente**, enviar a revisión, devolver (con motivo) y publicar. El botón de publicar se bloquea para quien creó la versión.
- **Parámetros** (`/admin/parametros`): valores vigentes con su historial; el cambio se programa desde una fecha futura con motivo obligatorio.
- El menú y la pantalla de inicio dependen del rol (`GET /me`); la API vuelve a exigir cada permiso.

## Ejecutar

```bash
npm install                      # en la raíz
cp apps/web/.env.example apps/web/.env.local
npm run dev -w @bisa/web         # http://localhost:3001  (la API debe estar en API_URL)
NODE_ENV=production npm run build -w @bisa/web && npm run start -w @bisa/web
```

## Inicio de sesión

Producción: lo hará el proveedor de identidad corporativo (OIDC), **pendiente con TI**; la web guardará el token que entregue.
Desarrollo: con `AUTH_MODE=dev` y `AUTH_DEV_SECRET` (el mismo de la API) existe `/dev-token`, que entrega un token para un correo. Responde 404 en producción.
El usuario debe existir y estar activo en la base (la API lo exige).

## Pruebas

`npm test -w @bisa/web` (lector de CSV) y las dos pruebas de navegador. Para estas, con una base recién creada (`apps/api/test/preparar-db.sh`),
`node apps/api/scripts/sembrar-dev.cjs` crea usuarios de ejemplo y publica el tarifario; luego API y web en desarrollo con `AUTH_MODE=dev`:
`node apps/web/test/e2e.mjs` (cotizador) y `node apps/web/test/e2e-admin.mjs` (administración: acceso por rol, importación todo-o-nada, revisión, publicación por otra persona, parámetros).

## Prueba de extremo a extremo del cotizador

`node apps/web/test/e2e.mjs` con la API (3000) y la web en modo desarrollo (3001), ambas con `AUTH_MODE=dev`, y un usuario `ana@bisa.test` con rol COMERCIAL.
Recorre en un Chromium real: acceso sin sesión, usuario sin acceso, validaciones del asistente, cotización con tres productos (Infinity para hombre de 30 años en La Paz = USD 66, como en el Excel), paso a paso, guardar, emitir, anular con motivo, búsqueda y cierre de sesión.

## Pendiente

- PDF de la propuesta (Paso 7).
- Identidad visual de BISA (colores y logo): hoy es un diseño sobrio por defecto.
- Token en `sessionStorage` (aceptable para uso interno con sesiones cortas); con el proveedor definitivo evaluar cookie HttpOnly.
