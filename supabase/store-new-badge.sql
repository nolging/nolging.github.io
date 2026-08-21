-- =============================================================
--  상점에 신상이 뜨면 하단 탭 "상점" 메뉴에 보라색 점을 찍는다. 일반/프리미엄
--  상점 중 어느 쪽이든 5일 이내 공개(public_since, Store.jsx 의 "신상" 배지와
--  동일 기준)된 아이템이 있고 아직 그 탭을 확인 안 했으면 뜬다. 두 상점 다
--  신상이 있으면 둘 다 확인해야(각 탭에 한 번씩 들어가야) 점이 없어진다.
--  적용: Supabase SQL Editor 에 그대로 실행. (store-item-public-since.sql 이후)
-- =============================================================

create table if not exists public.store_seen (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  general_at timestamptz,
  premium_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.store_seen enable row level security;

drop policy if exists store_seen_select on public.store_seen;
create policy store_seen_select on public.store_seen
  for select to authenticated using (user_id = auth.uid());
drop policy if exists store_seen_insert on public.store_seen;
create policy store_seen_insert on public.store_seen
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists store_seen_update on public.store_seen;
create policy store_seen_update on public.store_seen
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 일반/프리미엄 중 하나라도 "5일 이내 공개 + 아직 그 탭 확인 안 함" 인 아이템이 있으면 true.
create or replace function public.has_new_store_items()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.store_items si
    left join public.store_seen ss on ss.user_id = auth.uid()
    where si.is_active
      and si.public_since is not null
      and si.public_since > now() - interval '5 days'
      and si.public_since > coalesce(
        case when si.premium then ss.premium_at else ss.general_at end,
        '-infinity'::timestamptz
      )
  );
$$;
grant execute on function public.has_new_store_items() to authenticated;

-- 일반/프리미엄 탭에 들어가면 그 탭만 "확인함"으로 기록(다른 탭은 그대로 둔다).
create or replace function public.mark_store_seen(p_kind text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_kind not in ('general', 'premium') then raise exception '잘못된 상점 구분입니다.'; end if;
  insert into public.store_seen(user_id, general_at, premium_at)
    values (auth.uid(),
      case when p_kind = 'general' then now() end,
      case when p_kind = 'premium' then now() end)
  on conflict (user_id) do update
    set general_at = case when p_kind = 'general' then now() else public.store_seen.general_at end,
        premium_at = case when p_kind = 'premium' then now() else public.store_seen.premium_at end,
        updated_at = now();
end;
$$;
grant execute on function public.mark_store_seen(text) to authenticated;

notify pgrst, 'reload schema';
