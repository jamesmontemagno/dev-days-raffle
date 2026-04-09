create extension if not exists pgcrypto;

create table if not exists public.raffle_entries (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  organization text,
  email text,
  normalized_name text not null,
  normalized_organization text,
  normalized_email text,
  prize_label text,
  won_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  constraint raffle_entries_display_name_not_blank check (char_length(trim(display_name)) > 0)
);

create unique index if not exists raffle_entries_identity_unique
  on public.raffle_entries (
    normalized_name,
    coalesce(normalized_organization, ''),
    coalesce(normalized_email, '')
  );

alter table public.raffle_entries enable row level security;

drop policy if exists raffle_entries_insert_public on public.raffle_entries;
create policy raffle_entries_insert_public
  on public.raffle_entries
  for insert
  to anon, authenticated
  with check (true);

create or replace function public.raffle_summary()
returns table (
  total_entries bigint,
  winners_count bigint,
  eligible_count bigint
)
language sql
security definer
set search_path = public
as $$
  select
    count(*)::bigint as total_entries,
    count(*) filter (where won_at is not null)::bigint as winners_count,
    count(*) filter (where won_at is null)::bigint as eligible_count
  from public.raffle_entries;
$$;

create or replace function public.list_recent_winners(limit_count integer default 8)
returns table (
  id uuid,
  display_name text,
  organization text,
  prize_label text,
  won_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    raffle_entries.id,
    raffle_entries.display_name,
    raffle_entries.organization,
    raffle_entries.prize_label,
    raffle_entries.won_at
  from public.raffle_entries
  where raffle_entries.won_at is not null
  order by raffle_entries.won_at desc
  limit greatest(limit_count, 1);
$$;

create or replace function public.draw_winner(selected_prize_label text default null)
returns table (
  id uuid,
  display_name text,
  organization text,
  prize_label text,
  won_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  chosen_id uuid;
begin
  select raffle_entries.id
  into chosen_id
  from public.raffle_entries
  where raffle_entries.won_at is null
  order by random()
  limit 1
  for update skip locked;

  if chosen_id is null then
    raise exception 'NO_ELIGIBLE_ENTRIES';
  end if;

  return query
  update public.raffle_entries
  set
    won_at = timezone('utc', now()),
    prize_label = nullif(trim(coalesce(selected_prize_label, '')), '')
  where raffle_entries.id = chosen_id
  returning
    raffle_entries.id,
    raffle_entries.display_name,
    raffle_entries.organization,
    raffle_entries.prize_label,
    raffle_entries.won_at;
end;
$$;

grant execute on function public.raffle_summary() to anon, authenticated;
grant execute on function public.list_recent_winners(integer) to anon, authenticated;
grant execute on function public.draw_winner(text) to anon, authenticated;
