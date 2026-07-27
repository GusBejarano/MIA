-- ============================================================
-- MIA — Comparacion de ciudad sin tildes + limpieza de datos (v1.5)
--
-- Encontrado al probar 2026.07.27-mia_coverage_indexes_and_view.sql:
-- "tulua"/"tulua" (sin tilde) y "jamundi"/"jamundi" (con y sin tilde)
-- quedaban como CIUDADES DISTINTAS en la vista de cobertura, porque
-- benefits.city tiene ambas grafias escritas a mano en distintas filas.
-- Esto ya pasaba antes de la migracion anterior (el codigo JS viejo
-- tampoco unificaba tildes) - ahora se corrige de raiz:
--
-- 1. Comparacion/agrupacion ignora tildes (unaccent) - une "Tulua" y
--    "Tuluá" en una sola clave sin importar como se escriba en el
--    futuro.
-- 2. Se guarda por separado el nombre "bonito" (con tilde, tal como
--    esta escrito) para MOSTRAR - si compararamos y mostraramos con la
--    misma clave sin tildes, el usuario veria "Tulua" siempre, sin
--    importar que la base de datos si tenga la tilde.
-- 3. Se limpian las filas existentes para que todas queden escritas
--    igual (con tilde) - no es obligatorio para que el matching
--    funcione (ya funciona sin esto), pero evita que la eleccion de
--    "cual grafia mostrar" dependa del azar.
-- ============================================================

create extension if not exists unaccent;

-- ------------------------------------------------------------
-- 1. Funciones de normalizacion - version con unaccent
-- ------------------------------------------------------------

-- unaccent(regdictionary, text) -- la forma de 2 argumentos, con
-- diccionario explicito -- es la que Postgres marca IMMUTABLE de verdad
-- (la de 1 argumento depende de configuracion de sesion, no se puede
-- usar en columnas generadas, mismo tipo de problema que tuvimos con la
-- suma de fechas en el archivo de dedup de session_started).
create or replace function public.normalize_city_list(raw text)
returns text[]
language sql
immutable
as $$
  select coalesce(
    array_agg(lower(unaccent('unaccent'::regdictionary, trim(piece))) order by ord)
      filter (where trim(piece) <> ''
        and lower(unaccent('unaccent'::regdictionary, trim(piece))) <> 'colombia'),
    array[]::text[]
  )
  from unnest(string_to_array(coalesce(raw, ''), ',')) with ordinality as t(piece, ord);
$$;

-- Mismo split/filtro que normalize_city_list (para quedar alineadas
-- pieza a pieza), pero SIN quitar tildes ni pasar a minusculas - esta
-- es la que se usa para mostrarle el nombre al usuario.
create or replace function public.display_city_list(raw text)
returns text[]
language sql
immutable
as $$
  select coalesce(
    array_agg(trim(piece) order by ord)
      filter (where trim(piece) <> ''
        and lower(unaccent('unaccent'::regdictionary, trim(piece))) <> 'colombia'),
    array[]::text[]
  )
  from unnest(string_to_array(coalesce(raw, ''), ',')) with ordinality as t(piece, ord);
$$;

-- ------------------------------------------------------------
-- 2. Columna generada nueva (display_city_list) - la vista de abajo la
-- cruza con city_list (misma posicion/orden) para saber, para cada
-- ciudad normalizada, como mostrarla con tilde.
-- ------------------------------------------------------------

alter table public.benefits
  add column display_city_list text[] generated always as (public.display_city_list(city)) stored;

-- ------------------------------------------------------------
-- 3. Recrear la vista de cobertura con la columna de display - Postgres
-- no tiene "CREATE OR REPLACE MATERIALIZED VIEW", hay que borrarla y
-- crearla de nuevo. CASCADE se lleva el indice unico y las 2 funciones
-- que la consultan directo (resolve_city_key, get_benefactor_coverage,
-- get_city_coverage) - se recrean todas mas abajo, en el mismo orden.
-- ------------------------------------------------------------

drop materialized view if exists public.benefactor_city_coverage cascade;

create materialized view public.benefactor_city_coverage as
  select
    b.source_program_id,
    z.city,
    min(z.city_display) as city_display,
    count(*) as benefit_count
  from public.benefits b
  cross join lateral unnest(b.city_list, b.display_city_list) as z(city, city_display)
  where b.status = 'activo'
  group by b.source_program_id, z.city;

create unique index idx_benefactor_city_coverage_pk
  on public.benefactor_city_coverage (source_program_id, city);

create or replace function public.resolve_city_key(target_city text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select v.city from public.benefactor_city_coverage v
      where v.city = lower(unaccent('unaccent'::regdictionary, trim(target_city))) limit 1),
    (select v.city from public.benefactor_city_coverage v
      where v.city ilike '%' || lower(unaccent('unaccent'::regdictionary, trim(target_city))) || '%'
      order by v.benefit_count desc limit 1)
  );
$$;

revoke all on function public.resolve_city_key(text) from public;
grant execute on function public.resolve_city_key(text) to service_role;

create or replace function public.get_benefactor_coverage(target_city text)
returns table (source_program_id uuid, benefit_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select v.source_program_id, v.benefit_count
  from public.benefactor_city_coverage v
  where v.city = public.resolve_city_key(target_city);
$$;

revoke all on function public.get_benefactor_coverage(text) from public;
grant execute on function public.get_benefactor_coverage(text) to service_role;

-- city_label ahora sale de city_display (con tilde, tal como esta
-- escrito) en vez de initcap(city_value) (que perdia la tilde, porque
-- city_value ya viene sin tildes a proposito para poder compararse).
create or replace function public.get_city_coverage()
returns table (city_value text, city_label text, benefit_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select v.city, min(v.city_display), sum(v.benefit_count)
  from public.benefactor_city_coverage v
  group by v.city
  order by sum(v.benefit_count) desc;
$$;

revoke all on function public.get_city_coverage() from public;
grant execute on function public.get_city_coverage() to service_role;

-- ------------------------------------------------------------
-- 4. Recalcular city_list en las filas existentes - ya se creo hace
-- rato con la version VIEJA de normalize_city_list (sin unaccent).
-- Postgres no recalcula una columna generada sola cuando cambia la
-- funcion que usa - hay que forzarlo con un UPDATE que toque la columna
-- de origen (aunque sea al mismo valor). display_city_list no necesita
-- esto: se creo en el Paso 2 de arriba, ya con la funcion nueva.
-- ------------------------------------------------------------

update public.benefits set city = city;

-- ------------------------------------------------------------
-- 5. Limpieza de datos: unificar grafias conocidas (Tulua/Jamundi sin
-- tilde -> con tilde). Solo toca filas que tengan la palabra exacta sin
-- tilde (\m...\M = limites de palabra) - no afecta filas que ya estan
-- bien escritas.
-- ------------------------------------------------------------

update public.benefits
  set city = regexp_replace(city, '(?i)\mTulua\M', 'Tuluá', 'g')
  where city ~* '\mTulua\M';

update public.benefits
  set city = regexp_replace(city, '(?i)\mJamundi\M', 'Jamundí', 'g')
  where city ~* '\mJamundi\M';

-- ------------------------------------------------------------
-- 6. "valle del cauca" aparecio como si fuera una ciudad (es un
-- departamento) - no lo corrijo solo porque no se a cual ciudad
-- pertenece ese beneficio de verdad. Corre esto para ver cual(es)
-- fila(s) son y decidime que ciudad va ahi - te paso el UPDATE puntual
-- despues de que me digas.
-- ------------------------------------------------------------

select id, title, city
from public.benefits
where city ilike '%valle del cauca%';
