-- RPC to safely increment event view count
create or replace function increment_view_count(event_id bigint)
returns void as $$
begin
  update events
  set view_count = view_count + 1
  where id = event_id;
end;
$$ language plpgsql;
