import * as THREE from 'three';
import { Engine } from './engine.js';
import { G } from './glsl.js';
import { FPS, DURATION, REEL, CUES } from './shots.js';
import { onThrees } from './util.js';
import { Player } from './player.js';
import { renderScore, renderScoreAsync } from './audio.js';
import { BENCHES } from './bench/index.js';
import { makeFilm } from './film.js';

const q = new URLSearchParams(location.search);
const W = +(q.get('w') ?? 1920), H = +(q.get('h') ?? 1080), S = +(q.get('scale') ?? 1);
const STYLE = q.get('style') ?? null;          // force a style: noir | engrave | poster
// debug overrides of the engine look: &beam=0&mono=0&shadows=0&smoke=1&exposure=1.2
const OVR = {}; for (const k of ['beam', 'mono', 'smoke', 'exposure', 'haze', 'bloom', 'campTint']) if (q.has(k)) OVR[k] = +q.get(k); if (q.has('shadows')) OVR.shadows = q.get('shadows') !== '0';

const canvas = document.getElementById('film');
const msgEl = document.getElementById('msg'), playBtn = document.getElementById('play');
if (!q.has('still') && msgEl) { msgEl.textContent = 'building the war room…'; playBtn.disabled = true; }
function init() {
  canvas.width = W; canvas.height = H;
  const engine = new Engine(canvas, W, H, S);
  const scene = new THREE.Scene();
  const overlay = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, W / H, 0.03, 200);
  const title = document.getElementById('titles');
  const tctx = title.getContext('2d');
  title.width = W; title.height = H;
  const benchName = q.get('bench');
  let renderAt;
  if (benchName) {
    const update = BENCHES[benchName].setup({ scene, overlay, camera, engine });
    renderAt = (t) => {
      G.uTime.value = t; G.uFxTime.value = onThrees(t);
      camera.aspect = W / H;
      const look = update(t, camera) || {};
      if (STYLE) look.style = STYLE;
      Object.assign(look, OVR);
      camera.updateProjectionMatrix();
      engine.render(scene, overlay, camera, { ...look, frame: Math.round(t * FPS) });
      tctx.clearRect(0, 0, W, H);
      return look;
    };
  } else {
    const film = makeFilm({ scene, overlay, camera, engine }); window.__film = film;   // (debug handle for the tools)
    for (const name of (q.get('hide') ?? '').split(',').filter(Boolean)) { const m = film.world[name]; if (m?.root) m.root.visible = false; if (m?.overlay) m.overlay.visible = false; }
    renderAt = (t) => {
      t = Math.max(0, Math.min(DURATION - 1e-4, t));
      G.uTime.value = t; G.uFxTime.value = onThrees(t);
      camera.aspect = W / H;
      const st = film.update(t, camera);
      if (STYLE) st.look.style = STYLE;
      Object.assign(st.look, OVR);
      camera.updateProjectionMatrix();
      engine.render(scene, overlay, camera, { ...st.look, frame: Math.round(t * FPS) });
      film.drawTitles(tctx, W, H, st, t);
      return st;
    };
  }
  window.renderAt = renderAt; window.cam = camera;
  window.renderScore = renderScore;
  window.FILM = { DURATION, FPS, W, H, REEL };
  if (!benchName) for (const t of [REEL.t0 + 1, REEL.t0 + 10, REEL.t0 + 20]) renderAt(t);   // compile shaders up front
  const player = new Player({ renderAt, canvas, DURATION, still: q.has('still'), start: +(q.get('t') ?? 0), poster: CUES.hands + 1.5,
    makeScore: async (sr) => (renderScoreAsync ? renderScoreAsync(sr, {}, (p) => { const m = document.getElementById('msg'); if (m) m.textContent = `synthesizing the score… ${Math.round(p * 100)}%`; }) : renderScore(sr)) });
  window.player = player;
  window.__ready = true;
  if (msgEl && !q.has('still')) { msgEl.textContent = ''; playBtn.disabled = false; }
}
if (q.has('still')) init(); else setTimeout(init, 60);
