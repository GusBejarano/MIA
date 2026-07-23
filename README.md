# MIA — Descuentos Inteligentes

Frontend y motor conversacional de MIA para [descuentosinteligentes.com](https://descuentosinteligentes.com), construido con Next.js (App Router) y desplegado en Netlify.

Versión actual: **1.4.0** (aprendizaje progresivo del perfil) — despliegue en curso solo a Dev.

## Stack

- **Next.js 16** (App Router) + TypeScript + Tailwind CSS 4
- **@anthropic-ai/sdk** — Sonnet 5 (conversación) / Haiku 4.5 (clasificación, matching de texto libre)
- **@supabase/supabase-js** — persistencia (usuarios, afinidades, programas, beneficios, calificaciones, eventos), acceso 100% server-side con `service_role` key
- Deploy en **Netlify** vía `@netlify/plugin-nextjs`

## Estructura

```
src/
  app/
    page.tsx                    -> monta <MiaChat />
    layout.tsx, globals.css      -> layout raíz y estilos base (Tailwind)
    api/mia/route.ts             -> POST: arranca/continúa una conversación (OnboardingSession)
    api/mia/rating/route.ts      -> POST: guarda/borra una calificación de 1-3 estrellas (fuera del flujo de turnos de chat)
    api/mia/declare-relation/route.ts -> POST: declara relación activa con un benefactor desde el detalle (buscador de negocio), fuera del flujo de turnos de chat
  components/
    MiaChat.tsx                  -> UI completa del chat: fase phone-gate, render de mensajes/enlaces/tooltips, geolocalización, sessionStorage/localStorage, rotación del placeholder del input
    mia/
      ChipSelect.tsx             -> chips tocables (single o multi-select), incluye el chip "Volver" con flecha en gradiente de marca
      SummaryCards.tsx           -> tarjetas resumen de benefactores elegidos
      BenefitCarousel.tsx        -> carrusel horizontal de beneficios, con badge de calificación y badge de relación (activa/sin_relacion) superpuestos
      DetailSheet.tsx            -> hoja de detalle de un beneficio (estrellas, links condicionales, banner para declarar relación si no existe)
      RatingStars.tsx            -> sistema de calificación de 3 estrellas (también expone <Star> suelto para el badge del carrusel)
      InfoTooltip.tsx            -> tooltip con detección de colisiones (portal a document.body) para términos como "relación activa"
      Tip.tsx                    -> tip de bajo perfil (ensenar/recordar el buscador de negocio), mismo patrón visual que "¿No ves el tuyo?"
  lib/mia/                       -> motor conversacional de MIA
    systemPrompt.ts              -> bloque de personalidad/tono/guardrails (prompt cacheado, `cache_control: ephemeral`)
    claudeClient.ts               -> wrapper de la Claude API (`miaConversation` = Sonnet, `miaTask` = Haiku)
    onboarding.ts                 -> OnboardingSession: máquina de estados del flujo completo (ver "Flujo conversacional" abajo)
    copy.ts                       -> copy fijo y códigos de navegación compartidos entre backend y frontend (términos con tooltip, acciones NAV_BACK_TO_*)
    discovery.ts                   -> consultas de catálogo real: ciudades/benefactores/categorías/beneficios con cobertura activa, ranking de colores, nombres de programa por id
    businessSearch.ts               -> buscador de negocio en 2 capas: Capa 1 (pg_trgm sobre benefits.title, vía RPC) y Capa 2 (Haiku sobre conditions, solo si la Capa 1 no encuentra nada)
    uiMessages.ts                  -> contrato de tipos entre backend y frontend (chip_select, summary_cards, card_carousel, detail_sheet, tip, NavLink)
    cityMatch.ts                   -> matching de ciudad contra el campo `city` (texto libre, puede traer varias separadas por coma)
    phoneHash.ts                    -> hashea el teléfono del usuario con BEDI_HASH_SALT (nunca se guarda en texto plano)
    supabaseClient.ts                -> cliente Supabase server-only (bloqueado si se importa desde el navegador)
    store.ts                          -> toda la persistencia en Supabase (users, affinities, user_programs, benefit_exposures, benefit_ratings, events, last_business_search_at, app_settings)
    tasks/
      classifyOpenMessage.ts          -> Haiku: clasifica mensajes de conversación libre (BENEFACTOR:<nombre>, BENEFACTORES, CATEGORIAS, CATEGORIA:<nombre>, BUSCAR_NEGOCIO:<nombre>, NINGUNA)
      matchFromText.ts                 -> Haiku: matchea texto libre contra una lista real de opciones (benefactor/categoría/ciudad)
      detectCityChange.ts               -> Haiku: detecta si un mensaje libre indica cambio de ciudad (se combina con matchFromText para confirmar contra cobertura real)
      findBusinessInConditions.ts        -> Haiku: Capa 2 del buscador de negocio, busca menciones de un negocio dentro de `conditions` (caso "paraguas")
      parseProfileAnswer.ts               -> interpreta la respuesta libre a un campo de perfil pendiente (gender/birth_date vía Haiku, name trivial) - null si no trae un valor usable
scripts/
  mia-cli.ts                      -> simulador de conversación por terminal, sin depender del navegador (`npm run chat`)
supabase/
  2026.07.10-mia_supabase_schema_v1.sql       -> esquema base (users, affinities, programs, user_programs, benefits, benefit_exposures, events)
  2026.07.17-mia_location_permission.sql      -> agrega users.location_permission_granted + evento location_permission_granted
  2026.07.22-mia_session_started_event.sql    -> agrega el evento session_started (retención)
  2026.07.22-mia_business_search_similarity_fn.sql -> función RPC de solo lectura que expone pg_trgm/similarity() sobre benefits.title vía PostgREST (necesaria porque el backend no tiene conexión Postgres directa, solo supabase-js)
  _diagnostico_grants.sql                      -> diagnóstico/fix de privilegios de service_role sobre el esquema public
```

## Flujo conversacional

La exploración es un flujo **guiado por UI** (chips de una sola selección + carrusel), no una conversación libre en cada paso — tocar una opción dispara código determinístico directamente, sin pasar por el LLM. El LLM (Haiku) solo entra a interpretar cuando el usuario escribe texto libre en vez de tocar algo.

1. **Arranque** — número de WhatsApp como identificador (hasheado, nunca en texto plano). Si el dispositivo/número ya había concedido el permiso de ubicación antes, se salta directo sin volver a preguntar.
2. **Permiso de ubicación** — mensaje fijo, honesto sobre que la ubicación se guarda para no volver a pedirla. Si se rechaza, se repregunta en cada sesión nueva hasta que se conceda.
3. **Validación de cobertura** (silenciosa, sin mensaje intermedio) — si la ciudad detectada tiene descuentos activos, salta directo a benefactores; si no, muestra el listado completo de ciudades con cobertura real, ordenadas de mayor a menor.
4. **Benefactor** — selección única ("relación activa", con tooltip de qué significa) entre los benefactores con cobertura en la ciudad elegida.
5. **Categoría** — selección única entre las categorías con cobertura para ese benefactor + ciudad.
6. **Carrusel de beneficios** — tarjetas ordenadas de mayor a menor según la calificación que el usuario ya les dio; ciudad/benefactor/categoría son enlaces tocables dentro del mensaje que saltan directo a esa pantalla de elección.
7. **Detalle del beneficio** — ruta de contexto completa (Ciudad › Benefactor › Categoría), calificación de 1-3 estrellas, links condicionales (Cómo llegar / Sitio web / Redes, cada uno solo si el dato existe).

En cualquier punto posterior a la ubicación, el usuario puede **cambiar de ciudad, benefactor o categoría escribiendo texto libre** (ej. "muéstrame Cali", "y en Comfandi qué hay") — se interpreta con Haiku y se hace coincidencia aproximada contra la cobertura real; si no hay coincidencia, nunca se muestra un error seco, siempre el listado completo del nivel correspondiente.

## Buscador de negocio (texto libre, 1.3.0)

El usuario puede escribir el nombre de un negocio en cualquier punto de la conversación (ej. "¿tienes descuento en Crepes & Waffles?") y MIA responde si tiene descuento ahí. `classifyOpenMessage` lo reconoce como una intención más (`BUSCAR_NEGOCIO:<nombre>`), igual que ya reconoce benefactor/categoría — **ojo:** `detectCityChange` corre en paralelo con prioridad sobre esta clasificación (decisión preexistente, no de esta versión), así que un nombre de negocio que además sea un nombre de ciudad real puede interpretarse como cambio de ciudad en vez de búsqueda (ver nota en "Pruebas" abajo).

**2 capas, en orden:**
1. **Determinística (pg_trgm)** — similitud de trigramas contra `benefits.title`, vía la función RPC `search_benefits_by_title_similarity` (`supabase/2026.07.22-mia_business_search_similarity_fn.sql` — **hace falta aplicarla a mano en el SQL Editor de cada entorno**, PostgREST no puede invocar `similarity()` sin una función expuesta). Umbral `0.35`, calibrado contra casos reales del catálogo (ver "Pruebas").
2. **Semántica (Haiku)** — solo si la Capa 1 no devuelve nada. Busca dentro de `conditions` de todos los beneficios activos, para el caso "paraguas" (`Aldea Asiática`, cuyo título no menciona los restaurantes reales `Fusion Wok`/`Uki`/`Baoku`/`Mo Sushi` que sí aparecen en el texto de condiciones).

**Ramificación por ciudad** (con los resultados de cualquiera de las 2 capas, filtrados primero por la ciudad actual del usuario):
- **1 resultado en la ciudad** → detalle directo (Paso 7). Si el usuario no tiene relación declarada con ese benefactor, el detalle muestra un banner tocable para declararla (escribe en `user_programs` vía `/api/mia/declare-relation`, mismo mecanismo que elegir un benefactor por chip).
- **2+ resultados en la ciudad** → mini-carrusel (`BenefitCarousel`, mismo componente del carrusel de categoría) con un badge por tarjeta ("Relación activa" / "Sin relación aún").
- **0 en la ciudad, pero sí en otra** → respuesta honesta sobre cobertura futura + evento `business_search_out_of_city`.
- **0 en cualquier ciudad** → respuesta honesta de que no existe + evento `business_search_miss`.

**Enseñanza del buscador**, después de ver el detalle de un beneficio (por cualquier vía):
- **Ensenar** (tip gris, mismo patrón que "¿No ves el tuyo?"): una sola vez, en el primer beneficio que el usuario explora jamás, solo si nunca usó el buscador (`users.last_business_search_at IS NULL`).
- **Recordar** (tip con más peso visual): si ya lo usó pero hace más días que `app_settings.business_search_reminder_days` (seed `30`, cambiable desde Supabase sin redeploy) — máximo una vez por regreso (sesión), no en cada detalle mientras siga vencido.

El placeholder del input del chat rota entre 2-3 ejemplos (incluye uno de búsqueda de negocio) — puro frontend, sin relación con la lógica de ensenar/recordar de arriba.

## Aprendizaje progresivo del perfil (1.4.0)

En el mensaje de bienvenida de un usuario **que regresa** (nunca en su primera visita/onboarding), MIA pregunta como máximo **un** campo de perfil pendiente, en rotación `name` → `gender` → `birth_date` → `name` → ... (`user_profile_learning_fields.priority` define el orden; `user_profile_learning_state` guarda el progreso).

- **Selección del campo**: de los campos activos que TODAVÍA NO ESTÁN CONTESTADOS, se elige el que lleva más tiempo sin preguntarse (`updated_at` más viejo) — los nunca preguntados cuentan como "los más atrasados de todos" y entre varios nunca preguntados se desempata por prioridad (así un usuario nuevo siempre arranca en `name`). Si los 3 ya están contestados, no se pregunta nada de perfil.
- **Declinar nunca descarta un campo para siempre** — solo le pasa el turno al siguiente en la rotación. `attempts` se sigue incrementando (informativo, cuántas veces se declinó), pero ya no bloquea nada; el ciclo completo se repite indefinidamente hasta que los 3 campos queden `answered = true`.
- **El turno se registra AL PREGUNTAR, no solo al confirmar/declinar** (`recordProfileFieldAsked`) — si no fuera así, un usuario que responde algo interpretable (dispara la confirmación) pero abandona el chat sin confirmar/declinar dejaría ese campo marcado como "nunca preguntado", y podría volver a salir antes de tiempo en el siguiente regreso, rompiendo el orden de la rotación.
- **La pregunta usa `prompt_text` tal cual está en la tabla** — nunca pasa por el LLM (solo el saludo que la antecede sí es generado, para variar el tono sin arriesgar la redacción exacta de la pregunta).
- **`name` y `birth_date`: confirmación de un tap antes de guardar**. La respuesta libre se interpreta (texto tal cual para `name`; Haiku extrae y normaliza una fecha para `birth_date`, validando que sea real, pasada y no absurda) y se muestra como pregunta de confirmación (`Sí` / `Déjame pensarlo`, sin texto libre, sin badge de conteo). Solo al tocar "Sí" se guarda en la columna real de `users` y se marca `answered = true`.
- **`gender`: chips directos** (`Mujer` / `Hombre` / `No importa`, mapeados a `femenino`/`masculino`/`prefiero_no_decir`) — tocar una opción YA es la confirmación, sin paso de "Sí/Déjame pensarlo" (mismo patrón que elegir benefactor/categoría). Texto libre sigue disponible como fallback (Haiku interpreta sinónimos/coloquialismos contra los 4 valores válidos del `CHECK`, incluyendo `otro`) y en ese caso sí pasa por la confirmación de un tap.
- **`birth_date` no dispara ninguna lógica de `age_range` en el código** — el trigger de Postgres ya aplicado la deriva sola al guardar la columna.
- **Máximo una "cosa extra" por regreso**: si hay un campo de perfil elegible, se pregunta y **se suprime el tip del buscador de negocio (hint o recordatorio) durante el resto de esa sesión**, sin importar su propia lógica de umbral — nunca aparecen los dos. La pantalla de benefactores que normalmente acompaña el saludo de regreso se difiere hasta que el sub-flujo de perfil se resuelve (confirmado, declinado, o resuelto por chip), para no mostrar la pregunta de perfil y los chips de benefactor al mismo tiempo.

## Cómo correrlo

```bash
npm install
cp .env.example .env.local
```

Abre `.env.local` y pega la key del workspace "MIA by Descuentos Inteligentes" en `ANTHROPIC_API_KEY`, el `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` del proyecto de Supabase, y el `BEDI_HASH_SALT` compartido. Los modelos ya vienen con los defaults correctos (Sonnet 5, Haiku 4.5).

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

### Probar el motor de MIA por terminal (sin frontend)

```bash
npm run chat
```

Primero pide un número de teléfono de prueba — identifica al usuario en Supabase (`users.phone_hash`), igual que el número de WhatsApp real. Después hace preguntas marcadas `[SIMULACION]` (si el usuario concede el permiso de ubicación y qué ciudad detectaría el geolocalizador) — esas son del arnés de prueba, no mensajes de MIA. Ya escribe en Supabase de verdad (con `logVisit: false`, no cuenta como visita real para la métrica de retención).

Escribe `salir` para terminar y ver el perfil capturado en esa sesión.

## Variables de entorno

| Variable | Uso |
|---|---|
| `ANTHROPIC_API_KEY` | Key de Claude API |
| `MIA_MODEL_SONNET` | Default `claude-sonnet-5` (conversación) |
| `MIA_MODEL_HAIKU` | Default `claude-haiku-4-5-20251001` (clasificación/matching) |
| `BEDI_HASH_SALT` | Salt compartido para hashear el teléfono del usuario |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Acceso server-side a Supabase (nunca se expone al navegador, por eso no hay variables `NEXT_PUBLIC_*` de Supabase) |

## Esquema de Supabase

Las migraciones en `supabase/*.sql` son la fuente de verdad versionada — corren manualmente en el SQL Editor de Supabase (no hay CLI/CI conectado todavía). **Importante:** el esquema real ya tiene columnas en uso por el código que no están en ninguna migración versionada — quedaron creadas directo en el dashboard en algún momento:

- `public.benefits`: además de lo que trae la migración base, el código lee `status`, `image_url`, `company_url`, `social_media_url`, `how_to_get_there`, `address`, `research_source`.
- `public.benefit_ratings` (calificación de 1-3 estrellas): no tiene migración versionada en este repo. Columnas: `id, user_id (FK users), benefit_id (FK benefits), rating (smallint, CHECK 1-3), created_at, updated_at`, único por `(user_id, benefit_id)`, trigger de `updated_at`, RLS activo.
- `public.users.last_business_search_at` (timestamptz, nullable) y `public.users.level` (int, default `1`) — agregadas a mano para 1.3.0, tampoco tienen migración versionada en este repo.
- `public.app_settings` (`key text primary key, value text, updated_at timestamptz`) — agregada a mano para 1.3.0, con la fila seed `business_search_reminder_days = '30'`. Cambiar `value` desde Supabase cambia el comportamiento del tip de recordatorio sin redeploy (ver "Buscador de negocio" arriba).
- `public.users.birth_date` (date, nullable, con un trigger que deriva `age_range` automáticamente al guardarse) — agregada a mano para 1.4.0.
- `public.profile_learning_fields` (`field_key text, priority int, prompt_text text, active boolean`) — agregada a mano para 1.4.0, sembrada con `name` (prioridad 1), `gender` (2), `birth_date` (3).
- `public.user_profile_learning_state` (`user_id, field_key, answered boolean, attempts int, updated_at`) — agregada a mano para 1.4.0, sin filas semilla (se crea una fila por usuario/campo la primera vez que se declina o se pregunta).
- `public.users.whatsapp_number` (text, nullable) — agregada a mano. Guarda el número tal cual lo escribió el usuario (sin normalizar), en paralelo a `phone_hash` (que sigue siendo la única fuente de verdad de identidad). Escritura de mejor esfuerzo en `getOrCreateUser` (`store.ts`) — si falla, solo se loguea, nunca bloquea el registro/reconocimiento del usuario. Puramente informativo para consulta administrativa directa en Supabase: **nunca se lee, muestra ni usa desde la app.**

Si tocas alguna de estas tablas/columnas, considera versionar una migración de "documentación" que capture el estado real, para que el repo deje de estar desincronizado del esquema vivo.

## Qué falta / limitaciones conocidas

- **No hay persistencia de historial de conversación.** Los turnos de chat viven solo en el estado del navegador (`ClientState.history`, va y vuelve en cada request) — nunca se guardan en Supabase.
- **Un usuario que regresa vuelve a elegir benefactor desde cero**, y puede volver a ver el mismo beneficio sin restricción — el tope diario de vistas (`DAILY_DETAIL_VIEW_LIMIT` en `discovery.ts`) está desactivado a propósito. (`getUserProgramIds`/`getExposedBenefitIds` en `store.ts` sí tienen caller desde 1.3.0 — los usa el buscador de negocio para el badge de relación y el tip de "primer beneficio explorado" — pero todavía no se usan para saltar pasos del flujo guiado por chips.)
- **`name`, `age_range`, `gender` existen en `users` pero ningún flujo los captura todavía.**
- **`affinities.weight` siempre es `1.0` fijo** — no hay señal real de intensidad de preferencia, solo de que la categoría se tocó alguna vez.
- **No hay canal real de WhatsApp** — no hay webhook ni credenciales de ningún proveedor. El campo de "número de WhatsApp" en el phone-gate es solo un identificador que el usuario escribe a mano; identifica al usuario entre visitas web, no envía ni recibe mensajes de WhatsApp de verdad.
- **Calidad de datos:** el campo `benefits.city` (texto libre) trae inconsistencias reales — ciudades duplicadas por acentuación (ej. "Tuluá"/"Tulua", "Jamundí"/"Jamundi") y al menos un valor que es un departamento, no una ciudad ("Valle del Cauca"). Vale la pena revisar la carga de datos de benefactores/beneficios.
- **`users.level` es solo semilla de gamificación (1.3.0)** — la columna existe con default `1` y se confirmó que ningún flujo la sobreescribe, pero no hay ninguna mecánica de puntos/subida de nivel ni elemento de UI todavía.
- **Un nombre de negocio que coincide con una ciudad real** (ej. un negocio literalmente llamado como una ciudad) puede resolverse como cambio de ciudad en vez de búsqueda de negocio — `detectCityChange` corre en paralelo con prioridad sobre `classifyOpenMessage` (decisión preexistente a 1.3.0). Edge case detectado durante las pruebas de esta versión, no resuelto todavía.
- **La Capa 2 del buscador de negocio (Haiku sobre `conditions`) trae el catálogo activo completo en cada búsqueda sin match de título** — bien a la escala actual (~230 filas), pero no pagina ni acota por ciudad de antemano (a propósito, ver "Buscador de negocio" arriba); revisar si el catálogo crece mucho.
- **Los campos de aprendizaje de perfil (`name`/`gender`/`birth_date`) están hardcodeados en código** (`parseProfileAnswer.ts`, `onboarding.ts`) para saber cómo interpretar y confirmar cada uno — la selección de CUÁL preguntar sí es 100% data-driven (`profile_learning_fields`), pero agregar un campo nuevo (rol actual, estado civil, hijos, vehículo propio — documentados como fuera de alcance de 1.4.0) sí requiere código nuevo (parser + copy de confirmación + columna en `users`), no es solo sembrar una fila.
- Ver `auditoria-mia-2026.07.21.md` para el inventario completo (API de Claude, esquema, flujo de contexto por turno) y `notas-v1.3-2026.07.22.md` para el detalle de la ronda anterior (texto libre generalizado + evento `session_started`). La mini auditoría de calidad de `benefits.title`/`conditions` que motivó el diseño de 2 capas del buscador de negocio de 1.3.0 se hizo en conversación, sin archivo versionado.

## Pruebas — Buscador de negocio, enseñanza y gamificación (1.3.0)

Corridas contra Supabase de Dev real (`OnboardingSession` invocada directamente, sin pasar por HTTP — mismo patrón que `scripts/mia-cli.ts`), con usuarios de prueba creados y borrados en cada corrida (`users`, `user_programs`, `benefit_exposures`, `events`, `affinities` limpios al final — verificado que no quedó ningún usuario de prueba). `npx tsc --noEmit`, `npx eslint src` y `npx next build` corren limpios.

**Calibración del umbral de similitud (Capa 1, pg_trgm)** — contra casos reales del catálogo, con la función RPC ya aplicada:
- `"Motos Honda"` → `Motos Honda (5%)` / `Motos Honda (8%)` en `0.86`; a `0.35` excluye correctamente el falso positivo `Mototrack` (`0.22`, sí aparecía a `0.2`).
- `"Bodytech"`, `"Sushi Green"`, `"Sándwich Qbano"` (con y sin tilde/mayúsculas) → match exacto o cercano, estable en todo el rango `0.2`–`0.5`.
- `"gimnasio"` (término genérico) → **sin resultados** a `0.35` — a `0.2`–`0.3` sí devolvía un match espurio (`Gimnasio club ready Roldanillo`, `0.30`). Confirma que `0.35` es el punto correcto: no pierde los casos "mixto" reales de la auditoría, pero descarta coincidencias genéricas débiles.
- `"crepes y waffles"` (no existe en el catálogo) → sin resultados en ningún umbral, cae correctamente a la Capa 2 (que tampoco lo encuentra, ya que no existe).

**Los 4 casos de ramificación** (usuario de prueba en Cali, ciudad con catálogo real de Comfandi + Comfenalco):
- **1 resultado** (`"Sushi Green"`) → detalle directo, `relation.hasRelation = false` para un usuario nuevo. Declarar relación desde ahí escribió correctamente en `user_programs` (verificado con `getUserProgramIds`).
- **2+ resultados** (`"Bodytech"`, que existe como fila propia en Comfandi *y* como `"Bodytech - Cali"` en Comfenalco) → mini-carrusel con 2 tarjetas, ambas con badge `sin_relacion` para un usuario nuevo.
- **0 en la ciudad, sí en otra** (`"Encanto Jardin Musical"`, solo en Tuluá) → mensaje honesto sobre cobertura futura + 1 evento `business_search_out_of_city` registrado.
- **0 en cualquier ciudad** (negocio inventado) → mensaje honesto de que no existe + 1 evento `business_search_miss` registrado.

**Capa 2 (Haiku sobre `conditions`)** — `"Fusion Wok"` y `"Baoku"` (mencionados solo en el texto de condiciones de `Aldea Asiática`, no en su título) resolvieron correctamente al beneficio paraguas.

**Tip "ensenar"** — apareció (`tone: "hint"`) en el primer beneficio jamás explorado por un usuario nuevo con `last_business_search_at IS NULL`; no se repitió en un segundo detalle dentro de la misma sesión.

**Tip "recordar"** — con `last_business_search_at` simulado a 40 días (umbral seed `30`) apareció (`tone: "reminder"`) y no se repitió en un segundo detalle de la misma sesión/regreso. Con `last_business_search_at` a 2 días, no apareció ningún tip.

**`app_settings.business_search_reminder_days` sin redeploy** — con el uso simulado a 5 días: con el umbral seed (`30`) no había tip; tras bajar `value` a `"3"` directamente en la tabla (mismo mecanismo que usaría alguien desde el dashboard de Supabase), el siguiente detalle mostró el tip de recordatorio, sin reiniciar el proceso. Se restauró `value` a su valor original al terminar la prueba.

**`users.level`** — un usuario nuevo creado vía `getOrCreateUser` quedó con `level = 1` sin ningún cambio de código (el default de columna alcanza); confirmado que ningún flujo lo sobreescribe.

**Edge case real encontrado (no corregido, ver "Qué falta"):** una primera versión de la prueba del caso "fuera de ciudad" usaba el negocio `"Centro de recreación Caicedonia"` — como `"Caicedonia"` es también una ciudad real con cobertura, `detectCityChange` (que corre en paralelo con prioridad, decisión preexistente) interpretó el mensaje como cambio de ciudad en vez de búsqueda de negocio, y cambió la ciudad del usuario de prueba a Caicedonia. Se cambió el caso de prueba a un negocio sin nombre de ciudad (`"Encanto Jardin Musical"`) para aislar la ramificación real, pero la ambigüedad de fondo sigue sin resolverse.

**Corrección post-lanzamiento (misma corrida de 1.3.0):** un usuario real reportó que el detalle de un beneficio llegado por el buscador de negocio mostraba el breadcrumb con un hueco ("Cali ›  › Acondicionamiento físico") — `profile.selectedBenefactorName` solo se llena en el flujo guiado por chips, así que un beneficio abierto vía el buscador lo dejaba vacío. Se reprodujo el caso exacto (`"tienes descuentos en Gym"` → carrusel con 2 negocios reales llamados "Gym Pro", uno de Comfandi y otro de Comfenalco → detalle de cualquiera de los dos) y se corrigió usando `relation.programName` (ya resuelto desde el propio beneficio) en vez del campo de perfil. Verificado con el mismo caso real tras el fix.

## Pruebas — Aprendizaje progresivo del perfil (1.4.0)

Mismo método que las pruebas de 1.3.0 (`OnboardingSession` invocada directamente contra Supabase de Dev, usuarios de prueba creados y borrados en cada corrida — incluyendo `user_profile_learning_state`, verificado sin residuos). `npx tsc --noEmit`, `npx eslint src` y `npx next build` corren limpios.

- **Usuario nuevo, primer regreso** → se le preguntó `name` (prioridad 1) con el `prompt_text` exacto de la tabla, sin chips. Al responder "Gus" y confirmar con "Sí": `users.name` quedó en `"Gus"`, `user_profile_learning_state` marcó `name.answered = true`, y el **siguiente regreso** (nueva sesión, mismo teléfono) preguntó `gender` (prioridad 2) — la progresión entre campos funciona.
- **Rotación completa** (4 regresos distintos, declinando `name`, luego `gender`, luego `birth_date`) → cada regreso preguntó el siguiente campo en la secuencia (nunca repitió uno ya preguntado en el regreso inmediatamente anterior), y el **4to regreso volvió a preguntar `name`** — confirma el ciclo `name → gender → birth_date → name → ...`. Al confirmar `name` en ese punto, el regreso siguiente ya no volvió a preguntarlo y siguió con `gender` — confirma que solo contestar (no declinar) saca un campo de la rotación para siempre.
- **`birth_date` con fecha real** (`"15 de marzo de 1990"`, interpretada y confirmada) → `users.birth_date` quedó en `1990-03-15` y `users.age_range` se derivó solo (`"36 a 50"`), sin ningún código de la app tocando esa columna — el trigger ya aplicado hizo el trabajo.
- **Campo de perfil pendiente + recordatorio de negocio también vencido** (`last_business_search_at` simulado a 40 días) → solo apareció la pregunta de perfil en el saludo; al completar el sub-flujo y navegar hasta ver el detalle de un beneficio en la misma sesión, el tip de recordatorio de negocio **no apareció** — confirma que un campo de perfil elegible ocupa el único "extra" del regreso.
- **Usuario con los 3 campos ya contestados** (marcados `answered = true` directamente, sin pasar por el flujo conversacional) → el saludo de regreso no preguntó nada de perfil y mostró los chips de benefactor de una, como el flujo pre-1.4.0; con `last_business_search_at` vencido, el tip de recordatorio de negocio **sí apareció** normalmente — confirma que la supresión es exclusiva de cuando hay de verdad un campo pendiente.

## Deploy

El proyecto incluye `netlify.toml` con `@netlify/plugin-nextjs`. Configura las variables de entorno (`ANTHROPIC_API_KEY`, `MIA_MODEL_SONNET`, `MIA_MODEL_HAIKU`, `BEDI_HASH_SALT`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) en el dashboard de Netlify (Site settings → Environment variables) antes del primer deploy.

- `main` → producción.
- `dev` → entorno de desarrollo (el pie de página del chat muestra el prefijo `dev-` fuera de `main`).

Antes de mergear `dev` a `main`, corre cualquier migración `.sql` nueva de `supabase/` en el proyecto de Supabase de producción — no hay ninguna automatización que lo haga por vos.
