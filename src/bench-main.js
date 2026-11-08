// A bench on its own: one department's bench (src/bench/<name>.js) without the film, so a department can build and
// snapshot its module while the director's files are being rewritten. Built by tools/build-bench.mjs <name> into
// dist/bench_<name>.html; snapshots with tools/snap-bench.mjs. Same engine and look as the film.
import * as THREE from 'three';
import { Engine } from './engine.js';
import { G } from './glsl.js';
import { onThrees } from './util.js';
import { setup } from 'BENCH';

const q = new URLSearchParams(location.search);
const W = +(q.get('w') ?? 1280), H = +(q.get('h') ?? 720), S = +(q.get('scale') ?? 1);
const canvas = document.getElementById('film');
canvas.width = W; canvas.height = H;
const engine = new Engine(canvas, W, H, S);
const scene = new THREE.Scene();
const overlay = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, W / H, 0.03, 200);
const title = document.getElementById('titles'); title.width = W; title.height = H;
const update = setup({ scene, overlay, camera, engine });
window.renderAt = (t) => {
  G.uTime.value = t; G.uFxTime.value = onThrees(t);
  camera.aspect = W / H;
  const look = update(t, camera) || {};
  camera.updateProjectionMatrix();
  engine.render(scene, overlay, camera, { ...look, frame: Math.round(t * 24) });
  return look;
};
window.cam = camera;
window.__ready = true;
