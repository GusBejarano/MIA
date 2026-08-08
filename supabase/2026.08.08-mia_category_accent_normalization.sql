-- ============================================================
-- MIA — Comparacion de categoria sin tildes (mismo bug que ya se
-- resolvio para ciudad en 2026.07.27-mia_city_accent_normalization.sql,
-- nunca se aplico el mismo fix a categoria)
--
-- Encontrado en dev 2.5: "Gastronomia" y "Gastronomía" (con y sin tilde,
-- escritas a mano en distintas filas de benefits.category) aparecian
-- como DOS categorias distintas en la fila de filtro - normalize_category_list
-- solo hacia lower(trim(...)), nunca unaccent, a diferencia de
-- normalize_city_list que ya lo tiene desde julio.
--
-- Esto NO es exclusivo de dev 2.5: category_list/get_category_coverage
-- tambien los usa el carrusel de categoria del chat de produccion (Fase 1),
-- asi que este mismo bug ya afectaba la seleccion de categoria de
-- cualquier usuario, solo que no se habia notado.
--
-- Mismo patron exacto que la migracion de ciudad: normalize_category_list
-- pasa a comparar sin tildes, display_category_list guarda la grafia
-- original (con tilde) para mostrar, get_category_coverage cruza ambas.
-- ============================================================

create or replace function public.normalize_category_list(raw text)
returns text[]
language sql
immutable
as $$
  select coalesce(
    array_agg(lower(unaccent('unaccent'::regdictionary, trim(piece))) order by ord)
      filter (where trim(piece) <> ''),
    array[]::text[]
  )
  from unnest(string_to_array(coalesce(raw, ''), ',')) with ordinality as t(piece, ord);
$$;

create or replace function public.display_category_list(raw text)
returns text[]
language sql
immutable
as $$
  select coalesce(
    array_agg(trim(piece) order by ord)
      filter (where trim(piece) <> ''),
    array[]::text[]
  )
  from unnest(string_to_array(coalesce(raw, ''), ',')) with ordinality as t(piece, ord);
$$;

alter table public.benefits
  add column if not exists display_category_list text[]
    generated always as (public.display_category_list(category)) stored;

-- category_label ahora sale de la grafia real (con tilde) mas frecuente
-- para ese valor normalizado, en vez de initcap(category_value) (que
-- perdia la tilde a proposito, porque category_value ya viene sin tildes
-- para poder compararse).
create or replace function public.get_category_coverage(program_ids uuid[], target_city text)
returns table (category_value text, category_label text, benefit_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select cat, mode() within group (order by cat_display), count(*)
  from public.benefits b
  cross join lateral unnest(b.category_list, b.display_category_list) as t(cat, cat_display)
  where b.status = 'activo'
    and b.source_program_id = any(program_ids)
    and b.city_list @> array[public.resolve_city_key(target_city)]
  group by cat
  order by count(*) desc;
$$;

revoke all on function public.get_category_coverage(uuid[], text) from public;
grant execute on function public.get_category_coverage(uuid[], text) to service_role;

-- Postgres no recalcula una columna generada sola cuando cambia la
-- funcion que usa (category_list ya existia con la version vieja de
-- normalize_category_list) - forzar recomputo con un UPDATE que toque la
-- columna de origen, mismo truco que la migracion de ciudad.
update public.benefits set category = category;
