-- Keep one personal best for each player name. Names are matched after trimming
-- surrounding whitespace and without regard to letter case.

with ranked_scores as (
  select
    ctid,
    row_number() over (
      partition by lower(btrim(name))
      order by score desc, ctid
    ) as rank_for_name
  from public.alma_bridge_newt_crosser_scores
)
delete from public.alma_bridge_newt_crosser_scores as scores
using ranked_scores
where scores.ctid = ranked_scores.ctid
  and ranked_scores.rank_for_name > 1;

create unique index if not exists alma_bridge_newt_crosser_scores_normalized_name_uidx
  on public.alma_bridge_newt_crosser_scores ((lower(btrim(name))));

create or replace function public.submit_alma_bridge_newt_crosser_score(
  player_name text,
  player_score integer
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  clean_name text := left(btrim(player_name), 20);
  saved_score integer;
begin
  if clean_name is null or clean_name = '' or player_score is null or player_score <= 0 then
    return null;
  end if;

  insert into public.alma_bridge_newt_crosser_scores (name, score)
  values (clean_name, player_score)
  on conflict ((lower(btrim(name)))) do update
    set score = greatest(
      alma_bridge_newt_crosser_scores.score,
      excluded.score
    )
  returning score into saved_score;

  return saved_score;
end;
$$;

revoke all on function public.submit_alma_bridge_newt_crosser_score(text, integer) from public;
grant execute on function public.submit_alma_bridge_newt_crosser_score(text, integer) to anon, authenticated;
