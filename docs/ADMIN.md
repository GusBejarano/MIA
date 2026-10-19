# Panel de administración de MIA (`/admin`)

Documento vivo del panel admin: qué está construido, el modelo de permisos, el modelo de datos, el vocabulario del dominio y las decisiones tomadas. Actualízalo cuando cambie algo de esto — no dejes que se desactualice como le pasó al README antes de v2.3 (ver sección D.5 del informe del 2026-10-14).

## 1. Vocabulario

- **Beneficio / comercio / empresa:** la empresa física, identificada por su **NIT**. Vive en `merchants`.
- **Convenio:** una empresa con un benefactor. No tiene tabla propia — es la combinación `merchants` + `programs` (implícita en `benefits.merchant_id` + `benefits.source_program_id`).
- **Descuento:** cada fila de `benefits` (lo que la app pública muestra como tarjeta). **Un convenio puede tener varios descuentos** (ej. "Mc Group Cali" tiene 3 con Comfandi — títulos/condiciones distintos, mismo comercio+benefactor). No hay restricción de un solo descuento por convenio.
- **Ciudad de la sede:** dónde está físicamente una sede (`benefit_locations.city`), normalizada contra `city_regions`.
- **Cobertura del descuento (`benefits.city`, campo "Ciudad(es)"):** el consolidado de las ciudades de las sedes **vinculadas** a ese descuento (`benefit_location_links`). Se calcula desde las sedes cuando el descuento tiene al menos una vinculada con ciudad; es manual (texto libre) si no. **Desde la activación del trigger de base de datos (sección 4.4), este cálculo ya no es solo del panel admin (item C2): Postgres lo mantiene actualizado solo** cada vez que cambia un vínculo sede↔descuento, incluso si la escritura no pasa por el admin.
- **Ciudad del convenio (filtro del Catálogo):** es solo el filtro de navegación — **no se guarda en ningún campo nuevo**. "+ Nuevo Convenio" usa la ciudad del filtro como cobertura manual inicial, hasta que se vinculen sedes reales.

## 2. Módulos construidos

| Módulo | Estado | Dónde |
|---|---|---|
| Auth + 2FA TOTP + middleware | En producción (v2.0) | `middleware.ts`, `src/app/admin/{login,mfa,auth,set-password}/**` |
| Gestión de usuarios | En producción (v2.0/v2.1) | `src/app/admin/users/**` |
| Catálogo (Ciudad→Benefactor→Categoría→grid) | En producción (v2.0) | `CatalogExplorer.tsx`, `catalog.ts` |
| Detalle de Beneficio (Datos + Sedes) | En producción, ampliado en v2.3 | `EditPanel.tsx`, `SedesTab.tsx` |
| Auditoría (log + regla derivada) | En producción (v2.1), mensaje mejorado en v2.3 (F4) | `audit.ts`, `auditActions.ts` |
| Sistema de tareas | En producción (v2.1) | `tasks.ts`, `tasks/**` |
| Permisos finos por rol/beneficio | v2.3 (S1) | `access.ts`, `guards.ts` |
| Pagos (reporte por analista) | v2.3 (P1) | `payments.ts`, `pagos/**` |
| Sedes multi-ciudad + cobertura calculada | v2.3 (C1/C2/C3) | `SedesTab.tsx`, `coverage.ts`, `EditPanel.tsx` |
| NIT del comercio + fusión asistida | v2.3 (N1/N3) | `catalog.ts` (NIT), bloque "Comercio" en `EditPanel.tsx` |
| "+ Nuevo Convenio" | v2.3 (N2) | `NewConvenioPanel.tsx` |
| "Nuevo Descuento" con IA desde un link | **No existe** | — (backlog, fuera de alcance) |

## 3. Matriz de permisos (resultado de S1 + N5)

Los guards viven en `src/lib/admin/guards.ts` (reglas puras en `access.ts`, cableado real contra Supabase en `guards.ts`). Un analista solo tiene acceso a un beneficio si está en `admin_task_benefits` de una tarea con `assigned_to = su admin_users.id` (cualquier estado de tarea).

| Guard | Quién pasa | Usado en |
|---|---|---|
| `requireAdminUser` | Cualquier sesión de `admin_users` activa | Base de los demás guards |
| `requireAdminRole` | Solo `admin` | Catálogo completo (`loadBenefitsAction`), crear tarea, listar todas las tareas, gestión de usuarios, **Pagos**, **todas las acciones de NIT/fusión/Nuevo Convenio (N1-N4)** |
| `requireTaskAccess(taskId)` | Admin, o analista dueño de esa tarea | Ver detalle de una tarea |
| `requireBenefitAccess(benefitId)` | Admin, o analista con ese beneficio en alguna de sus tareas | Guardar beneficio, marcar auditado, acciones de sedes con `benefitId`, leer NIT/nombre del comercio (`getMerchantInfoAction`) |
| `requireMerchantAccess(merchantId)` | Admin, o analista con un beneficio de sus tareas que use ese comercio | Acciones que solo reciben `merchantId` (ej. `upsertLocationAction`) |
| `requireLocationAccess(locationId)` | Igual que arriba, resuelto por el comercio de la sede | Acciones que solo reciben `locationId` (ej. `deleteLocationAction`) |
| `requireAnyTaskAccess` | Admin, o analista con al menos una tarea asignada | Acciones sin entidad propia (`searchMerchantsAction`, `listAllCitiesAction`, `resolveMapsUrlLatLngAction`) |

**El analista ve el NIT del comercio** (viene con los datos del beneficio vía `requireBenefitAccess`), **pero no puede editarlo ni fusionar** — esas acciones (`updateMerchantNitAction`, `mergeMerchantsAction`, `getMerchantMergeSummaryAction`, `getSimilarProvisionalMerchantsAction`, `findDuplicateLocationsForMerchantAction`, `lookupMerchantForConvenioAction`, `searchProvisionalMerchantsByNameAction`, `createConvenioAction`, `listMerchantLocationsPreviewAction`) usan `requireAdminRole`. La UI (`role === "admin"`) solo oculta el botón de editar — el límite real es el guard del servidor.

**Nota de alcance:** el buscador de comercio del flujo legacy de Sedes (`searchMerchantsAction`) sigue con `requireAnyTaskAccess` (criterio original de S1, sin cambios) — es distinto del buscador por NIT/nombre de "+ Nuevo Convenio" (`lookupMerchantForConvenioAction`/`searchProvisionalMerchantsByNameAction`), que es admin-only porque vive detrás de un botón que el Catálogo ya restringe a admin.

**Verificación:** por revisión de código (sin pruebas automatizadas — el proyecto no tiene framework de pruebas, ver "Decisiones" abajo). No verificado con una cuenta de analista real en vivo por esta sesión; pendiente de que Gustavo lo confirme a mano en `dev`.

## 4. Modelo de datos del admin

```
merchants (comercio/empresa)
  id, name, nit, nit_provisional (generada), merged_into, created_at
  └─ benefit_locations (sede física)
       id, name, address, city, maps_url, lat, lng, source_confidence, merchant_id
       └─ benefit_location_links (vínculo sede↔descuento)
            benefit_id, location_id

benefits (descuento)
  id, source_program_id (FK programs), merchant_id (FK merchants), title, category,
  city, status, delivery_mode, coverage_confidence, original_source_url, ...

admin_users (id, auth_user_id, full_name, role, email, is_active)
admin_tasks (id, assigned_to, created_by, program_id, city, category, status, assigned_at, completed_at)
admin_task_benefits (task_id, benefit_id)
benefit_audit_log (id, benefit_id, admin_user_id, task_id, audited_at)  -- append-only
benefit_audit_status (vista)  -- audit_status, last_audited_at, meets_condition (derivado, nunca booleano guardado)
```

### 4.1 Modelo de NIT (item N1)

- `merchants.nit`: texto, **obligatorio y único**, 9 o 10 dígitos, con `DEFAULT` = siguiente valor de la secuencia `merchant_provisional_nit_seq` (rango `9999999000`-`9999999999`, 1000 valores). Un `INSERT` sin NIT recibe el siguiente provisional.
- `merchants.nit_provisional`: columna **generada** — `true` si el NIT tiene 10 dígitos y empieza por `9999999`.
- `merchants.merged_into`: comercio que lo absorbió; `null` = vigente. **Toda búsqueda/listado de comercios excluye los fusionados** (`merged_into is null`). Si un beneficio apuntara a uno fusionado, se resuelve al vigente en lectura (`resolveActiveMerchantId`, `guards.ts`), sin persistir el cambio.
- **Un NIT provisional nunca se deja guardar como "real"** (`parseNit`, `src/lib/admin/nit.ts`) — sirve para identificar internamente y para *buscar*, nunca para crear una empresa nueva ni para confirmarlo como NIT real de una existente.
- **No se calcula ni se valida el dígito de verificación** — decisión explícita (fuera de alcance).

### 4.2 Por qué las empresas están separadas por título (y por qué se fusionarán al cargar NITs reales)

La migración del 2026-10-16 agrupó los 404 beneficios por **título completo normalizado**, no por nombre de empresa real — así que "Smart Fit", "Smart Fit - Cali", "Smart Fit - Jamundí", etc. son hoy **5 comercios distintos** (mismo patrón en "La Sevillana" vs "La Sevillana - Cali" / "- Jamundí" / "- Palmira", y "Mc Group Cali" en 3 comercios, uno por título). No fue un error: agrupar por título era lo único que se podía hacer sin un NIT real todavía. **La fusión asistida (N3) es justamente el mecanismo para corregir esto** cuando se cargue el NIT real de cada empresa — el momento en que dos "comercios" provisionales resultan ser la misma empresa.

### 4.3 Regla de fusión (`merge_merchants`, N3)

- Función de base de datos (`rpc merge_merchants(p_from uuid, p_into uuid)`, solo `service_role`), en una sola transacción: mueve los beneficios y las sedes de `p_from` a `p_into`, marca `p_from.merged_into = p_into`. **Nunca borra nada.**
- El código de la aplicación **nunca hace esas actualizaciones por su cuenta** — siempre llama al RPC (`mergeMerchantsRpc`, `catalog.ts`).
- Se dispara desde la UI cuando se intenta guardar un NIT real que ya pertenece a otro comercio vigente — eso **no es un error**, es la señal de que son la misma empresa.
- Tras fusionar: se muestra cuánto se movió, se buscan "otras empresas con nombre parecido que siguen separadas" (comercios vigentes con NIT provisional cuyo nombre empieza con las dos primeras palabras del que se conservó — ej. encuentra las 4 variantes restantes de "Smart Fit"), encadenable con su propio botón Fusionar; y se avisa (solo informativo, no se toca nada) si el comercio destino quedó con sedes de dirección normalizada igual (posibles duplicados a revisar a mano).
- **No se ha ejecutado ninguna fusión contra datos reales** durante la construcción de N3/N2 (regla explícita del prompt de v2.3) — Gustavo la usará en producción sobre casos reales (Smart Fit es el caso de prueba sugerido).

### 4.4 Trigger de cobertura desde sedes + llave foránea de ciudad — ACTIVOS en producción

Ejecutados por Gustavo directamente en el SQL Editor de Supabase (no hay archivo de migración versionado en `supabase/` para esto — ver "Esquema de Supabase" en el README, mismo patrón que otras piezas del esquema creadas a mano):

- **Trigger de cobertura:** mantiene `benefits.city` calculado automáticamente desde las sedes vinculadas (`benefit_location_links`) cada vez que cambia un vínculo — es la versión real, en Postgres, de lo que `coverageFromCities`/`coverageSavedText` (`src/lib/admin/coverage.ts`) ya hacían como preview en el cliente (item C2). Con el trigger activo, ambos cálculos deberían coincidir siempre; el preview del cliente deja de ser la única fuente de verdad, pero se mantiene porque sigue sirviendo para mostrar el cambio *antes* de guardar.
- **Recálculo aplicado una sola vez** a los 11 convenios que ya tenían sedes vinculadas al momento de activar el trigger. Caso verificado: "La Sevillana" con USB Cali (`benefits.id = 52b8ea2f-c1d0-4f59-a3ef-8b6cf10e440b`) tenía `city = "Cali, Palmira, Jamundí, Candelaria, Yumbo"` (declarado a mano, incluía Palmira/Candelaria sin sedes reales ahí — el caso que ya anticipaba el prompt de v2.3) y quedó en `"Cali, Jamundí, Yumbo"` (solo las ciudades con sede real vinculada). Confirmado leyendo la fila real vía API el 2026-10-18. La fila hermana de Comfandi (mismo comercio, `title = "La Sevillana"`) sigue con el texto declarado sin cambios — el trigger opera por descuento, no por comercio, y ese descuento no estaba entre los 11 recalculados.
- **Llave foránea:** `benefit_locations.city → city_regions.city`. Desde ahora, cualquier intento de guardar una sede con una ciudad que no exista en `city_regions` falla a nivel de base de datos (antes solo lo evitaba el desplegable del formulario, item C3, y la normalización de `createSedeFromLegacy`, item N4 — ambos seguían dependiendo de que el código no se saltara ese paso).

## 5. Decisiones tomadas (y por qué)

- **No se borra nada, nunca.** Comercios fusionados se conservan (`merged_into`); usuarios se desactivan, no se borran (historial de tareas/auditorías); `benefit_audit_log` es append-only.
- **El des-auditado es automático**, no código aparte: `benefit_audit_status` es una vista derivada, así que si se rompe la condición después (ej. se borra la última sede de un beneficio presencial) el beneficio vuelve solo a `sin_auditar`.
- **RLS sin policies, a propósito** (ver sección "Panel de administración" del README) — toda la autorización vive en los Server Actions.
- **Sin framework de pruebas automatizadas** — decisión explícita del prompt de v2.3 ("no instales ningún framework de pruebas... el proyecto no tiene pruebas automáticas y así se queda"). La verificación de cada ítem de v2.3 se hizo con `tsc`/`eslint`/`build` y, donde fue posible sin escribir en la base, con consultas de solo lectura contra datos reales vía API (ver cada mensaje de commit para el detalle de qué se verificó).
- **Datos de prueba intencionales, no tocar:** la sede "EDS Copia / probando" (`5e5e62ce-812c-4fbd-9371-14b43610c5e5`), la sede duplicada sin coordenadas de VIDAA, la cuenta "Analista Gustavo", la tarea activa de prueba (`973a4134…`, La Sevillana/Comfandi/Jamundí) y los comercios de prueba (Smart Fit, La Sevillana, Mc Group Cali, Turk House).
- **`dev` y producción comparten la misma base de datos** — no hay entorno de desarrollo separado. Cualquier prueba manual con escritura en `dev` es sobre datos reales.

## 6. Backlog (fuera de alcance de v2.3, explícitamente no construido)

- "Nuevo Descuento" con lectura de un link e IA.
- Una pantalla "Convenios" separada (se descartó — "+ Nuevo Convenio" vive dentro del Catálogo).
- Creación de convenios por analistas (solo admin).
- Reasignar, cancelar o reabrir tareas.
- `benefit_locations.source_confidence` — columna de solo escritura que nada lee todavía.
- Cálculo del dígito de verificación del NIT.
- Aviso de sedes duplicadas al **crear** una sede nueva (hoy solo se avisa post-fusión) y estados "en otro benefactor / sin asignar" — propuestos, no aprobados.
- RLS real (con policies) sobre `city_regions` o cualquier otra tabla del admin.
- Recuperación de contraseña desde la UI del admin (`resetPasswordForEmail` nunca se invoca).
