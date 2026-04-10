create or replace function public.list_entries()
returns table (
  id uuid,
  display_name text,
  organization text,
  email text,
  won_at timestamptz,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    raffle_entries.id,
    raffle_entries.display_name,
    raffle_entries.organization,
    raffle_entries.email,
    raffle_entries.won_at,
    raffle_entries.created_at
  from public.raffle_entries
  order by raffle_entries.created_at desc;
$$;

create or replace function public.remove_entry(selected_entry_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.raffle_entries
  where raffle_entries.id = selected_entry_id;

  get diagnostics deleted_count = row_count;

  return deleted_count > 0;
end;
$$;

grant execute on function public.list_entries() to anon, authenticated;
grant execute on function public.remove_entry(uuid) to anon, authenticated;
