-- 폴라로이드 필름 (polaroid-film) — 일반 상점 기능 강화 아이템
--   · 쪽지에 사진을 첨부한다. 한 장당 필름 1개 소모, 쪽지 하나에 최대 5장.
--   · 받는 사람은 바로 사진이 보이지 않고 "N장의 사진이 첨부됨" 영역만 보이며,
--     "인화하기"를 눌러야(develop_polaroid_note) 실제 사진이 공개된다.
--   · 프리미엄 아님 · 관리자 전용(admin_only, 테스트용) · 5 츄르
--  적용: Supabase SQL Editor 에 그대로 실행.

-- 1) 상점 아이템
insert into public.store_items (id, name, price, emoji, description, premium, tier, admin_only, category, sort_order, is_active) values
  ('polaroid-film', '폴라로이드 필름', 5, '📷', '쪽지에 사진을 첨부해요 (최대 5장)', false, null, true, 'feature', 45, true)
on conflict (id) do update set
  name = excluded.name, price = excluded.price, emoji = excluded.emoji,
  admin_only = excluded.admin_only, category = excluded.category, is_active = excluded.is_active;
  -- description, sort_order 는 관리자 편집 보존을 위해 갱신하지 않음

-- 2) 쪽지 하나에 딸린 사진들(note_items 와 같은 패턴). 인화 전까지는 receipient 에게
--    노출 안 됨(recipient 쪽 select 정책이 claimed=true 일 때만 허용) — sender 는 언제나 조회 가능.
create table if not exists public.note_photos (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.notes(id) on delete cascade,
  url text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_note_photos_note on public.note_photos(note_id);
alter table public.note_photos enable row level security;
drop policy if exists note_photos_select on public.note_photos;
create policy note_photos_select on public.note_photos for select to authenticated using (
  exists (select 1 from public.notes n where n.id = note_id and n.sender_id = auth.uid())
  or exists (select 1 from public.notes n where n.id = note_id and n.recipient_id = auth.uid() and n.claimed = true)
);

-- 3) 알림 문구(없어도 use_polaroid_film 안 코드 폴백으로 동작)
insert into public.notif_templates (key, label, title, body, vars, sort_order) values
  ('polaroid',      '사진 도착',       '{actor} 님이 폴라로이드 사진을 보냈어요', '쪽지함에서 인화해 보세요 📷', '{actor} = 보낸 사람', 78),
  ('polaroid_anon', '사진 도착(익명)', '익명의 폴라로이드 사진이 도착했어요',    '쪽지함에서 인화해 보세요 📷', '(치환자 없음)', 79)
on conflict (key) do update set label = excluded.label, vars = excluded.vars, sort_order = excluded.sort_order;

-- 4) 사용: 폴라로이드 필름 N장(=사진 N장) 소모 → 쪽지 하나로 전송
create or replace function public.use_polaroid_film(
  p_group_id uuid, p_recipient_id uuid, p_message text, p_urls jsonb, p_anonymous boolean default false
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_sender text; v_recipient text; v_sav text; v_rav text; v_body text; v_anon boolean;
  v_qty integer; v_ids uuid[]; v_note_id uuid; v_url text; i integer; v_nt_t text; v_nt_b text;
begin
  v_anon := coalesce(p_anonymous, false);
  if p_urls is null or jsonb_typeof(p_urls) <> 'array' or jsonb_array_length(p_urls) = 0 then
    raise exception '첨부할 사진이 없어요.'; end if;
  v_qty := jsonb_array_length(p_urls);
  if v_qty > 5 then raise exception '사진은 쪽지 하나에 최대 5장까지 첨부할 수 있어요.'; end if;
  if not public.is_group_member(p_group_id, auth.uid()) then raise exception '그룹 멤버만 사용할 수 있습니다.'; end if;
  if p_recipient_id = auth.uid() then raise exception '자기 자신에게는 보낼 수 없습니다.'; end if;
  if not public.is_group_member(p_group_id, p_recipient_id) then raise exception '받는 사람이 그룹 멤버가 아닙니다.'; end if;

  select array_agg(id) into v_ids from (
    select id from public.user_items where user_id = auth.uid() and item_id = 'polaroid-film' and status = 'active'
    order by created_at asc limit v_qty) t;
  if v_ids is null or array_length(v_ids, 1) < v_qty then raise exception '폴라로이드 필름이 부족해요.'; end if;
  update public.user_items set status = 'used', used_at = now() where id = any(v_ids);
  if v_anon then perform public.consume_one_eraser(); end if;

  v_sender    := coalesce(public.notif_member_name(p_group_id, auth.uid()), '');
  v_recipient := coalesce(public.notif_member_name(p_group_id, p_recipient_id), '');
  select avatar_url into v_sav from public.group_members where group_id = p_group_id and user_id = auth.uid();
  select avatar_url into v_rav from public.group_members where group_id = p_group_id and user_id = p_recipient_id;
  v_body := coalesce(nullif(btrim(p_message), ''), '사진을 보냈어요 📷');

  insert into public.notes(group_id, sender_id, recipient_id, sender_name, recipient_name, sender_avatar, recipient_avatar, body, kind, item_id, item_name, qty, anonymous)
    values (p_group_id, auth.uid(), p_recipient_id, v_sender, v_recipient, v_sav, v_rav, v_body, 'polaroid', 'polaroid-film', '폴라로이드 필름', v_qty, v_anon)
    returning id into v_note_id;

  i := 0;
  for v_url in select jsonb_array_elements_text(p_urls) loop
    insert into public.note_photos(note_id, url, sort_order) values (v_note_id, v_url, i);
    i := i + 1;
  end loop;

  select r.title, r.body into v_nt_t, v_nt_b from public.notif_render(case when v_anon then 'polaroid_anon' else 'polaroid' end, jsonb_build_object('actor', v_sender)) r;
  insert into public.notifications(user_id, actor_id, type, title, body, group_id)
    values (p_recipient_id, case when v_anon then null else auth.uid() end, 'polaroid',
            coalesce(v_nt_t, case when v_anon then '익명의 폴라로이드 사진이 도착했어요' when v_sender <> '' then v_sender || ' 님이 폴라로이드 사진을 보냈어요' else '폴라로이드 사진이 도착했어요' end),
            coalesce(v_nt_b, '쪽지함에서 인화해 보세요 📷'), p_group_id);
  return v_note_id;
end;
$$;
grant execute on function public.use_polaroid_film(uuid, uuid, text, jsonb, boolean) to authenticated;

-- 5) 인화하기: 받는 사람이 눌러야 사진이 공개됨(notes.claimed = true → note_photos 조회 가능해짐)
create or replace function public.develop_polaroid_note(p_note_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare n public.notes;
begin
  select * into n from public.notes where id = p_note_id;
  if n.id is null or n.recipient_id <> auth.uid() or n.kind <> 'polaroid' then
    raise exception '인화할 수 없는 쪽지입니다.'; end if;
  if n.claimed then raise exception '이미 인화했어요.'; end if;
  update public.notes set claimed = true, is_read = true where id = n.id;
end;
$$;
grant execute on function public.develop_polaroid_note(uuid) to authenticated;

notify pgrst, 'reload schema';
