# Auditoría de estado actual — MIA (2026-07-21)

Reporte de solo lectura. No se modificó ningún archivo ni se ejecutó ninguna migración para producir este documento.

## API de Claude

**Ubicación:** `src/lib/mia/claudeClient.ts` — único punto de contacto con `@anthropic-ai/sdk` en todo el repo.

**Modelos (tal como aparecen en el código):**
- `SONNET_MODEL = process.env.MIA_MODEL_SONNET ?? "claude-sonnet-5"` — usado por `miaConversation()`, la conversación real con el usuario.
- `HAIKU_MODEL = process.env.MIA_MODEL_HAIKU ?? "claude-haiku-4-5-20251001"` — usado por `miaTask()`, las tareas de clasificación/matching de back-office.

**System prompt:**
- `src/lib/mia/systemPrompt.ts` exporta `MIA_SYSTEM_PROMPT`, un bloque **estático** (personalidad/tono/guardrails, en español, ~60 líneas). No se arma dinámicamente con datos del usuario ni de la conversación — es texto fijo, igual para cualquier usuario en cualquier momento.
- Cada llamada a `miaConversation()` agrega un **segundo bloque de system** dinámico: `turnInstruction`, una instrucción en texto libre construida en `onboarding.ts` para ese turno puntual (ej. "El usuario concedió el permiso de ubicación, está en Cali..."), con datos reales interpolados (ciudad, nombre de benefactor, etc.). Este bloque nunca se cachea (no lleva `cache_control`).
- **Importante para la próxima fase:** desde los cambios de esta sesión (v1.2), buena parte de los mensajes de la etapa de descubrimiento (permiso de ubicación, pantalla de ciudades, pantalla de benefactores, pantalla de categorías, intro del carrusel) **ya no pasan por el LLM** — son strings fijos armados en `onboarding.ts` (`LOCATION_PERMISSION_MESSAGE`, `LOCATION_DECLINED_MESSAGE`, `benefactorSelectMessage()`, `categorySelectMessage()`, `carouselMessage()`). El LLM (`miaConversation`) hoy solo interviene en: el saludo de usuario que regresa, los reprompts cuando no se entiende una selección, los mensajes de "sin cobertura/sin beneficios en este momento", la intro de la vista de detalle, y la conversación libre genérica (catch-all).

**Prompt caching:**
- Sí, pero solo sobre `MIA_SYSTEM_PROMPT` (`cache_control: { type: "ephemeral" }` en `claudeClient.ts:36`). Nada más se cachea — ni catálogo de beneficios, ni perfil de usuario, ni historial.
- `miaTask()` (Haiku) no usa `system` en absoluto — cada prompt es un string autocontenido, sin caching.

**Clasificador (Haiku 4.5):**
- `src/lib/mia/tasks/classifyOpenMessage.ts` — clasifica mensajes de conversación libre en exactamente 4 intents (tal como están en el código): `NINGUNA` (`{kind:"none"}`), `BENEFACTORES` (`{kind:"benefactors"}`), `CATEGORIAS` (`{kind:"category_menu"}`), `CATEGORIA:<nombre>` (`{kind:"category", label}`). Solo se dispara cuando el usuario escribe texto libre en vez de tocar un chip.
- `src/lib/mia/tasks/matchFromText.ts` — `matchManyFromList`/`matchOneFromList`, no es un clasificador de intención sino un fuzzy-matcher texto→opción real (se usa para interpretar texto libre como benefactor o categoría).
- `src/lib/mia/tasks/detectCityChange.ts` — **existe pero no está conectado**: no hay ningún `import` de esta función en el resto del código (confirmado por búsqueda). Es código muerto.

**Streaming:** No. Tanto `miaConversation()` como `miaTask()` llaman `client.messages.create()` sin `stream: true` y extraen el bloque de texto completo de la respuesta ya resuelta.

## Esquema de Supabase

Fuente: `supabase/2026.07.10-mia_supabase_schema_v1.sql` + `supabase/2026.07.17-mia_location_permission.sql`, más lo que el código realmente consulta/escribe (hay columnas en uso que no están en ninguna migración del repo — ver más abajo).

| Tabla | Columnas |
|---|---|
| `public.users` | `id, phone_hash, name, age_range, gender, city, consent_given_at, created_at, last_active_at, deleted_at, location_permission_granted` (esta última agregada por la migración del 17 de julio) |
| `public.affinities` | `id, user_id, category, source ('declarada'\|'inferida'), weight, updated_at`, único por `(user_id, category)` |
| `public.programs` | `id, name, type` — catálogo fijo, sembrado con Comfandi, Comfenalco, Visa, Mastercard, Puntos Colombia, PriceSmart |
| `public.user_programs` | `id, user_id, program_id, declared_at`, único por `(user_id, program_id)` |
| `public.benefits` | Migración: `id, source_program_id, title, category, city, valid_from, valid_until, conditions, access_type, raw_data, created_at, updated_at`. **El código además lee `status`, `image_url`, `company_url`, `social_media_url`, `how_to_get_there`, `address`** (`src/lib/mia/discovery.ts`) — columnas que no están en ninguna migración versionada del repo, es decir el esquema real de Supabase ya divergió de lo que hay en `supabase/*.sql`. |
| `public.benefit_exposures` | `id, user_id, benefit_id, shown_at, channel` |
| `public.events` | `id, user_id, event_type, payload, occurred_at` — `event_type` es un enum controlado por `CHECK`, valores actuales: `onboarding_started, onboarding_completed, benefit_shown, benefit_clicked, session_returned, feedback_given, city_interest_declared, city_detected, location_permission_granted`. De estos, **solo `city_interest_declared`, `city_detected` y `location_permission_granted` se insertan de verdad** en el código hoy (`store.ts`) — los otros cinco están declarados en el `CHECK` pero ningún código los usa todavía. |
| `public.benefit_ratings` | **No existe en ninguna migración del repo** — la creaste tú directamente en Supabase (fuera de este repositorio de código) en la sesión de "Paso 7". Columnas según tu propia descripción: `id, user_id (FK users), benefit_id (FK benefits), rating (smallint 1-3, CHECK), created_at, updated_at`, único por `(user_id, benefit_id)`, trigger de `updated_at`, RLS activo. Mismo riesgo de deriva de esquema que el punto anterior: no hay un `.sql` versionado para ella. |

**Campos de perfil que ya se guardan hoy (`public.users`):**
- Escritos activamente por el código: **`city`** (`saveCity()`) y **`location_permission_granted`** (`saveLocationPermission()`).
- Existen en el esquema pero **ningún código los escribe todavía**: `name`, `age_range`, `gender`. Están en la tabla desde la migración original pero no hay ningún flujo (onboarding ni ningún otro) que los capture o los guarde.

**Tabla de historial de mensajes/conversación:** No existe. El historial completo de turnos (`ChatMessage[]`, con `role`/`content`) vive únicamente en el estado del cliente (`ClientState.history` en `src/app/api/mia/route.ts` y `src/components/MiaChat.tsx`) y viaja de ida y vuelta en el body de cada request HTTP — **nunca se persiste en Supabase**. Si se cierra la pestaña o se borra el `localStorage`, la conversación en sí se pierde por completo (solo sobreviven los eventos puntuales en `events` y las filas de `affinities`/`user_programs`/`benefit_exposures`/`benefit_ratings`).

**Campos/tablas que ya intentan capturar preferencias o afinidades (parcial):**
- `affinities`: se escribe (upsert) cada vez que el usuario entra a ver el carrusel de una categoría (`saveAffinity()`, en `showCarouselForCategory`) — `source` siempre `"declarada"`, `weight` siempre `1.0` fijo (no se acumula ni sube con repetición). Es una señal binaria de "tocó esta categoría alguna vez", no un peso real.
- `user_programs`: se escribe (`saveProgramSelections()`) cada vez que el usuario elige un benefactor, pero **nunca se vuelve a leer** — `getUserProgramIds()` existe en `store.ts` pero no tiene ningún caller en el resto del código. Un usuario que regresa vuelve a tener que elegir su benefactor desde cero cada sesión aunque la fila ya exista en Supabase.
- `benefit_exposures`: se escribe (`saveExposure()`) cada vez que se abre el detalle de un beneficio, pero **tampoco se vuelve a leer** — `getExposedBenefitIds()` existe en `store.ts` sin caller. La lógica de tope diario de vistas (`getDailyDetailViewCount`/`DAILY_DETAIL_VIEW_LIMIT` en `discovery.ts`) está explícitamente desactivada (comentario propio en `onboarding.ts`: "Tope diario de vistas de detalle desactivado en esta etapa de lanzamiento del MVP").
- `benefit_ratings`: única señal de preferencia que sí se **escribe y se lee activamente** hoy — se usa tanto para pre-llenar las estrellas al abrir el detalle como para ordenar el carrusel de mayor a menor calificación (agregado en esta sesión).

## Flujo de contexto por turno

Por cada mensaje que llega a `POST /api/mia` (`src/app/api/mia/route.ts`):
1. El cliente manda el `phone`, el mensaje/selección, y el `state` completo de la sesión anterior (`{history, stage, profile, userId}`) — el backend es stateless (no hay memoria de servidor entre requests).
2. `OnboardingSession` se reconstruye en memoria a partir de ese `state`.
3. Según la etapa (`stage`), se resuelve determinísticamente en código (sin LLM) qué mostrar — **excepto** cuando el mensaje es texto libre sin chip, donde antes se llama a Haiku (`classifyOpenMessage`) para decidir intención, y a veces a `matchOneFromList` para interpretar el texto contra una lista real (benefactores/categorías).
4. Cuando sí se llama a `miaConversation` (Sonnet), el contexto que se junta es: (a) el bloque de personalidad estático cacheado, (b) la instrucción de ese turno con los datos reales ya resueltos por código (ciudad, nombre de benefactor, etc. — nunca se le pasa el perfil completo de Supabase ni el catálogo crudo), (c) el `history` completo de la conversación tal como viene del cliente.
5. No se junta explícitamente "perfil de usuario" desde Supabase para dárselo al LLM como contexto — los únicos datos de Supabase que llegan al LLM son los que ya fueron resueltos a texto dentro de la `turnInstruction` (ej. el nombre de una ciudad o de un benefactor), nunca un perfil estructurado completo.

**Turnos de historial enviados:** todos los que existan en `ClientState.history` — no hay ningún corte ni ventana deslizante. Cada turno de usuario y de MIA se va acumulando ahí (`this.history.push(...)`) desde el primer "Hola" sintético del arranque.

**Límite o truncamiento de contexto:** No existe ninguno en el código. No hay recorte por cantidad de turnos ni por tokens — el `history` crece sin límite mientras dure la sesión del navegador (que en la práctica termina siendo acotado porque el historial vive solo en memoria del cliente, no sobrevive a un refresh completo salvo que el usuario no recargue la página).

## Flujo de descubrimiento (Fase 1)

**Ciudad → benefactor → categoría → beneficio:** es un flujo **guiado por UI** (chips tocables de un solo tap, definidos en `onboarding.ts`: `cityChipMessage`, `benefactorChipMessage`, `categoryChipMessage`, y el `card_carousel` final), no una conversación libre en cada paso. Tocar un chip dispara directamente el código correspondiente (`resolveCityChoice`, `resolveBenefactorSelect`, `resolveCategorySelect`, `showCarouselForCategory`) sin pasar por el LLM para decidir el enrutamiento. El LLM solo entra si el usuario ignora los chips y escribe texto libre (ahí sí pasa por Haiku para clasificar/matchear). Selección de ciudad, benefactor y categoría son todas de **una sola opción** (no múltiple) desde los cambios de esta sesión. Además, desde el mensaje del carrusel (Paso 6), el nombre de ciudad/benefactor/categoría son enlaces tocables que saltan directo a esa pantalla de elección (`NavLink`, en `uiMessages.ts`).

**Sistema de rating de 3 estrellas:** sí está conectado de punta a punta y desplegado en producción — componente `RatingStars` en el detalle del beneficio, badge de estrellas en las tarjetas del carrusel, endpoint dedicado `POST /api/mia/rating` (fuera del flujo de turnos de chat, porque calificar no genera respuesta de MIA) que hace upsert/delete contra `benefit_ratings`. Es funcional y fue verificado manualmente en esta sesión. No tengo forma de confirmar desde el código si ya hay usuarios reales calificando en producción (eso requeriría consultar los datos en Supabase, no algo que pueda ver leyendo el repo).

## Canal WhatsApp

No existe ningún puente real con WhatsApp (no hay webhook, no hay integración con WhatsApp Business API/Twilio/Meta — no hay credenciales de ningún proveedor de mensajería en `.env.example` ni `.env.local.example`, y `src/app/api/` solo tiene las dos rutas `mia` y `mia/rating`). Lo que existe es:
- Una pantalla web (`MiaChat.tsx`, fase `"phone-gate"`) donde el usuario **escribe manualmente** su número de WhatsApp como texto libre — se usa únicamente como identificador (hasheado con `BEDI_HASH_SALT` vía `hashPhone()`) para reconocerlo entre visitas, no para enviar ni recibir mensajes de WhatsApp de verdad.
- El propio `README.md` (sección "Qué falta conectar") documenta esto como pendiente: *"Falta exponer `onboarding.ts` a través de rutas de API del chat web... ahí es donde `OnboardingSession` recibirá el teléfono real (webhook de WhatsApp o sesión web autenticada)"* — es decir, el propio equipo ya tenía identificado que el webhook de WhatsApp real todavía no existe.

## Brechas identificadas

Esto es lo que se preguntó en este documento y **no existe** hoy en el código:

1. **No hay persistencia de historial de conversación.** Los turnos de chat viven solo en el estado del navegador; no hay tabla `messages`/`conversations` en Supabase. Cualquier memoria de "qué se habló" tendría que reconstruirse desde los eventos/afinidades/exposiciones puntuales, no desde una transcripción real.
2. **`name`, `age_range`, `gender` existen en `users` pero no se capturan.** No hay ningún flujo que los pregunte ni los guarde.
3. **Las señales de preferencia ya capturadas no se reutilizan.** `user_programs` y `benefit_exposures` se escriben pero nunca se leen de vuelta (`getUserProgramIds`/`getExposedBenefitIds` son código muerto) — un usuario que regresa no se beneficia de esos datos: vuelve a elegir benefactor desde cero y puede volver a ver el mismo beneficio sin restricción. Esto contradice directamente lo que promete `systemPrompt.ts` ("No repitas un beneficio mostrado recientemente... Usa la ciudad ya guardada... Nunca repites las 3 preguntas de onboarding a alguien que ya las respondió antes") — esas son instrucciones para el LLM, pero el código que debería respaldarlas con datos reales (para todo excepto ciudad/benefactor-al-inicio) no está conectado.
4. **`affinities.weight` no es una señal real de fuerza de preferencia.** Siempre se guarda en `1.0`, sin importar cuántas veces el usuario vuelva a esa categoría — no hay nada que la haga crecer o decaer.
5. **`detectCityChange.ts` es código muerto.** Está escrito pero no importado en ningún flujo activo.
6. **El "Paso 2" del onboarding original de 3 preguntas ("¿qué tipo de plan te interesa?") no está implementado como pregunta explícita.** `systemPrompt.ts` todavía lo describe en su bloque de ONBOARDING, pero el flujo real implementado (ubicación → ciudad → benefactor → categoría) no incluye ese paso; la única señal de "tipo de plan" que se captura es implícita, cuando el usuario efectivamente entra a ver una categoría.
7. **No hay ninguna tabla ni mecanismo de "sesión"** (más allá del `userId`/`phone_hash`) — no hay noción de sesiones discretas con inicio/fin, duración, o cuántas veces regresó un usuario, salvo lo que se pueda inferir indirectamente de `last_active_at` y timestamps sueltos en `events`.
8. **No hay canal real de WhatsApp** — ni webhook, ni credenciales, ni SDK de ningún proveedor. Ver sección anterior.
9. **`README.md` está desactualizado respecto al código real.** Documenta archivos que ya no existen (`mockBenefits.ts`, `tasks/classifyAffinity.ts`, `tasks/extractPrograms.ts`, `tasks/rankBenefits.ts`) y no menciona los archivos reales agregados desde entonces (`discovery.ts`, `uiMessages.ts`, `cityMatch.ts`, `copy.ts`, los componentes de UI en `src/components/mia/`, ni el endpoint de rating). No es una "brecha" funcional, pero sí una fuente de información engañosa si se usa como referencia para planear la siguiente fase.
10. **No hay streaming ni límite/ventana de contexto.** Si la próxima fase agrega memoria de largo plazo (perfil + historial + catálogo) al prompt, hoy no hay ningún mecanismo de recorte, resumen, ni streaming ya construido sobre el cual apoyarse — habría que construirlo desde cero.
