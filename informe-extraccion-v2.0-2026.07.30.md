# MIA v2.0 — Nuevo contrato de datos para el proceso de extracción de beneficios

Este informe es para quien opera el proceso de extracción/investigación de
beneficios (el "cowork" que produce el export que luego se carga a Supabase) —
no asume que tenga contexto de la conversación donde se diseñó esto. Aplica
desde ya, y se probará por primera vez con la próxima entrega de Coomeva
("entrega 2").

## Por qué cambia el contrato

Hasta ahora, cuando no se encontraba un desglose claro de ciudades para un
beneficio, el campo `city` se cargaba como `"Colombia"` — comodín de "cobertura
nacional". El problema: eso mismo comodín se usaba tanto para beneficios
genuinamente nacionales/online (correcto) como para empresas con sedes físicas
limitadas que simplemente no se investigaron a fondo (incorrecto). Confirmado
con datos reales ya en producción:

- **Tecnosuper** quedó cargado como `"Colombia"`, pero su dirección real es
  una sola sede en Medellín — un usuario en cualquier otra ciudad lo veía como
  "disponible aquí" sin serlo.
- **Kosta Azul** quedó como `"Colombia"`, pero tiene exactamente 6 ciudades
  reales (Dosquebradas, Pereira, Bogotá, Palmira, Tuluá, Pasto).

La prioridad de negocio es **minimizar falsos positivos** (un usuario nunca
debe ver "disponible en tu ciudad" cuando no lo está) por encima de falsos
negativos (que un beneficio tarde en aparecer mientras se confirma su
cobertura real). Por eso, desde el 2026-07-30, Supabase **ya no acepta
`"Colombia"` como cobertura de un beneficio activo salvo que se declare y
justifique explícitamente** — cualquier beneficio que llegue con cobertura
ambigua reducida a solo el país se guarda automáticamente como
`pendiente_revision` (no aparece a ningún usuario) hasta que alguien confirme
su cobertura real.

## Los dos campos nuevos que hay que producir por cada beneficio

### 1. `delivery_mode` — cómo se redime

Uno de tres valores, según lo que diga la fuente (sitio de la empresa,
condiciones del beneficio, o lo que ya se investigó):

| Valor | Cuándo usarlo |
|---|---|
| `online` | Se redime 100% por internet — código de descuento, compra online, servicio digital. Cero dependencia de ubicación. Ejemplos reales ya confirmados: Almia (CIO / Creador de CV), Ay Ombe Coffee ("venta 100% online" en su propia página). |
| `presencial` | Requiere ir a una sede física — tienda, oficina, punto de venta. |
| `online_y_presencial` | Ofrece ambas modalidades (ej. compra en tienda física o en la tienda online de la misma marca). |

**Regla dura: si hay CUALQUIER componente presencial, `delivery_mode` no puede
ser `online`.** Usa `online_y_presencial` en ese caso — el sistema solo trata
como "sin dependencia geográfica" lo que sea 100% online.

### 2. `coverage_confidence` — qué tan confiable es la cobertura geográfica declarada

| Valor | Cuándo usarlo | Ejemplo real |
|---|---|---|
| `confirmada` | Hay una señal explícita y verificable: el sitio dice "100% online", o hay una dirección/lista de ciudades real y concreta. | Tecnosuper (una dirección de calle exacta), Kosta Azul (6 ciudades nombradas explícitamente), Goyurt ("134 puntos de venta en 33 ciudades") |
| `estimada` | Hay indicio de que es presencial y multi-sede, pero sin conteo ni ubicación exacta ("Varias Tiendas", "+10 puntos de venta" sin listarlos). | — |
| `desconocida` | No hay ninguna señal de dirección/ciudad, o la única señal es dudosa/genérica. | Beneficios con dirección `null`, o donde el único dato es "tiendas a nivel nacional" sin respaldo. |

**Regla dura y la más importante de este informe:** un beneficio con
componente presencial **nunca debe quedar con `city = "Colombia"` a menos que
`coverage_confidence = "confirmada"` con evidencia real** (dirección o lista
de ciudades concreta, no una frase genérica). Si no se pudo confirmar la
cobertura real:

- **No** escribas `"Colombia"` como salida fácil.
- Escribe el desglose de ciudades que sí se pudo confirmar (aunque sea una
  sola), y marca `coverage_confidence = "estimada"` o `"desconocida"` según
  el caso.
- Si de verdad no hay ninguna pista de ubicación, es preferible entregar el
  beneficio marcado explícitamente como pendiente de investigación de
  dirección, en vez de forzar `"Colombia"` — el sistema lo va a rechazar como
  `activo` de todos modos si no cumple la regla de arriba.

## Sedes (`benefit_locations`) — un paso hacia ubicaciones reales, no solo texto

A futuro (v2.1+), MIA podrá decirle a un usuario en qué sede específica
reclamar un beneficio y qué tan cerca le queda. Para eso, desde ya conviene
que la extracción capture, **por cada sede física real que se identifique**:

- El **link de Google Maps de esa sede** (obligatorio si se puede conseguir —
  es lo mismo que ya se busca hoy para `how_to_get_there`, no es trabajo
  nuevo).
- La dirección en texto, si está disponible.

**No hace falta calcular ni convertir nada a latitud/longitud** — eso lo
resuelve el código automáticamente cuando el link ya las trae (los links
largos de Google Maps, tipo `.../place/...@4.6,-74.0,15z`, incluyen
coordenadas; los links de búsqueda por texto no, y eso está bien, se completan
después). Lo único que se necesita de este proceso es **el link real, uno por
sede** — si un beneficio tiene 6 sedes, idealmente 6 links (aunque sea
aceptable entregar menos si no se consiguen todos — se completan
progresivamente sin bloquear el resto).

### Prioridad de esfuerzo de investigación (útil para decidir cuánto tiempo invertir por beneficio)

No todos los beneficios necesitan el mismo nivel de detalle de ubicación.
Orden de prioridad (de más importante a menos):

1. **Mono-sede** (1 sola dirección) — el de mayor riesgo si se marca mal
   (como pasó con Tecnosuper) y el más barato de verificar. Vale la pena
   confirmar la dirección exacta siempre.
2. **Multi-sede pequeño (2-5 ciudades/puntos)** — igual de valioso confirmar
   cada una si el número es manejable (como Kosta Azul, 6 ciudades).
3. **Multi-sede mediano (6-10)**.
4. **Multi-sede grande (+10) u online** — aquí es donde tiene sentido menos
   inversión por sede individual; si son decenas de puntos repartidos en
   muchas ciudades, alcanza con el conteo/lista de ciudades general
   (`coverage_confidence = "confirmada"` si el número/lista viene de una
   fuente real como el propio sitio de la empresa) sin necesidad de un link
   de Maps por cada punto.

## Resumen de lo que debe traer cada beneficio en la entrega 2 de Coomeva

Además de los campos que ya se entregan hoy (título, categoría, condiciones,
vigencia, `access_type`, `company_url`, `social_media_url`, `address`,
`how_to_get_there`, etc.), agregar:

1. `delivery_mode`: `online` | `presencial` | `online_y_presencial`.
2. `coverage_confidence`: `confirmada` | `estimada` | `desconocida`, con la
   justificación breve de por qué (para que quien revise no tenga que
   re-investigar desde cero).
3. Si es presencial: el desglose real de ciudades (nunca `"Colombia"` como
   default), y cuando se pueda, el link de Google Maps por sede.

Cualquier caso donde no se pueda cumplir el punto 3 debe entregarse igual
(no es motivo para excluir el beneficio del lote), pero marcado claramente
como `coverage_confidence = "desconocida"` — el sistema lo recibirá como
`pendiente_revision`, no bloqueará la carga del resto del lote, y quedará en
una cola de revisión manual junto con los 20 casos que ya existen hoy en
producción con este mismo estado (Tributi y 19 beneficios de Coomeva del lote
anterior).
