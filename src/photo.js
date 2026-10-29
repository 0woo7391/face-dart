// 사진 얼굴(face-curling 얼굴 만들기 결과)의 q 좌표 → 다트 판 위 좌표.
// q: 512 크롭 정규화 좌표, (0,0)=좌상단, y는 아래로 증가. 판: 가운데가 (0,0), y는 위로 증가.

// 크롭 한 변의 판 위 길이. 얼굴 폭(q 약 0.6)이 그림 얼굴 폭(8.8)과 비슷해지게
export const PHOTO_S = 14;

export const toWorld = (q) => ({ x: (q.x - 0.5) * PHOTO_S, y: (0.5 - q.y) * PHOTO_S });

/** 얼굴 박스(q) → 얼굴 판정 타원 (중심·반지름, 판 위) */
export function faceEllipse(box) {
  const c = toWorld({ x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 });
  return { cx: c.x, cy: c.y, rx: ((box.x1 - box.x0) / 2) * PHOTO_S, ry: ((box.y1 - box.y0) / 2) * PHOTO_S };
}

/** 스티커 사각형 가운데에서 본 앵커(무게중심) 위치 (판 위). 카드를 앵커 기준으로 붙이는 데 쓴다 */
export function anchorOffset({ rect, anchor }) {
  const a = toWorld(anchor);
  const c = toWorld({ x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 });
  return { x: a.x - c.x, y: a.y - c.y };
}
