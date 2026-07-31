-- ============================================================
-- MIA — Panel de Administración (Fase 1): admin_users
--
-- Separado por completo de public.users (los beneficiarios finales,
-- identificados por phone_hash) - este es el sistema de identidad del
-- panel /admin, respaldado por Supabase Auth (auth.users) + 2FA nativo
-- (TOTP, via auth.mfa_factors - ya provisto por Supabase, no se crea aqui).
--
-- RLS activo sin policies (mismo patron que el resto del esquema): el
-- backend de /admin siempre usa la service_role key desde el servidor
-- (Server Actions/API routes de Next.js), nunca supabase-js en el cliente -
-- el control de acceso real (admin vs analista, "solo mis tareas") vive en
-- codigo de servidor, no en policies de Postgres.
-- ============================================================

create table public.admin_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null check (role in ('admin', 'analista')),
  email text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.admin_users is
  'Usuarios del panel /admin (admin o analista) - respaldados por Supabase Auth (auth_user_id) con 2FA TOTP. Separado de public.users (beneficiarios finales).';

create unique index idx_admin_users_auth_user_id on public.admin_users (auth_user_id);

alter table public.admin_users enable row level security;
