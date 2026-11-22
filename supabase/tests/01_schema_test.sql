-- Behavioural checks for the schema: service-area lookup and tenant isolation.
-- Any failed assertion raises and aborts the run.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'owner-a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'owner-b@example.com'),
  ('00000000-0000-0000-0000-00000000000c', 'customer@example.com');

-- Owners create their companies through the RPC, as the app does.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
select public.create_company('Alpha Lawns', 'alpha') as company_a \gset
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
select public.create_company('Beta Lawns', 'beta') as company_b \gset

do $$ begin
  begin
    perform public.create_company('Second', 'second');
    raise exception 'FAIL: a user created a second company';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;

-- Owner A draws an area (a ~1km box) and prices it.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
insert into public.service_areas (company_id, name, boundary, service_weekdays)
values (:'company_a', 'Northside',
  '{"type":"Polygon","coordinates":[[[-97.75,30.27],[-97.74,30.27],[-97.74,30.28],[-97.75,30.28],[-97.75,30.27]]]}',
  '{2,4}')
returning id as area_a \gset
select id as tier_a from public.lawn_size_tiers where name = 'Small' \gset
insert into public.mowing_prices (company_id, area_id, tier_id, frequency, price_cents)
values (:'company_a', :'area_a', :'tier_a', 'weekly', 4500);

do $$ begin
  if (select count(*) from public.lawn_size_tiers) <> 4 then
    raise exception 'FAIL: owner A should see exactly their 4 starter tiers';
  end if;
  if (select count(*) from public.companies) <> 1 then
    raise exception 'FAIL: owner A sees other companies';
  end if;
end $$;

-- Point lookup.
select public.find_service_area(:'company_a', -97.745, 30.275) as hit \gset
select public.find_service_area(:'company_a', -97.80, 30.275) is null as miss \gset
\if :miss \else \echo 'FAIL: point outside matched' \quit 1 \endif
select (:'hit' = :'area_a') as hit_ok \gset
\if :hit_ok \else select 1/0; \endif

-- Owner B cannot see or modify A's data, nor insert into A's company.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
do $$ declare n int; begin
  if exists (select 1 from public.service_areas where name = 'Northside') then
    raise exception 'FAIL: owner B can read company A areas';
  end if;
  if exists (select 1 from public.mowing_prices where price_cents = 4500) then
    raise exception 'FAIL: owner B can read company A prices';
  end if;
  update public.service_areas set name = 'hacked' where name = 'Northside';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: owner B updated company A area'; end if;
  update public.companies set platform_fee_percent = 0 where slug = 'beta';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: members can update companies directly'; end if;
end $$;
select public.find_service_area(:'company_a', -97.745, 30.275) is null as b_blind \gset
\if :b_blind \else select 1/0; \endif

select set_config('test.company_a', :'company_a', true);
do $$ begin
  begin
    insert into public.addon_services (company_id, name, price_cents)
    values (current_setting('test.company_a')::uuid, 'Sneaky', 100);
  exception when insufficient_privilege then
    return;
  end;
  raise exception 'FAIL: owner B inserted into company A';
end $$;

-- Customer data (written by the service role in the app).
reset role;
insert into public.customers (id, company_id, user_id, email, full_name, address, lng, lat, area_id, tier_id)
values ('10000000-0000-0000-0000-000000000001', :'company_a', '00000000-0000-0000-0000-00000000000c',
  'customer@example.com', 'Casey Customer', '1 Main St', -97.745, 30.275, :'area_a', :'tier_a');
insert into public.subscriptions (id, company_id, customer_id, area_id, frequency, price_cents, start_date, status)
values ('20000000-0000-0000-0000-000000000001', :'company_a', '10000000-0000-0000-0000-000000000001',
  :'area_a', 'weekly', 4500, '2026-06-02', 'active');
insert into public.visits (company_id, subscription_id, customer_id, area_id, original_date, visit_date)
values (:'company_a', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
  :'area_a', '2026-06-02', '2026-06-02');

set local role authenticated;
-- The customer sees their own records but nothing of the company's setup.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true);
do $$ begin
  if (select count(*) from public.customers) <> 1 or (select count(*) from public.visits) <> 1
     or (select count(*) from public.subscriptions) <> 1 then
    raise exception 'FAIL: customer cannot read own records';
  end if;
  if exists (select 1 from public.companies) or exists (select 1 from public.service_areas) then
    raise exception 'FAIL: customer can read company internals';
  end if;
end $$;
-- Owner B sees none of A's customers; owner A sees them.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
do $$ begin
  if exists (select 1 from public.customers) or exists (select 1 from public.visits) then
    raise exception 'FAIL: owner B can read company A customers';
  end if;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
do $$ declare n int; begin
  if (select count(*) from public.customers) <> 1 then raise exception 'FAIL: owner A cannot read customers'; end if;
  update public.visits set status = 'completed';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: owner A cannot complete a visit'; end if;
end $$;

-- Anonymous visitors get nothing.
set local role anon;
do $$ declare t text; n int; begin
  foreach t in array array['companies','customers','service_areas','mowing_prices','visits','stripe_events'] loop
    begin
      execute format('select count(*) from public.%I', t) into n;
    exception when insufficient_privilege then
      n := 0;
    end;
    if n <> 0 then raise exception 'FAIL: anon can read %', t; end if;
  end loop;
end $$;

rollback;
\echo 'ALL SCHEMA TESTS PASSED'
