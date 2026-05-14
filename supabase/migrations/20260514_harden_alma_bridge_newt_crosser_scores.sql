-- Safe, rerunnable migration for the leaderboard table used by the app.
-- This intentionally scopes changes to alma_bridge_newt_crosser_scores only.

create table if not exists public.alma_bridge_newt_crosser_scores (
  name text not null,
  score integer not null
);

alter table if exists public.alma_bridge_newt_crosser_scores
  enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert on table public.alma_bridge_newt_crosser_scores to anon, authenticated;

create index if not exists alma_bridge_newt_crosser_scores_score_idx
  on public.alma_bridge_newt_crosser_scores (score desc);

create index if not exists alma_bridge_newt_crosser_scores_name_idx
  on public.alma_bridge_newt_crosser_scores (name);

drop policy if exists allow_public_leaderboard_reads on public.alma_bridge_newt_crosser_scores;
create policy allow_public_leaderboard_reads
  on public.alma_bridge_newt_crosser_scores
  for select
  to anon, authenticated
  using (true);

drop policy if exists allow_public_leaderboard_inserts on public.alma_bridge_newt_crosser_scores;
create policy allow_public_leaderboard_inserts
  on public.alma_bridge_newt_crosser_scores
  for insert
  to anon, authenticated
  with check (true);