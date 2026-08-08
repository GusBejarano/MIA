-- ============================================================
-- MIA — dev 2.5: onboarding nuevo + home de retorno
-- SQL para correr manualmente en Supabase, rama/branch dev 2.5.
-- No ejecutar en producción hasta validar en dev.
-- Verificar antes de correr: que las tablas `users` y `user_programs`
-- existan con esos nombres exactos y que `users.id` sea uuid (así es
-- según 2026.07.10-mia_supabase_schema_v1.sql).
-- ============================================================

-- 1) Avatar del beneficiario — 3 valores fijos, no URL (assets estáticos en el repo)
alter table public.users
  add column if not exists avatar text default 'negro';
  -- valores esperados: 'negro' | 'verde' | 'fucsia'

-- 2) Conexión con Benefactor: tipo de relación, verificación futura, y cuál es la principal
alter table public.user_programs
  add column if not exists tipo_relacion text,
  add column if not exists verificado boolean not null default false,
  add column if not exists es_principal boolean not null default false,
  add column if not exists connected_at timestamptz;
  -- tipo_relacion esperado: 'afiliado' | 'empleado' | 'beneficiario' | 'estudiante'
  -- es_principal: solo una fila por usuario debería quedar en true;
  --   se controla desde la app, no con un constraint de BD (decisión deliberada)
  -- verificado: default false — la verificación real (correo corporativo / carnet) queda para más adelante

-- 3) Ciudades de interés declaradas por el usuario (independiente de su ubicación real del dispositivo)
create table if not exists public.user_cities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  city text not null,
  created_at timestamptz not null default now(),
  unique (user_id, city)
);

alter table public.user_cities enable row level security;
-- Sin políticas para anon/authenticated = deny-all por defecto, mismo patrón
-- que el resto del esquema (backend accede vía service_role).

-- ------------------------------------------------------------
-- 4) set_principal_connection — agregado por Claude, no estaba en el SQL
-- original. Necesario para que "marcar como principal" sea realmente
-- atómico (regla del prompt: "se controla desde la app... dentro de la
-- misma transacción"). Sin esto, la app tendría que hacer dos UPDATE
-- seguidos vía REST (desmarcar las demás + marcar esta), que no son
-- atómicos entre sí — si el segundo falla, pueden quedar dos filas
-- es_principal=true. Esta función hace ambos updates en una sola
-- transacción de servidor. Mismo patrón de seguridad que
-- search_benefits_by_title_similarity (security definer, search_path
-- fijo, solo service_role).
-- ------------------------------------------------------------

create or replace function public.set_principal_connection(
  p_user_id uuid,
  p_program_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.user_programs
    set es_principal = false
    where user_id = p_user_id
      and program_id <> p_program_id
      and es_principal = true;

  update public.user_programs
    set es_principal = true
    where user_id = p_user_id
      and program_id = p_program_id;
end;
$$;

revoke all on function public.set_principal_connection(uuid, uuid) from public;
grant execute on function public.set_principal_connection(uuid, uuid) to service_role;
