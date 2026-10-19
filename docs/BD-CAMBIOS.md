# Registro de cambios de base de datos — Admin

Registro cronológico, **de solo agregar** (nunca se edita una entrada pasada — si algo se corrige, se agrega una entrada nueva que lo diga), de los cambios de esquema/datos relevantes para el panel `/admin`. No reemplaza las migraciones versionadas de `supabase/*.sql` (que siguen siendo la fuente de verdad para lo que sí tiene archivo) — este registro cubre **todo lo demás**: lo ejecutado directo en el dashboard sin dejar archivo, con el detalle de qué se hizo, quién, cómo, el efecto real y cómo revertirlo si hiciera falta.

**Alcance:** cambios de base de datos relevantes para el admin, desde su Fase 3 (v2.0, sedes geolocalizadas) en adelante. Los cambios de la app pública anteriores a eso (esquema base, cobertura geográfica 1.5.0, etc.) ya están documentados en el README (`## Crecimiento del catálogo`, `## Esquema de Supabase`) y en sus propios archivos `supabase/*.sql` — no se duplican aquí.

---

## 2026-07-30 — `delivery_mode` / `coverage_confidence` / `benefit_locations` (v2.0)

- **Qué:** agrega `benefits.delivery_mode` (`online`/`presencial`/`online_y_presencial`) y `benefits.coverage_confidence` (`confirmada`/`estimada`/`desconocida`); crea `public.benefit_locations` (sedes geolocalizadas, `benefit_id`, `maps_url`, `lat`/`lng` nullable, `is_primary`, `source_confidence`), con RLS activo sin policies desde su creación; agrega `users.last_lat`/`last_lng`/`location_captured_at`.
- **Archivo:** `supabase/2026.07.30-mia_delivery_mode_and_locations.sql` (versionado).
- **Por quién y cómo:** migración SQL aplicada a mano en el SQL Editor de Supabase.
- **Efecto:** 100% aditivo — nada del código leía estas columnas todavía al momento de aplicarse, cero cambio de comportamiento visible.
- **Cómo revertir:** `DROP TABLE benefit_locations` (perdería cualquier sede ya cargada) y `ALTER TABLE benefits DROP COLUMN delivery_mode, DROP COLUMN coverage_confidence` — no recomendado una vez hay datos reales dependiendo de estas columnas (ver entradas siguientes).

## 2026-07-30 — Gate "Colombia sin confirmar" + degradación de 20 beneficios (v2.0, Fase 4)

- **Qué:** extiende el trigger `check_benefit_city_coverage` (creado en `2026.07.27-mia_geographic_hierarchy.sql`): un beneficio `activo` cuya cobertura se reduce a `['colombia']` se degrada solo a `pendiente_revision` salvo que sea `delivery_mode='online'` o `coverage_confidence='confirmada'`. Junto con esto, un `UPDATE` puntual degradó los 20 casos ya identificados como `coverage_confidence='desconocida'` (Tributi + 19 de Coomeva).
- **Archivo:** `supabase/2026.07.30-mia_coverage_confidence_gate.sql` (versionado).
- **Por quién y cómo:** SQL Editor, con confirmación explícita de Gustavo antes de ejecutar (es el único paso de esa fase con consecuencia visible real para un usuario final).
- **Efecto:** esos 20 beneficios dejaron de mostrarse a usuarios finales hasta que se confirmara su dirección real. Siguen en `pendiente_revision` hoy (verificado en la auditoría del 2026-10-14: 19 de Coomeva + el caso de Tributi).
- **Cómo revertir el `UPDATE` puntual:** no quedó un respaldo de cuáles 20 filas eran antes de la degradación más allá del propio archivo SQL (que las identifica por `coverage_confidence='desconocida'` en ese momento) — revertir el trigger no reactiva esos beneficios solo, haría falta un `UPDATE` manual fila por fila confirmando cada dirección real primero.

## 2026-07-31 — `admin_users` (Admin Fase 1)

- **Qué:** crea `public.admin_users` (`auth_user_id` → `auth.users`, `full_name`, `role` admin/analista, `email` único, `is_active`), RLS activo sin policies.
- **Archivo:** `supabase/2026.07.31-mia_admin_users.sql` (versionado).
- **Efecto:** base del sistema de identidad del panel admin, separado de `public.users` (beneficiarios finales).
- **Cómo revertir:** `DROP TABLE admin_users` — rompería el login de todo el panel admin; no aplicable sin un reemplazo.

## 2026-07-31 — `original_source_url` + rename de `research_source` (Admin Fase 2)

- **Qué:** agrega `benefits.original_source_url` (solo uso interno, nunca visible a usuarios finales); renombra la etiqueta `research_source = 'carga_manual'` a `'Carga Asistida por Claude Cowork'` en los 404 beneficios que la tenían.
- **Archivo:** `supabase/2026.07.31-mia_admin_source_url.sql` (versionado).
- **Efecto:** sin impacto visible para usuarios finales (campo interno).

## 2026-07-31 — `benefit_locations.city` (Admin Fase 3, múltiples sedes)

- **Qué:** agrega `benefit_locations.city` (nullable) y la columna generada `city_list` (`text[]`, normalizada a minúsculas) con índice GIN, mismo patrón que `benefits.city_list`.
- **Archivo:** `supabase/2026.07.31-mia_benefit_locations_city.sql` (versionado).
- **Efecto:** aditivo — una sede sin `city` simplemente no aparecía en ningún filtro por ciudad hasta completarse.

## 2026-08-01 — `merchants` / `benefit_location_links` / `admin_tasks` / `admin_task_benefits` / `benefit_audit_log` / vista `benefit_audit_status` (Admin v2.0/v2.1)

- **Qué:** comercio compartido (`merchants`, `benefit_location_links` como tabla puente beneficio↔sede) y sistema de tareas + auditoría (`admin_tasks`, `admin_task_benefits`, `benefit_audit_log`, vista `benefit_audit_status`).
- **Archivo:** **ninguno versionado** — creados directo en el dashboard de Supabase (confirmado por `grep` sobre `supabase/`: 0 resultados para estas tablas). Es la misma deuda que ya señalaba el README antes de esta versión.
- **Efecto:** son la base de datos real de v2.0 (Fase 3, comercio compartido) y v2.1 (auditoría + tareas) — en producción y en uso desde entonces.
- **Cómo revertir:** no recomendable — borraría el historial completo de auditorías y tareas reales.

## 2026-10-15 — Normalización de ciudad en 4 sedes

- **Qué:** `UPDATE benefit_locations SET city = 'cali' WHERE city = 'Cali'` sobre 4 filas: `cfebf317-77d7-4cba-bdbe-d457e48dd744` (Época), `64f97c2f-5b65-4af9-92d2-b1f439a09180` (Hotel 122 Pance), `278f8723-d8bc-4000-937a-dd8b3ad39c0f` (VIDAA, duplicada sin coordenadas), `f46e879e-a7de-446e-a215-dc89e3b6bce6` (VIDAA).
- **Archivo:** ninguno — `UPDATE` puntual ejecutado por Gustavo desde su sesión de chat, con su autorización.
- **Efecto:** esas 4 sedes dejaron de ser las únicas con una ciudad fuera del formato normalizado (minúsculas) que usa `city_regions` — desbloqueó poder exigir después la llave foránea (ver 2026-10-18).
- **Cómo revertir:** `UPDATE benefit_locations SET city = 'Cali' WHERE id IN (...)` sobre esos mismos 4 ids — pero revertirlo rompería la llave foránea agregada después si `'Cali'` (con mayúscula) no existe en `city_regions.city`.

## 2026-10-16 — Modelo de NIT en comercios

- **Qué:**
  - Secuencia `merchant_provisional_nit_seq` (rango `9999999000`–`9999999999`, solo `service_role` puede usarla).
  - `merchants.nit` (texto, obligatorio, único, 9 o 10 dígitos, `DEFAULT` = siguiente valor de la secuencia).
  - `merchants.merged_into` (nullable, comercio vigente si éste fue fusionado).
  - `merchants.nit_provisional` (columna generada: `true` si el NIT tiene 10 dígitos y empieza por `9999999`).
  - Función `merge_merchants(p_from uuid, p_into uuid)` — mueve beneficios y sedes de `p_from` a `p_into` y marca `p_from.merged_into = p_into`, en una transacción; no borra nada; solo `service_role` puede ejecutarla.
  - Agrupación de los 404 beneficios existentes por título completo normalizado: 5 se vincularon a comercios ya existentes (los 10 que ya tenían NIT `9999999000`–`9999999009`, asignados en orden alfabético); se crearon 382 comercios nuevos (NIT `9999999010`–`9999999391`); 387 beneficios quedaron vinculados en este paso.
- **Archivo:** ninguno — ejecutado directo en el SQL Editor por Gustavo.
- **Efecto verificado:** 392 comercios totales, **0 beneficios sin `merchant_id`** (de 404), secuencia en `9999999392`. Todos los 392 comercios con `nit_provisional = true` (ninguno tiene todavía un NIT real cargado ni ninguna fusión ejecutada — confirmado vía API el 2026-10-18: los 5 comercios "Smart Fit" siguen separados, todos provisionales, `merged_into` nulo).
- **Cómo revertir:** no recomendable una vez agrupados los beneficios — perdería el trabajo de agrupación. Si hiciera falta deshacer solo la función/secuencia sin tocar los datos: `DROP FUNCTION merge_merchants`, `DROP SEQUENCE merchant_provisional_nit_seq` (fallaría si algún `DEFAULT` todavía la referencia), `ALTER TABLE merchants DROP COLUMN nit_provisional, DROP COLUMN merged_into, DROP COLUMN nit`.

## 2026-10-18 — Trigger de cobertura desde sedes + llave foránea de ciudad

- **Qué:**
  - Función `recompute_benefit_city_from_sedes` + triggers `trg_links_recompute_city` (sobre `benefit_location_links`) y `trg_locations_city_recompute` (sobre `benefit_locations`) — recalculan `benefits.city` desde las sedes vinculadas cada vez que cambia un vínculo o la ciudad de una sede. **Solo actúan cuando hay al menos una sede con ciudad vinculada** — no blanquean la cobertura de un convenio que todavía no tiene sedes (sigue siendo manual, ver `docs/ADMIN.md` sección 1).
  - Llave foránea `benefit_locations_city_fkey` (`benefit_locations.city → city_regions.city`, `ON UPDATE CASCADE`, `ON DELETE RESTRICT`) + índice `idx_benefit_locations_city`.
  - **Recálculo aplicado una sola vez** a los 11 convenios que ya tenían sedes vinculadas en ese momento: 10 pasaron de `"Cali, Colombia"` a `"Cali"` (9 de USB Cali y "La Sevillana Parrilla" de Coomeva), y "La Sevillana" con USB Cali pasó de `"Cali, Palmira, Jamundí, Candelaria, Yumbo"` a `"Cali, Jamundí, Yumbo"`.
- **Archivo:** ninguno — ejecutado directo en el SQL Editor por Gustavo desde su sesión de chat.
- **Efecto verificado** (vía API, solo lectura, el 2026-10-18): el `benefits.id = 52b8ea2f-c1d0-4f59-a3ef-8b6cf10e440b` ("La Sevillana", USB Cali) tiene hoy `city = "Cali, Jamundí, Yumbo"`, exactamente lo reportado. La fila hermana con Comfandi (mismo comercio, `id = acb4ccc2-c763-48ef-892f-f8a8216724a9`) sigue con `"Cali, Palmira, Jamundí, Candelaria, Yumbo"` sin cambios — confirma que el trigger opera por descuento, no por comercio, y ese descuento no estaba entre los 11 recalculados.
- **Consecuencia práctica para el código del admin:** `src/lib/admin/coverage.ts` (preview en el cliente, item C2 de Admin v2.3) y el trigger ahora calculan lo mismo — deberían coincidir siempre. El preview del cliente se mantiene porque muestra el cambio *antes* de guardar, cosa que el trigger (que solo corre al escribir) no puede hacer.
- **Cómo revertir:**
  - Trigger: `DROP TRIGGER trg_links_recompute_city ON benefit_location_links`, `DROP TRIGGER trg_locations_city_recompute ON benefit_locations`, `DROP FUNCTION recompute_benefit_city_from_sedes`.
  - Llave foránea: `ALTER TABLE benefit_locations DROP CONSTRAINT benefit_locations_city_fkey` (y el índice si se quiere, `DROP INDEX idx_benefit_locations_city`).
  - **Los 11 `benefits.city` recalculados no vuelven solos al texto anterior** — no quedó un respaldo automático. Si hiciera falta restaurar el texto previo de "La Sevillana · USB Cali", es exactamente `"Cali, Palmira, Jamundí, Candelaria, Yumbo"` (citado arriba); los otros 10 no tienen su texto previo exacto registrado en este documento — revisar el historial de auditoría de Supabase (si lo tiene habilitado) antes de intentar revertirlos a mano.

---

## Estado de datos tras todos los cambios de arriba (verificado 2026-10-18, vía API de solo lectura)

404 beneficios (384 `activo`, 20 `pendiente_revision`) · 392 comercios (todos con `merged_into` nulo, ninguna fusión ejecutada) · 50 sedes · 54 vínculos sede↔descuento · 9 auditorías · 2 usuarios admin · 2 tareas · 9 beneficios de tarea. De los 404 descuentos, solo 11 tienen sedes vinculadas (los recalculados arriba) — los otros 393 siguen con cobertura manual.
