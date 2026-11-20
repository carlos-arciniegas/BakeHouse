-- Imita en un PostgreSQL normal lo que Supabase ya trae, para probar las migraciones sin tocar
-- el proyecto real: roles anon/authenticated, auth.users y auth.uid() leído del JWT.
-- Solo se usa en scripts/probar-bd.sh.

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (id uuid primary key, email text);

-- En Supabase, auth.uid() sale del token de la sesión; aquí, de un ajuste que fijan las pruebas
create function auth.uid() returns uuid
language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated;

-- Supabase da por defecto estos permisos sobre las tablas nuevas; luego las políticas (RLS) los limitan
alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
