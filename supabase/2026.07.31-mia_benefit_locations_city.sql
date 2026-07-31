-- ============================================================
-- MIA — Panel /admin Fase 3 (múltiples sedes): ciudad por sede
--
-- benefit_locations no distinguia ciudad por sede - un beneficio que cubre
-- varias ciudades a la vez (ej. Kosta Azul: Dosquebradas/Pereira/Bogota/
-- Palmira/Tulua/Pasto en una sola fila de benefits.city) no podia acotar
-- que sedes le corresponden a cada ciudad. Se agrega aqui, aditivo -
-- nullable a proposito (el CRUD de carga de sedes todavia no existe; una
-- sede sin city simplemente no aparece para nadie hasta completarse).
--
-- Mismo patron que benefits.city_list (2026.07.27-mia_coverage_indexes_and_view.sql):
-- columna generada normalizada + indice GIN, para poder usar
-- resolve_city_scope + .overlaps() igual que el resto de la app.
-- ============================================================

alter table public.benefit_locations
  add column city text;

alter table public.benefit_locations
  add column city_list text[] generated always as (
    case when city is null or trim(city) = '' then null else array[lower(trim(city))] end
  ) stored;

create index idx_benefit_locations_city_list on public.benefit_locations using gin (city_list);

comment on column public.benefit_locations.city is
  'Ciudad de esta sede puntual (una sede = una ciudad, a diferencia de benefits.city que puede listar varias). Nullable hasta que se cargue.';
