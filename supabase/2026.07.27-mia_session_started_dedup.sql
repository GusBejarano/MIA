-- MIA — Dedup de session_started por ventana de tiempo (v1.5, Bug #1)
-- Postgres rechaza (a nivel de INSERT, sin consulta adicional) un segundo
-- session_started del mismo user_id si ocurre a menos de 30s del anterior.
-- No requiere ningun cambio en el cliente ni un client_session_id nuevo -
-- cubre reintentos de red, doble contexto (pestana + PWA agregado a
-- inicio) y cualquier otra causa que dispare el mismo evento dos veces
-- casi al mismo tiempo, sin tocar la logica de negocio.

create extension if not exists btree_gist;

-- Los indices (y por lo tanto las exclusion constraints, que son un
-- indice por dentro) exigen funciones IMMUTABLE. "timestamptz + interval"
-- esta marcada STABLE en Postgres (en general puede depender del huso
-- horario de la sesion), asi que no se puede usar directo en el rango de
-- abajo. Convertir a segundos "epoch" (numero simple, sin husos horarios
-- de por medio) evita el problema - epoch de un timestamptz es siempre el
-- mismo numero sin importar la sesion, asi que es seguro declararla
-- IMMUTABLE nosotros mismos (Postgres no lo verifica, confia en la
-- declaracion).
create or replace function public.epoch_seconds(ts timestamptz)
returns numeric
language sql
immutable
as $$
  select extract(epoch from ts)::numeric;
$$;

alter table public.events
  add constraint no_duplicate_session_started
  exclude using gist (
    user_id with =,
    numrange(epoch_seconds(occurred_at), epoch_seconds(occurred_at) + 30, '[]') with &&
  )
  where (event_type = 'session_started');
