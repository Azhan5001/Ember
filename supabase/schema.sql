-- Ember account sync v1. Run the entire file in Supabase SQL Editor.
-- Safe to rerun. Uses Supabase Auth; never stores passwords in these tables.
begin;
create table if not exists public.ember_sync_heads (
 user_id uuid primary key references auth.users(id) on delete cascade,
 revision bigint not null default 0
);
create table if not exists public.ember_sync_records (
 user_id uuid not null references auth.users(id) on delete cascade,
 id text not null check(length(id) between 1 and 512),
 data jsonb,
 deleted boolean not null default false,
 revision bigint not null,
 mutation text not null,
 primary key(user_id,id),
 check(data is null or pg_column_size(data)<=131072)
);
create index if not exists ember_sync_revision on public.ember_sync_records(user_id,revision);
alter table public.ember_sync_heads enable row level security;
alter table public.ember_sync_records enable row level security;
revoke all on public.ember_sync_heads,public.ember_sync_records from anon,authenticated;
-- Only the ownership-checked RPC writes data. Defense-in-depth read policies.
drop policy if exists ember_own_head on public.ember_sync_heads;
create policy ember_own_head on public.ember_sync_heads for select to authenticated using((select auth.uid())=user_id);
drop policy if exists ember_own_records on public.ember_sync_records;
create policy ember_own_records on public.ember_sync_records for select to authenticated using((select auth.uid())=user_id);
create or replace function public.ember_sync_v1(p_cursor bigint default 0,p_changes jsonb default '[]'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 uid uuid:=auth.uid(); head bigint; op jsonb; old public.ember_sync_records;
 acknowledgements jsonb:='[]'; conflicts jsonb:='[]'; results jsonb; next_cursor bigint;
begin
 if uid is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if p_cursor<0 or jsonb_typeof(p_changes)<>'array' or jsonb_array_length(p_changes)>100 or octet_length(p_changes::text)>2000000 then raise exception 'Invalid sync request'; end if;
 insert into public.ember_sync_heads(user_id) values(uid) on conflict do nothing;
 select revision into head from public.ember_sync_heads where user_id=uid for update;
 if p_cursor>head then raise exception 'Sync cursor is ahead of server; reset cloud cache'; end if;
 for op in select value from jsonb_array_elements(p_changes) loop
  if coalesce(op->>'id','') !~ '^(setting|addon|library|progress|history|profile):.+' or length(op->>'id')>512 or length(coalesce(op->>'mutation','')) not between 1 and 80 or coalesce((op->>'base')::bigint,-1)<0 then raise exception 'Invalid record'; end if;
  select * into old from public.ember_sync_records where user_id=uid and id=op->>'id';
  if old.mutation=op->>'mutation' then
   acknowledgements:=acknowledgements||jsonb_build_array(jsonb_build_object('id',old.id,'mutation',old.mutation,'revision',old.revision));
  elsif coalesce(old.revision,0)<>((op->>'base')::bigint) then
   conflicts:=conflicts||jsonb_build_array(to_jsonb(old)-'user_id');
  else
   head:=head+1;
   insert into public.ember_sync_records(user_id,id,data,deleted,revision,mutation)
   values(uid,op->>'id',op->'data',coalesce((op->>'deleted')::boolean,false),head,op->>'mutation')
   on conflict(user_id,id) do update set data=excluded.data,deleted=excluded.deleted,revision=excluded.revision,mutation=excluded.mutation;
   acknowledgements:=acknowledgements||jsonb_build_array(jsonb_build_object('id',op->>'id','mutation',op->>'mutation','revision',head));
  end if;
 end loop;
 update public.ember_sync_heads set revision=head where user_id=uid;
 select coalesce(jsonb_agg(to_jsonb(r)-'user_id' order by r.revision),'[]'),coalesce(max(r.revision),p_cursor) into results,next_cursor
 from (select * from public.ember_sync_records where user_id=uid and revision>p_cursor order by revision limit 500) r;
 return jsonb_build_object('records',results,'acks',acknowledgements,'conflicts',conflicts,'cursor',next_cursor,'more',next_cursor<head,'head',head);
end $$;
revoke all on function public.ember_sync_v1(bigint,jsonb) from public,anon;
grant execute on function public.ember_sync_v1(bigint,jsonb) to authenticated;
commit;
