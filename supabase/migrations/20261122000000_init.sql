-- LawnMaster initial schema.
create extension if not exists postgis with schema extensions;

-- ---------------------------------------------------------------- companies
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$'),
  tagline text,
  phone text,
  logo_url text,
  brand_color text not null default '#15803d' check (brand_color ~ '^#[0-9a-fA-F]{6}$'),
  map_center_lng double precision,
  map_center_lat double precision,
  stripe_account_id text unique,
  stripe_charges_enabled boolean not null default false,
  platform_fee_percent numeric(5,2) not null default 0 check (platform_fee_percent >= 0 and platform_fee_percent <= 50),
  created_at timestamptz not null default now()
);

create table public.company_members (
  company_id uuid not null references public.companies on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'manager')),
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);
create index on public.company_members (user_id);

create table public.company_domains (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies on delete cascade,
  domain text not null unique check (domain = lower(domain)),
  verified boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.company_domains (company_id);

-- ------------------------------------------------------------ service areas
create table public.service_areas (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  -- GeoJSON Polygon geometry as drawn on the map.
  boundary jsonb not null check (boundary ->> 'type' = 'Polygon'),
  geog extensions.geography generated always as
    (extensions.st_geomfromgeojson(boundary::text)::extensions.geography) stored,
  -- 0 = Sunday .. 6 = Saturday
  service_weekdays smallint[] not null default '{}' check (service_weekdays <@ array[0,1,2,3,4,5,6]::smallint[]),
  daily_capacity integer check (daily_capacity is null or daily_capacity > 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.service_areas (company_id);
create index service_areas_geog_idx on public.service_areas using gist (geog);

create table public.area_blackout_dates (
  area_id uuid not null references public.service_areas on delete cascade,
  date date not null,
  primary key (area_id, date)
);

-- ------------------------------------------------------------------ pricing
create table public.lawn_size_tiers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  min_sqft integer not null check (min_sqft >= 0),
  max_sqft integer check (max_sqft is null or max_sqft > min_sqft)
);
create index on public.lawn_size_tiers (company_id);

create table public.mowing_prices (
  company_id uuid not null references public.companies on delete cascade,
  area_id uuid not null references public.service_areas on delete cascade,
  tier_id uuid not null references public.lawn_size_tiers on delete cascade,
  frequency text not null check (frequency in ('weekly', 'biweekly', 'triweekly', 'monthly')),
  price_cents integer not null check (price_cents > 0),
  primary key (area_id, tier_id, frequency)
);
create index on public.mowing_prices (company_id);

create table public.addon_services (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text,
  price_cents integer not null check (price_cents > 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.addon_services (company_id);

-- ---------------------------------------------------------------- customers
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  email text not null,
  full_name text not null,
  phone text,
  address text not null,
  lng double precision not null,
  lat double precision not null,
  lawn_outline jsonb,
  lawn_sqft integer,
  tier_id uuid references public.lawn_size_tiers on delete set null,
  area_id uuid references public.service_areas on delete set null,
  stripe_customer_id text,
  created_at timestamptz not null default now(),
  unique (company_id, user_id)
);
create index on public.customers (user_id);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies on delete cascade,
  customer_id uuid not null references public.customers on delete cascade,
  area_id uuid not null references public.service_areas on delete restrict,
  frequency text not null check (frequency in ('weekly', 'biweekly', 'triweekly', 'monthly')),
  price_cents integer not null check (price_cents > 0),
  start_date date not null,
  status text not null default 'pending' check (status in ('pending', 'active', 'past_due', 'canceled')),
  stripe_subscription_id text unique,
  stripe_checkout_session_id text unique,
  created_at timestamptz not null default now()
);
create index on public.subscriptions (company_id, status);
create index on public.subscriptions (customer_id);

create table public.addon_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies on delete cascade,
  customer_id uuid not null references public.customers on delete cascade,
  addon_id uuid references public.addon_services on delete set null,
  name text not null,
  price_cents integer not null check (price_cents > 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'completed', 'canceled')),
  stripe_checkout_session_id text,
  created_at timestamptz not null default now()
);
create index on public.addon_orders (company_id, status);
create index on public.addon_orders (customer_id);
create index on public.addon_orders (stripe_checkout_session_id);

create table public.visits (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies on delete cascade,
  subscription_id uuid not null references public.subscriptions on delete cascade,
  customer_id uuid not null references public.customers on delete cascade,
  area_id uuid not null references public.service_areas on delete restrict,
  -- The slot the schedule produced; visit_date differs when it was rolled past a blackout.
  original_date date not null,
  visit_date date not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'skipped')),
  unique (subscription_id, original_date)
);
create index on public.visits (company_id, visit_date);
create index on public.visits (area_id, visit_date);
create index on public.visits (customer_id);

-- Processed Stripe webhook events, for idempotency. Service role only.
create table public.stripe_events (
  id text primary key,
  received_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- functions
create function public.is_company_member(p_company uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.company_members m
    where m.company_id = p_company and m.user_id = (select auth.uid())
  );
$$;

-- Create a company owned by the calling user, with a starter set of lawn sizes.
create function public.create_company(p_name text, p_slug text)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_id uuid;
begin
  if v_user is null then
    raise exception 'not signed in';
  end if;
  if exists (select 1 from public.company_members where user_id = v_user) then
    raise exception 'user already belongs to a company';
  end if;
  insert into public.companies (name, slug) values (p_name, p_slug) returning id into v_id;
  insert into public.company_members (company_id, user_id, role) values (v_id, v_user, 'owner');
  insert into public.lawn_size_tiers (company_id, name, min_sqft, max_sqft) values
    (v_id, 'Small', 0, 5000),
    (v_id, 'Medium', 5000, 10000),
    (v_id, 'Large', 10000, 20000),
    (v_id, 'Extra large', 20000, null);
  return v_id;
end;
$$;

-- The active service area of a company that contains a point, if any.
create function public.find_service_area(p_company uuid, p_lng double precision, p_lat double precision)
returns uuid
language sql stable
set search_path = ''
as $$
  select a.id
  from public.service_areas a
  where a.company_id = p_company
    and a.active
    and extensions.st_covers(
      a.geog,
      extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography
    )
  order by a.created_at
  limit 1;
$$;

revoke execute on function public.is_company_member(uuid) from public, anon;
revoke execute on function public.create_company(text, text) from public, anon;
revoke execute on function public.find_service_area(uuid, double precision, double precision) from public, anon;
grant execute on function public.is_company_member(uuid) to authenticated, service_role;
grant execute on function public.create_company(text, text) to authenticated;
grant execute on function public.find_service_area(uuid, double precision, double precision) to authenticated, service_role;

-- ---------------------------------------------------------------------- RLS
-- Company members manage their own company's rows. Customers can read their own
-- records. Everything else (public storefront reads, checkout, webhooks) runs
-- server-side with the service role, which bypasses RLS. There are no anon policies.
alter table public.companies enable row level security;
alter table public.company_members enable row level security;
alter table public.company_domains enable row level security;
alter table public.service_areas enable row level security;
alter table public.area_blackout_dates enable row level security;
alter table public.lawn_size_tiers enable row level security;
alter table public.mowing_prices enable row level security;
alter table public.addon_services enable row level security;
alter table public.customers enable row level security;
alter table public.subscriptions enable row level security;
alter table public.addon_orders enable row level security;
alter table public.visits enable row level security;
alter table public.stripe_events enable row level security;

create policy "members read company" on public.companies
  for select to authenticated using (public.is_company_member(id));

create policy "read own membership" on public.company_members
  for select to authenticated using (user_id = (select auth.uid()));

create policy "members read domains" on public.company_domains
  for select to authenticated using (public.is_company_member(company_id));

create policy "members manage areas" on public.service_areas
  for all to authenticated
  using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));

create policy "members manage blackouts" on public.area_blackout_dates
  for all to authenticated
  using (exists (select 1 from public.service_areas a where a.id = area_id and public.is_company_member(a.company_id)))
  with check (exists (select 1 from public.service_areas a where a.id = area_id and public.is_company_member(a.company_id)));

create policy "members manage tiers" on public.lawn_size_tiers
  for all to authenticated
  using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));

create policy "members manage prices" on public.mowing_prices
  for all to authenticated
  using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));

create policy "members manage addons" on public.addon_services
  for all to authenticated
  using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));

create policy "members read customers" on public.customers
  for select to authenticated using (public.is_company_member(company_id));
create policy "customers read self" on public.customers
  for select to authenticated using (user_id = (select auth.uid()));

create policy "members read subscriptions" on public.subscriptions
  for select to authenticated using (public.is_company_member(company_id));
create policy "customers read own subscriptions" on public.subscriptions
  for select to authenticated
  using (exists (select 1 from public.customers c where c.id = customer_id and c.user_id = (select auth.uid())));

create policy "members read addon orders" on public.addon_orders
  for select to authenticated using (public.is_company_member(company_id));
create policy "members update addon orders" on public.addon_orders
  for update to authenticated
  using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));
create policy "customers read own addon orders" on public.addon_orders
  for select to authenticated
  using (exists (select 1 from public.customers c where c.id = customer_id and c.user_id = (select auth.uid())));

create policy "members read visits" on public.visits
  for select to authenticated using (public.is_company_member(company_id));
create policy "members update visits" on public.visits
  for update to authenticated
  using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));
create policy "customers read own visits" on public.visits
  for select to authenticated
  using (exists (select 1 from public.customers c where c.id = customer_id and c.user_id = (select auth.uid())));

-- ------------------------------------------------------------------- grants
-- Explicit, so the schema does not depend on a project's default privileges.
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
revoke all on public.stripe_events from authenticated;
