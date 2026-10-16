# Publicar el MVP: GitHub + Supabase + Vercel (dos proyectos)

| Pieza | Dónde |
|---|---|
| Código | GitHub (repositorio **privado**) |
| Base de datos + inicio de sesión | **Supabase** (un solo proyecto) |
| API (NestJS + PDF) | **Vercel**, proyecto 1: raíz del repositorio |
| Web (Next.js) | **Vercel**, proyecto 2: carpeta `apps/web` |

Tiempo estimado: 1 a 2 horas. Todo desde los paneles web, salvo un comando para preparar la base.

## 1. GitHub
```bash
cd cotizador-bisa-salud          # carpeta descomprimida del zip
git init -b main && git add . && git commit -m "Cotizador BISA Salud: MVP"
git remote add origin git@github.com:SU_ORGANIZACION/cotizador-bisa-salud.git
git push -u origin main
```
Compruebe que `git status` no muestre ningún archivo `.env`.

## 2. Supabase: proyecto, base de datos y login
1. Cree el proyecto (región cercana, p. ej. São Paulo). **Guarde la contraseña de la base**.
2. *Connect* → pestaña **Session pooler**: copie la cadena (`postgres://postgres.REF:[CLAVE]@aws-0-REGION.pooler.supabase.com:5432/postgres`). Es la que sirve desde cualquier red (IPv4) y desde Vercel. **No use** el *Transaction pooler* (puerto 6543) ni la conexión directa (solo IPv6).
3. *Authentication → Sign In / Providers → Email*: activo y **sin «Allow new users to sign up»**.
4. *Authentication → Users → Add user*: una cuenta (correo + contraseña, «Auto confirm») por cada correo de `USUARIOS_INICIALES` del paso siguiente.
5. *Project Settings → JWT Keys*: debe usar llaves de firma asimétricas (ES256/RS256). Si solo muestra el «Legacy JWT secret», migre a las nuevas llaves: la API verifica con JWKS.
6. Anote: URL del proyecto (`https://REF.supabase.co`) y la **anon key** (pública). Nunca use la `service_role` en la web ni en la API.

### Preparar la base (una sola vez, desde su computador)
Requiere Node 20. Dentro de la carpeta del proyecto:
```bash
npm install
ADMIN_DATABASE_URL='postgres://postgres.REF:CLAVE@aws-0-REGION.pooler.supabase.com:5432/postgres' \
APP_DB_PASSWORD='UNA-CLAVE-LARGA-SOLO-LETRAS-NUMEROS-_-.~' \
USUARIOS_INICIALES='tu@correo.com=ADMIN_TI+REVISOR_COMERCIAL+ADMIN_TARIFAS,comercial1@correo.com=COMERCIAL,sup@correo.com=SUPERVISOR' \
node apps/api/scripts/desplegar-db.cjs
```
El script: aplica el esquema y las tarifas, crea el rol `cotizador_app` **sin permisos de administración**, **cierra la API REST pública de Supabase sobre nuestras tablas** (RLS activado y permisos de `anon`/`authenticated` revocados, `db/07_supabase.sql`), da de alta a los usuarios con sus roles y publica el tarifario inicial. Solo funciona con una base vacía.

> Roles: `COMERCIAL` cotiza; `SUPERVISOR`/`AUDITOR` consultan; `REVISOR_COMERCIAL` aprueba el texto de los PDF; `ADMIN_TARIFAS` y `APROBADOR_TARIFAS` (personas distintas) cambian y publican tarifas; `ADMIN_TI` consulta plantillas.
> Los permisos viven en nuestra tabla `usuario`, no en Supabase: quien tenga cuenta en Supabase pero no esté en esa tabla recibe «no tiene acceso».

Cadena de conexión de la API: la del Session pooler pero con el usuario **`cotizador_app.REF`** (el pooler exige `rol.REF`) y la clave `APP_DB_PASSWORD`:
`postgres://cotizador_app.REF:APP_DB_PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres`

## 3. Vercel, proyecto 1: la API
*Add New Project* → importe el repositorio →
- **Root Directory: la raíz** (déjelo vacío o `./`). Framework: *Other*. El archivo `vercel.json` ya define compilación, límites y reglas.
- Variables de entorno:

| Variable | Valor |
|---|---|
| `DATABASE_URL` | la de `cotizador_app.REF` del paso 2 |
| `DB_SSL` | `no-verify` (Supabase usa una autoridad de certificados propia; la conexión va cifrada) |
| `DB_POOL_MAX` | `3` |
| `PDF_MODO` | `serverless` |
| `AUTH_MODE` | `oidc` |
| `OIDC_ISSUER` | `https://REF.supabase.co/auth/v1` |
| `OIDC_AUDIENCE` | `authenticated` |
| `OIDC_JWKS_URI` | `https://REF.supabase.co/auth/v1/.well-known/jwks.json` |
| `TRUST_PROXY` | `1` |

Pruebe `https://SU-API.vercel.app/health` → `{"estado":"ok"}`.
> La generación de PDF necesita hasta 60 s y 1,7 GB de memoria (ya en `vercel.json`). En el plan **Hobby** el límite de memoria puede ser menor: si el PDF falla con error de memoria o tiempo, pase el proyecto de la API a **Pro**.

## 4. Vercel, proyecto 2: la web
*Add New Project* → el mismo repositorio →
- **Root Directory: `apps/web`**. Framework: Next.js.
- Variables de entorno:

| Variable | Valor |
|---|---|
| `API_URL` | `https://SU-API.vercel.app` (sin barra final) |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://REF.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | la anon key |

No defina `AUTH_MODE` ni `AUTH_DEV_SECRET`: sin ellos `/dev-token` responde 404.

## 5. Prueba de humo (10 minutos)
1. Entrar como comercial → *Nueva cotización* → calcular y guardar.
2. En el detalle, *Descargar Infinity Green*: el PDF debe abrir con acentos, logo y la marca «TEXTO PROVISIONAL». **Revise bien la tipografía**: en Vercel el Chromium liviano trae menos fuentes que un servidor normal, y el PDF puede verse algo distinto al de las capturas.
3. Entrar como `REVISOR_COMERCIAL` → *Plantillas*: las 13 en estado «Provisional».
4. Un comercial no debe ver los menús de administración.
5. Seguridad: con la anon key, `https://REF.supabase.co/rest/v1/usuario` (cabecera `apikey`) debe responder error de permisos, no datos.

## Límites conocidos de este MVP
- **Los PDF son provisionales** hasta que el área comercial apruebe cada plantilla. No enviar a clientes.
- La primera descarga de PDF tras un rato sin uso tarda más (arranque en frío de la función: de 10 a 15 s).
- El límite de peticiones por minuto se cuenta por instancia de la función, no de forma global.
- Supabase gratuito pausa el proyecto tras ~1 semana sin actividad y no incluye respaldos diarios: para el piloto conviene el plan Pro.
- El token vive en `sessionStorage`; el proveedor de identidad definitivo de BISA lo reemplazará.
- Pendiente de negocio: suma combinada con monedas mezcladas; feriados en los 10 días hábiles.
- Para producción real: dominio propio, respaldos verificados, hosting y proveedor de identidad definidos con TI. El `Dockerfile` de la raíz sirve para alojar la API en un contenedor si se decide dejar Vercel.
