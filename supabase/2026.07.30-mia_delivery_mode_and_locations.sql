-- ============================================================
-- MIA — Modo de entrega, confianza de cobertura y sedes geolocalizadas (v2.0)
--
-- Problema que resuelve: benefits.city="Colombia" se usa hoy como comodin
-- tanto para "genuinamente nacional / online, sin dependencia de ubicacion"
-- como para "empresa con sedes fisicas limitadas que no se investigo bien" -
-- el modelo no distingue los dos casos. Confirmado con datos reales: 27 de
-- 404 beneficios activos caen en city_list=['colombia'], y de esos, Tecnosuper
-- (una sola sede en Medellin) y Kosta Azul (6 ciudades puntuales) son falsos
-- positivos confirmados - un usuario en una ciudad sin cobertura real ve el
-- beneficio como disponible ahi.
--
-- Migracion 100% aditiva: nada de esto lo lee el codigo actual todavia (ver
-- discovery.ts/get_category_coverage) - cero cambio de comportamiento visible
-- para un usuario mientras no se toque el paso siguiente (backfill) ni,
-- despues, el trigger check_benefit_city_coverage.
--
-- Sedes (benefit_locations): una fila por punto de reclamo fisico, con el
-- link de Google Maps que ya se captura hoy (maps_url, obligatorio) y lat/lng
-- solo cuando ese link ya los trae (nullable - se completan progresivamente,
-- sede por sede, sin que las que faltan bloqueen a las que ya existen). El
-- calculo de distancia/cercania es una funcionalidad futura (v2.1+) y vive en
-- codigo (no en SQL/PostGIS) - estas columnas solo guardan el dato crudo.
-- ============================================================

-- ------------------------------------------------------------
-- 1. benefits: modo de entrega + confianza de la cobertura declarada
-- ------------------------------------------------------------

alter table public.benefits
  add column delivery_mode text
    check (delivery_mode in ('online', 'presencial', 'online_y_presencial')),
  add column coverage_confidence text
    check (coverage_confidence in ('confirmada', 'estimada', 'desconocida'));

comment on column public.benefits.delivery_mode is
  'Como se redime: online (sin dependencia geografica), presencial (requiere sede fisica), o ambos.';
comment on column public.benefits.coverage_confidence is
  'Que tan confiable es la cobertura geografica declarada en city/city_list - confirmada (señal explicita: 100% online, o direccion/lista de ciudades real), estimada (se infiere pero sin certeza total), desconocida (sin señal suficiente, pendiente de investigar). Gatea el trigger check_benefit_city_coverage cuando se endurezca (fase aparte, todavia no aplicada).';

-- ------------------------------------------------------------
-- 2. benefit_locations: una fila por sede real (punto de reclamo)
--
-- RLS activo desde la creacion, sin policies (mismo patron que el resto de
-- tablas de este esquema - bloqueada para anon/authenticated, el backend
-- usa service_role que no pasa por RLS). A diferencia del olvido en
-- city_regions (migracion del 27 de julio), esta nace protegida.
-- ------------------------------------------------------------

create table public.benefit_locations (
  id uuid primary key default gen_random_uuid(),
  benefit_id uuid not null references public.benefits(id) on delete cascade,
  maps_url text not null,
  lat double precision,
  lng double precision,
  is_primary boolean not null default false,
  source_confidence text check (source_confidence in ('confirmada', 'estimada')),
  created_at timestamptz not null default now()
);

comment on table public.benefit_locations is
  'Sedes geolocalizadas por beneficio (punto de reclamo fisico). Llenado progresivo: un beneficio puede tener 1 de N sedes cargadas y las demas se agregan despues sin afectar la presentacion de la que ya existe. lat/lng quedan null cuando el maps_url todavia no es del tipo que los trae (link corto o busqueda por texto) - se completan cuando se resuelvan.';

create index idx_benefit_locations_benefit_id on public.benefit_locations (benefit_id);

alter table public.benefit_locations enable row level security;

-- ------------------------------------------------------------
-- 3. users: ubicacion persistente del usuario (hoy se capturaba en el
-- navegador solo para resolver el nombre de ciudad, y se descartaba - ver
-- MiaChat.tsx). Se guarda de forma persistente para poder calcular cercania
-- real en una version futura (v2.1+, fuera de este alcance).
-- ------------------------------------------------------------

alter table public.users
  add column last_lat double precision,
  add column last_lng double precision,
  add column location_captured_at timestamptz;

comment on column public.users.last_lat is
  'Ultima latitud real capturada por geolocalizacion del navegador (permiso concedido). Nullable - solo se llena cuando el usuario comparte ubicacion.';
comment on column public.users.last_lng is
  'Ultima longitud real capturada por geolocalizacion del navegador. Ver last_lat.';
comment on column public.users.location_captured_at is
  'Cuando se capturo el ultimo last_lat/last_lng - para saber si el dato quedo desactualizado.';
