# 상점 아이템 이미지

아이템 이미지를 이 폴더에 **`{아이템id}.svg`** 파일명으로 넣으면 자동으로 표시됩니다.
파일이 없으면 `store_items.emoji` 값(이모지)으로 폴백됩니다.

## 현재 아이템 id → 파일명
| 아이템 | id | 파일명 |
|---|---|---|
| 소원권 | `wish` | `wish.svg` |
| 커플 링 | `couple-ring` | `couple-ring.svg` |
| 우정 링 | `friend-ring` | `friend-ring.svg` |
| 천체 망원경 | `telescope` | `telescope.svg` |
| 지우개 | `eraser` | `eraser.svg` |
| 카세트 테이프 | `cassette` | `cassette.svg` |

## 규격
- **정사각형** SVG 권장 (카드 62px / 상세 모달 108px 박스 안에 여백 두고 표시)
- 배경은 투명 (박스 배경색 위에 얹힘)
- 새 아이템을 추가하면 그 아이템의 `id`.svg 를 넣으면 됩니다.
