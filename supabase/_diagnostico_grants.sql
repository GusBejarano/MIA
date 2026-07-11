-- Diagnostico: revisa que privilegios tiene service_role sobre las tablas de MIA.
-- Corre esto primero en el SQL Editor de Supabase (selecciona todo el bloque
-- antes de darle Run).
select table_name, string_agg(privilege_type, ', ' order by privilege_type) as privilegios
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee = 'service_role'
group by table_name
order by table_name;

-- Si en "privilegios" falta SELECT, INSERT, UPDATE o DELETE para alguna
-- tabla, corre esto para otorgar el acceso completo a service_role sobre
-- el esquema public - es el rol que usa nuestro backend, y ya tiene RLS
-- habilitado en todas las tablas como segunda capa (ver
-- 2026.07.10-mia_supabase_schema_v1.sql).
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
