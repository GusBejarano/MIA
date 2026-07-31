-- ============================================================
-- MIA — Gate de falso positivo "Colombia" como comodin (v2.0, Fase 4)
--
-- Extiende check_benefit_city_coverage (creada en
-- 2026.07.27-mia_geographic_hierarchy.sql): ademas del chequeo existente
-- (toda zona en city_list debe existir en city_regions), un beneficio activo
-- cuya cobertura se reduzca a solo el pais (city_list = ['colombia']) ya no
-- se acepta como activo salvo que sea 100% online (delivery_mode='online')
-- o la cobertura nacional este confirmada con señal real
-- (coverage_confidence='confirmada'). Cualquier otro caso se degrada
-- automaticamente a pendiente_revision - NO se bloquea el guardado en seco
-- (a diferencia del chequeo de zonas no reconocidas, que si lanza excepcion)
-- para no romper una carga por lote de varias filas a la vez.
--
-- Aplicado junto con la demotion puntual de los 20 casos ya identificados
-- como 'desconocida' (Tributi + 19 de Coomeva) - confirmado con Gustavo
-- antes de ejecutar, porque es el unico paso de esta fase con consecuencia
-- visible real para un usuario (esos 20 beneficios dejan de mostrarse hasta
-- que se confirme su direccion real).
-- ============================================================

create or replace function public.check_benefit_city_coverage()
returns trigger
language plpgsql
as $$
declare
  unmapped text[];
begin
  if new.status = 'activo' then
    select array_agg(distinct tok)
    into unmapped
    from unnest(public.normalize_city_list(new.city)) as tok
    where not exists (
      select 1 from public.city_regions cd
      where cd.city = tok or cd.department = tok or cd.country = tok
    );

    if unmapped is not null then
      raise exception
        'Beneficio "%": la(s) zona(s) % no existen en city_regions (ni como ciudad, ni departamento, ni pais). Agrega la fila correspondiente a city_regions, o corrige el campo city si fue un error de tipeo, antes de guardarlo como activo.',
        new.title, array_to_string(unmapped, ', ');
    end if;

    if public.normalize_city_list(new.city) = array['colombia']
       and coalesce(new.delivery_mode, '') <> 'online'
       and coalesce(new.coverage_confidence, '') <> 'confirmada' then
      raise notice
        'Beneficio "%": cobertura "Colombia" sin confirmar (delivery_mode=%, coverage_confidence=%) - se guarda como pendiente_revision en vez de activo. Confirma direccion(es) real(es) y marca coverage_confidence=confirmada (o delivery_mode=online si aplica) para reactivarlo.',
        new.title, coalesce(new.delivery_mode, 'null'), coalesce(new.coverage_confidence, 'null');
      new.status := 'pendiente_revision';
    end if;
  end if;
  return new;
end;
$$;

-- Demotion puntual de los 20 casos ya identificados como 'desconocida' -
-- confirmado con Gustavo antes de ejecutar (ver mensaje de sesion).
update public.benefits
set status = 'pendiente_revision'
where status = 'activo'
  and city_list = array['colombia']
  and coverage_confidence = 'desconocida';
