-- ============================================================
-- MIA — Evento session_started (retencion semanal)
-- Agrega 'session_started' al enum de event_type: se dispara una vez por
-- visita real (no por mensaje ni por llamada a la API), tanto para
-- usuarios nuevos como para los que regresan, para poder calcular
-- cohortes de retencion (dia 1 / dia 7 / dia 30) comparando la primera
-- ocurrencia de este evento por usuario contra las siguientes.
--
-- Decision: NO se reutiliza 'session_returned' (ya esta en el enum, sin
-- uso todavia) porque su nombre asume que el usuario ya habia estado
-- antes - usarlo tambien para la primera visita de un usuario nuevo
-- produciria datos semanticamente incorrectos para cualquiera que despues
-- consulte event_type = 'session_returned' esperando solo visitas de
-- retorno. session_started es neutral: sirve igual para la primera
-- visita y para todas las siguientes, que es justo lo que pide la
-- metrica (% de usuarios con 2+ sesiones reales en una ventana de 7
-- dias).
-- ============================================================

alter table public.events
  drop constraint events_event_type_check;

alter table public.events
  add constraint events_event_type_check check (event_type in (
    'onboarding_started',
    'onboarding_completed',
    'benefit_shown',
    'benefit_clicked',
    'session_returned',
    'feedback_given',
    'city_interest_declared',
    'city_detected',
    'location_permission_granted',
    'session_started'                        -- una vez por visita real (nuevos y que regresan), base para retencion dia 1/7/30
  ));
