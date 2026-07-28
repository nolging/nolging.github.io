-- =============================================================
--  한 기기(push endpoint)로 여러 계정의 푸시를 동시에 받기
--   · 기존: endpoint 가 UNIQUE → 계정 전환 시 이전 계정 구독을 삭제하고 현재 계정으로 이전
--     → 관리자 상태에선 일반 계정 푸시를 못 받음.
--   · 변경: (user_id, endpoint) 를 UNIQUE 로 → 같은 기기를 여러 계정이 각각 구독 가능.
--     attach 는 현재 계정 구독만 upsert(다른 계정 구독 유지), detach 는 현재 계정 구독만 제거.
--   · 계정 전환 스위처로 각 계정에 한 번씩 로그인/전환하면(활성화되는 순간 자동 attach)
--     그 계정 구독이 이 기기에 남아, 이후 어느 계정으로 있든 모두 푸시를 받는다.
--  적용: Supabase SQL Editor 에 실행.
-- =============================================================

-- endpoint 단독 UNIQUE 제거 → (user_id, endpoint) UNIQUE 로 교체
alter table public.push_subscriptions drop constraint if exists push_subscriptions_endpoint_key;
-- (이름이 다른 환경 방어) endpoint 한 컬럼짜리 unique 제약이 있으면 모두 제거
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.push_subscriptions'::regclass and contype = 'u'
      and array_length(conkey, 1) = 1
      and conkey[1] = (select attnum from pg_attribute
                        where attrelid = 'public.push_subscriptions'::regclass and attname = 'endpoint')
  loop execute format('alter table public.push_subscriptions drop constraint %I', c); end loop;
end $$;
alter table public.push_subscriptions
  add constraint push_subscriptions_user_endpoint_key unique (user_id, endpoint);
-- 조회 성능(같은 endpoint 정리 등)
create index if not exists idx_push_subscriptions_endpoint on public.push_subscriptions(endpoint);

-- attach: 현재 사용자 구독만 upsert. 다른 계정의 같은 기기 구독은 건드리지 않는다.
create or replace function public.attach_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  insert into public.push_subscriptions(user_id, endpoint, p256dh, auth)
    values (auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (user_id, endpoint) do update
    set p256dh = excluded.p256dh, auth = excluded.auth;
end;
$$;
grant execute on function public.attach_push_subscription(text, text, text) to authenticated;

-- detach: 로그아웃/끄기 시 현재 사용자의 이 기기 구독만 제거(다른 계정 구독은 유지).
create or replace function public.detach_push_subscription(p_endpoint text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
end;
$$;
grant execute on function public.detach_push_subscription(text) to authenticated;
