-- MIA — Limpieza previa a 2026.07.27-mia_session_started_dedup.sql
--
-- La constraint de exclusion de ese archivo se valida contra los datos
-- YA existentes en events - si ya hay session_started duplicados (mismo
-- user_id, menos de 30s de diferencia), el ALTER TABLE de ese archivo
-- va a fallar. Corre este archivo PRIMERO si eso pasa.
--
-- Paso 1: revisar que va a borrar (no borra nada todavia).
select
  e1.id as id_a_borrar,
  e1.user_id,
  e1.occurred_at as occurred_at_a_borrar,
  e2.id as se_conserva_este,
  e2.occurred_at as occurred_at_conservado
from public.events e1
join public.events e2
  on e1.user_id = e2.user_id
  and e2.event_type = 'session_started'
  and e1.event_type = 'session_started'
  and e2.occurred_at < e1.occurred_at
  and e1.occurred_at - e2.occurred_at < interval '30 seconds'
order by e1.user_id, e1.occurred_at;

-- Paso 2: si el resultado de arriba se ve correcto (son los duplicados
-- que esperabas, no eventos legitimos separados), descomenta y corre
-- esto para borrarlos - conserva el mas viejo de cada par/cadena, borra
-- el resto.
--
-- with ranked as (
--   select id, user_id, occurred_at,
--          lag(occurred_at) over (partition by user_id order by occurred_at) as prev_at
--   from public.events
--   where event_type = 'session_started'
-- )
-- delete from public.events
-- where id in (
--   select id from ranked
--   where prev_at is not null
--     and occurred_at - prev_at < interval '30 seconds'
-- );

-- Paso 3: recien despues de la limpieza (o si el Paso 1 no encontro
-- nada), corre 2026.07.27-mia_session_started_dedup.sql.
