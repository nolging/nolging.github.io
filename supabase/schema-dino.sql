-- =============================================================
--  Nolging · 다이노 짬푸 (프리미엄 그룹 전용 솔로 미니게임)
--  ------------------------------------------------------------
--  크롬 오프라인 공룡 게임 클론. 대기실 없이 혼자 플레이하고, 판마다
--  기록(dino_runs)을 남겨 그룹 내 전체 기록 순위(dino_leaderboard)를
--  보여준다. 매일 자정(KST) 직후 pg_cron 이 전날 그룹별 1위에게
--  코인을 지급한다(dino_daily_reward).
--
--  실행 순서: schema.sql → schema-core.sql(is_group_member/is_couple_group/
--  is_friend_group) → schema-economy-store.sql(coin_ledger) →
--  schema-notifications.sql(notifications 테이블) 이후 이 파일.
--
--  ⚠️ 아직 관리자만 노출(admin-only). 일반 사용자 공개는 프런트(GroupMembers.jsx)
--  의 isAdmin 조건만 지우면 되고, 이 파일은 손댈 필요 없음(타로 카페와 동일 패턴).
-- =============================================================


-- =============================================================
--  1. 테이블
-- =============================================================

-- 판마다 기록(제출된 점수) 로그. 전체 기록 순위(최고점)와 일별 1위 산정(보상용) 모두
-- 이 테이블에서 계산한다 — coin_ledger 처럼 누적 로그로 두고 별도 집계 테이블을 두지 않음.
create table if not exists public.dino_runs (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  score      int  not null check (score >= 0),
  created_at timestamptz not null default now()
);
create index if not exists idx_dino_runs_leaderboard on public.dino_runs(group_id, user_id, score desc, created_at);
create index if not exists idx_dino_runs_day on public.dino_runs(group_id, created_at);

-- 일별 1위 보상 지급 이력(그룹당 하루 1건) — 중복 지급 방지(멱등) + 지급액 감사(audit) 기록용.
create table if not exists public.dino_awards (
  group_id   uuid not null references public.groups(id) on delete cascade,
  day        date not null,
  winner     uuid not null references public.profiles(id) on delete cascade,
  coin       int  not null,
  created_at timestamptz not null default now(),
  primary key (group_id, day)
);


-- =============================================================
--  2. RLS
-- =============================================================

alter table public.dino_runs enable row level security;
drop policy if exists dino_runs_select on public.dino_runs;
create policy dino_runs_select on public.dino_runs for select to authenticated
  using (public.is_group_member(group_id, auth.uid()));
-- 쓰기(추가)는 정책 없음 → submit_dino_score(정의자 권한)로만 가능(점수 조작 방지).

alter table public.dino_awards enable row level security;
-- 정책 없음 → 직접 조회/쓰기 불가, dino_daily_reward(cron 전용, 정의자)로만 접근.


-- =============================================================
--  3. 함수
-- =============================================================

-- 판 종료 시 점수 제출. 프리미엄(커플/우정) 그룹 멤버만. 반환: { ok, score, best }
create or replace function public.submit_dino_score(p_group_id uuid, p_score int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_score int; v_best int;
begin
  if not public.is_group_member(p_group_id, auth.uid()) then raise exception '그룹 멤버가 아니에요.'; end if;
  if not (public.is_couple_group(p_group_id) or public.is_friend_group(p_group_id)) then
    raise exception '프리미엄 그룹 전용 게임이에요.'; end if;
  v_score := greatest(0, least(coalesce(p_score, 0), 999999));   -- 비정상 값 방어(클라 게임이라 서버가 공정성까진 못 봄)
  insert into public.dino_runs(group_id, user_id, score) values (p_group_id, auth.uid(), v_score);
  select max(score) into v_best from public.dino_runs where group_id = p_group_id and user_id = auth.uid();
  return jsonb_build_object('ok', true, 'score', v_score, 'best', v_best);
end;
$$;
grant execute on function public.submit_dino_score(uuid, int) to authenticated;

-- 그룹 내 기록 순위(전체 기간 최고점, 회원별 1행). 그룹 멤버 또는 앱 관리자만.
-- 반환: { rows:[{user_id,name,avatar,best,achieved_at}], my_best }
create or replace function public.dino_leaderboard(p_group_id uuid)
returns jsonb language plpgsql security definer set search_path = public stable as $$
declare v_rows jsonb; v_my_best int;
begin
  if not (public.is_group_member(p_group_id, auth.uid()) or public.is_admin(auth.uid())) then
    raise exception '그룹 멤버가 아니에요.'; end if;

  select jsonb_agg(jsonb_build_object(
      'user_id', b.user_id, 'name', coalesce(gm.display_nickname, '멤버'),
      'avatar', gm.avatar_url, 'best', b.best, 'achieved_at', b.achieved_at
    ) order by b.best desc, b.achieved_at asc)
  into v_rows
  from (
    -- 회원별 최고점 1행(동점이면 먼저 그 점수를 낸 시점) — DISTINCT ON 으로 회원당 1행만.
    select distinct on (user_id) user_id, score as best, created_at as achieved_at
    from public.dino_runs
    where group_id = p_group_id
    order by user_id, score desc, created_at asc
  ) b
  join public.group_members gm on gm.group_id = p_group_id and gm.user_id = b.user_id;

  select max(score) into v_my_best from public.dino_runs where group_id = p_group_id and user_id = auth.uid();

  return jsonb_build_object('rows', coalesce(v_rows, '[]'::jsonb), 'my_best', coalesce(v_my_best, 0));
end;
$$;
grant execute on function public.dino_leaderboard(uuid) to authenticated;

-- 일별 1위 보상(pg_cron 전용, 매일 00:05 KST 실행 → "어제(KST)" 하루치를 정산).
-- 그룹별로: 어제 플레이한 회원들 중 최고점(동점이면 그날 먼저 시작한 사람) 1명을 1위로,
-- 그날 참여 인원 수(N)만큼 5 + (N-1)*5 츄르 지급(최대 20). 그룹당 하루 1회(멱등, dino_awards).
create or replace function public.dino_daily_reward()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_day        date := (now() at time zone 'Asia/Seoul')::date - 1;
  v_day_start  timestamptz := (v_day::timestamp at time zone 'Asia/Seoul');
  v_day_end    timestamptz := ((v_day + 1)::timestamp at time zone 'Asia/Seoul');
  v_group      record;
  v_winner     uuid;
  v_score      int;
  v_n          int;
  v_coin       int;
  v_t          text;
  v_b          text;
begin
  for v_group in
    select distinct group_id from public.dino_runs
    where created_at >= v_day_start and created_at < v_day_end
  loop
    with daily as (
      select user_id, max(score) as best, min(created_at) as first_at
      from public.dino_runs
      where group_id = v_group.group_id and created_at >= v_day_start and created_at < v_day_end
      group by user_id
    )
    select d.user_id, d.best, (select count(*) from daily)
    into v_winner, v_score, v_n
    from daily d
    order by d.best desc, d.first_at asc
    limit 1;

    if v_winner is null then continue; end if;

    v_coin := least(20, 5 + 5 * greatest(0, v_n - 1));

    begin
      insert into public.dino_awards(group_id, day, winner, coin) values (v_group.group_id, v_day, v_winner, v_coin);
    exception when unique_violation then
      continue;  -- 이미 지급됨(멱등)
    end;

    insert into public.coin_ledger(user_id, delta, reason, ref_type)
      values (v_winner, v_coin, '다이노 짬푸 1위 보상', 'dino');

    select nr.title, nr.body into v_t, v_b
      from public.notif_render('dino_win', jsonb_build_object('coin', v_coin::text)) nr;
    if v_t is not null then
      insert into public.notifications(user_id, actor_id, type, title, body, group_id)
        values (v_winner, null, 'dino_win', v_t, v_b, v_group.group_id);
    end if;
  end loop;
end;
$$;
-- authenticated 에게 grant 하지 않음(cron 전용 — draw_lotto_round() 와 동일 패턴)

-- 알림 템플릿(관리자 "알림 관리"에서 문구 수정 가능) — 다른 도메인 함수들처럼 notif_render() 를
-- 거치도록 위에서 이미 고쳤는데, notif_templates 에 시드 행이 없어 관리자 페이지 목록에도
-- 안 보이고 있었다. 여기서 등록.
insert into public.notif_templates (key, label, title, body, vars, emoji, sort_order) values
  ('dino_win', '다이노 짬푸 1위 보상', '다이노 짬푸 1위 보상',
   '어제 다이노 짬푸 그룹 1위! {coin} 츄르를 받았어요.', '{coin} = 지급된 츄르 수', '🦖', 130)
on conflict (key) do update set label = excluded.label, vars = excluded.vars, sort_order = excluded.sort_order;


-- =============================================================
--  4. pg_cron 스케줄
-- =============================================================

create extension if not exists pg_cron;
do $$ begin
  perform cron.unschedule('nolging-dino-daily-reward');
exception when others then null;
end $$;
-- UTC 15:05 = KST 00:05(다음날) — 자정 직후 "어제(KST)" 하루치를 정산
select cron.schedule('nolging-dino-daily-reward', '5 15 * * *', $$select public.dino_daily_reward()$$);
