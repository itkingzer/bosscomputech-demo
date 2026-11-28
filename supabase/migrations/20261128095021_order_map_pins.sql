alter table public.orders
  add column if not exists delivery_map_url text
    check (length(delivery_map_url) <= 2048 and delivery_map_url ~
      '^https://((www\.|maps\.)?google\.(com|co\.th)/maps([/?#]|$)|maps\.google\.(com|co\.th)/\?([^#]*&)?q=|maps\.app\.goo\.gl/[A-Za-z0-9_-]+/?([?#]|$)|goo\.gl/maps/[A-Za-z0-9_-]+/?([?#]|$))'),
  add column if not exists onsite_map_pin jsonb
    check (jsonb_path_exists(onsite_map_pin, '$ ? (
      @.latitude.type() == "number" && @.latitude >= -90 && @.latitude <= 90 &&
      @.longitude.type() == "number" && @.longitude >= -180 && @.longitude <= 180 &&
      @.accuracy.type() == "number" && @.accuracy >= 0 &&
      @.captured_at.type() == "string"
    )'));
