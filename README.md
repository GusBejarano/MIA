# MIA — Descuentos Inteligentes

Frontend y motor conversacional de MIA para [descuentosinteligentes.com](https://descuentosinteligentes.com), construido con Next.js (App Router) y desplegado en Netlify.

Versión actual: **1.2.1**.

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
  components/
    MiaChat.tsx                  -> UI completa del chat: fase phone-gate, render de mensajes/enlaces/tooltips, geolocalización, sessionStorage/localStorage
    mia/
      ChipSelect.tsx             -> chips tocables (single o multi-select), incluye el chip "Volver" con flecha en gradiente de marca
      SummaryCards.tsx           -> tarjetas resumen de benefactores elegidos
      BenefitCarousel.tsx        -> carrusel horizontal de beneficios, con badge de calificación superpuesto
      DetailSheet.tsx            -> hoja de detalle de un beneficio (estrellas, links condicionales)
      RatingStars.tsx            -> sistema de calificación de 3 estrellas (también expone <Star> suelto para el badge del carrusel)
      InfoTooltip.tsx            -> tooltip con detección de colisiones (portal a document.body) para términos como "relación activa"
  lib/mia/                       -> motor conversacional de MIA
    systemPrompt.ts              -> bloque de personalidad/tono/guardrails (prompt cacheado, `cache_control: ephemeral`)
    claudeClient.ts               -> wrapper de la Claude API (`miaConversation` = Sonnet, `miaTask` = Haiku)
    onboarding.ts                 -> OnboardingSession: máquina de estados del flujo completo (ver "Flujo conversacional" abajo)
    copy.ts                       -> copy fijo y códigos de navegación compartidos entre backend y frontend (términos con tooltip, acciones NAV_BACK_TO_*)
    discovery.ts                   -> consultas de catálogo real: ciudades/benefactores/categorías/beneficios con cobertura activa, ranking de colores
    uiMessages.ts                  -> contrato de tipos entre backend y frontend (chip_select, summary_cards, card_carousel, detail_sheet, NavLink)
    cityMatch.ts                   -> matching de ciudad contra el campo `city` (texto libre, puede traer varias separadas por coma)
    phoneHash.ts                    -> hashea el teléfono del usuario con BEDI_HASH_SALT (nunca se guarda en texto plano)
    supabaseClient.ts                -> cliente Supabase server-only (bloqueado si se importa desde el navegador)
    store.ts                          -> toda la persistencia en Supabase (users, affinities, user_programs, benefit_exposures, benefit_ratings, events)
    tasks/
      classifyOpenMessage.ts          -> Haiku: clasifica mensajes de conversación libre (BENEFACTOR:<nombre>, BENEFACTORES, CATEGORIAS, CATEGORIA:<nombre>, NINGUNA)
      matchFromText.ts                 -> Haiku: matchea texto libre contra una lista real de opciones (benefactor/categoría/ciudad)
      detectCityChange.ts               -> Haiku: detecta si un mensaje libre indica cambio de ciudad (se combina con matchFromText para confirmar contra cobertura real)
scripts/
  mia-cli.ts                      -> simulador de conversación por terminal, sin depender del navegador (`npm run chat`)
supabase/
  2026.07.10-mia_supabase_schema_v1.sql       -> esquema base (users, affinities, programs, user_programs, benefits, benefit_exposures, events)
  2026.07.17-mia_location_permission.sql      -> agrega users.location_permission_granted + evento location_permission_granted
  2026.07.22-mia_session_started_event.sql    -> agrega el evento session_started (retención)
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

- `public.benefits`: además de lo que trae la migración base, el código lee `status`, `image_url`, `company_url`, `social_media_url`, `how_to_get_there`, `address`.
- `public.benefit_ratings` (calificación de 1-3 estrellas): no tiene migración versionada en este repo. Columnas: `id, user_id (FK users), benefit_id (FK benefits), rating (smallint, CHECK 1-3), created_at, updated_at`, único por `(user_id, benefit_id)`, trigger de `updated_at`, RLS activo.

Si tocas alguna de estas dos tablas, considera versionar una migración de "documentación" que capture el estado real, para que el repo deje de estar desincronizado del esquema vivo.

## Qué falta / limitaciones conocidas

- **No hay persistencia de historial de conversación.** Los turnos de chat viven solo en el estado del navegador (`ClientState.history`, va y vuelve en cada request) — nunca se guardan en Supabase.
- **`user_programs` y `benefit_exposures` se escriben pero nunca se vuelven a leer** (`getUserProgramIds`/`getExposedBenefitIds` en `store.ts` no tienen ningún caller). Un usuario que regresa vuelve a elegir benefactor desde cero, y puede volver a ver el mismo beneficio sin restricción — el tope diario de vistas (`DAILY_DETAIL_VIEW_LIMIT` en `discovery.ts`) está desactivado a propósito.
- **`name`, `age_range`, `gender` existen en `users` pero ningún flujo los captura todavía.**
- **`affinities.weight` siempre es `1.0` fijo** — no hay señal real de intensidad de preferencia, solo de que la categoría se tocó alguna vez.
- **No hay canal real de WhatsApp** — no hay webhook ni credenciales de ningún proveedor. El campo de "número de WhatsApp" en el phone-gate es solo un identificador que el usuario escribe a mano; identifica al usuario entre visitas web, no envía ni recibe mensajes de WhatsApp de verdad.
- **Calidad de datos:** el campo `benefits.city` (texto libre) trae inconsistencias reales — ciudades duplicadas por acentuación (ej. "Tuluá"/"Tulua", "Jamundí"/"Jamundi") y al menos un valor que es un departamento, no una ciudad ("Valle del Cauca"). Vale la pena revisar la carga de datos de benefactores/beneficios.
- Ver `auditoria-mia-2026.07.21.md` para el inventario completo (API de Claude, esquema, flujo de contexto por turno) y `notas-v1.3-2026.07.22.md` para el detalle de la última ronda de cambios (texto libre generalizado + evento `session_started` para medir retención).

## Deploy

El proyecto incluye `netlify.toml` con `@netlify/plugin-nextjs`. Configura las variables de entorno (`ANTHROPIC_API_KEY`, `MIA_MODEL_SONNET`, `MIA_MODEL_HAIKU`, `BEDI_HASH_SALT`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) en el dashboard de Netlify (Site settings → Environment variables) antes del primer deploy.

- `main` → producción.
- `dev` → entorno de desarrollo (el pie de página del chat muestra el prefijo `dev-` fuera de `main`).

Antes de mergear `dev` a `main`, corre cualquier migración `.sql` nueva de `supabase/` en el proyecto de Supabase de producción — no hay ninguna automatización que lo haga por vos.
