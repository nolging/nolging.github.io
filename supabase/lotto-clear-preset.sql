-- =============================================================
--  로또: 관리자가 미리 지정해 둔 당첨 번호(preset) 삭제 기능 추가.
--  삭제하면 해당 회차는 다시 "미지정" 상태로 돌아가 정기 추첨 시각(토요일 18시)에
--  시스템이 랜덤으로 뽑는다. 이미 추첨이 끝난(winning_numbers 확정) 회차는 삭제 불가.
-- =============================================================

create or replace function public.admin_clear_lotto_preset(p_round_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_round public.lotto_rounds;
begin
  if not public.is_admin(auth.uid()) then raise exception '관리자만 사용할 수 있어요.'; end if;

  select * into v_round from public.lotto_rounds where id = p_round_id for update;
  if v_round.id is null then raise exception '회차를 찾을 수 없어요.'; end if;
  if v_round.winning_numbers is not null then raise exception '이미 추첨이 완료된 회차예요.'; end if;

  update public.lotto_rounds set preset_numbers = null, preset_bonus = null where id = p_round_id;
end $$;
grant execute on function public.admin_clear_lotto_preset(bigint) to authenticated;

-- ⚠️ 배포 후: 이 파일의 내용은 schema-store-items.sql 에도 반영해 두었습니다. 프로덕션에
-- 실행 완료되면(위 함수가 잘 동작하면) 이 파일은 지워도 됩니다.
