-- BakeHouse: esquema inicial
--
-- Cada negocio tiene sus clientes, movimientos (ventas y pagos), catálogo y métodos de pago.
-- Una persona (auth.users) entra a uno o varios negocios a través de "miembros".
-- Row Level Security: cada persona solo ve y cambia los datos de sus negocios.
--
-- Sincronización (la app sigue funcionando sin conexión):
-- - Los ids de clientes, movimientos, productos y métodos son texto y los genera la app,
--   así se pueden crear sin red y se conservan los ids de los datos locales existentes.
-- - "actualizado_en" lo pone siempre el servidor; la app pide "lo que cambió desde X".
-- - Borrar es marcar "borrado_en", para que el borrado llegue a los otros dispositivos.

-- ---------------------------------------------------------------------------
-- Negocios y miembros
-- ---------------------------------------------------------------------------

create table public.negocios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (char_length(btrim(nombre)) between 1 and 80),
  pais text not null default 'VE' check (pais in ('VE', 'ES', 'PT', 'IT', 'FR', 'DE', 'GB', 'US')),
  -- Tasa BCV compartida por todos los dispositivos del negocio (solo se usa en Venezuela)
  tasa_bcv numeric(12, 2) not null default 0 check (tasa_bcv >= 0),
  tasa_bcv_actualizada text not null default '',
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table public.miembros (
  negocio_id uuid not null references public.negocios (id) on delete cascade,
  usuario_id uuid not null references auth.users (id) on delete cascade,
  rol text not null default 'dueno' check (rol in ('dueno', 'ayudante')),
  creado_en timestamptz not null default now(),
  primary key (negocio_id, usuario_id)
);

create index miembros_usuario_idx on public.miembros (usuario_id);

-- ---------------------------------------------------------------------------
-- Datos de cada negocio
-- ---------------------------------------------------------------------------

create table public.clientes (
  negocio_id uuid not null references public.negocios (id) on delete cascade,
  id text not null check (char_length(id) between 1 and 64),
  nombre text not null check (char_length(btrim(nombre)) between 1 and 120),
  -- Solo dígitos con código de país, como lo guarda la app
  telefono text not null default '' check (telefono ~ '^[0-9]{0,20}$'),
  nota text not null default '' check (char_length(nota) <= 200),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  borrado_en timestamptz,
  primary key (negocio_id, id)
);

create table public.movimientos (
  negocio_id uuid not null,
  id text not null check (char_length(id) between 1 and 64),
  cliente_id text not null,
  -- 'abono' es el nombre interno de un pago (compatibilidad con los datos de la app)
  tipo text not null check (tipo in ('venta', 'abono')),
  descripcion text not null default '' check (char_length(descripcion) <= 500),
  -- En la moneda del país del negocio
  monto numeric(12, 2) not null check (monto > 0),
  fecha date not null,
  -- Productos de la venta para reportes: [{ "nombre": "...", "cantidad": 2, "precio": 1.5 }].
  -- Vacío en pagos y en ventas escritas a mano.
  productos jsonb check (productos is null or jsonb_typeof(productos) = 'array'),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  borrado_en timestamptz,
  primary key (negocio_id, id),
  foreign key (negocio_id, cliente_id) references public.clientes (negocio_id, id) on delete cascade
);

create index movimientos_cliente_idx on public.movimientos (negocio_id, cliente_id);

create table public.productos (
  negocio_id uuid not null references public.negocios (id) on delete cascade,
  id text not null check (char_length(id) between 1 and 64),
  nombre text not null check (char_length(btrim(nombre)) between 1 and 120),
  precio numeric(12, 2) not null check (precio > 0),
  orden integer not null default 0,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  borrado_en timestamptz,
  primary key (negocio_id, id)
);

create table public.metodos_pago (
  negocio_id uuid not null references public.negocios (id) on delete cascade,
  id text not null check (char_length(id) between 1 and 64),
  tipo text not null check (tipo in ('transferencia', 'bizum', 'paypal', 'pagomovil', 'zelle', 'binance', 'otro')),
  datos jsonb not null default '{}' check (jsonb_typeof(datos) = 'object'),
  activo boolean not null default true,
  orden integer not null default 0,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  borrado_en timestamptz,
  primary key (negocio_id, id)
);

-- Para pedir "lo que cambió desde X" sin recorrer toda la tabla
create index clientes_cambios_idx on public.clientes (negocio_id, actualizado_en);
create index movimientos_cambios_idx on public.movimientos (negocio_id, actualizado_en);
create index productos_cambios_idx on public.productos (negocio_id, actualizado_en);
create index metodos_pago_cambios_idx on public.metodos_pago (negocio_id, actualizado_en);

-- ---------------------------------------------------------------------------
-- "actualizado_en" lo pone el servidor (la hora de un teléfono no es confiable)
-- ---------------------------------------------------------------------------

create function public.marcar_actualizado()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

create trigger negocios_actualizado before insert or update on public.negocios
  for each row execute function public.marcar_actualizado();
create trigger clientes_actualizado before insert or update on public.clientes
  for each row execute function public.marcar_actualizado();
create trigger movimientos_actualizado before insert or update on public.movimientos
  for each row execute function public.marcar_actualizado();
create trigger productos_actualizado before insert or update on public.productos
  for each row execute function public.marcar_actualizado();
create trigger metodos_pago_actualizado before insert or update on public.metodos_pago
  for each row execute function public.marcar_actualizado();

-- ---------------------------------------------------------------------------
-- Permisos (Row Level Security)
-- ---------------------------------------------------------------------------

-- security definer: consulta "miembros" sin pasar por sus propias políticas (evita recursión)
create function public.es_miembro(negocio uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.miembros m
    where m.negocio_id = negocio and m.usuario_id = (select auth.uid())
  );
$$;

create function public.es_dueno(negocio uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.miembros m
    where m.negocio_id = negocio and m.usuario_id = (select auth.uid()) and m.rol = 'dueno'
  );
$$;

-- Crear un negocio deja a quien lo crea como dueño. Es la única forma de crear negocios.
create function public.crear_negocio(nombre text, pais text default 'VE')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  nuevo uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Hay que iniciar sesión para crear un negocio';
  end if;
  insert into public.negocios (nombre, pais) values (crear_negocio.nombre, crear_negocio.pais)
    returning id into nuevo;
  insert into public.miembros (negocio_id, usuario_id, rol) values (nuevo, (select auth.uid()), 'dueno');
  return nuevo;
end;
$$;

revoke execute on function public.es_miembro(uuid) from public, anon;
revoke execute on function public.es_dueno(uuid) from public, anon;
revoke execute on function public.crear_negocio(text, text) from public, anon;
grant execute on function public.es_miembro(uuid) to authenticated;
grant execute on function public.es_dueno(uuid) to authenticated;
grant execute on function public.crear_negocio(text, text) to authenticated;

alter table public.negocios enable row level security;
alter table public.miembros enable row level security;
alter table public.clientes enable row level security;
alter table public.movimientos enable row level security;
alter table public.productos enable row level security;
alter table public.metodos_pago enable row level security;

-- Sin sesión no se ve nada
revoke all on public.negocios, public.miembros, public.clientes, public.movimientos, public.productos, public.metodos_pago from anon;

-- Negocios: los miembros los ven; solo el dueño los cambia o borra; se crean con crear_negocio()
create policy "miembros ven su negocio" on public.negocios
  for select to authenticated using (public.es_miembro(id));
create policy "dueno edita su negocio" on public.negocios
  for update to authenticated using (public.es_dueno(id)) with check (public.es_dueno(id));
create policy "dueno borra su negocio" on public.negocios
  for delete to authenticated using (public.es_dueno(id));

-- Miembros: cada quien ve a los miembros de sus negocios. Invitar personas queda para más adelante.
create policy "ver miembros de mis negocios" on public.miembros
  for select to authenticated using (public.es_miembro(negocio_id));

-- Datos: los miembros del negocio leen y escriben
create policy "miembros usan clientes" on public.clientes
  for all to authenticated using (public.es_miembro(negocio_id)) with check (public.es_miembro(negocio_id));
create policy "miembros usan movimientos" on public.movimientos
  for all to authenticated using (public.es_miembro(negocio_id)) with check (public.es_miembro(negocio_id));
create policy "miembros usan productos" on public.productos
  for all to authenticated using (public.es_miembro(negocio_id)) with check (public.es_miembro(negocio_id));
create policy "miembros usan metodos de pago" on public.metodos_pago
  for all to authenticated using (public.es_miembro(negocio_id)) with check (public.es_miembro(negocio_id));
