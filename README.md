# MIA — Descuentos Inteligentes

Frontend y motor conversacional de MIA para [descuentosinteligentes.com](https://descuentosinteligentes.com), construido con Next.js (App Router) y desplegado en Netlify.

## Stack

- **Next.js 16** (App Router) + TypeScript + Tailwind CSS
- **@anthropic-ai/sdk** — Sonnet 5 (conversación) / Haiku 4.5 (tareas de clasificación y ranking)
- **@supabase/supabase-js** — persistencia (usuarios, afinidades, programas, eventos)
- Deploy en **Netlify** vía `@netlify/plugin-nextjs`

## Estructura

```
src/
  app/            -> rutas del App Router (páginas + API routes del chat)
  lib/mia/        -> motor conversacional de MIA (portado de mia-motor/)
    systemPrompt.ts     -> bloque de personalidad/tono (prompt cacheado)
    claudeClient.ts      -> wrapper de la Claude API (Sonnet + Haiku)
    onboarding.ts         -> máquina de estados del guion completo
    mockBenefits.ts       -> catálogo de prueba (10 beneficios en Cali)
    mockStore.ts          -> simula el guardado en Supabase (solo console.log,
                              se reemplaza por el cliente real cuando se conecte)
    tasks/
      classifyAffinity.ts  -> Haiku: clasifica la Pregunta 2
      extractPrograms.ts   -> Haiku: extrae la Pregunta 3
      detectCityChange.ts  -> Haiku: detecta cambio de ciudad en texto libre
      rankBenefits.ts       -> ranking mecánico + razón de cada recomendación (Haiku)
scripts/
  mia-cli.ts      -> simulador de conversación por terminal (mismo harness de prueba
                     que existía en mia-motor/src/cli.ts, sin depender del navegador)
```

## Cómo correrlo

```bash
npm install
cp .env.example .env.local
```

Abre `.env.local` y pega la key del workspace "MIA by Descuentos Inteligentes" en `ANTHROPIC_API_KEY`, y las credenciales del proyecto de Supabase. Los modelos ya vienen con los defaults correctos (Sonnet 5, Haiku 4.5).

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

### Probar el motor de MIA por terminal (sin frontend)

```bash
npm run chat
```

Vas a ver primero unas preguntas marcadas `[SIMULACION]` — esas son del arnés de prueba, simulan lo que haría el navegador (si el usuario concede el permiso de ubicación y qué ciudad detectaría el geolocalizador). No son mensajes de MIA. Después de eso, la conversación real con MIA empieza.

Prueba estos escenarios para cubrir el guion completo:

1. **Permiso concedido + Cali:** contesta "s" y "Cali" en las preguntas de simulación — deberías ver la afirmación directa ("Veo que estás en Cali...") sin que te pregunte la ciudad.
2. **Permiso concedido + otra ciudad:** contesta "s" y "Bogotá" — deberías ver el mensaje de "por ahora solo tengo beneficios en Cali, voy a investigar...".
3. **Permiso no concedido:** contesta "n" — deberías ver el listado de ciudades (Cali / me interesa otra).
4. En cualquiera de los tres, sigue respondiendo las preguntas de afinidad y programas para llegar al reveal con las 3 recomendaciones.

Escribe `salir` para terminar y ver el perfil capturado en esa sesión.

## Qué falta conectar

- `src/lib/mia/mockStore.ts` todavía solo imprime en consola — falta reemplazarlo por el cliente real de Supabase (`service_role` key) sin tocar `onboarding.ts`.
- `src/lib/mia/mockBenefits.ts` usa 10 beneficios de ejemplo en Cali — falta el catálogo real.
- Falta exponer `onboarding.ts` a través de rutas de API del chat web (`src/app/api/...`) para reemplazar `scripts/mia-cli.ts` como punto de entrada de producción.

## Deploy

El proyecto incluye `netlify.toml` con `@netlify/plugin-nextjs`. Configura las variables de entorno (`ANTHROPIC_API_KEY`, `MIA_MODEL_SONNET`, `MIA_MODEL_HAIKU`, `BEDI_HASH_SALT`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) en el dashboard de Netlify (Site settings → Environment variables) antes del primer deploy.
