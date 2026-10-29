import * as THREE from 'three';
import './style.css';
import './maker/maker.css';
import { loadFace, saveFace, clearFace } from './maker/store.js';
import { PHOTO_S, toWorld, faceEllipse, anchorOffset } from './photo.js';

const V3 = THREE.Vector3;
// 실험판(비행): 레인 110, 중력 약하게. 다트판 시절 값은 FACE_Z -30, G 7
const FACE_Z = -110, G = 1, LINE_X = 4.2;
const BOARD_R = 7.6;
// 얼굴 판정 타원(중심·반지름)과 채점 정규화 길이. 사진 얼굴을 쓰면 applyFace가 바꾼다
let FACE_CX = 0, FACE_CY = 0, FACE_RX = 4.4, FACE_RY = 5.6;
let DIAG = 2 * Math.hypot(FACE_RX, FACE_RY);
const inFace = (x, y) => ((x - FACE_CX) / FACE_RX) ** 2 + ((y - FACE_CY) / FACE_RY) ** 2 <= 1;
const AIM_CAM = new V3(0, .6, 7);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// 부위별 성격: wind = 바람 타는 정도(카드가 넓을수록), flutter = 팔랑거림, steer = 틀기 반응
const PARTS = [
  { id: 'left_brow', name: '왼 눈썹', kind: 'brow', ax: -1.55, ay: 2.3, w: 1.7, h: .6, wind: 1.4, flutter: 1.2, steer: 1.2, r: .45 },
  { id: 'right_brow', name: '오른 눈썹', kind: 'brow', mirror: true, ax: 1.55, ay: 2.3, w: 1.7, h: .6, wind: 1.4, flutter: 1.2, steer: 1.2, r: .45 },
  { id: 'left_eye', name: '왼 눈', kind: 'eye', ax: -1.55, ay: 1.1, w: 1.5, h: .85, wind: 1.0, flutter: .8, steer: 1.0, r: .5 },
  { id: 'right_eye', name: '오른 눈', kind: 'eye', mirror: true, ax: 1.55, ay: 1.1, w: 1.5, h: .85, wind: 1.0, flutter: .8, steer: 1.0, r: .5 },
  { id: 'nose', name: '코', kind: 'nose', ax: 0, ay: -.55, w: 1.2, h: 1.7, wind: .5, flutter: .3, steer: .75, r: .55 },
  { id: 'mouth', name: '입', kind: 'mouth', ax: 0, ay: -2.6, w: 2.5, h: 1.1, wind: 1.3, flutter: .7, steer: .9, r: .6 },
];
const settings = { wind: true, follow: true, slow: true };

// ---------- 캔버스 그림 ----------
function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

function sticker(w, h, paint, mirror) {
  const pad = 16, art = mk(w, h), a = art.getContext('2d');
  if (mirror) { a.translate(w, 0); a.scale(-1, 1); }
  const X = u => pad + u * (w - 2 * pad), Y = v => pad + v * (h - 2 * pad);
  paint(a, X, Y, w - 2 * pad, h - 2 * pad);
  const out = mk(w, h), o = out.getContext('2d');
  for (let i = 0; i < 20; i++) { const t = i / 20 * Math.PI * 2; o.drawImage(art, Math.cos(t) * 9, Math.sin(t) * 9); }
  o.globalCompositeOperation = 'source-in'; o.fillStyle = '#fff'; o.fillRect(0, 0, w, h);
  o.globalCompositeOperation = 'source-over'; o.drawImage(art, 0, 0);
  return out;
}

const PAINT = {
  brow(c, X, Y) {
    c.fillStyle = '#3b2618';
    c.beginPath(); c.moveTo(X(0), Y(.9));
    c.quadraticCurveTo(X(.42), Y(-.15), X(1), Y(.42));
    c.lineTo(X(.98), Y(.7));
    c.quadraticCurveTo(X(.45), Y(.35), X(.08), Y(1));
    c.closePath(); c.fill();
  },
  eye(c, X, Y, W, H) {
    const almond = () => { c.beginPath(); c.moveTo(X(0), Y(.55)); c.quadraticCurveTo(X(.5), Y(-.3), X(1), Y(.5)); c.quadraticCurveTo(X(.5), Y(1.2), X(0), Y(.55)); };
    almond(); c.fillStyle = '#fffaf2'; c.fill();
    c.save(); almond(); c.clip();
    c.fillStyle = '#6a4326'; c.beginPath(); c.arc(X(.5), Y(.5), H * .4, 0, 7); c.fill();
    c.fillStyle = '#140d0a'; c.beginPath(); c.arc(X(.5), Y(.5), H * .2, 0, 7); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(X(.56), Y(.38), H * .08, 0, 7); c.fill();
    c.restore();
    almond(); c.strokeStyle = '#2a1a14'; c.lineWidth = 5; c.stroke();
    c.beginPath(); c.moveTo(X(0), Y(.55)); c.quadraticCurveTo(X(.5), Y(-.3), X(1), Y(.5)); c.lineWidth = 9; c.stroke();
  },
  nose(c, X, Y) {
    c.beginPath(); c.moveTo(X(.5), Y(0));
    c.bezierCurveTo(X(.62), Y(.35), X(1), Y(.58), X(.94), Y(.84));
    c.quadraticCurveTo(X(.5), Y(1.06), X(.06), Y(.84));
    c.bezierCurveTo(X(0), Y(.58), X(.38), Y(.35), X(.5), Y(0));
    c.fillStyle = '#e3a37c'; c.fill(); c.strokeStyle = '#a5643f'; c.lineWidth = 5; c.stroke();
    c.fillStyle = '#7a4030';
    c.beginPath(); c.ellipse(X(.32), Y(.82), 13, 8, .3, 0, 7); c.fill();
    c.beginPath(); c.ellipse(X(.68), Y(.82), 13, 8, -.3, 0, 7); c.fill();
    c.strokeStyle = 'rgba(255,240,225,.7)'; c.lineWidth = 6; c.lineCap = 'round';
    c.beginPath(); c.moveTo(X(.52), Y(.18)); c.lineTo(X(.56), Y(.55)); c.stroke();
  },
  mouth(c, X, Y) {
    c.beginPath(); c.moveTo(X(0), Y(.35));
    c.quadraticCurveTo(X(.25), Y(0), X(.5), Y(.2)); c.quadraticCurveTo(X(.75), Y(0), X(1), Y(.35));
    c.quadraticCurveTo(X(.5), Y(1.2), X(0), Y(.35));
    c.fillStyle = '#d9465f'; c.fill();
    const inner = () => { c.beginPath(); c.moveTo(X(.1), Y(.4)); c.quadraticCurveTo(X(.5), Y(.52), X(.9), Y(.4)); c.quadraticCurveTo(X(.5), Y(.9), X(.1), Y(.4)); };
    inner(); c.fillStyle = '#5a1020'; c.fill();
    c.save(); inner(); c.clip(); c.fillStyle = '#fff'; c.fillRect(X(0), Y(.3), X(1), Y(.58) - Y(.3)); c.restore();
    c.strokeStyle = '#8f2236'; c.lineWidth = 4; inner(); c.stroke();
  },
  hand(c, X, Y) {
    c.fillStyle = '#eab08c'; c.strokeStyle = '#a5643f'; c.lineWidth = 5;
    const rr = (x, y, w, h, r) => { c.beginPath(); c.roundRect(X(x), Y(y), X(x + w) - X(x), Y(y + h) - Y(y), r); c.fill(); c.stroke(); };
    rr(.18, 0, .14, .5, 20); rr(.36, -.0, .14, .46, 20); rr(.54, .03, .14, .46, 20); rr(.72, .1, .13, .42, 20);
    c.save(); c.translate(X(.12), Y(.6)); c.rotate(-.6); c.beginPath(); c.roundRect(-18, -60, 36, 90, 18); c.fill(); c.stroke(); c.restore();
    c.beginPath(); c.roundRect(X(.15), Y(.38), X(.88) - X(.15), Y(1) - Y(.38), 40); c.fill(); c.stroke();
    c.strokeStyle = 'rgba(140,80,50,.5)'; c.lineWidth = 4;
    c.beginPath(); c.moveTo(X(.3), Y(.6)); c.quadraticCurveTo(X(.55), Y(.7), X(.8), Y(.55)); c.stroke();
    c.beginPath(); c.moveTo(X(.3), Y(.72)); c.quadraticCurveTo(X(.45), Y(.85), X(.5), Y(.98)); c.stroke();
  },
};

function partCanvas(p) { return sticker(256, Math.round(256 * p.h / p.w), PAINT[p.kind], p.mirror); }

function faceTexture() {
  const c = mk(512, 640), x = c.getContext('2d');
  const cx = 256, cy = 320, rx = FACE_RX / 11 * 512, ry = FACE_RY / 13.75 * 640;
  x.fillStyle = '#2b1d1a'; x.beginPath(); x.ellipse(cx, cy - 70, rx + 26, ry - 10, 0, 0, 7); x.fill();
  x.fillStyle = '#e2a57e';
  x.beginPath(); x.ellipse(cx - rx + 4, cy + 10, 30, 56, -.15, 0, 7); x.fill();
  x.beginPath(); x.ellipse(cx + rx - 4, cy + 10, 30, 56, .15, 0, 7); x.fill();
  const g = x.createRadialGradient(cx, cy - 40, 30, cx, cy, ry);
  g.addColorStop(0, '#f6cfae'); g.addColorStop(1, '#dea07a');
  x.fillStyle = g; x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, 7); x.fill();
  x.fillStyle = '#2b1d1a'; x.beginPath();
  x.moveTo(cx - rx - 4, cy - 60);
  x.quadraticCurveTo(cx - rx + 10, cy - ry - 30, cx, cy - ry - 8);
  x.quadraticCurveTo(cx + rx - 10, cy - ry - 30, cx + rx + 4, cy - 60);
  x.quadraticCurveTo(cx + 60, cy - ry + 40, cx - 20, cy - ry + 26);
  x.quadraticCurveTo(cx - rx + 40, cy - ry + 50, cx - rx - 4, cy - 60);
  x.fill();
  x.fillStyle = 'rgba(240,120,130,.22)';
  x.beginPath(); x.arc(cx - 120, cy + 70, 40, 0, 7); x.fill();
  x.beginPath(); x.arc(cx + 120, cy + 70, 40, 0, 7); x.fill();
  return c;
}

function boardTexture() {
  const s = 512, c = mk(s, s), x = c.getContext('2d'), m = s / 2;
  x.fillStyle = '#14101f'; x.beginPath(); x.arc(m, m, m, 0, 7); x.fill();
  for (let i = 0; i < 20; i++) {
    const a0 = (i - .5) / 20 * Math.PI * 2, a1 = (i + .5) / 20 * Math.PI * 2;
    x.fillStyle = i % 2 ? '#e9dcc4' : '#2a2147';
    x.beginPath(); x.moveTo(m, m); x.arc(m, m, m * .96, a0, a1); x.fill();
    x.fillStyle = i % 2 ? '#3ea67a' : '#d94a5c';
    x.beginPath(); x.arc(m, m, m * .96, a0, a1); x.arc(m, m, m * .88, a1, a0, true); x.fill();
  }
  return c;
}

// ---------- 3D ----------
const app = document.getElementById('app');
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1b1530);
scene.fog = new THREE.Fog(0x1b1530, 40, 180);
const camera = new THREE.PerspectiveCamera(46, 1, .05, 200);

const tex = c => { const t = new THREE.CanvasTexture(c); t.anisotropy = 4; t.colorSpace = THREE.SRGBColorSpace; return t; };
const flat = (w, h, map, extra) => new THREE.Mesh(new THREE.PlaneGeometry(w, h),
  new THREE.MeshBasicMaterial(Object.assign({ map, transparent: true, alphaTest: .08, side: THREE.DoubleSide }, extra)));

const wall = new THREE.Mesh(new THREE.PlaneGeometry(120, 60), new THREE.MeshBasicMaterial({ color: 0x231b3d }));
wall.position.set(0, 0, FACE_Z - 1); scene.add(wall);
const board = new THREE.Mesh(new THREE.CircleGeometry(BOARD_R, 72), new THREE.MeshBasicMaterial({ map: tex(boardTexture()) }));
board.position.set(0, 0, FACE_Z - .1); scene.add(board);
const face = flat(11, 13.75, tex(faceTexture()));
face.position.set(0, 0, FACE_Z - .03); scene.add(face);

{ // 바닥 격자, 레인 불빛, 던지는 선(오키)
  const c = mk(256, 256), x = c.getContext('2d');
  x.fillStyle = '#1e1736'; x.fillRect(0, 0, 256, 256);
  x.strokeStyle = '#3a2f63'; x.lineWidth = 3; x.strokeRect(0, 0, 256, 256);
  const t = tex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(10, 35);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 140), new THREE.MeshBasicMaterial({ map: t }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, -8, -52); scene.add(floor);
  const oche = new THREE.Mesh(new THREE.PlaneGeometry(10, .25), new THREE.MeshBasicMaterial({ color: 0xffcc3d }));
  oche.rotation.x = -Math.PI / 2; oche.position.set(0, -7.98, 0); scene.add(oche);
  const pts = [];
  for (let z = 6; z > FACE_Z; z -= 2.5) pts.push(-9, -7.8, z, 9, -7.8, z);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffcc3d, size: .25 })));
}

// 바람 가루
const DUST = 200, dustPos = new Float32Array(DUST * 3);
for (let i = 0; i < DUST; i++) { dustPos[i * 3] = (Math.random() - .5) * 24; dustPos[i * 3 + 1] = (Math.random() - .5) * 16; dustPos[i * 3 + 2] = 6 - Math.random() * 116; }
const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
scene.add(new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xc9c2ff, size: .06, transparent: true, opacity: .5 })));

// 장애물은 미리 만들어 두고(손바닥 3, 파리 6, 선풍기 2), 던질 때마다 6~8개를 골라 레인을 따라 깐다.
// 각자 거리(z)·중심(x, y)·움직임을 매번 새로 뽑는다

// 장애물: 손바닥 (막기). 좌우 또는 위아래로 오간다
const HAND_TEX = tex(sticker(256, 320, PAINT.hand));
const hands = [0, 1, 2].map(i => {
  const mesh = flat(3.2, 4.0, HAND_TEX); scene.add(mesh);
  return { mesh, on: false, x: 0, y: 0, z: 0, cx: 0, cy: 0, axis: 'x', ph: i * 1.7 };
});

// 장애물: 파리 (튕기기). 각자 중심을 두고 8자 경로를 돈다. 경로가 일정해서 보고 피할 수 있다
const flies = [0, 1, 2, 3, 4, 5].map(i => {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.SphereGeometry(.2, 12, 10), new THREE.MeshBasicMaterial({ color: 0x0c0a12 })));
  // 어두운 배경에서도 보이게: 밝은 테두리(뒷면만 그린 조금 큰 구)
  g.add(new THREE.Mesh(new THREE.SphereGeometry(.26, 12, 10), new THREE.MeshBasicMaterial({ color: 0xfff1c2, side: THREE.BackSide })));
  const eyeM = new THREE.MeshBasicMaterial({ color: 0xc0303a });
  [-1, 1].forEach(s => { const e = new THREE.Mesh(new THREE.SphereGeometry(.07, 8, 6), eyeM); e.position.set(s * .1, .08, .15); g.add(e); });
  const wingM = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .55, side: THREE.DoubleSide });
  const wings = [-1, 1].map(s => { const w = new THREE.Mesh(new THREE.CircleGeometry(.2, 16), wingM); w.scale.set(1, .55, 1); w.position.set(s * .24, .14, 0); g.add(w); return w; });
  g.scale.setScalar(1.6); scene.add(g);
  return { g, wings, on: false, z: 0, cx: 0, cy: 0, ph: i * 2.1, sp: .8 + (i % 3) * .15, knock: 0, kv: new V3() };
});

// 장애물: 선풍기 (바람은 좌우를 맡으니, 선풍기는 아래나 위에서 불어 다트를 위아래로 민다)
const flowCanvas = mk(128, 256);
{
  const x = flowCanvas.getContext('2d');
  x.strokeStyle = 'rgba(255,255,255,.9)'; x.lineCap = 'round';
  for (let i = 0; i < 22; i++) {
    const x0 = Math.random() * 128, y0 = Math.random() * 256, l = 30 + Math.random() * 70;
    x.lineWidth = 1 + Math.random() * 2; x.beginPath(); x.moveTo(x0, y0); x.lineTo(x0, y0 + l); x.stroke();
  }
}
const fans = [0, 1].map(() => {
  const g = new THREE.Group(), blades = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CircleGeometry(1.1, 32), new THREE.MeshBasicMaterial({ color: 0x8fa6cf })));
  const bm = new THREE.MeshBasicMaterial({ color: 0xeef4ff, side: THREE.DoubleSide });
  for (let i = 0; i < 3; i++) {
    const h = new THREE.Group(), b = new THREE.Mesh(new THREE.PlaneGeometry(.42, .95), bm);
    b.position.set(0, .5, .02); h.rotation.z = i * Math.PI * 2 / 3; h.add(b); blades.add(h);
  }
  g.add(blades);
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.08, 1.2, 32), new THREE.MeshBasicMaterial({ color: 0x4a5878, side: THREE.DoubleSide }));
  ring.position.z = .03; g.add(ring);
  g.scale.setScalar(.95);
  scene.add(g);
  // 세로 바람 줄무늬 (선풍기마다 방향이 달라서 텍스처도 따로)
  const flowTex = tex(flowCanvas); flowTex.wrapT = THREE.RepeatWrapping;
  const flow = new THREE.Mesh(new THREE.PlaneGeometry(6, 12), new THREE.MeshBasicMaterial({ map: flowTex, transparent: true, opacity: .28, depthWrite: false }));
  scene.add(flow);
  return { g, blades, flow, flowTex, on: false, dir: 1, z: 0, zone: 2.5 };
});

const OBS = { hand: '손바닥', fly: '파리', fan: '선풍기' };
const rnd = (a, b) => a + Math.random() * (b - a);
const LANE_NEAR = -20, LANE_FAR = FACE_Z + 25; // 출발 직후(조준 화면을 가리지 않게)와 얼굴 앞 25(마지막 조준 구간)는 비워 둔다
function pickObstacles() {
  [...hands, ...flies, ...fans].forEach(o => { o.on = false; });
  const pool = { hand: [...hands], fly: [...flies], fan: [...fans] }, count = {};
  // n칸으로 나눈 레인에 한 칸에 하나씩. 칸 안에서 z를 흔들어 일정 간격처럼 보이지 않게
  const n = 6 + Math.floor(Math.random() * 3), gap = (LANE_NEAR - LANE_FAR) / n;
  for (let i = 0; i < n; i++) {
    const types = Object.keys(pool).filter(k => pool[k].length);
    const k = types[Math.floor(Math.random() * types.length)], o = pool[k].pop();
    o.on = true; o.z = LANE_NEAR - gap * (i + .2 + Math.random() * .6);
    count[k] = (count[k] || 0) + 1;
    if (k === 'hand') { o.cx = rnd(-2.5, 2.5); o.cy = rnd(-2, 2); o.axis = Math.random() < .5 ? 'x' : 'y'; }
    if (k === 'fly') { o.cx = rnd(-3, 3); o.cy = rnd(-2.5, 2.5); o.knock = 0; o.g.rotation.z = 0; }
    if (k === 'fan') {
      // dir 1 = 아래에서 위로, -1 = 위에서 아래로. 카메라 쪽으로 살짝 기울여 날개가 보이게
      o.dir = Math.random() < .5 ? -1 : 1;
      o.g.position.set(rnd(-1.5, 1.5), -o.dir * 6.6, o.z); o.g.rotation.set(-o.dir * (Math.PI / 2 - .55), 0, 0);
      o.flow.position.set(o.g.position.x, 0, o.z);
    }
  }
  hands.forEach(h => { h.mesh.visible = h.on; }); flies.forEach(f => { f.g.visible = f.on; });
  fans.forEach(f => { f.g.visible = f.flow.visible = f.on; });
  ui.obs.textContent = '장애물: ' + Object.keys(count).map(k => `${OBS[k]} ${count[k]}`).join(' · ');
}



// p.canvas = 카드 그림. 사진 얼굴이면 applyFace가 바꾸고, p.def로 그림 카드에 되돌린다
PARTS.forEach(p => { p.canvas = partCanvas(p); p.def = { ax: p.ax, ay: p.ay, w: p.w, h: p.h, canvas: p.canvas, off: null }; });
// 카드의 원점 = 앵커(채점 기준점). 사진 스티커는 앵커가 사각형 가운데가 아니라서 그만큼 옮긴다
function partCard(p, opts) {
  const m = flat(p.w, p.h, tex(p.canvas), opts);
  if (p.off) m.geometry.translate(-p.off.x, -p.off.y, 0);
  return m;
}

// 다트: 촉이 원점, 몸통은 +z 쪽. 그룹의 -z가 날아가는 방향
const MAT = {
  steel: new THREE.MeshBasicMaterial({ color: 0xd5d9e3 }),
  barrel: new THREE.MeshBasicMaterial({ color: 0x4a5066 }),
  ring: new THREE.MeshBasicMaterial({ color: 0x9aa3b8 }),
  shaft: new THREE.MeshBasicMaterial({ color: 0x1a1a22 }),
};
const FLIGHT_COLORS = { brow: 0xffcc3d, eye: 0x5fe0a8, nose: 0xff9a5c, mouth: 0xff5d73 };
function makeDart(p) {
  const g = new THREE.Group();
  const tip = new THREE.Mesh(new THREE.ConeGeometry(.035, .5, 10), MAT.steel);
  tip.rotation.x = -Math.PI / 2; tip.position.z = .25; g.add(tip);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(.07, .08, .9, 14), MAT.barrel);
  barrel.rotation.x = Math.PI / 2; barrel.position.z = .95; g.add(barrel);
  [.68, .85, 1.02, 1.19].forEach(z => {
    const r = new THREE.Mesh(new THREE.CylinderGeometry(.083, .083, .04, 14), MAT.ring);
    r.rotation.x = Math.PI / 2; r.position.z = z; g.add(r);
  });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(.028, .028, .7, 8), MAT.shaft);
  shaft.rotation.x = Math.PI / 2; shaft.position.z = 1.75; g.add(shaft);
  const flights = new THREE.Group(); flights.position.z = 2.0;
  const fm = new THREE.MeshBasicMaterial({ color: FLIGHT_COLORS[p.kind], side: THREE.DoubleSide, transparent: true, opacity: .92 });
  const shape = new THREE.Shape(); shape.moveTo(0, -.25); shape.lineTo(.3, .05); shape.lineTo(.3, .3); shape.lineTo(0, .2); shape.lineTo(0, -.25);
  const fg = new THREE.ShapeGeometry(shape);
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(fg, fm); f.rotation.x = Math.PI / 2; const holder = new THREE.Group(); holder.rotation.z = i * Math.PI / 2; holder.add(f); flights.add(holder);
  }
  g.add(flights);
  const card = partCard(p); card.position.z = .42; card.scale.setScalar(.75); g.add(card);
  g.userData = { flights, card };
  return g;
}
const FWD = new V3(0, 0, -1);
function pointDart(d, dir) { d.quaternion.setFromUnitVectors(FWD, dir.clone().normalize()); }

// ---------- 소리 ----------
let ac = null, soundOn = true;
function audio() {
  if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = null; } }
  if (ac && ac.state === 'suspended') ac.resume();
  return ac;
}
function tone(f0, f1, dur, type, vol) {
  if (!soundOn || !ac) return;
  const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur);
}
function noise(dur, vol, freq, type) {
  if (!soundOn || !ac) return;
  const n = Math.floor(ac.sampleRate * dur), b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 2;
  const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = b; f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = 1.2; g.gain.value = vol;
  s.connect(f).connect(g).connect(ac.destination); s.start();
}
const sfx = {
  throw() { noise(.3, .45, 1600); },
  stick() { noise(.05, .9, 3500, 'highpass'); tone(140, 55, .16, 'sine', .5); setTimeout(() => tone(900, 700, .25, 'triangle', .05), 30); },
  block() { tone(320, 120, .25, 'square', .12); noise(.12, .4, 600); },
  fly() { tone(220, 140, .18, 'sawtooth', .08); },
  miss() { tone(300, 90, .4, 'sine', .15); },
  done() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, f, .25, 'triangle', .12), i * 110)); },
};
const buzz = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} };

// ---------- UI ----------
const $ = id => document.getElementById(id);
const ui = { round: $('round'), wind: $('wind'), hint: $('hint'), obs: $('obs'), parts: $('parts'), stick: $('stick'), knob: $('knob'), toast: $('toast'),
  repos: $('reposBtn'), windflow: $('windflow') };
PARTS.forEach(p => {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'part'; b.id = 'part-' + p.id;
  b.innerHTML = `<img alt="" src="${p.canvas.toDataURL()}"><span>${p.name}<em></em></span>`;
  b.addEventListener('click', () => { if (state === 'aim' && !used.has(p.id)) select(p); });
  ui.parts.appendChild(b);
});
let toastTimer = 0;
function toast(big, small) {
  ui.toast.innerHTML = `${big}${small ? `<small>${small}</small>` : ''}`;
  ui.toast.classList.remove('out'); clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.add('out'), 1300);
}
function setHint(t) { ui.hint.textContent = t; }

// ---------- 사진 얼굴 ----------
const DEFAULT_FACE = { geo: face.geometry, map: face.material.map, rx: FACE_RX, ry: FACE_RY };
let photoFace = null, photoMaps = null;

// 판(동그란 다트판) 안에 들어가게 사진을 원으로 오린다
function roundCrop(src) {
  const c = mk(src.width, src.height), x = c.getContext('2d');
  x.beginPath(); x.arc(c.width / 2, c.height / 2, c.width / 2, 0, 7); x.clip(); x.drawImage(src, 0, 0);
  return c;
}
// 흰 테두리 스티커 (그림 카드와 같은 모양새)
function outlined(src, pad = 6) {
  const out = mk(src.width + pad * 2, src.height + pad * 2), o = out.getContext('2d');
  for (let i = 0; i < 16; i++) { const t = i / 16 * Math.PI * 2; o.drawImage(src, pad + Math.cos(t) * 4, pad + Math.sin(t) * 4); }
  o.globalCompositeOperation = 'source-in'; o.fillStyle = '#fff'; o.fillRect(0, 0, out.width, out.height);
  o.globalCompositeOperation = 'source-over'; o.drawImage(src, pad, pad);
  return out;
}
/** 사진 얼굴을 판에 깐다. null이면 그림 얼굴로. 못 찾은 부위는 그림 카드·기본 자리를 쓴다 */
function applyFace(f) {
  photoFace = f;
  if (f) {
    face.geometry = new THREE.PlaneGeometry(PHOTO_S, PHOTO_S);
    photoMaps = { empty: tex(roundCrop(f.empty)), orig: tex(roundCrop(f.crop)) };
    face.material.map = photoMaps.empty;
    ({ cx: FACE_CX, cy: FACE_CY, rx: FACE_RX, ry: FACE_RY } = faceEllipse(f.faceBox));
  } else {
    face.geometry = DEFAULT_FACE.geo; face.material.map = DEFAULT_FACE.map;
    FACE_CX = FACE_CY = 0; FACE_RX = DEFAULT_FACE.rx; FACE_RY = DEFAULT_FACE.ry;
  }
  face.material.needsUpdate = true;
  DIAG = 2 * Math.hypot(FACE_RX, FACE_RY);
  PARTS.forEach(p => {
    const s = f?.parts[p.id];
    if (!s) Object.assign(p, p.def);
    else {
      const a = toWorld(s.anchor), c = outlined(s.canvas), k = s.rect.w * PHOTO_S / s.canvas.width;
      Object.assign(p, { ax: a.x, ay: a.y, w: c.width * k, h: c.height * k, canvas: c, off: anchorOffset(s) });
    }
    $('part-' + p.id).querySelector('img').src = p.canvas.toDataURL();
  });
}

let maker = null;
$('faceBtn').addEventListener('click', async () => {
  // 얼굴 만들기(MediaPipe 포함)는 처음 열 때만 불러온다
  const { FaceMaker } = await import('./maker/maker.js');
  maker ??= new FaceMaker($('maker'), {
    hasFace: () => !!photoFace,
    onDone(f) { applyFace(f); saveFace(f); newRound(); },
    onReset() { applyFace(null); clearFace(); newRound(); },
    layoutWarnings(f) {
      const miss = PARTS.filter(p => !f.parts[p.id]).map(p => p.name);
      return miss.length ? [`찾지 못한 부위: ${miss.join('·')} (그림 카드 사용)`] : [];
    },
  });
  maker.open();
});

// ---------- 게임 상태 ----------
let state = 'aim', current = PARTS[0], held = null, dart = null, timer = 0, slow = 1, shake = 0;
const used = new Set(), stuck = [], results = {}, wind = { x: 0, y: 0 };
let ghosts = [];
// 던지는 자리: 상하좌우(throwX, throwY). 조준은 2단계: place(자리 고르기) → pull(당겨서 세기·각도)
const REST_Y = -.9, LINE_Y_MIN = -4, LINE_Y_MAX = 3.6;
let aimPhase = 'place', throwX = 0, throwY = REST_Y;
const MAX_PULL = () => Math.min(app.clientHeight * .3, 230);
function restPose() { held.position.set(throwX, throwY, 0); pointDart(held, new V3(0, .1, -1)); }

function newWind() {
  wind.x = settings.wind ? (Math.random() * 2 - 1) * 1.8 : 0;
  wind.y = 0; // 위아래는 선풍기 담당
  // 세기 3단계(약·중·강)를 글자·막대 개수·색으로 함께 보여준다
  const a = Math.abs(wind.x), lv = a < .3 ? 0 : a < .8 ? 1 : a < 1.3 ? 2 : 3;
  const side = wind.x < 0 ? '왼쪽' : '오른쪽', word = ['', '약', '중', '강'][lv];
  ui.wind.dataset.lv = ui.windflow.dataset.lv = lv; ui.windflow.dataset.dir = wind.x < 0 ? 'l' : 'r';
  ui.wind.setAttribute('aria-label', lv ? `바람 ${side}으로 ${word}` : '바람 없음');
  ui.wind.innerHTML = lv === 0 ? '바람 없음' :
    `<b aria-hidden="true">${wind.x < 0 ? '←' : '→'}</b>${word}<i class="meter" aria-hidden="true"><span></span><span></span><span></span></i>`;
}
function refreshButtons() {
  PARTS.forEach(p => {
    const b = $('part-' + p.id), r = results[p.id];
    b.classList.toggle('sel', p === current && state === 'aim');
    b.classList.toggle('used', used.has(p.id));
    b.disabled = used.has(p.id);
    b.querySelector('em').textContent = r ? `${r.score}점` : '';
  });
  ui.round.innerHTML = `${Math.min(used.size + 1, 6)}/6<small>${current.name}</small>`;
}
function select(p) {
  current = p;
  if (held) scene.remove(held);
  held = makeDart(p); restPose(); scene.add(held);
  refreshButtons();
}
// 손바닥에 처음 막힌 부위는 0점 대신 한 번 더 던진다 (부위마다 1회). 장애물·바람은 그대로 둔다
const retried = new Set();
let retrying = false;
function toAim() {
  state = 'aim';
  if (retrying) { retrying = false; select(current); toPlace(); return; }
  const next = used.has(current.id) ? PARTS.find(p => !used.has(p.id)) : current;
  newWind(); pickObstacles(); select(next); toPlace();
}
function toPlace() {
  aimPhase = 'place'; ui.repos.hidden = true; ui.windflow.hidden = ui.windflow.dataset.lv === '0';
  setHint('① 누른 채 끌어서 노릴 곳 앞에 다트를 두고 손을 떼세요');
}
function toPull() {
  aimPhase = 'pull'; ui.repos.hidden = false;
  setHint('② 아래로 당겼다 놓으면 출발');
}
ui.repos.addEventListener('click', () => { if (state === 'aim') toPlace(); });
function newRound() {
  if (showingOrig) showOriginal(false);
  if (dart) { scene.remove(dart.mesh); dart = null; } // 날아가는 중에 얼굴을 바꾼 경우
  stuck.forEach(s => { scene.remove(s.card); scene.remove(s.dart); }); stuck.length = 0;
  ghosts.forEach(g => scene.remove(g)); ghosts = [];
  used.clear(); Object.keys(results).forEach(k => delete results[k]);
  retried.clear(); retrying = false;
  $('result').hidden = true; ui.parts.hidden = false;
  current = PARTS[0]; toAim();
}

// 당긴 길이(0~1). 지금은 출발 신호와 당기는 모습에만 쓴다
function pullOf(p) {
  const dy = p.y - p.y0;
  return { power: Math.max(0, Math.min(1, dy / MAX_PULL())), dy };
}
// 다트는 놓인 자리 바로 앞으로 곧게 출발한다. 방향 바꾸기는 비행 중 조종이 맡는다
// shortcut: 실험판(비행)이라 세기는 무시하고 앞으로 가는 속도는 일정(약 5초 비행), 재밌으면 출발 조작을 다시 정한다
function shotOf(P) {
  const vz = 18, t = (P.z - FACE_Z) / vz;
  return new V3(0, G * t / 2, -vz); // 중력만큼 살짝 위로 쏴서 같은 높이에 닿게
}
function launch() {
  const P = held.position.clone(), vel = shotOf(P);
  dart = {
    p: current, mesh: held, pos: P, vel,
    rot: 0, spin: (Math.random() - .5) * .5 * current.flutter, wobble: 0, t: 0, jx: 0, jy: 0, roll: 0,
  };
  held = null; state = 'fly'; ui.repos.hidden = true; ui.windflow.hidden = true;
  refreshButtons(); sfx.throw(); buzz(15);
  setHint('누른 채 끌면 그쪽으로 날아가요. 장애물을 피해 얼굴까지!');
}

function wrapAngle(a) { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; }
function scoreOf(p, x, y, rot, where) {
  if (where !== 'face') return 0;
  const d = Math.hypot(x - p.ax, y - p.ay);
  const pos = Math.max(0, 1 - d / (DIAG * .22));
  const deg = Math.abs(wrapAngle(rot)) * 180 / Math.PI;
  return Math.round(100 * pos * Math.max(0, 1 - deg / 300));
}
const NOTE = { face: '', board: '얼굴 밖', blocked: '막힘', miss: '빗나감' };

function finish(where) {
  const d = dart, p = d.p;
  if (where === 'blocked' && !retried.has(p.id)) {
    retried.add(p.id); retrying = true; scene.remove(d.mesh);
    toast('막혔다!', `${p.name} 한 번 더`);
    dart = null; state = 'impact'; timer = 1.2; return;
  }
  used.add(p.id);
  if (where === 'face' || where === 'board') {
    // 카드는 얼굴에 납작하게 꽂고, 다트는 들어온 각도 그대로 박혀서 떨린다
    const card = d.mesh.userData.card; d.mesh.remove(card);
    card.scale.setScalar(1); card.position.set(d.pos.x, d.pos.y, FACE_Z + .01 + stuck.length * .004);
    card.rotation.set(0, 0, d.roll); scene.add(card);
    d.mesh.position.set(d.pos.x, d.pos.y, FACE_Z - .12);
    stuck.push({ p, card, dart: d.mesh, base: d.mesh.quaternion.clone(), hitT: T, x: d.pos.x, y: d.pos.y, rot: d.roll, where });
  } else scene.remove(d.mesh);
  const sc = scoreOf(p, d.pos.x, d.pos.y, d.roll, where);
  const note = (where === 'blocked' && d.blockNote) || NOTE[where];
  results[p.id] = { score: sc, where, note };
  const turn = Math.round(Math.abs(wrapAngle(d.roll)) * 180 / Math.PI);
  toast(where === 'face' ? `+${sc}` : '0', where === 'face' ? `${p.name} · 회전 ${turn}°` : note);
  dart = null; state = 'impact'; timer = 1.6; refreshButtons();
}

function stickHit() {
  const d = dart, p = d.p, x = d.pos.x, y = d.pos.y;
  const onFace = inFace(x, y);
  const onBoard = Math.hypot(x, y) <= BOARD_R - .2;
  if (!onFace && !onBoard) { d.falling = true; d.fallEnd = d.t + 1; d.vel.set(d.vel.x * .2, -2, 3); sfx.miss(); return; }
  // 먼저 꽂힌 부위와 겹쳐도 밀지 않는다. 나중 카드가 위에 겹쳐 꽂힌다
  sfx.stick(); buzz(onFace ? 30 : 15); if (!reduceMotion) shake = .18;
  finish(onFace ? 'face' : 'board');
}

function blockDart(d, note) {
  d.falling = true; d.blocked = true; d.blockNote = note; d.fallEnd = d.t + 1.1;
  d.vel.set((Math.random() - .5) * 4, 2, Math.abs(d.vel.z) * .25);
  sfx.block(); buzz(60); if (!reduceMotion) shake = .25;
  toast('막혔다!', note);
}

let steerKeys = { x: 0, y: 0 }, steerPtr = { x: 0, y: 0 };
function stepDart(dt) {
  const d = dart, p = d.p;
  d.t += dt;
  if (d.falling) {
    d.vel.y -= 14 * dt; d.pos.addScaledVector(d.vel, dt);
    d.mesh.position.copy(d.pos); d.mesh.rotateX(5 * dt);
    if (d.t > d.fallEnd) finish(d.blocked ? 'blocked' : 'miss');
    return;
  }
  let sx = steerPtr.x + steerKeys.x, sy = steerPtr.y + steerKeys.y;
  const sl = Math.hypot(sx, sy); if (sl > 1) { sx /= sl; sy /= sl; }
  const s = Math.min(1, sl);
  d.jx += ((Math.random() * 2 - 1) * p.flutter * 2.5 - d.jx) * Math.min(1, dt * 3);
  d.jy += ((Math.random() * 2 - 1) * p.flutter * 1.5 - d.jy) * Math.min(1, dt * 3);
  // 활공: 조종은 세게, 손을 떼면 옆·위아래 속도가 서서히 줄어 멈춘다(관성 약간). 틀어도 앞으로 가는 속도는 그대로
  d.vel.x += (wind.x * p.wind + sx * 21 * p.steer + d.jx - d.vel.x * 1.8) * dt;
  d.vel.y += (-G + wind.y * p.wind + sy * 21 * p.steer + d.jy - d.vel.y * 1.8) * dt;
  d.wobble = Math.min(2, d.wobble + s * dt * 1.4) * (1 - dt * .7);
  d.rot += d.spin * dt;
  d.roll = d.rot + Math.sin(d.t * (6 + p.flutter * 4)) * (.08 + d.wobble * .3) * p.flutter;
  const prevZ = d.pos.z;
  d.pos.addScaledVector(d.vel, dt);
  d.mesh.position.copy(d.pos);
  pointDart(d.mesh, d.vel);
  d.mesh.userData.flights.rotation.z += dt * 14;
  d.mesh.userData.card.rotation.z = d.roll;

  const crossed = z => prevZ > z && d.pos.z <= z;
  for (const h of hands) {
    if (h.on && crossed(h.z) &&
        Math.abs(d.pos.x - h.x) < 1.5 + p.r * .4 && Math.abs(d.pos.y - h.y) < 1.9 + p.r * .4) { blockDart(d, '손바닥에 막힘'); return; }
  }
  fans.forEach(f => {
    if (!f.on || Math.abs(d.pos.z - f.z) > f.zone || Math.abs(d.pos.x - f.g.position.x) > 3) return;
    d.vel.y += f.dir * 13 * dt; d.wobble = Math.min(2, d.wobble + dt * .8);
  });
  flies.forEach(f => {
    if (!f.on || f.knock > 0) return;
    if (f.g.position.distanceTo(d.pos) < p.r * .8 + .48) {
      const side = d.pos.x >= f.g.position.x ? 1 : -1;
      d.vel.x += side * (2.5 + Math.random() * 2.5); d.vel.y += (Math.random() - .5) * 3; d.vel.z *= .85; d.spin += (Math.random() - .5) * 6;
      f.knock = 2; f.kv.set(-side * 6, 3, 4); sfx.fly(); buzz(25);
    }
  });
  if (d.pos.z <= FACE_Z) { d.pos.z = FACE_Z; stickHit(); return; }
  if (d.pos.y < -8) { d.falling = true; d.fallEnd = d.t; }
}

function showResult() {
  state = 'result';
  const total = PARTS.reduce((a, p) => a + (results[p.id] ? results[p.id].score : 0), 0);
  const verdict = total >= 480 ? '거의 본인' : total >= 340 ? '닮은 사촌' : total >= 200 ? '피카소 시기' : '누구세요?';
  $('resTitle').innerHTML = `${verdict}<small>${total} / 600</small>`;
  $('resRows').innerHTML = PARTS.map(p => {
    const r = results[p.id];
    return `<div><span>${p.name}</span><b>${r.where === 'face' ? r.score + '점' : '0점 · ' + (r.note || NOTE[r.where])}</b></div>`;
  }).join('');
  ui.parts.hidden = true; $('result').hidden = false;
  setHint(''); sfx.done();
}
$('againBtn').addEventListener('click', newRound);
// 원본 보기: 꽂은 다트를 잠시 치우고 원래 얼굴을 보여준다. 사진 얼굴은 원본 사진, 그림 얼굴은 정답 자리의 부위 카드
let showingOrig = false;
function showOriginal(on) {
  showingOrig = on;
  stuck.forEach(s => { s.card.visible = s.dart.visible = !on; });
  if (photoFace) face.material.map = on ? photoMaps.orig : photoMaps.empty;
  else {
    ghosts.forEach(g => scene.remove(g));
    ghosts = on ? PARTS.map(p => { const g = partCard(p); g.position.set(p.ax, p.ay, FACE_Z - .02); scene.add(g); return g; }) : [];
  }
  $('ghostBtn').textContent = on ? '내 얼굴 보기' : '원본 보기';
}
$('ghostBtn').addEventListener('click', () => showOriginal(!showingOrig));

// 설정·소리
const optMap = { optWind: 'wind', optFollow: 'follow', optSlow: 'slow' };
Object.keys(optMap).forEach(id => $(id).addEventListener('change', e => { settings[optMap[id]] = e.target.checked; }));
$('optBtn').addEventListener('click', () => { $('opts').hidden = !$('opts').hidden; });
$('optClose').addEventListener('click', () => { $('opts').hidden = true; });
$('soundBtn').addEventListener('click', () => {
  soundOn = !soundOn; audio(); $('soundBtn').textContent = soundOn ? '소리 켬' : '소리 끔';
});

// ---------- 입력 ----------
// 조준 ①: 누른 채 좌우로 끌어 던질 자리를 옮기고, 떼면 고정
// 조준 ②: 아래로 당겼다 놓으면 발사. 당긴 길이 = 세기, 당긴 방향 = 좌우 각도
let ptr = null;
canvas.addEventListener('pointerdown', e => {
  audio();
  if (ptr || !$('opts').hidden) return;
  ptr = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, startX: throwX, startY: throwY,
    mode: state === 'aim' ? aimPhase : state === 'fly' ? 'steer' : null };
  try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
  if (ptr.mode === 'steer') showStick();
});
canvas.addEventListener('pointermove', e => {
  if (!ptr || e.pointerId !== ptr.id) return;
  ptr.x = e.clientX; ptr.y = e.clientY;
  if (ptr.mode === 'steer') updateSteer();
  if (ptr.mode === 'place' && state === 'aim') {
    throwX = Math.max(-LINE_X, Math.min(LINE_X, ptr.startX + (ptr.x - ptr.x0) / app.clientWidth * LINE_X * 2.4));
    throwY = Math.max(LINE_Y_MIN, Math.min(LINE_Y_MAX, ptr.startY - (ptr.y - ptr.y0) / app.clientHeight * (LINE_Y_MAX - LINE_Y_MIN) * 1.6));
  }
});
function endPtr(e) {
  if (!ptr || e.pointerId !== ptr.id) return;
  if (state === 'aim' && ptr.mode === 'place') toPull();
  else if (state === 'aim' && ptr.mode === 'pull') {
    const a = pullOf(ptr);
    if (a.dy > 15 && a.power > .04) launch();
    else { restPose(); toPull(); }
  }
  ptr = null; steerPtr.x = steerPtr.y = 0; ui.stick.hidden = true;
}
canvas.addEventListener('pointerup', endPtr);
canvas.addEventListener('pointercancel', endPtr);

function showStick() {
  const r = app.getBoundingClientRect();
  ui.stick.hidden = false; ui.stick.style.left = (ptr.x0 - r.left) + 'px'; ui.stick.style.top = (ptr.y0 - r.top) + 'px';
  ui.knob.style.left = '0px'; ui.knob.style.top = '0px';
}
function updateSteer() {
  let dx = (ptr.x - ptr.x0) / 40, dy = (ptr.y0 - ptr.y) / 40;
  const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
  steerPtr.x = dx; steerPtr.y = dy;
  ui.knob.style.left = dx * 60 + 'px'; ui.knob.style.top = -dy * 60 + 'px';
}
const keyDown = {};
addEventListener('keydown', e => { keyDown[e.key] = true; keySteer(); });
addEventListener('keyup', e => { keyDown[e.key] = false; keySteer(); });
function keySteer() {
  steerKeys.x = (keyDown.ArrowRight || keyDown.d ? 1 : 0) - (keyDown.ArrowLeft || keyDown.a ? 1 : 0);
  steerKeys.y = (keyDown.ArrowUp || keyDown.w ? 1 : 0) - (keyDown.ArrowDown || keyDown.s ? 1 : 0);
}

// ---------- 루프 ----------
const camPos = AIM_CAM.clone(), camLook = new V3(0, 0, FACE_Z);
let fov = 46, T = 0, last = performance.now();
function resize() {
  const w = app.clientWidth, h = app.clientHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

function frame(now) {
  const rdt = Math.min(.05, (now - last) / 1000); last = now;
  const portrait = camera.aspect < .8;
  slow += ((settings.slow && dart && !dart.falling && dart.pos.z < FACE_Z + 5 ? .35 : 1) - slow) * Math.min(1, rdt * 12);
  const dt = rdt * slow;
  T += dt;

  // 손바닥: 뽑힌 방향(좌우 또는 위아래)으로만 오간다
  hands.forEach(h => {
    const sw = Math.sin(T * .9 + h.ph);
    h.x = h.axis === 'x' ? h.cx + sw * 3.5 : h.cx; h.y = h.axis === 'y' ? h.cy + sw * 2.5 : h.cy;
    h.mesh.position.set(h.x, h.y, h.z); h.mesh.rotation.z = Math.sin(T * 1.8 + h.ph) * .12;
  });
  fans.forEach(f => { f.blades.rotation.z += dt * 24; f.flowTex.offset.y -= f.dir * dt * 1.4; });
  flies.forEach(f => {
    if (f.knock > 0) {
      // 맞은 파리는 잠깐 튕겨 나갔다가 제 경로로 돌아온다
      f.knock -= dt; f.g.position.addScaledVector(f.kv, dt); f.g.rotation.z += dt * 10;
      if (f.knock <= 0) f.g.rotation.z = 0;
    } else {
      const t = T * f.sp + f.ph;
      f.g.position.set(f.cx + Math.sin(t) * 2, f.cy + Math.sin(2 * t) * 1, f.z);
    }
    const flap = Math.sin(T * 60) * .8;
    f.wings[0].rotation.y = flap; f.wings[1].rotation.y = -flap;
  });
  for (let i = 0; i < DUST; i++) {
    dustPos[i * 3] += (wind.x * 1.6 + .2) * dt; dustPos[i * 3 + 1] += wind.y * dt; dustPos[i * 3 + 2] += 2 * dt;
    if (dustPos[i * 3] > 12) dustPos[i * 3] -= 24; if (dustPos[i * 3] < -12) dustPos[i * 3] += 24;
    if (dustPos[i * 3 + 2] > 7) dustPos[i * 3 + 2] -= 117;
  }
  dustGeo.attributes.position.needsUpdate = true;

  // 손에 든 다트: 자리 고르는 중엔 따라오고, 당기는 중엔 뒤로 물러난다
  if (state === 'aim' && held) {
    if (ptr && ptr.mode === 'pull') {
      const a = pullOf(ptr);
      held.position.set(throwX, throwY - a.power * .1, a.power * .7);
      setHint(a.dy > 15 ? '놓으면 출발!' : '아래로 당기세요');
    } else {
      held.position.x += (throwX - held.position.x) * Math.min(1, rdt * 18);
      held.position.y += (throwY + Math.sin(T * 2) * .03 - held.position.y) * Math.min(1, rdt * 18);
    }
  }
  if (state === 'fly' && dart) {
    const n = Math.ceil(dt / .006);
    for (let i = 0; i < n && state === 'fly' && dart; i++) stepDart(dt / n);
  }
  if (state === 'impact') {
    timer -= rdt;
    if (timer <= 0) { if (used.size >= PARTS.length) showResult(); else toAim(); }
  }
  // 꽂힌 다트 떨림
  stuck.forEach(s => {
    const age = T - s.hitT, a = age < 1.5 ? .22 * Math.exp(-age * 4) * Math.sin(age * 38) : 0;
    s.dart.quaternion.copy(s.base); if (a) s.dart.rotateX(a);
  });

  // 카메라: 조준 = 던지는 자리, 비행 = 다트 뒤를 따라 반쯤 들어감, 꽂힘·결과 = 얼굴 정면
  let tp, tl, tf, k;
  if (state === 'fly' && dart && settings.follow) {
    tp = new V3(dart.pos.x * .8, dart.pos.y + .8, Math.max(dart.pos.z + 5, FACE_Z + 11));
    tl = new V3(dart.pos.x * .5, dart.pos.y * .5, FACE_Z);
    tf = portrait ? 58 : 48; k = 1 - Math.exp(-rdt * 7);
  } else if (state === 'impact' || state === 'result') {
    tp = new V3(0, state === 'result' ? -1.5 : 0, FACE_Z + (portrait ? 17 : 14)); tl = new V3(0, state === 'result' ? -1.2 : 0, FACE_Z);
    tf = portrait ? 58 : 48; k = 1 - Math.exp(-rdt * 4);
  } else {
    const dy = throwY - REST_Y;
    tp = new V3(throwX * .75, AIM_CAM.y + dy * .75, AIM_CAM.z); tl = new V3(throwX * .3, dy * .3, FACE_Z); tf = portrait ? 50 : 42; k = 1 - Math.exp(-rdt * 5);
  }
  camPos.lerp(tp, k); camLook.lerp(tl, k); fov += (tf - fov) * k;
  camera.fov = fov; camera.updateProjectionMatrix();
  camera.position.copy(camPos);
  if (shake > 0) { camera.position.x += (Math.random() - .5) * shake; camera.position.y += (Math.random() - .5) * shake; shake = Math.max(0, shake - rdt * 1.5); }
  camera.lookAt(camLook);

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

resize(); newRound(); requestAnimationFrame(frame);
// 지난번(또는 face-curling에서) 만든 얼굴이 있으면 그 얼굴로
loadFace().then(f => { if (f) { applyFace(f); newRound(); } });
