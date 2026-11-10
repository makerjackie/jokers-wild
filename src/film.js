// 《失控》 — the film: builds the world (set, props, kings, decks, the free cards, the ant), runs the director, applies
// its state. Cards held in a hand are placed here, on the hand as the kings are posed this frame (never a past frame).
import * as THREE from 'three';
import { G } from './glsl.js';
import { makeSet, LAMP_PIVOT } from './set.js';
import { makeProps } from './props.js';
import { makeKings } from './kings.js';
import { makeCards } from './cards.js';
import { makeFx } from './fx.js';
import { makeFreeCards, basisQ } from './freecards.js';
import { makeScreens } from './screens.js';
import { makeRollers } from './rollers.js';
import { makeAnt } from './ant.js';
import { makeMachines } from './machine.js';
import { makeLeaderboard } from './leaderboard.js';
import { CARD, cardAtlas } from './cards.js';
import { CELL } from './cards-cells.js';
import { KINGS, KING, SIDE_SIGN } from './layout.js';
import { direct } from './director.js';
import { shotAt } from './shots.js';
import { smooth } from './util.js';

const LAMP_POW = G.uLampPow.value;
const _pivot = new THREE.Vector3();

export function makeFilm({ scene, overlay, camera, engine }) {
  const ctx = { scene, overlay, camera, engine };
  const set = makeSet(ctx); scene.add(set.root);
  const props = makeProps(ctx); scene.add(props.root);
  if (props.tableRoot && set.tableTop) { set.root.updateMatrixWorld(true); set.tableTop.attach(props.tableRoot); }   // things on the table follow its wobble
  const kings = makeKings(ctx); scene.add(kings.root);
  const cards = makeCards(ctx, { set, kings, props }); scene.add(cards.root);
  const fx = makeFx(ctx); scene.add(fx.root); overlay.add(fx.overlay);
  const screens = makeScreens(ctx); scene.add(screens.root);
  const rollers = makeRollers(ctx); scene.add(rollers.root);
  const free = makeFreeCards(ctx); scene.add(free.root);
  const ant = makeAnt(ctx); scene.add(ant.root);
  const machines = makeMachines(ctx); scene.add(machines.root);
  const leaderboard = makeLeaderboard(ctx); scene.add(leaderboard.root);
  const world = { set, props, kings, cards, fx, camera, free, screens, rollers, ant, machines };
  const api = {
    handFrame: (id, side) => (side === 'M' ? kings.mouthFrame(id) : kings.handFrame(id, side)), mouthFrame: (id) => kings.mouthFrame(id),
    ...(kings.bodyFrame ? { bodyFrame: (id, out) => kings.bodyFrame(id, out) } : {}),
    ...(kings.headFrame ? { headFrame: (id, out) => kings.headFrame(id, out) } : {}),
    ...(kings.gripFrame ? { gripFrame: (id, side, out) => kings.gripFrame(id, side, out) } : {}),
  };

  // ---- cards held in hands: { hand: { id, side ('L' | 'R' | 'B' both), mode, tremble, mix, to } }
  const _P = new THREE.Vector3(), _A = new THREE.Vector3(), _B = new THREE.Vector3(), _H = new THREE.Vector3(), _Y = new THREE.Vector3(), _Z = new THREE.Vector3();
  const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler();
  function resolveHeld(list, t) {
    for (const c of list) {
      const h = c.hand; if (!h) continue;
      const sx = SIDE_SIGN[KING[h.id].side], s = c.scale ?? 1;
      let n, up;
      if (h.side === 'B') {
        kings.handWorld(h.id, 'L', _A); kings.handWorld(h.id, 'R', _B);
        _P.copy(_A).add(_B).multiplyScalar(0.5);
        _P.y += CARD.H * s * 0.36;
        n = [-sx, 0.2, 0]; up = [0, 1, 0];
      } else {
        const M = kings.handFrame(h.id, h.side);
        _P.setFromMatrixPosition(M);
        _Y.set(0, 1, 0).transformDirection(M);           // the fingers
        _Z.set(0, 0, 1).transformDirection(M);           // out of the palm
        _P.addScaledVector(_Y, 0.05 + CARD.H * s * 0.18);
        kings.headWorld(h.id, _H);
        _A.copy(_H).sub(_P).normalize();
        { const l = Math.hypot(_A.x, _A.y * 0.35, _A.z) || 1; n = [_A.x / l, (_A.y * 0.35) / l, _A.z / l]; }
        if (h.faceTo) { _A.set(h.faceTo[0] - _P.x, h.faceTo[1] - _P.y, h.faceTo[2] - _P.z).normalize(); n = [_A.x, _A.y, _A.z]; }
        up = [_Y.x * 0.4, 0.9, _Y.z * 0.4];
        if (h.fan) { _A.set(...n); _B.set(...up).applyAxisAngle(_A.normalize(), -h.fan * 0.3); up = [_B.x, _B.y, _B.z]; _P.addScaledVector(_A, -0.004 * h.fan); _P.y -= Math.abs(h.fan) * 0.01; }
      }
      let q = basisQ(n, up);
      if (h.tremble) {
        _q.set(...q).multiply(_q2.setFromEuler(_e.set(Math.sin(t * 33) * 0.03 * h.tremble, Math.sin(t * 27 + 1) * 0.02 * h.tremble, Math.sin(t * 41 + 2) * 0.025 * h.tremble)));
        q = [_q.x, _q.y, _q.z, _q.w];
      }
      let pos = [_P.x, _P.y, _P.z];
      if (h.mix > 0 && h.to) {
        const m = smooth(h.mix);
        pos = [pos[0] + (h.to.pos[0] - pos[0]) * m, pos[1] + (h.to.pos[1] - pos[1]) * m, pos[2] + (h.to.pos[2] - pos[2]) * m];
        _q.set(...q).slerp(_q2.set(...h.to.q), m); q = [_q.x, _q.y, _q.z, _q.w];
      }
      c.pos = pos; c.q = q;
    }
  }

  // ---- small things carried in a hand: pos = the palm (+ off, world), blended toward `to` by mix (a toss)
  function resolveCarried(list) {
    for (const c of list ?? []) {
      const h = c?.hand; if (!h) continue;
      kings.handWorld(h.id, h.side, _P);
      const o = h.off ?? [0, 0, 0];
      let pos = [_P.x + o[0], _P.y + o[1], _P.z + o[2]];
      if (h.mix > 0 && h.to) { const m = Math.min(1, h.mix); pos = [pos[0] + (h.to[0] - pos[0]) * m, pos[1] + (h.to[1] - pos[1]) * m, pos[2] + (h.to[2] - pos[2]) * m]; }
      c.pos = pos;
    }
  }
  // ---- inertialization: when a king's hand target or look target jumps (a new action starts), carry the old value
  // into the new motion and let the difference decay (the director is re-run at the previous sub-frames).
  const ghost = { ...world, camera: new THREE.PerspectiveCamera(), lite: true };
  const DT = 1 / 48, NS = 14;
  const REST = {}; for (const k of KINGS) REST[k.id] = { L: kings.restHand(k.id, 'L'), R: kings.restHand(k.id, 'R') };
  const keyOf = (s, id) => { const P = s.kings[id] ?? {}; return { L: P.armL?.target ?? REST[id].L, R: P.armR?.target ?? REST[id].R, look: P.look ?? null }; };
  const dist = (a, b) => (a && b ? Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) : 0);
  function inertialize(t, st) {
    const t0 = shotAt(t).t0;
    const S = [{}];
    for (const k of KINGS) S[0][k.id] = keyOf(st, k.id);
    for (let i = 1; i <= NS + 1 && t - i * DT >= t0; i++) { const s = direct(t - i * DT, ghost); S[i] = {}; for (const k of KINGS) S[i][k.id] = keyOf(s, k.id); }
    for (const k of KINGS) for (const ch of ['L', 'R', 'look']) {
      const span = ch === 'look' ? 0.32 : 0.22, thr = ch === 'look' ? 0.25 : 0.07;
      for (let i = 0; i < S.length - 1; i++) {
        const a = S[i][k.id][ch], b = S[i + 1][k.id][ch]; if (!a || !b) break;
        const d = dist(a, b);
        const nb = Math.max(i > 0 ? dist(S[i - 1][k.id][ch], a) : 0, i + 2 < S.length ? dist(b, S[i + 2][k.id][ch]) : 0);
        if (d > thr && d > 4 * nb) {
          const wgt = 1 - smooth((i * DT) / span);
          const cur = S[0][k.id][ch];
          const v = [cur[0] + (b[0] - a[0]) * wgt, cur[1] + (b[1] - a[1]) * wgt, cur[2] + (b[2] - a[2]) * wgt];
          if (ch === 'look') st.kings[k.id].look = v;
          else st.kings[k.id]['arm' + ch] = { ...(st.kings[k.id]['arm' + ch] || {}), target: v };
          break;
        }
      }
    }
  }
  return {
    world,
    update(t, cam) {
      const st = direct(t, world);
      inertialize(t, st);
      set.update(st.set, t);
      set.lampBulb(G.uLampPos.value);
      if (set.lampDir) set.lampDir(G.uLampDir.value);
      else G.uLampDir.value.copy(G.uLampPos.value).sub(_pivot.set(...LAMP_PIVOT)).normalize();
      G.uLampCone.value = Math.cos(((st.look.lampCone ?? 64) * Math.PI) / 180);
      G.uLampSoft.value = st.look.lampSoft ?? 0.08;
      G.uLampPow.value = LAMP_POW * (st.set.lamp?.on ?? 1) * (1 - 0.85 * (st.set.lamp?.flicker ?? 0)) * (st.look.lampPow ?? 1);
      const p2 = st.look.p2;
      if (p2) { G.uP2Pos.value.set(...p2.pos); G.uP2Col.value.setRGB(...p2.col); G.uP2Range.value = p2.range ?? 6; } else G.uP2Col.value.setRGB(0, 0, 0);
      const p3 = st.look.p3;
      if (p3) { G.uP3Pos.value.set(...p3.pos); G.uP3Col.value.setRGB(...p3.col); G.uP3Range.value = p3.range ?? 3; } else G.uP3Col.value.setRGB(0, 0, 0);
      kings.update(st.kings, t);
      props.update(st.props, t, api);
      cards.update(st.cards, t);
      screens.update(st.screens, t);
      leaderboard.update(st.lb, t);
      const mc = st.machines ?? {};
      resolveCarried(st.rollers); resolveCarried(mc.chips); resolveCarried([mc.heart, mc.spade]);
      for (const k of KINGS) kings.setLoose(k.id, null);
      for (const r of st.rollers ?? []) if (r.of && r.pos) kings.setLoose(r.of, r);
      rollers.update(st.rollers);
      ant.update(st.ant, t);
      machines.update(mc, t);
      resolveHeld(st.free, t);
      if ((st.look.near ?? 0.03) > 0.01) {
        const cp = (cam ?? camera).position, R = 0.55;
        for (const c of st.free) {
          if (!c.pos || c.hand || (c.scale ?? 1) > 5) continue;
          const dx = c.pos[0] - cp.x, dy = c.pos[1] - cp.y, dz = c.pos[2] - cp.z, d = Math.hypot(dx, dy, dz);
          const r = R * Math.max(1, (c.scale ?? 1) * 0.6);
          if (d < r && d > 1e-6) { const k = r / d; c.pos = [cp.x + dx * k, cp.y + dy * k, cp.z + dz * k]; }
        }
      }
      if (globalThis.__freeSkip) { const [a, b] = globalThis.__freeSkip; st.free = st.free.filter((_, i) => i < a || i > b); }
      free.update(st.free, t);
      fx.update(st.fx, t, world);
      return st;
    },
    drawTitles(c, W, H, st) {
      c.clearRect(0, 0, W, H);
      const tt = st.titles;
      if (!tt) return;
      c.save();
      c.globalAlpha = tt.alpha ?? 1;
      c.fillStyle = tt.color ?? '#efe6d2';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = `${Math.round(H * 0.13)}px "Songti SC", "SimSun", "Noto Serif CJK SC", serif`;
      if (tt.zh) { c.letterSpacing = `${Math.round(H * 0.03)}px`; c.fillText(tt.zh, W / 2 + Math.round(H * 0.015), H * (tt.y ?? 0.45)); }
      c.font = `${Math.round(H * 0.036)}px Georgia, "Times New Roman", serif`;
      if (tt.en) { c.letterSpacing = `${Math.round(H * 0.014)}px`; c.fillText(tt.en, W / 2, H * ((tt.y ?? 0.45) + 0.11)); }
      // a line under the title; an end-credit card: a small label, the name, a smaller line under it
      if (tt.sub) { c.globalAlpha = tt.subAlpha ?? 1; c.fillStyle = '#cfc5b2'; c.letterSpacing = `${Math.round(H * 0.006)}px`; c.font = `${Math.round(H * 0.038)}px "Songti SC", "SimSun", "Noto Serif CJK SC", serif`; c.fillText(tt.sub, W / 2, H * 0.72); c.globalAlpha = tt.alpha ?? 1; }
      if (tt.card) {
        const k = tt.card, zhF = '"Songti SC", "SimSun", "Noto Serif CJK SC", serif', enF = 'Georgia, "Times New Roman", serif';
        c.fillStyle = '#9d9483'; c.letterSpacing = `${Math.round(H * 0.012)}px`; c.font = `${Math.round(H * 0.032)}px ${zhF}`;
        if (k.label) c.fillText(k.label, W / 2, H * 0.39);
        c.fillStyle = '#efe6d2'; c.letterSpacing = `${Math.round(H * 0.004)}px`; c.font = `${Math.round(H * (k.size ?? 0.062))}px ${k.zh ? zhF : enF}`;
        c.fillText(k.main, W / 2, H * 0.5);
        c.fillStyle = '#9d9483'; c.letterSpacing = `${Math.round(H * 0.004)}px`; c.font = `${Math.round(H * 0.028)}px ${zhF}`;
        if (k.small) c.fillText(k.small, W / 2, H * 0.61);
      }
      if (tt.roll) {
        // the credits roll up from below: every role the same name, the human last
        const lh = H * (tt.roll.lh ?? 0.075), y0 = tt.roll.y0 != null ? H * tt.roll.y0 : H * (1.05 - tt.roll.u * 1.25);
        c.globalAlpha = tt.alpha ?? 1; c.letterSpacing = '0px';
        tt.roll.lines.forEach(([role, name], i) => {
          const y = y0 + i * lh; if (y < -lh || y > H + lh) return;
          c.textAlign = 'right'; c.fillStyle = '#b9b09e'; c.font = `${Math.round(H * 0.036)}px "Songti SC", "SimSun", serif`; c.fillText(role, W / 2 - H * 0.03, y);
          c.textAlign = 'left'; c.fillStyle = '#f4ecda'; c.font = `bold ${Math.round(H * 0.04)}px Georgia, "Times New Roman", serif`; c.fillText(name, W / 2 + H * 0.03, y);
        });
      }
      if (tt.slap) {
        // (v7) the last card of the film: it falls out of the dark onto the last name and covers it
        const k = tt.slap, img = cardAtlas().image, cell = CELL[k.cell] ?? CELL.num1;
        const ACW = 256, ACH = 372, ax = (cell % 16) * ACW, ay = Math.floor(cell / 16) * ACH;
        const ch = H * (k.flat ? 0.4 : 0.5), cw = ch * (ACW / ACH), u = Math.min(1, k.u), e = u * u;
        // fast (the swat): it comes at the lens, huge, and lands flat in two frames; flat: lying across the name line
        const cx = W / 2 + H * (k.flat ? 0.235 : 0.2), cy = H * k.y + (1 - e) * (k.fast ? -H * 0.2 : -H * 0.75), sc = k.fast ? 1 + 2.4 * (1 - u) : 1 + 0.5 * (1 - e);
        c.save(); c.globalAlpha = k.alpha ?? 1; c.translate(cx, cy); c.rotate((k.flat ? Math.PI / 2 : 0) - 0.07 + (k.fast ? 0.12 : 0.3) * (1 - e)); c.scale(sc, sc);
        c.shadowColor = 'rgba(0,0,0,0.85)'; c.shadowBlur = H * 0.04; c.shadowOffsetY = H * 0.01 * (1 + 3 * (1 - e));
        c.drawImage(img, ax, ay, ACW, ACH, -cw / 2, -ch / 2, cw, ch);
        c.restore();
      }
      if (tt.flash) { c.save(); c.globalAlpha = Math.min(1, tt.flash) * 0.85; c.fillStyle = '#ffffff'; c.fillRect(0, 0, W, H); c.restore(); }
      if (tt.credit) { c.globalAlpha = (tt.alpha ?? 1) * 0.8; c.font = `${Math.round(H * 0.026)}px Georgia, "Times New Roman", serif`; c.letterSpacing = `${Math.round(H * 0.004)}px`; c.fillText(tt.credit, W / 2, H * 0.86); }
      c.restore();
    },
  };
}
