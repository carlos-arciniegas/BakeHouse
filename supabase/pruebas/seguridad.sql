-- Pruebas de la base de datos: permisos (Row Level Security), validaciones y triggers.
-- Cada bloque lanza "FALLA: ..." si algo no se cumple. Se corren con scripts/probar-bd.sh.

\set ON_ERROR_STOP on
\set QUIET on

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'ana@ejemplo.com'),
  ('00000000-0000-0000-0000-00000000000b', 'bruno@ejemplo.com');

-- ---------------------------------------------------------------------------
-- Ana crea su negocio y anota datos
-- ---------------------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false) as _ \gset

select public.crear_negocio('Pachon''s Bakehouse', 'VE') as negocio_ana \gset
select set_config('pruebas.negocio_ana', :'negocio_ana', false) as _ \gset

insert into public.clientes (negocio_id, id, nombre, telefono, nota)
values (:'negocio_ana', 'cli_1', 'José Rodríguez', '584149876543', '');

insert into public.movimientos (negocio_id, id, cliente_id, tipo, descripcion, monto, fecha, productos)
values (:'negocio_ana', 'mov_1', 'cli_1', 'venta', '2x Galleta', 3, '2026-11-20', '[{"nombre": "Galleta", "cantidad": 2, "precio": 1.5}]');

insert into public.productos (negocio_id, id, nombre, precio) values (:'negocio_ana', 'prod_1', 'Galleta', 1.5);
insert into public.metodos_pago (negocio_id, id, tipo, datos) values (:'negocio_ana', 'met_1', 'pagomovil', '{"banco": "Banesco (0134)"}');

do $$ begin
  if (select count(*) from public.negocios) <> 1 then raise exception 'FALLA: Ana debería ver su negocio'; end if;
  if (select rol from public.miembros) <> 'dueno' then raise exception 'FALLA: quien crea el negocio debería quedar como dueño'; end if;
  if (select count(*) from public.clientes) <> 1 then raise exception 'FALLA: Ana debería ver su cliente'; end if;
  if (select count(*) from public.movimientos) <> 1 then raise exception 'FALLA: Ana debería ver su movimiento'; end if;
  raise notice '✓ Ana crea su negocio, queda como dueña y ve sus datos';
end $$;

-- "actualizado_en" lo pone el servidor aunque la app mande otra hora
do $$ begin
  update public.clientes set nota = 'Oficina', actualizado_en = '2000-01-01' where id = 'cli_1';
  if (select actualizado_en from public.clientes where id = 'cli_1') < now() - interval '1 minute' then
    raise exception 'FALLA: actualizado_en debería ponerlo el servidor';
  end if;
  raise notice '✓ actualizado_en lo pone el servidor';
end $$;

-- Validaciones
do $$ begin
  begin
    insert into public.movimientos (negocio_id, id, cliente_id, tipo, monto, fecha)
    values (current_setting('pruebas.negocio_ana')::uuid, 'mov_x', 'cli_1', 'venta', 0, '2026-11-20');
    raise exception 'FALLA: aceptó un monto de 0';
  exception when check_violation then null; end;

  begin
    insert into public.movimientos (negocio_id, id, cliente_id, tipo, monto, fecha)
    values (current_setting('pruebas.negocio_ana')::uuid, 'mov_x', 'cli_1', 'regalo', 5, '2026-11-20');
    raise exception 'FALLA: aceptó un tipo de movimiento inválido';
  exception when check_violation then null; end;

  begin
    insert into public.movimientos (negocio_id, id, cliente_id, tipo, monto, fecha)
    values (current_setting('pruebas.negocio_ana')::uuid, 'mov_x', 'no_existe', 'venta', 5, '2026-11-20');
    raise exception 'FALLA: aceptó un movimiento de un cliente que no existe';
  exception when foreign_key_violation then null; end;

  begin
    insert into public.clientes (negocio_id, id, nombre, telefono)
    values (current_setting('pruebas.negocio_ana')::uuid, 'cli_x', 'Ana', '+58 412');
    raise exception 'FALLA: aceptó un teléfono con símbolos';
  exception when check_violation then null; end;

  begin
    insert into public.metodos_pago (negocio_id, id, tipo) values (current_setting('pruebas.negocio_ana')::uuid, 'met_x', 'cheque');
    raise exception 'FALLA: aceptó un tipo de método de pago inválido';
  exception when check_violation then null; end;

  raise notice '✓ rechaza montos en 0, tipos inválidos, clientes inexistentes y teléfonos con símbolos';
end $$;

-- Borrado suave
do $$ begin
  update public.productos set borrado_en = now() where id = 'prod_1';
  if (select borrado_en from public.productos where id = 'prod_1') is null then raise exception 'FALLA: no se pudo marcar como borrado'; end if;
  raise notice '✓ se puede marcar como borrado (para sincronizar borrados)';
end $$;

-- Ana no puede crear negocios ni miembros saltándose crear_negocio()
do $$ begin
  begin
    insert into public.negocios (nombre) values ('Otro');
    raise exception 'FALLA: pudo insertar un negocio directo';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.miembros (negocio_id, usuario_id) values (current_setting('pruebas.negocio_ana')::uuid, '00000000-0000-0000-0000-00000000000b');
    raise exception 'FALLA: pudo agregar un miembro directo';
  exception when insufficient_privilege then null; end;
  raise notice '✓ negocios y miembros solo se crean con crear_negocio()';
end $$;

-- ---------------------------------------------------------------------------
-- Bruno (otra cuenta) no ve ni toca los datos de Ana
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false) as _ \gset

do $$ begin
  if (select count(*) from public.negocios) <> 0 then raise exception 'FALLA: Bruno ve el negocio de Ana'; end if;
  if (select count(*) from public.clientes) <> 0 then raise exception 'FALLA: Bruno ve los clientes de Ana'; end if;
  if (select count(*) from public.movimientos) <> 0 then raise exception 'FALLA: Bruno ve los movimientos de Ana'; end if;
  if (select count(*) from public.metodos_pago) <> 0 then raise exception 'FALLA: Bruno ve los métodos de pago de Ana'; end if;
  if (select count(*) from public.miembros) <> 0 then raise exception 'FALLA: Bruno ve los miembros de Ana'; end if;

  begin
    insert into public.clientes (negocio_id, id, nombre) values (current_setting('pruebas.negocio_ana')::uuid, 'intruso', 'Intruso');
    raise exception 'FALLA: Bruno pudo crear un cliente en el negocio de Ana';
  exception when insufficient_privilege then null; end;

  update public.clientes set nombre = 'Hackeado' where id = 'cli_1';
  delete from public.movimientos where id = 'mov_1';
  update public.negocios set nombre = 'Hackeado';

  raise notice '✓ Bruno no ve ni puede escribir los datos de Ana';
end $$;

-- Bruno crea su propio negocio y solo ve ese
select public.crear_negocio('Dulce Mila', 'ES') as negocio_bruno \gset
do $$ begin
  if (select count(*) from public.negocios) <> 1 then raise exception 'FALLA: Bruno debería ver solo su negocio'; end if;
  if (select pais from public.negocios) <> 'ES' then raise exception 'FALLA: el país del negocio de Bruno'; end if;
  raise notice '✓ cada cuenta ve solo sus negocios';
end $$;

-- Sin sesión (anon) no se ve nada
reset role;
set role anon;
select set_config('request.jwt.claim.sub', '', false) as _ \gset
do $$ begin
  begin
    perform 1 from public.clientes;
    raise exception 'FALLA: sin sesión se pueden leer clientes';
  exception when insufficient_privilege then null; end;
  begin
    perform public.crear_negocio('Anónimo', 'VE');
    raise exception 'FALLA: sin sesión se puede crear un negocio';
  exception when insufficient_privilege then null; end;
  raise notice '✓ sin sesión no se puede leer ni crear nada';
end $$;

-- ---------------------------------------------------------------------------
-- Lo que intentó Bruno no cambió nada de Ana
-- ---------------------------------------------------------------------------
reset role;
do $$ begin
  if (select nombre from public.clientes where id = 'cli_1') <> 'José Rodríguez' then raise exception 'FALLA: Bruno cambió un cliente de Ana'; end if;
  if not exists (select 1 from public.movimientos where id = 'mov_1') then raise exception 'FALLA: Bruno borró un movimiento de Ana'; end if;
  if exists (select 1 from public.negocios where nombre = 'Hackeado') then raise exception 'FALLA: Bruno renombró un negocio'; end if;
  raise notice '✓ los intentos de Bruno no cambiaron nada';
end $$;

-- ---------------------------------------------------------------------------
-- Ayudante: usa los datos pero no administra el negocio
-- ---------------------------------------------------------------------------
insert into public.miembros (negocio_id, usuario_id, rol)
values (:'negocio_ana', '00000000-0000-0000-0000-00000000000b', 'ayudante');

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false) as _ \gset
do $$ begin
  if (select count(*) from public.clientes) <> 1 then raise exception 'FALLA: la ayudante debería ver los clientes del negocio'; end if;
  insert into public.movimientos (negocio_id, id, cliente_id, tipo, descripcion, monto, fecha)
  values (current_setting('pruebas.negocio_ana')::uuid, 'mov_2', 'cli_1', 'abono', 'Pago (Efectivo)', 3, '2026-11-20');
  update public.negocios set nombre = 'Cambiado por ayudante' where id = current_setting('pruebas.negocio_ana')::uuid;
end $$;
reset role;
do $$ begin
  if not exists (select 1 from public.movimientos where id = 'mov_2') then raise exception 'FALLA: la ayudante no pudo anotar un pago'; end if;
  if exists (select 1 from public.negocios where nombre = 'Cambiado por ayudante') then raise exception 'FALLA: la ayudante pudo renombrar el negocio'; end if;
  raise notice '✓ la ayudante anota ventas y pagos, pero no administra el negocio';
end $$;
