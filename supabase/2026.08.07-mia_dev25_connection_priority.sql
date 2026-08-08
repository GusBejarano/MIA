-- ============================================================
-- MIA — dev 2.5: prioridad por benefactor conectado (1-3 estrellas)
-- SQL para correr manualmente en Supabase, rama/branch dev 2.5.
--
-- Agregado despues de la primera prueba en vivo del onboarding nuevo:
-- reemplaza el uso de "es_principal" (una sola conexion marcada, ver
-- 2026.08.07-mia_dev25_onboarding_v2.sql) por una calificacion 1-3 por
-- CADA benefactor conectado - mas estrellas, mas prioridad al ordenar sus
-- beneficios en el tab "Conectados". Mismo rango que benefit_ratings
-- (1,2,3), pero aqui SIEMPRE tiene un valor (no representa "sin calificar":
-- toda fila de user_programs ya existe desde que se conecta el benefactor,
-- por eso el default es 1 en vez de usar ausencia de fila como en
-- benefit_ratings).
--
-- es_principal/verificado NO se eliminan de user_programs (columnas ya
-- existentes, quedan sin usar en la UI nueva) - no hay necesidad de una
-- migracion destructiva por esto.
-- ============================================================

alter table public.user_programs
  add column if not exists prioridad smallint not null default 1
    check (prioridad in (1, 2, 3));

comment on column public.user_programs.prioridad is
  'Prioridad 1-3 que el usuario le da a este benefactor (mas estrellas = mas prioridad al mostrar sus beneficios en el tab Conectados) - reemplaza es_principal en la UI de "Mis conexiones".';
