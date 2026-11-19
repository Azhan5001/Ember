-- Ember 0.7. Run once in Supabase SQL Editor after the account setup.
begin;
create table if not exists public.ember_party_rooms (
 id uuid primary key default gen_random_uuid(),code text not null unique,host_client uuid not null,media jsonb not null,
 position double precision not null default 0 check(position between 0 and 604800),paused boolean not null default true,waiting boolean not null default true,
 anchor_at timestamptz not null default now(),revision bigint not null default 1,epoch bigint not null default 1,expires_at timestamptz not null default now()+interval '12 hours');
create table if not exists public.ember_party_members (
 room_id uuid not null references public.ember_party_rooms(id) on delete cascade,client_id uuid not null,user_id uuid not null references auth.users(id) on delete cascade,
 profile_id text not null,name text not null,ready boolean not null default false,duration double precision not null default 0,joined_at timestamptz not null default now(),seen_at timestamptz not null default now(),primary key(room_id,client_id));
create index if not exists ember_party_member_user on public.ember_party_members(user_id,room_id);
create index if not exists ember_party_expiry on public.ember_party_rooms(expires_at);
alter table public.ember_party_rooms enable row level security;
alter table public.ember_party_members enable row level security;
revoke all on public.ember_party_rooms,public.ember_party_members from anon,authenticated;
grant select on public.ember_party_rooms to authenticated;
create or replace function public.ember_party_member(p_room uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$select exists(select 1 from public.ember_party_members where room_id=p_room and user_id=auth.uid() and seen_at>now()-interval '30 seconds');$$;
revoke all on function public.ember_party_member(uuid) from public,anon;
grant execute on function public.ember_party_member(uuid) to authenticated;
drop policy if exists ember_party_room_read on public.ember_party_rooms;
create policy ember_party_room_read on public.ember_party_rooms for select to authenticated using(expires_at>now() and public.ember_party_member(id));
create or replace function public.ember_party_v1(p_room uuid,p_client uuid,p_action text,p_payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 r public.ember_party_rooms%rowtype;m public.ember_party_members%rowtype;t timestamptz:=clock_timestamp();u uuid:=auth.uid();was_waiting boolean;changed boolean:=false;host_duration double precision;members jsonb;med jsonb;
begin
 if u is null or p_client is null then raise exception 'Sign in to use watch parties.';end if;
 if length(p_payload::text)>4096 then raise exception 'Party request too large.';end if;
 if p_action not in ('create','join','pulse','play','pause','seek','media','leave','snapshot') then raise exception 'Unknown party action.';end if;
 if p_action in ('create','join') then
  perform pg_advisory_xact_lock(hashtext(u::text));delete from public.ember_party_rooms where expires_at<t;
  if (select count(*) from public.ember_party_members where user_id=u and seen_at>t-interval '30 seconds')>=8 then raise exception 'Close an existing party connection first.';end if;
 end if;
 if p_action='create' then
  insert into public.ember_party_rooms(code,host_client,media) values(upper(substr(replace(gen_random_uuid()::text,'-',''),1,16)),p_client,'{}') returning * into r;
 elsif p_action='join' then
  select * into r from public.ember_party_rooms where code=upper(regexp_replace(p_payload->>'code','[^a-zA-Z0-9]','','g')) and expires_at>t for update;
 else select * into r from public.ember_party_rooms where id=p_room and expires_at>t for update;end if;
 if r.id is null then raise exception 'Party not found or expired.';end if;
 if p_action in ('create','join') then
  if (select count(*) from public.ember_party_members where room_id=r.id and seen_at>t-interval '12 seconds')>=8 then raise exception 'This party is full (8 viewers).';end if;
  if exists(select 1 from public.ember_party_members where room_id=r.id and client_id=p_client and user_id<>u) then raise exception 'Connection belongs to another account.';end if;
  insert into public.ember_party_members(room_id,client_id,user_id,profile_id,name) values(r.id,p_client,u,left(coalesce(p_payload->>'profile','main'),80),left(coalesce(nullif(trim(p_payload->>'name'),''),'Viewer'),30)) on conflict(room_id,client_id) do update set seen_at=t,ready=false;
  changed:=true;
 end if;
 select * into m from public.ember_party_members where room_id=r.id and client_id=p_client and user_id=u;
 if m.client_id is null then raise exception 'You are not a member of this party.';end if;
 if not r.paused and not r.waiting then r.position:=least(604800,r.position+greatest(0,extract(epoch from t-r.anchor_at)));end if;
 r.anchor_at:=t;was_waiting:=r.waiting;
 if p_action='leave' then delete from public.ember_party_members where room_id=r.id and client_id=p_client and user_id=u;changed:=true;
 else update public.ember_party_members set seen_at=t where room_id=r.id and client_id=p_client;end if;
 if not exists(select 1 from public.ember_party_members where room_id=r.id and client_id=r.host_client and seen_at>t-interval '12 seconds') then
  select client_id into r.host_client from public.ember_party_members where room_id=r.id and seen_at>t-interval '12 seconds' order by joined_at,client_id limit 1;
  if r.host_client is null then delete from public.ember_party_rooms where id=r.id;return jsonb_build_object('left',true);end if;changed:=true;
 end if;
 if p_action in ('create','media') then
  if r.host_client<>p_client then raise exception 'Only the host can change the episode.';end if;
  med:=p_payload->'media';
  if med is null or coalesce(med->>'id','')='' or coalesce(med->>'type','') not in ('movie','series') or coalesce(med->>'vid','')='' then raise exception 'Choose a movie or episode first.';end if;
  r.media:=jsonb_build_object('id',left(med->>'id',200),'type',med->>'type','name',left(med->>'name',200),'vid',left(med->>'vid',200),'season',med->'season','episode',med->'episode','title',left(med->>'title',200));
  r.position:=greatest(0,least(604800,coalesce((p_payload->>'position')::double precision,0)));r.epoch:=r.epoch+1;
  update public.ember_party_members set ready=false,duration=0 where room_id=r.id;changed:=true;
 end if;
 if p_action in ('play','pause','seek') then
  if coalesce((p_payload->>'epoch')::bigint,0)<>r.epoch then raise exception 'The episode changed. Try again.';end if;
  if p_action='seek' then
   if not p_payload ? 'position' then raise exception 'Missing seek position.';end if;
   select duration into host_duration from public.ember_party_members where room_id=r.id and client_id=r.host_client;
   r.position:=greatest(0,least(coalesce(nullif(host_duration,0),604800),(p_payload->>'position')::double precision));
  else r.paused:=p_action='pause';end if;changed:=true;
 end if;
 if p_action='pulse' then
  update public.ember_party_members set ready=coalesce((p_payload->>'ready')::boolean,false) and coalesce((p_payload->>'epoch')::bigint,0)=r.epoch,duration=greatest(0,least(604800,coalesce((p_payload->>'duration')::double precision,0))) where room_id=r.id and client_id=p_client;
 end if;
 select duration into host_duration from public.ember_party_members where room_id=r.id and client_id=r.host_client;
 select coalesce(jsonb_agg(jsonb_build_object('client',client_id,'name',name,'profile',profile_id,'ready',ready,'mismatch',duration>0 and host_duration>0 and abs(duration-host_duration)>3) order by joined_at,client_id),'[]') into members from public.ember_party_members where room_id=r.id and seen_at>t-interval '12 seconds';
 r.waiting:=exists(select 1 from jsonb_array_elements(members) v where not (v->>'ready')::boolean or (v->>'mismatch')::boolean);
 if r.waiting<>was_waiting then changed:=true;end if;
 if changed then
  r.revision:=r.revision+1;
  update public.ember_party_rooms set host_client=r.host_client,media=r.media,position=r.position,paused=r.paused,waiting=r.waiting,anchor_at=r.anchor_at,revision=r.revision,epoch=r.epoch where id=r.id;
 end if;
 return jsonb_build_object('room',to_jsonb(r),'members',members,'server_now',t,'left',p_action='leave');
end;$$;
revoke all on function public.ember_party_v1(uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.ember_party_v1(uuid,uuid,text,jsonb) to authenticated;
do $$begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='ember_party_rooms') then alter publication supabase_realtime add table public.ember_party_rooms;end if;
end$$;

-- Parties are discoverable only to accounts with a currently active member.
create or replace function public.ember_party_list_v1() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(row_to_json(visible)), '[]'::jsonb) from (
  select r.id,r.code,r.media->>'name' as name,r.media->>'type' as type,
   (select count(*) from public.ember_party_members m where m.room_id=r.id and m.seen_at>now()-interval '12 seconds') as viewers
  from public.ember_party_rooms r where r.expires_at>now() and auth.uid() is not null
   and exists(select 1 from public.ember_party_members own where own.room_id=r.id and own.user_id=auth.uid() and own.seen_at>now()-interval '30 seconds')
  order by r.anchor_at desc limit 8
 ) visible;
$$;
revoke all on function public.ember_party_list_v1() from public,anon;
grant execute on function public.ember_party_list_v1() to authenticated;

commit;
