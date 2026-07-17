-- ============================================================
-- MIA — Paso 2: memoria del permiso de ubicación (por usuario)
-- Agrega la bandera que evita volver a pedir el permiso una vez
-- concedido, y el tipo de evento asociado para la bitácora.
-- ============================================================

alter table public.users
  add column location_permission_granted boolean not null default false;

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
    'location_permission_granted'            -- primera vez que el usuario concede el permiso de ubicacion
  ));
