# Changelog — Admin

Versionado propio del panel `/admin` (`src/lib/admin/version.ts`), separado del de la app pública (`package.json`). No existe un release 2.2.0: lo que se había planeado para él quedó dentro de 2.3.0.

## [2.3.0] — sin publicar (en `dev`, pendiente de Fase 6: lanzamiento)

Reconstruido desde `git log` (commits `ecb9cd4..HEAD` en `dev`, en el orden en que se hicieron):

- **S1** (`e06784a`) — guards por rol/beneficio en los Server Actions del admin: antes `catalogActions.ts`/`auditActions.ts` solo exigían sesión activa, no rol. Nuevos `src/lib/admin/access.ts`/`guards.ts` con `requireAdminRole`, `requireBenefitAccess`, `requireMerchantAccess`, `requireLocationAccess`, `requireAnyTaskAccess`.
- **F4** (`95f8ab8`) — el mensaje de auditoría distingue si `delivery_mode` no está definido, si es presencial sin sedes, o si la condición ya se cumple.
- **F3** (`ab26e7f`) — botón "👁️ Usuario Final" también en la vista de tarea (antes solo en el Catálogo).
- **B1** (`3f3e2d5`) — `stripAccents` con el escape Unicode correcto (rango U+0300-U+036F); ya no borraba dígitos ni la letra "f".
- **B2** (`318bb39`) — `extractLatLngFromMapsUrl` unificada en `src/lib/admin/mapsUrl.ts` (antes duplicada server/cliente).
- **B3** (`f464e61`) — `redirectTo` de la invitación por correo lee `ADMIN_INVITE_REDIRECT_URL`, con producción como default.
- **P1** (`0867db1`) — nueva opción **Pagos** (solo admin): reporte de pago por analista, una fila por tarea, con filtro de analista y rango de fechas.
- **C3+C1** (`e10a50c`) — ciudad de sede como desplegable de `city_regions` (antes texto libre); pestaña Sedes muestra todas las ciudades del comercio, agrupadas y ordenadas por total de sedes.
- **C2** (incluido en `e10a50c`) — `Ciudad(es)` en Datos se calcula desde las sedes vinculadas cuando hay al menos una con ciudad; manual si no.
- **N1** (`d8d4849`) — capa de datos del comercio: `nit`, `nit_provisional`, `merged_into`; las búsquedas excluyen comercios fusionados.
- **N4** (`2112f65`) — encabezado "Comercio · NIT" en Sedes; migración asistida desde el campo legacy normaliza la ciudad contra `city_regions` antes de insertar.
- **N3** (`2984473`) — "NIT del comercio" editable (solo admin) en Datos, con fusión asistida (`rpc merge_merchants`) cuando el NIT ya pertenece a otro comercio vigente.
- **N2** (`11b8788`) — botón **"+ Nuevo Convenio"** en el Catálogo (solo admin), con el NIT primero y los 4 casos documentados en `docs/ADMIN.md`.
- **N5** — permisos de todo lo anterior (verificado junto con cada ítem, sin commit propio).
- **Versión** (`ec58ba6`) — `ADMIN_VERSION = "2.3.0"` como fuente propia; header `Admin v2.3.0 · <hash>`.

**Pendiente dentro de esta misma versión:** documentación (`docs/ADMIN.md`, este changelog, README), tags locales, las dos migraciones SQL de Fase 6 (trigger de cobertura desde sedes, llave foránea de ciudad) y el lanzamiento con visto bueno — ver el informe de estado entregado a Gustavo.

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
