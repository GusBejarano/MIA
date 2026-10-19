# Changelog — Admin

Versionado propio del panel `/admin` (`src/lib/admin/version.ts`), separado del de la app pública (`package.json`). No existe un release 2.2.0: lo que se había planeado para él quedó dentro de 2.3.0.

## [2.3.0] — publicada en producción 2026-10-18 (`main @ 9fdf940`)

Notas completas: [`version/2026.10.18 - Admin 2.3.0 - Notas de version.md`](version/2026.10.18%20-%20Admin%202.3.0%20-%20Notas%20de%20version.md). Reconstruido desde `git log` (commits `ecb9cd4..9fdf940` en `dev`, en el orden en que se hicieron).

### Agregado
- **P1** (`0867db1`) — nueva opción **Pagos** (solo admin): reporte de pago por analista, una fila por tarea, con filtro de analista y rango de fechas, fila de totales y detalle desplegable.
- **N1** (`d8d4849`) — capa de datos del comercio: `nit`, `nit_provisional`, `merged_into`.
- **N3** (`2984473`) — bloque "NIT del comercio" en Datos (solo admin), con fusión asistida (`rpc merge_merchants`) cuando el NIT ya pertenece a otro comercio vigente.
- **N2** (`11b8788`) — botón **"+ Nuevo Convenio"** en el Catálogo (solo admin), con el NIT primero y los 4 casos documentados en `docs/ADMIN.md`.
- **F3** (`ab26e7f`) — botón "👁️ Usuario Final" también en la vista de tarea (antes solo en el Catálogo).
- **Versión** (`ec58ba6`) — `src/lib/admin/version.ts` (`ADMIN_VERSION`), fuente propia del Admin, separada de la app pública.
- **Documentos vivos** (`74607b4`, `9fdf940`, este commit) — `CHANGELOG.md`, `docs/ADMIN.md`, `docs/BD-CAMBIOS.md`, `docs/VERSIONING.md`, carpeta `version/`.

### Cambiado
- **C3+C1** (`e10a50c`) — ciudad de sede: de texto libre a desplegable de `city_regions`; pestaña Sedes: de acotada a la ciudad de navegación a mostrar todas las sedes del comercio, agrupadas y ordenadas por total de sedes.
- **C2** (incluido en `e10a50c`, ver nota de trazabilidad en las notas de versión) — `Ciudad(es)` en Datos pasa de editable siempre a calculada desde las sedes vinculadas cuando hay al menos una con ciudad.
- **N4** (`2112f65`) — pestaña Sedes: el flujo "sin comercio" (buscar/crear) deja de ser el principal; nuevo encabezado "Comercio · NIT"; la migración asistida desde el campo legacy ahora normaliza la ciudad contra `city_regions` antes de insertar.
- **F4** (`95f8ab8`) — el mensaje de auditoría pasa de un texto único a distinguir 3 casos (`delivery_mode` sin definir / presencial sin sedes / condición cumplida).
- **B2** (`318bb39`) — `extractLatLngFromMapsUrl` pasa de estar duplicada (servidor y cliente) a vivir en un solo módulo compartido (`src/lib/admin/mapsUrl.ts`).
- Header de `/admin` — pasa de mostrar la versión de la app pública (`NEXT_PUBLIC_APP_VERSION`) a mostrar `Admin v2.3.0 · <hash>`.

### Corregido
- **B1** (`3f3e2d5`) — `stripAccents` (`coverageGate.ts`) borraba dígitos y la letra "f" por un escape Unicode mal formado; corregido a `/[\u0300-\u036f]/`.
- **B3** (`f464e61`) — `redirectTo` de la invitación por correo estaba fijo al dominio de producción (una invitación emitida desde `dev` mandaba al dominio equivocado); ahora lee `ADMIN_INVITE_REDIRECT_URL`.

### Seguridad
- **S1** (`e06784a`) — las Server Actions del catálogo y la auditoría solo exigían sesión activa, no rol: un analista autenticado podía invocar directo cualquier acción sobre cualquier beneficio, fuera del alcance de sus tareas. Cerrado con guards finos (`requireAdminRole`, `requireBenefitAccess`, `requireMerchantAccess`, `requireLocationAccess`, `requireAnyTaskAccess`, nuevos `src/lib/admin/access.ts`/`guards.ts`).
- **N5** — las 9 Server Actions nuevas de NIT/fusión/Nuevo Convenio (N1-N4) quedan todas `requireAdminRole`, salvo la lectura del NIT (`requireBenefitAccess`, el analista solo lee). Verificado junto con cada ítem, sin commit propio.

### Base de datos
Detalle completo, con efecto verificado y cómo revertir cada uno: [`docs/BD-CAMBIOS.md`](docs/BD-CAMBIOS.md).
- **2026-10-15** — normalización de ciudad ("Cali"→"cali") en 4 sedes.
- **2026-10-16** — modelo de NIT en `merchants` (secuencia provisional, `nit`/`nit_provisional`/`merged_into`, función `merge_merchants`) + agrupación de los 404 beneficios por título completo (392 comercios resultantes, 0 beneficios sin comercio).
- **2026-10-18** — trigger `recompute_benefit_city_from_sedes` (cobertura calculada desde sedes) + llave foránea `benefit_locations.city → city_regions.city`; recálculo aplicado a 11 convenios.
- Ninguno de estos tres tiene archivo de migración versionado en `supabase/` — se ejecutaron directo en el SQL Editor de Supabase por Gustavo.

### Pendiente
- Promover este commit de documentación a `main` (hoy `main` tiene el código completo de 2.3.0 desde `9fdf940`, pero no estos documentos) — requiere autorización explícita.
- Mover el tag `admin-v2.3.0` (hoy local, sobre `9fdf940`) al commit final una vez promovida la documentación — ver `docs/VERSIONING.md` sección 8.
- Push del tag `admin-v2.3.0` a `origin` — requiere autorización explícita, por separado del push de la rama.
- **Deploy de Netlify: NO VERIFICADO** (sesión de la CLI expirada, sin token en `.env.local`).
- **Verificación manual en producción (clic a clic, con cuenta de analista real): NO VERIFICADA** — pendiente de que Gustavo la confirme.

## [2.1.0] — `102eb0d` (2026-08-01, en `main`)

- **`360c2ad`** — v2.1 Admin: auditoría (`benefit_audit_log`, vista `benefit_audit_status`, des-auditado automático) + sistema de tareas (crear, cola, histórico, cierre automático) + gestión de usuarios (invitar, rol, activar/desactivar).
- **`f0ac619`** — "Crear tarea": la categoría pasa de texto libre a un `<select>` con datos reales del alcance elegido.
- **`9fc2a22`** — sello "Auditado" más visible en el grid + filtro Pendientes/Auditados/Todos en la cola de la tarea.
- **`102eb0d`** — fix de textos casi invisibles en `/admin` con el celular en modo oscuro.

## [2.0.0] — `9c5aef9` (2026-07-31, en `main`)

- **`37fcdcc`** (Fase 1) — auth + 2FA TOTP + `middleware.ts` protegiendo `/admin/**`.
- **`14f6d6e`**, **`62a4ef9`** (Fase 2) — Catálogo Ciudad → Benefactor → Categoría → grid, panel de Detalle de Beneficio (pestaña Datos, 20 campos).
- **`b20aca1`** — campo `original_source_url` ("Link a la fuente original", solo uso interno).
- **`9c5aef9`** (Fase 3) — comercio compartido (`merchants`, `benefit_locations`, `benefit_location_links`) + pestaña Sedes + modelo de cobertura geográfica por sede (`delivery_mode`, `coverage_confidence`, gate de degradación automática a `pendiente_revision`).
- Fixes de la misma versión: **`36cc0b4`** (preview de cobertura que crasheaba el panel), **`08107b8`** (sedes reales no llegaban al filtro ni al preview), **`2748433`** (branding MIA + etiqueta ADMIN en el header).
