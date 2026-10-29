import { describe, it, expect } from 'vitest';
import { PHOTO_S, toWorld, faceEllipse, anchorOffset } from '../src/photo.js';

describe('사진 얼굴 좌표', () => {
  it('크롭 가운데는 판 가운데, 위쪽 q는 판 위쪽(+y)', () => {
    expect(toWorld({ x: 0.5, y: 0.5 })).toEqual({ x: 0, y: 0 });
    expect(toWorld({ x: 0, y: 0 })).toEqual({ x: -PHOTO_S / 2, y: PHOTO_S / 2 });
  });

  it('얼굴 박스 → 타원', () => {
    const e = faceEllipse({ x0: 0.2, y0: 0.2, x1: 0.8, y1: 0.9 });
    expect(e.cx).toBeCloseTo(0);
    expect(e.cy).toBeCloseTo(-0.05 * PHOTO_S);
    expect(e.rx).toBeCloseTo(0.3 * PHOTO_S);
    expect(e.ry).toBeCloseTo(0.35 * PHOTO_S);
  });

  it('앵커가 사각형 가운데보다 왼쪽 아래면 오프셋도 왼쪽 아래', () => {
    const o = anchorOffset({ rect: { x: 0.4, y: 0.4, w: 0.2, h: 0.2 }, anchor: { x: 0.45, y: 0.55 } });
    expect(o.x).toBeCloseTo(-0.05 * PHOTO_S);
    expect(o.y).toBeCloseTo(-0.05 * PHOTO_S);
  });
});
