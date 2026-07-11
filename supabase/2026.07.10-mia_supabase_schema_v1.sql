-- ============================================================
-- MIA by Descuentos Inteligentes — Fase 1: Arquitectura de datos
-- Esquema Supabase (PostgreSQL) v1.0 · Julio 2026
--
-- Patrón de acceso: todo el acceso pasa por el backend (Next.js
-- API routes) usando la service_role key, que ignora RLS.
-- Las políticas de abajo son deny-all para anon/authenticated,
-- como cinturón de seguridad si algún día se agrega un cliente
-- Supabase directo en el navegador.
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- 1. users — perfil
-- ------------------------------------------------------------
create table public.users (
  id uuid primary key default gen_random_uuid(),
  phone_hash text not null unique,          -- hash del número de WhatsApp con BEDI_HASH_SALT (secreto compartido a nivel BEDI), nunca texto plano
  name text,
  age_range text,                            -- ej. '18-24', '25-34', '35-44', '45+'
  gender text check (gender in ('femenino', 'masculino', 'otro', 'prefiero_no_decir')),
  city text,
  consent_given_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  deleted_at timestamptz                     -- soft delete, purga manual futura
);

create index idx_users_last_active on public.users (last_active_at);
create index idx_users_deleted_at on public.users (deleted_at) where deleted_at is null;

-- ------------------------------------------------------------
-- 2. affinities — afinidades
-- ------------------------------------------------------------
create table public.affinities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  category text not null,                    -- ej. 'comida', 'viajes', 'entretenimiento'
  source text not null check (source in ('declarada', 'inferida')),
  weight numeric not null default 1.0,
  updated_at timestamptz not null default now(),
  unique (user_id, category)
);

create index idx_affinities_user on public.affinities (user_id);

-- ------------------------------------------------------------
-- 3. programs — catálogo de fuentes (Comfandi, Comfenalco, etc.)
-- ------------------------------------------------------------
create table public.programs (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  type text not null check (type in (
    'caja_compensacion', 'tarjeta_credito', 'fidelizacion', 'membresia'
  ))
);

insert into public.programs (name, type) values
  ('Comfandi', 'caja_compensacion'),
  ('Comfenalco', 'caja_compensacion'),
  ('Visa', 'tarjeta_credito'),
  ('Mastercard', 'tarjeta_credito'),
  ('Puntos Colombia', 'fidelizacion'),
  ('PriceSmart', 'membresia');

-- ------------------------------------------------------------
-- 4. user_programs — qué programas declara tener el usuario
-- ------------------------------------------------------------
create table public.user_programs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete restrict,
  declared_at timestamptz not null default now(),
  unique (user_id, program_id)
);

create index idx_user_programs_user on public.user_programs (user_id);

-- ------------------------------------------------------------
-- 5. benefits — catálogo de beneficios (lo llena Fase 3)
-- ------------------------------------------------------------
create table public.benefits (
  id uuid primary key default gen_random_uuid(),
  source_program_id uuid not null references public.programs (id) on delete restrict,
  title text not null,
  category text,
  city text,
  valid_from date,
  valid_until date,
  conditions text,
  access_type text,                          -- ej. 'solo_tarjetahabientes', 'publico'
  raw_data jsonb,                             -- payload crudo de la carga manual, sin normalizar
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_benefits_category on public.benefits (category);
create index idx_benefits_city on public.benefits (city);
create index idx_benefits_validity on public.benefits (valid_from, valid_until);

-- ------------------------------------------------------------
-- 6. benefit_exposures — beneficios conocidos (ya mostrados)
-- ------------------------------------------------------------
create table public.benefit_exposures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  benefit_id uuid not null references public.benefits (id) on delete cascade,
  shown_at timestamptz not null default now(),
  channel text not null default 'chat_web'
);

create index idx_exposures_user_benefit on public.benefit_exposures (user_id, benefit_id, shown_at);

-- ------------------------------------------------------------
-- 7. events — bitácora de producto
-- ------------------------------------------------------------
create table public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users (id) on delete set null,
  event_type text not null check (event_type in (
    'onboarding_started',
    'onboarding_completed',
    'benefit_shown',
    'benefit_clicked',
    'session_returned',
    'feedback_given',
    'city_interest_declared',                -- usuario en ciudad aún no cubierta por el MVP; payload: {"city": "..."}
    'city_detected'                          -- ciudad detectada/actualizada (geolocalización o declarada); payload: {"city": "...", "method": "geolocation|manual"}
  )),
  payload jsonb,
  occurred_at timestamptz not null default now()
);

create index idx_events_user on public.events (user_id);
create index idx_events_type_time on public.events (event_type, occurred_at);

-- ============================================================
-- Row Level Security — deny-all para anon/authenticated
-- El backend accede vía service_role, que ignora RLS.
-- ============================================================

alter table public.users enable row level security;
alter table public.affinities enable row level security;
alter table public.programs enable row level security;
alter table public.user_programs enable row level security;
alter table public.benefits enable row level security;
alter table public.benefit_exposures enable row level security;
alter table public.events enable row level security;

-- Sin políticas para anon/authenticated = deny-all por defecto en Postgres RLS.
-- No se crean políticas de SELECT/INSERT/UPDATE/DELETE a propósito.
-- Si en el futuro se necesita acceso directo desde el navegador
-- (ej. con Supabase Auth por número verificado), agregar aquí
-- políticas explícitas scoped a auth.uid() = user_id.
