-- ============================================================
-- MIA — Panel de Administración (Fase 2, ajuste): link a la fuente original
--
-- Campo de uso exclusivo del panel /admin - nunca se expone en la app
-- publica (ni getBenefitDetail ni DetailSheetMessage lo tocan). Sirve para
-- que un analista compare rapido lo que ya esta en la BD contra la fuente
-- original de donde se investigo el beneficio, y complete datos faltantes.
-- ============================================================

alter table public.benefits
  add column original_source_url text;

comment on column public.benefits.original_source_url is
  'Link a la fuente original de este beneficio (para comparar/completar datos) - solo uso interno del panel admin, nunca se muestra a usuarios finales.';

-- Renombra la etiqueta generica "carga_manual" (los 404 beneficios de hoy)
-- a algo mas especifico, para poder distinguir a futuro otras formas de
-- carga manual (ej. sin asistencia de IA) de esta.
update public.benefits
set research_source = 'Carga Asistida por Claude Cowork'
where research_source = 'carga_manual';
