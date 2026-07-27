-- ============================================================
-- MIA — Indices de cobertura + vista materializada (v1.5, Bug #2 /
-- arquitectura de crecimiento)
--
-- Problema que resuelve: benefits.city y benefits.category son texto
-- libre separado por comas (ej. "Cali, Palmira"), con un indice btree
-- normal que no sirve para "¿esta fila incluye Cali?". Hoy el backend
-- trae TODAS las filas activas a Node y filtra/agrupa en JavaScript
-- (discovery.ts) - funciona con el catalogo actual, pero no escala:
-- cada turno de chat descargaria el catalogo completo sin importar
-- cuantos beneficios haya.
--
-- Cambio de comportamiento (avisado y confirmado): cityMatch.ts hace
-- match por SUFIJO ("Nueva Cali" matchea "Cali"). En el flujo real
-- nunca se le pasa texto libre suelto (siempre un valor que ya salio de
-- una lista real de ciudades), asi que esa leniencia nunca se activa hoy
-- - de ahora en adelante el filtro de ciudad intenta match EXACTO
-- primero (rapido, indexado - cubre chips y texto libre del chat, que ya
-- llega resuelto exacto via Haiku), y solo si eso no encuentra nada cae
-- a ILIKE por substring (ver resolve_city_key mas abajo) - respaldo para
-- la ciudad detectada por geolocalizacion, que no pasa por Haiku y puede
-- traer variaciones de acentos/redaccion.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Columnas generadas: arrays normalizados de city/category
--
-- Se derivan automaticamente del mismo texto separado por comas que ya
-- se carga a mano en Supabase - cero cambios en como cargas catalogo.
-- IMMUTABLE + sin leer otras tablas, unico requisito para poder usarlas
-- en una columna generada.
-- ------------------------------------------------------------

create or replace function public.normalize_city_list(raw text)
returns text[]
language sql
immutable
as $$
  select coalesce(
    array_agg(lower(trim(piece)) order by ord)
      filter (where trim(piece) <> '' and lower(trim(piece)) <> 'colombia'),
    array[]::text[]
  )
  from unnest(string_to_array(coalesce(raw, ''), ',')) with ordinality as t(piece, ord);
$$;

create or replace function public.normalize_category_list(raw text)
returns text[]
language sql
immutable
as $$
  select coalesce(
    array_agg(lower(trim(piece)) order by ord)
      filter (where trim(piece) <> ''),
    array[]::text[]
  )
  from unnest(string_to_array(coalesce(raw, ''), ',')) with ordinality as t(piece, ord);
$$;

alter table public.benefits
  add column city_list text[] generated always as (public.normalize_city_list(city)) stored,
  add column category_list text[] generated always as (public.normalize_category_list(category)) stored;

create index idx_benefits_city_list_gin on public.benefits using gin (city_list);
create index idx_benefits_category_list_gin on public.benefits using gin (category_list);

-- Beneficios activos de un benefactor puntual (usado por la RPC de
-- categorias mas abajo, y por getBenefitsForCategory/getBenefitDetail).
create index idx_benefits_active_program
  on public.benefits (source_program_id)
  where status = 'activo';

-- ------------------------------------------------------------
-- 2. Vista materializada de cobertura (benefactor x ciudad)
--
-- Responde "¿que benefactores tienen cobertura en la ciudad X, y
-- cuantos beneficios?" sin escanear el catalogo completo en cada turno
-- de chat - se agrega UNA vez aca, las consultas del backend solo leen
-- filas ya resumidas (una fila por benefactor+ciudad, nunca una por
-- beneficio). Cubre benefactores nuevos automaticamente (es un
-- GROUP BY, no una lista de nombres) - no hace falta tocar nada al
-- agregar el benefactor #4, #50 o #200.
-- ------------------------------------------------------------

create materialized view public.benefactor_city_coverage as
  select
    b.source_program_id,
    c.city,
    count(*) as benefit_count
  from public.benefits b
  cross join lateral unnest(b.city_list) as c(city)
  where b.status = 'activo'
  group by b.source_program_id, c.city;

create unique index idx_benefactor_city_coverage_pk
  on public.benefactor_city_coverage (source_program_id, city);

-- ------------------------------------------------------------
-- 3. Trigger: refresco automatico ante cualquier cambio de catalogo
--
-- No es CONCURRENTLY (esa variante no puede correr dentro de una
-- transaccion/trigger) - por eso lecturas de la vista pueden bloquearse
-- unos milisegundos justo durante un refresco. Aceptable: la carga de
-- catalogo es manual y de bajo volumen, no hay escrituras concurrentes
-- de verdad. FOR EACH STATEMENT (no ROW) - un solo refresco aunque una
-- misma operacion toque muchas filas a la vez.
-- ------------------------------------------------------------

create or replace function public.refresh_benefactor_city_coverage()
returns trigger
language plpgsql
as $$
begin
  refresh materialized view public.benefactor_city_coverage;
  return null;
end;
$$;

create trigger trg_refresh_benefactor_city_coverage
  after insert or update or delete on public.benefits
  for each statement
  execute function public.refresh_benefactor_city_coverage();

-- ------------------------------------------------------------
-- 4. Funciones RPC (mismo patron que search_benefits_by_title_similarity)
--
-- El backend solo tiene supabase-js (PostgREST/REST), no conexion
-- Postgres directa - sin estas funciones expuestas no hay forma de
-- invocar GROUP BY/agregados reales desde discovery.ts. Todas de solo
-- lectura, security definer + search_path fijo (patron estandar
-- Supabase), solo otorgadas a service_role.
-- ------------------------------------------------------------

-- Resuelve el texto de ciudad que llega a estas funciones contra una
-- clave real conocida - primero match EXACTO (rapido, usa el indice
-- unico de la vista). Si no hay ninguno, cae a ILIKE por substring -
-- pero sobre la vista ya resumida (unas pocas filas, una por
-- benefactor+ciudad), nunca sobre el catalogo completo, asi que sigue
-- siendo barato sin importar cuantos beneficios haya. Cubre el caso de
-- la ciudad detectada por geolocalizacion (nunca pasa por el matching
-- de Haiku contra la lista real - ver detectCityChange/matchFromText -
-- asi que puede llegar con acentos/variaciones que no calcen exacto).
-- El texto libre del chat no necesita esto: ya llega resuelto exacto
-- (Haiku lo matchea contra get_city_coverage() antes de llegar aca).
create or replace function public.resolve_city_key(target_city text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select v.city from public.benefactor_city_coverage v
      where v.city = lower(trim(target_city)) limit 1),
    (select v.city from public.benefactor_city_coverage v
      where v.city ilike '%' || lower(trim(target_city)) || '%'
      order by v.benefit_count desc limit 1)
  );
$$;

revoke all on function public.resolve_city_key(text) from public;
grant execute on function public.resolve_city_key(text) to service_role;

-- Benefactores con cobertura en una ciudad puntual (reemplaza el "traer
-- todo y agrupar en JS" de getAvailableBenefactores).
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

-- Todas las ciudades con cobertura activa, con su conteo total (suma
-- entre benefactores) - reemplaza getAvailableCities.
create or replace function public.get_city_coverage()
returns table (city_value text, city_label text, benefit_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select v.city, initcap(v.city), sum(v.benefit_count)
  from public.benefactor_city_coverage v
  group by v.city
  order by sum(v.benefit_count) desc;
$$;

revoke all on function public.get_city_coverage() from public;
grant execute on function public.get_city_coverage() to service_role;

-- Categorias de un benefactor (o varios) en una ciudad puntual - ya
-- viene acotada a un benefactor+ciudad especifico (resultado chico por
-- diseno), no necesita la vista materializada: consulta en vivo sobre
-- el indice GIN alcanza. Reemplaza getAvailableCategories.
create or replace function public.get_category_coverage(program_ids uuid[], target_city text)
returns table (category_value text, category_label text, benefit_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select cat, initcap(cat), count(*)
  from public.benefits b
  cross join lateral unnest(b.category_list) as t(cat)
  where b.status = 'activo'
    and b.source_program_id = any(program_ids)
    and b.city_list @> array[public.resolve_city_key(target_city)]
  group by cat
  order by count(*) desc;
$$;

revoke all on function public.get_category_coverage(uuid[], text) from public;
grant execute on function public.get_category_coverage(uuid[], text) to service_role;
