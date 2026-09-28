// Parametric rodent characters drawn pixel by pixel.
// One body plan plus species and outfit options keeps the whole cast in one style.
import { Pix, Mask, PAL, paint, dots, outline } from './pixel.js';

export const FRAME_W = 32;
export const FRAME_H = 40;
export const DIRS = ['down', 'left', 'right', 'up'];
export const WALK_FRAMES = 4;

const W = FRAME_W;
const H = FRAME_H;

export const CAST = {
  archer: {
    name: 'Squirrel archer',
    species: 'squirrel',
    fur: PAL.grayFur,
    belly: PAL.cream,
    outfit: 'archer',
  },
  elder: {
    name: 'Mouse elder',
    species: 'mouse',
    fur: PAL.brownFur,
    belly: PAL.cream,
    outfit: 'robe',
  },
  merchant: {
    name: 'Chipmunk merchant',
    species: 'chipmunk',
    fur: PAL.chipFur,
    belly: PAL.cream,
    outfit: 'merchant',
  },
};

// walk phase per frame: stride direction and body bob
const STRIDE = [0, 1, 0, -1];
const BOB = [0, -1, 0, -1];

export function drawFrame(spec, dir, frame) {
  const P = new Pix(W, H);
  const M = () => new Mask(W, H);
  const L = (mask, rmp, opts) => paint(P, mask, rmp, opts);
  const s = STRIDE[frame];
  const b = BOB[frame];
  const sway = frame === 1 ? 1 : frame === 3 ? -1 : 0;
  const ctx = { P, M, L, s, b, sway, spec };
  if (dir === 'down') drawDown(ctx);
  else if (dir === 'up') drawUp(ctx);
  else drawSide(ctx);
  outline(P);
  if (dir === 'left') {
    const F = new Pix(W, H);
    F.blit(P, 0, 0, true);
    return F;
  }
  return P;
}

// ---------------------------------------------------------------------------
// shared parts
// ---------------------------------------------------------------------------

function tail(ctx, view) {
  const { M, L, b, sway, spec } = ctx;
  const t = M();
  if (spec.species === 'mouse') {
    // long thin tail
    if (view === 'down') t.line(21, 32 + b, 26, 33, 1).line(26, 33, 28, 30, 1);
    else if (view === 'up') t.line(16, 31 + b, 16 + sway, 36, 1).line(16 + sway, 36, 19 + sway, 38, 1);
    else t.line(10, 30 + b, 5, 32, 1).line(5, 32, 3 + sway, 29, 1);
    L(t, PAL.earPink, { flat: true, ink: false });
    return;
  }
  const big = spec.species === 'squirrel' ? 1 : 0.88;
  const rough = spec.species === 'squirrel' ? 0.32 : 0.2;
  if (view === 'down') {
    t.ellipse(24, 28 + b, 4.8 * big, 5 * big, rough, 3)
      .ellipse(26 + sway * 0.5, 20 + b, 4.6 * big, 5.8 * big, rough, 4)
      .ellipse(24 + sway, 12 + b, 4.4 * big, 4.2 * big, rough, 5);
  } else if (view === 'up') {
    t.ellipse(21, 29 + b, 4.6 * big, 5 * big, rough, 3)
      .ellipse(23 + sway * 0.5, 21 + b, 4.4 * big, 5.6 * big, rough, 4)
      .ellipse(22 + sway, 13 + b, 4 * big, 4 * big, rough, 5);
  } else {
    t.ellipse(8, 28 + b, 4.6 * big, 5.2 * big, rough, 3)
      .ellipse(5.5 + sway * 0.5, 19 + b, 4.4 * big, 6 * big, rough, 4)
      .ellipse(8 + sway, 10.5 + b, 4.2 * big, 4 * big, rough, 5);
  }
  t.clean();
  L(t, spec.fur, { ink: view === 'up' });
  // lighter fringe along the top-left of the tail
  if (spec.species === 'squirrel') {
    const f = M();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (t.has(x, y) && (!t.has(x - 1, y) || !t.has(x, y - 1))) f.put(x, y);
    L(f, spec.fur, { flat: true, tone: -2, ink: false });
    // a darker core stripe for depth
    const c = M();
    if (view === 'side') c.line(7, 26 + b, 6, 17 + b).line(6, 17 + b, 8 + sway, 11 + b);
    else if (view === 'down') c.line(24, 26 + b, 25, 19 + b).line(25, 19 + b, 24 + sway, 13 + b);
    else c.line(21, 28 + b, 23, 21 + b).line(23, 21 + b, 22 + sway, 14 + b);
    L(c, spec.fur, { flat: true, tone: 1, ink: false });
  }
  if (spec.species === 'chipmunk') {
    const st = M();
    if (view === 'side') st.line(8, 30 + b, 6, 20 + b);
    else if (view === 'down') st.line(25, 29 + b, 26, 19 + b);
    else st.line(19, 29 + b, 20, 18 + b);
    L(st, PAL.darkLeather, { flat: true, tone: 1, ink: false });
  }
}

function boots(ctx, x, y, rmp = PAL.darkLeather) {
  const { M, L } = ctx;
  L(M().ellipse(x, y, 2.6, 1.9), rmp);
}

function ears(ctx, view) {
  const { M, L, b, spec, P } = ctx;
  const inner = [];
  if (spec.species === 'mouse') {
    const e = M();
    if (view === 'side') e.ellipse(14, 6.5 + b, 3.6, 3.8);
    else e.ellipse(8.5, 7 + b, 3.8, 4).ellipse(23.5, 7 + b, 3.8, 4);
    L(e, spec.fur);
    const i = M();
    if (view === 'side') i.ellipse(14.5, 7 + b, 2, 2.2);
    else if (view === 'down') i.ellipse(8.5, 7.5 + b, 2.2, 2.4).ellipse(23.5, 7.5 + b, 2.2, 2.4);
    if (view !== 'up') L(i, PAL.earPink, { ink: false });
    return;
  }
  const e = M();
  const tall = spec.species === 'squirrel' ? 0 : 1.5;
  if (view === 'side') {
    e.poly([[12.5, 9.5 + b], [14, 3 + tall + b], [17, 8 + b]]);
    e.poly([[10.5, 9.5 + b], [11, 4 + tall + b], [13.5, 8.5 + b]]);
  } else {
    e.poly([[8.5, 10 + b], [9.5, 3 + tall + b], [13.5, 7.5 + b]]);
    e.poly([[23.5, 10 + b], [22.5, 3 + tall + b], [18.5, 7.5 + b]]);
  }
  L(e, spec.fur);
  if (view === 'down') {
    const i = M().poly([[10, 8.5 + b], [10.2, 5.5 + tall + b], [12.3, 7.6 + b]]).poly([[22, 8.5 + b], [21.8, 5.5 + tall + b], [19.7, 7.6 + b]]);
    L(i, PAL.earPink, { flat: true, ink: false });
  } else if (view === 'side') {
    const i = M().poly([[13.5, 8.5 + b], [14, 5.5 + tall + b], [15.6, 7.8 + b]]);
    L(i, PAL.earPink, { flat: true, ink: false });
  }
  if (spec.species === 'squirrel') {
    // ear tufts
    const d = spec.fur[3];
    if (view === 'side') inner.push([14, 2 + b, d], [13, 2 + b, d], [14, 1 + b, d], [11, 3 + b, d]);
    else inner.push([9, 2 + b, d], [10, 2 + b, d], [9, 1 + b, d], [22, 2 + b, d], [23, 2 + b, d], [23, 1 + b, d]);
    dots(P, inner);
  }
}

// ---------------------------------------------------------------------------
// facing down (toward the camera)
// ---------------------------------------------------------------------------

function drawDown(ctx) {
  const { P, M, L, s, b, spec } = ctx;
  const o = spec.outfit;
  tail(ctx, 'down');

  // quiver fletching peeking over the left shoulder
  // legs and boots
  const dl = s > 0 ? 1 : s < 0 ? -1 : 0;
  const legR = o === 'robe' ? PAL.robe : PAL.trousers;
  L(M().rect(12, 31 + b, 3, 5 + dl), legR);
  L(M().rect(18, 31 + b, 3, 5 - dl), legR);
  boots(ctx, 13.5, 36.3 + dl);
  boots(ctx, 19.5, 36.3 - dl);

  // torso
  if (o === 'robe') {
    L(M().poly([[10, 20 + b], [22, 20 + b], [24, 36], [8, 36]]), PAL.robe);
    L(M().rect(10, 28 + b, 12, 2), PAL.redCloth);
  } else if (o === 'merchant') {
    L(M().ellipse(16, 26 + b, 6.2, 6.2), PAL.redCloth);
    L(M().poly([[11, 24 + b], [21, 24 + b], [22, 34 + b], [10, 34 + b]]), PAL.apron);
    L(M().rect(10, 28 + b, 12, 1), PAL.apron, { tone: 2 });
  } else {
    L(M().ellipse(16, 26 + b, 6.2, 6.2), PAL.leather);
    L(M().poly([[10, 28 + b], [22, 28 + b], [23, 33 + b], [9, 33 + b]]), PAL.leather, { tone: 1 });
    // strap across the chest
    L(M().line(12, 23 + b, 20, 30 + b), PAL.darkLeather, { flat: true });
    // belt and buckle
    L(M().rect(9, 29 + b, 14, 2), PAL.darkLeather);
    dots(P, [[15, 29 + b, PAL.metal[1]], [16, 29 + b, PAL.metal[2]], [15, 30 + b, PAL.metal[2]], [16, 30 + b, PAL.metal[3]]]);
    // two daggers on the belt, hilts up
    for (const side of [-1, 1]) {
      const x = 16 + side * 5;
      // sheath angles out over the hip, grip and pommel stand above the belt
      L(M().poly([[x - 1, 31 + b], [x + 1, 31 + b], [x + 1 + side * 2, 35 + b], [x - 1 + side * 2, 35 + b]]), PAL.darkLeather, { tone: -1 });
      dots(P, [[x + side * 2, 35 + b, PAL.metal[2]]]);
      L(M().rect(x - 1, 30 + b, 3, 1), PAL.metal, { flat: true, tone: -1 });
      L(M().rect(x, 27 + b, 1, 3), PAL.wood, { flat: true, tone: 1 });
      dots(P, [[x, 26 + b, PAL.metal[0]], [x, 27 + b, PAL.wood[1]]]);
    }
  }

  // arms
  for (const side of [-1, 1]) {
    const x = side < 0 ? 7 : 22;
    const dy = -side * s;
    const sleeve = o === 'robe' ? PAL.robe : o === 'merchant' ? PAL.redCloth : PAL.leather;
    L(M().rect(x, 21 + b + dy, 3, 6), sleeve);
    if (o === 'archer') L(M().rect(x, 25 + b + dy, 3, 2), PAL.darkLeather);
    L(M().ellipse(x + 1.5, 28 + b + dy, 1.8, 1.5), spec.fur);
  }

  // capelet with the hood bunched behind the neck
  if (o === 'archer') {
    L(M().ellipse(16, 19.5 + b, 7.5, 2.6), PAL.cloak, { tone: 1 });
    L(M().ellipse(16, 21.5 + b, 9, 3).poly([[11, 22 + b], [21, 22 + b], [16, 26 + b]]), PAL.cloak);
    dots(P, [[16, 22 + b, PAL.metal[0]], [15, 22 + b, PAL.metal[2]]]);
  } else if (o === 'robe') {
    L(M().ellipse(16, 20.5 + b, 7.5, 2.6), PAL.robe, { tone: 1 });
  }

  // head
  ears(ctx, 'down');
  L(M().ellipse(16, 13 + b, 7.6, 6.6, 0.12, 9), spec.fur);
  if (spec.species === 'chipmunk') {
    L(M().rect(15, 7 + b, 2, 5), PAL.darkLeather, { flat: true, tone: 1, ink: false });
    L(M().line(10, 13 + b, 12, 12 + b).line(22, 13 + b, 20, 12 + b), PAL.cream, { flat: true, tone: -1, ink: false });
  }
  L(M().ellipse(16, 16.4 + b, 3.7, 2.4), spec.belly, { ink: false });
  L(M().ellipse(11, 17 + b, 1.6, 1.2).ellipse(21, 17 + b, 1.6, 1.2), spec.belly, { ink: false, tone: 1 });
  const e = PAL.eye;
  dots(P, [
    [12, 12 + b, e[2]], [13, 12 + b, e[2]], [12, 13 + b, e[2]], [13, 13 + b, e[3]], [12, 12 + b, e[0]],
    [19, 12 + b, e[2]], [20, 12 + b, e[2]], [19, 13 + b, e[2]], [20, 13 + b, e[3]], [19, 12 + b, e[0]],
    [15, 15 + b, PAL.nose[1]], [16, 15 + b, PAL.nose[2]], [15, 16 + b, PAL.nose[3]], [16, 16 + b, PAL.nose[3]],
    [15, 17 + b, spec.belly[3]], [16, 17 + b, spec.belly[3]],
  ]);
  if (spec.outfit === 'robe') {
    // white brows for the elder
    dots(P, [[11, 11 + b, PAL.feather[0]], [12, 11 + b, PAL.feather[0]], [20, 11 + b, PAL.feather[0]], [21, 11 + b, PAL.feather[0]]]);
  }
}

// ---------------------------------------------------------------------------
// facing away
// ---------------------------------------------------------------------------

function drawUp(ctx) {
  const { P, M, L, s, b, spec } = ctx;
  const o = spec.outfit;
  const dl = s > 0 ? 1 : s < 0 ? -1 : 0;
  const legR = o === 'robe' ? PAL.robe : PAL.trousers;
  L(M().rect(12, 31 + b, 3, 5 - dl), legR);
  L(M().rect(18, 31 + b, 3, 5 + dl), legR);
  boots(ctx, 13.5, 36.3 - dl);
  boots(ctx, 19.5, 36.3 + dl);

  // arms behind the body
  for (const side of [-1, 1]) {
    const x = side < 0 ? 7 : 22;
    const dy = side * s;
    const sleeve = o === 'robe' ? PAL.robe : o === 'merchant' ? PAL.redCloth : PAL.leather;
    L(M().rect(x, 21 + b + dy, 3, 6), sleeve);
    L(M().ellipse(x + 1.5, 28 + b + dy, 1.8, 1.5), spec.fur);
  }
  // torso
  if (o === 'robe') L(M().poly([[10, 20 + b], [22, 20 + b], [24, 36], [8, 36]]), PAL.robe);
  else if (o === 'merchant') {
    L(M().ellipse(16, 26 + b, 6.2, 6.2), PAL.redCloth);
    L(M().rect(10, 27 + b, 12, 1), PAL.apron, { tone: 1 });
  } else {
    L(M().ellipse(16, 26 + b, 6.2, 6.2), PAL.leather);
    L(M().poly([[10, 28 + b], [22, 28 + b], [23, 33 + b], [9, 33 + b]]), PAL.leather, { tone: 1 });
    L(M().rect(9, 29 + b, 14, 2), PAL.darkLeather);
    // dagger sheaths at the hips
    L(M().line(10, 30 + b, 8, 34 + b, 2).line(22, 30 + b, 24, 34 + b, 2), PAL.darkLeather);
  }
  // capelet and hood
  if (o === 'archer') {
    L(M().ellipse(16, 21.5 + b, 9, 3.2).poly([[9, 21 + b], [23, 21 + b], [16, 27 + b]]), PAL.cloak);
    L(M().ellipse(16, 18.5 + b, 6.5, 3.2), PAL.cloak, { tone: 1 });
  } else if (o === 'robe') {
    L(M().ellipse(16, 20 + b, 7.5, 3.2), PAL.robe, { tone: 1 });
  }
  // quiver across the back with arrows (drawn after the tail, see below)
  if (false) {
    L(M().line(10, 15 + b, 11, 14 + b, 2).line(12, 14 + b, 13, 13 + b, 2), PAL.feather);
    L(M().line(9, 16 + b, 10, 13 + b, 1), PAL.redFeather, { flat: true });
    L(M().line(11, 17 + b, 19, 29 + b, 3), PAL.leather, { tone: -1 });
    L(M().line(10, 17 + b, 13, 16 + b, 2), PAL.darkLeather);
  }
  // head from behind
  ears(ctx, 'up');
  L(M().ellipse(16, 13 + b, 7.6, 6.6, 0.12, 9), spec.fur);
  if (spec.species === 'chipmunk') {
    L(M().rect(15, 8 + b, 2, 11), PAL.darkLeather, { flat: true, tone: 1, ink: false });
    L(M().rect(12, 10 + b, 1, 7).rect(19, 10 + b, 1, 7), PAL.cream, { flat: true, ink: false });
  }
  // the tail rises beside the back when seen from behind
  tail(ctx, 'up');
  if (o === 'archer') {
    L(M().line(9, 14 + b, 12, 12 + b, 2), PAL.feather);
    dots(P, [[9, 13 + b, PAL.redFeather[1]], [12, 11 + b, PAL.redFeather[2]], [10, 12 + b, PAL.redFeather[1]]]);
    L(M().line(10, 16 + b, 17, 29 + b, 3), PAL.leather, { tone: -1 });
    L(M().line(9, 16 + b, 13, 15 + b, 2), PAL.darkLeather);
  }
}

// ---------------------------------------------------------------------------
// facing right (left is mirrored)
// ---------------------------------------------------------------------------

function drawSide(ctx) {
  const { P, M, L, s, b, spec } = ctx;
  const o = spec.outfit;
  tail(ctx, 'side');

  // far arm and leg
  const legR = o === 'robe' ? PAL.robe : PAL.trousers;
  L(M().rect(15 - s * 2, 31 + b, 3, 5), legR, { tone: 1 });
  boots(ctx, 17 - s * 2, 36.3, PAL.darkLeather);
  const sleeve = o === 'robe' ? PAL.robe : o === 'merchant' ? PAL.redCloth : PAL.leather;
  L(M().rect(17 + s, 21 + b, 3, 6), sleeve, { tone: 1 });
  L(M().ellipse(18.5 + s, 28 + b, 1.7, 1.5), spec.fur, { tone: 1 });

  // quiver on the back
  if (o === 'archer') {
    L(M().rect(9, 13 + b, 2, 4), PAL.feather);
    L(M().rect(11, 12 + b, 2, 4), PAL.redFeather);
    L(M().poly([[9, 17 + b], [13, 16 + b], [13, 27 + b], [10, 28 + b]]), PAL.leather, { tone: -1 });
    L(M().rect(9, 17 + b, 4, 1), PAL.darkLeather);
  }

  // near leg
  L(M().rect(15 + s * 2, 31 + b, 3, 5), legR);
  boots(ctx, 17.5 + s * 2, 36.3, PAL.darkLeather);

  // torso
  if (o === 'robe') {
    L(M().poly([[12, 20 + b], [21, 20 + b], [22, 36], [10, 36]]), PAL.robe);
    L(M().rect(11, 28 + b, 11, 2), PAL.redCloth);
  } else if (o === 'merchant') {
    L(M().ellipse(16, 26 + b, 5.4, 6.2), PAL.redCloth);
    L(M().poly([[17, 24 + b], [21, 24 + b], [22, 34 + b], [17, 34 + b]]), PAL.apron);
  } else {
    L(M().ellipse(16, 26 + b, 5.4, 6.2), PAL.leather);
    L(M().poly([[11, 28 + b], [21, 28 + b], [22, 33 + b], [10, 33 + b]]), PAL.leather, { tone: 1 });
    L(M().rect(10, 29 + b, 12, 2), PAL.darkLeather);
    // dagger on the near hip, hilt forward
    L(M().line(15, 31 + b, 12, 35 + b, 2), PAL.darkLeather);
    L(M().rect(16, 29 + b, 1, 3), PAL.metal);
    L(M().rect(17, 30 + b, 3, 1), PAL.wood, { flat: true });
    dots(P, [[20, 30 + b, PAL.metal[1]]]);
  }
  // capelet
  if (o === 'archer') {
    L(M().ellipse(14, 19.5 + b, 5.5, 2.6), PAL.cloak, { tone: 1 });
    L(M().ellipse(15.5, 21.5 + b, 7, 3).poly([[11, 22 + b], [20, 22 + b], [14, 26 + b]]), PAL.cloak);
  } else if (o === 'robe') {
    L(M().ellipse(15, 20.5 + b, 6.5, 2.6), PAL.robe, { tone: 1 });
  }
  // near arm swings opposite the near leg
  L(M().rect(14 - s, 21 + b, 3, 6), sleeve);
  if (o === 'archer') L(M().rect(14 - s, 25 + b, 3, 2), PAL.darkLeather);
  L(M().ellipse(15.5 - s, 28 + b, 1.8, 1.5), spec.fur);

  // head in profile
  ears(ctx, 'side');
  L(M().ellipse(16, 13 + b, 6.8, 6.4, 0.12, 9), spec.fur);
  L(M().ellipse(21, 15 + b, 4.2, 3), spec.fur);
  L(M().ellipse(20.5, 16.3 + b, 3.6, 2), spec.belly, { ink: false });
  if (spec.species === 'chipmunk') {
    L(M().line(13, 12 + b, 21, 13 + b), PAL.darkLeather, { flat: true, tone: 1, ink: false });
    L(M().line(13, 14 + b, 19, 14 + b), PAL.cream, { flat: true, tone: -1, ink: false });
  }
  const e = PAL.eye;
  dots(P, [
    [19, 11 + b, e[2]], [20, 11 + b, e[2]], [19, 12 + b, e[3]], [20, 12 + b, e[2]], [20, 11 + b, e[0]],
    [24, 14 + b, PAL.nose[1]], [25, 14 + b, PAL.nose[2]], [25, 15 + b, PAL.nose[3]],
    [22, 17 + b, spec.belly[3]], [23, 17 + b, spec.belly[3]],
  ]);
  if (spec.outfit === 'robe') dots(P, [[18, 10 + b, PAL.feather[0]], [19, 10 + b, PAL.feather[0]], [20, 10 + b, PAL.feather[0]]]);
}

// Full sheet: rows = down, left, right, up; columns = walk frames.
export function buildSheet(spec) {
  const sheet = new Pix(W * WALK_FRAMES, H * DIRS.length);
  DIRS.forEach((dir, row) => {
    for (let f = 0; f < WALK_FRAMES; f++) sheet.blit(drawFrame(spec, dir, f), f * W, row * H);
  });
  return sheet;
}
