-- Cover the remaining foreign keys so deletes and joins on them don't scan.
create index addon_orders_addon_id_idx on public.addon_orders (addon_id);
create index customers_area_id_idx on public.customers (area_id);
create index customers_tier_id_idx on public.customers (tier_id);
create index mowing_prices_tier_id_idx on public.mowing_prices (tier_id);
create index subscriptions_area_id_idx on public.subscriptions (area_id);
