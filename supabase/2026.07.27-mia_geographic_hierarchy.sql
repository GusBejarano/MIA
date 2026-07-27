-- ============================================================
-- MIA — Jerarquia geografica ciudad/departamento/pais (v1.5)
--
-- Problema: un beneficio puede aplicar a UNA ciudad ("Cali"), a un
-- DEPARTAMENTO completo ("Valle del Cauca" - ver Assisglobal SAS,
-- Constructora Solanillas, Gane SuperGIROS, Supermercado Surtifamiliar)
-- o a un PAIS completo ("Colombia" - ver Tributi). La decision de
-- producto: el registro en `benefits.city` se queda EXACTAMENTE como
-- esta (nunca se reescribe para listar ciudades una por una) - la
-- expansion a "en que ciudades reales aparece" pasa SOLO en la vista ya
-- resumida, cruzando contra una tabla de referencia chica
-- (ciudad -> departamento -> pais). Cero filas duplicadas en benefits,
-- cero impacto de performance sin importar cuantos beneficios haya (la
-- tabla de referencia crece con el numero de CIUDADES reales, no con el
-- numero de beneficios - hoy 19 filas, seguira siendo un puñado aunque
-- el catalogo llegue a millones).
--
-- Checklist al agregar una ciudad nueva de Colombia: una fila en
-- city_regions (ciudad, departamento, pais='colombia', nombre para
-- mostrar). Nada de codigo que tocar.
--
-- Nota sobre crecer a otro pais (no Colombia): la tabla ya tiene columna
-- `country`, lista para eso sin cambios. Lo unico que SI hay que revisar
-- ese dia es la funcion normalize_city_list mas abajo: hoy asume que
-- cualquier fila cuyo campo `city` se quede vacio despues de quitar el
-- "Colombia" decorativo (que HOY aparece al final de practicamente
-- todas las filas, tenga o no una ciudad real) es un beneficio nacional
-- colombiano. Con un segundo pais en juego, esa regla puntual necesita
-- saber cual pais decorativo quitar segun el caso - un ajuste de pocas
-- lineas en esa funcion especifica, aislado y comentado, no un
-- rediseño de todo esto.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Tabla de referencia: ciudad -> departamento -> pais
-- ------------------------------------------------------------

create table public.city_regions (
  city text primary key,          -- clave normalizada (sin tildes, minusculas) - igual que city_list
  department text not null,       -- idem normalizado
  country text not null,          -- idem normalizado - columna lista para cuando haya un segundo pais
  display_name text not null,     -- nombre real para mostrar (con tildes/mayusculas correctas)
  created_at timestamptz not null default now()
);

insert into public.city_regions (city, department, country, display_name) values
  ('cali', 'valle del cauca', 'colombia', 'Cali'),
  ('palmira', 'valle del cauca', 'colombia', 'Palmira'),
  ('cartago', 'valle del cauca', 'colombia', 'Cartago'),
  ('tulua', 'valle del cauca', 'colombia', 'Tuluá'),
  ('buga', 'valle del cauca', 'colombia', 'Buga'),
  ('buenaventura', 'valle del cauca', 'colombia', 'Buenaventura'),
  ('jamundi', 'valle del cauca', 'colombia', 'Jamundí'),
  ('yumbo', 'valle del cauca', 'colombia', 'Yumbo'),
  ('caicedonia', 'valle del cauca', 'colombia', 'Caicedonia'),
  ('roldanillo', 'valle del cauca', 'colombia', 'Roldanillo'),
  ('zarzal', 'valle del cauca', 'colombia', 'Zarzal'),
  ('calima', 'valle del cauca', 'colombia', 'Calima'),
  ('florida', 'valle del cauca', 'colombia', 'Florida'),
  ('sevilla', 'valle del cauca', 'colombia', 'Sevilla'),
  ('candelaria', 'valle del cauca', 'colombia', 'Candelaria'),
  ('pradera', 'valle del cauca', 'colombia', 'Pradera'),
  ('el cerrito', 'valle del cauca', 'colombia', 'El Cerrito'),
  ('quimbaya', 'quindio', 'colombia', 'Quimbaya'),
  ('cartagena', 'bolivar', 'colombia', 'Cartagena');

-- ------------------------------------------------------------
-- 2. Borrar la vista vieja PRIMERO - depende de display_city_list, no
-- se puede soltar esa columna mientras la vista siga existiendo. La
-- vista nueva se crea mas abajo (Paso 4).
-- ------------------------------------------------------------

drop materialized view if exists public.benefactor_city_coverage cascade;

-- ------------------------------------------------------------
-- 2b. Limpieza: display_city_list (de la migracion anterior) queda
-- reemplazada por city_regions.display_name - una sola fuente de
-- verdad del nombre para mostrar, en vez de adivinarlo del texto crudo
-- de cada beneficio.
-- ------------------------------------------------------------

alter table public.benefits drop column if exists display_city_list;
drop function if exists public.display_city_list(text);

-- ------------------------------------------------------------
-- 3. Resuelve, para una ciudad ya normalizada, las claves de alcance
-- que hay que buscar en city_list: la ciudad misma, su departamento, su
-- pais. 100% en base a la tabla de referencia - nada hardcodeado a
-- "colombia" aca.
-- ------------------------------------------------------------

create or replace function public.city_scope_keys(resolved_city text)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select array_remove(array[
    resolved_city,
    (select department from public.city_regions where city = resolved_city),
    (select country from public.city_regions where city = resolved_city)
  ], null);
$$;

revoke all on function public.city_scope_keys(text) from public;
grant execute on function public.city_scope_keys(text) to service_role;

-- ------------------------------------------------------------
-- 4. Vista de cobertura, rediseñada: JOIN de 3 niveles contra
-- city_regions. Un beneficio que diga "Valle del Cauca" cuenta para
-- CADA ciudad real de ese departamento sin que el dato de origen liste
-- ninguna - el fan-out lo hace el JOIN, no una escritura. (La vista
-- vieja ya se borro en el Paso 2.)
-- ------------------------------------------------------------

create materialized view public.benefactor_city_coverage as
  select
    b.source_program_id,
    cd.city,
    cd.display_name as city_display,
    count(*) as benefit_count
  from public.benefits b
  cross join lateral unnest(b.city_list) as tok(token)
  join public.city_regions cd
    on cd.city = tok.token
    or cd.department = tok.token
    or cd.country = tok.token
  where b.status = 'activo'
  group by b.source_program_id, cd.city, cd.display_name;

create unique index idx_benefactor_city_coverage_pk
  on public.benefactor_city_coverage (source_program_id, city);

-- ------------------------------------------------------------
-- 5. Trigger de refresco tambien en city_regions - agregar una ciudad
-- nueva (o corregir un departamento/pais) tiene que reflejarse en la
-- vista igual que un cambio de catalogo.
-- ------------------------------------------------------------

create trigger trg_refresh_benefactor_city_coverage_on_regions
  after insert or update or delete on public.city_regions
  for each statement
  execute function public.refresh_benefactor_city_coverage();

-- ------------------------------------------------------------
-- 6. Funciones RPC que dependian de la vista (se recrean porque el
-- DROP ... CASCADE del Paso 4 se las llevo) - misma logica de siempre,
-- get_city_coverage ahora usa city_display de la vista en vez de
-- adivinar la tilde con initcap.
-- ------------------------------------------------------------

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

create or replace function public.get_city_coverage()
returns table (city_value text, city_label text, benefit_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select v.city, v.city_display, sum(v.benefit_count)
  from public.benefactor_city_coverage v
  group by v.city, v.city_display
  order by sum(v.benefit_count) desc;
$$;

revoke all on function public.get_city_coverage() from public;
grant execute on function public.get_city_coverage() to service_role;

-- get_category_coverage ya no compara solo contra la ciudad exacta -
-- usa city_scope_keys para que un beneficio de departamento/pais
-- tambien cuente en las categorias de la ciudad puntual. && (overlap)
-- sigue usando el indice GIN de city_list, no escanea la tabla.
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
    and b.city_list && public.city_scope_keys(public.resolve_city_key(target_city))
  group by cat
  order by count(*) desc;
$$;

revoke all on function public.get_category_coverage(uuid[], text) from public;
grant execute on function public.get_category_coverage(uuid[], text) to service_role;

-- ------------------------------------------------------------
-- 7. Garantia de sincronizacion: si guardas (o editas) un beneficio
-- como activo con una ciudad/zona que city_regions no reconoce (ni como
-- ciudad, ni como departamento, ni como pais), el guardado se rechaza
-- con un error explicando exactamente que falta - en vez de quedar
-- invisible en silencio porque el JOIN de la vista no encuentra con que
-- cruzarlo. Solo aplica a status = 'activo' (un borrador/inactivo puede
-- tener cualquier cosa mientras se decide su geografia). BEFORE (no
-- AFTER) para frenar el guardado antes de que pase - por eso llama a
-- normalize_city_list(new.city) directo en vez de leer new.city_list:
-- las columnas generadas todavia no estan calculadas en un trigger
-- BEFORE, solo despues.
-- ------------------------------------------------------------

create or replace function public.check_benefit_city_coverage()
returns trigger
language plpgsql
as $$
declare
  unmapped text[];
begin
  if new.status = 'activo' then
    select array_agg(distinct tok)
    into unmapped
    from unnest(public.normalize_city_list(new.city)) as tok
    where not exists (
      select 1 from public.city_regions cd
      where cd.city = tok or cd.department = tok or cd.country = tok
    );

    if unmapped is not null then
      raise exception
        'Beneficio "%": la(s) zona(s) % no existen en city_regions (ni como ciudad, ni departamento, ni pais). Agrega la fila correspondiente a city_regions, o corrige el campo city si fue un error de tipeo, antes de guardarlo como activo.',
        new.title, array_to_string(unmapped, ', ');
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_check_benefit_city_coverage
  before insert or update on public.benefits
  for each row
  execute function public.check_benefit_city_coverage();
