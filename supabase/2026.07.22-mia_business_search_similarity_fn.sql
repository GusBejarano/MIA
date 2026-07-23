-- ============================================================
-- MIA — Buscador de negocio, Capa 1: funcion RPC de similitud
--
-- pg_trgm y el indice de similitud sobre benefits.title ya estan
-- creados (aplicado manualmente antes de esta sesion). Pero el backend
-- solo tiene acceso a Supabase via supabase-js (PostgREST/REST), no una
-- conexion Postgres directa - sin una funcion expuesta como RPC no hay
-- forma de invocar similarity() ni de que el planner use ese indice
-- desde el codigo de la app. Esta funcion es de solo lectura (no toca
-- ninguna tabla ni dato existente), unicamente expone el indice ya
-- construido.
--
-- security definer + search_path fijo: patron estandar de Postgres para
-- funciones RPC de Supabase (evita hijacking de search_path). No
-- necesita bypassear RLS (benefits no tiene politicas restrictivas para
-- SELECT via service_role), pero se deja explicito por consistencia.
-- Solo se otorga a service_role - el backend nunca expone la key
-- anon/authenticated a esta funcion (mismo posture deny-all del resto
-- del esquema).
-- ============================================================

create or replace function public.search_benefits_by_title_similarity(
  search_text text,
  min_similarity real default 0.35,
  match_limit int default 10
)
returns table (
  id uuid,
  title text,
  source_program_id uuid,
  city text,
  similarity_score real
)
language sql
stable
security definer
set search_path = public
as $$
  select
    b.id,
    b.title,
    b.source_program_id,
    b.city,
    similarity(lower(b.title), lower(search_text)) as similarity_score
  from public.benefits b
  where b.status = 'activo'
    and similarity(lower(b.title), lower(search_text)) >= min_similarity
  order by similarity_score desc
  limit match_limit;
$$;

revoke all on function public.search_benefits_by_title_similarity(text, real, int) from public;
grant execute on function public.search_benefits_by_title_similarity(text, real, int) to service_role;
