// print sample times for shots: node tools/shots-times.mjs s01 s12b [fractions]
import { SHOTS } from '../src/shots.js';
const [a, b, ...fr] = process.argv.slice(2);
const f = fr.length ? fr.map(Number) : [0.1, 0.5, 0.9];
const i0 = SHOTS.findIndex((s) => s.id === a), i1 = SHOTS.findIndex((s) => s.id === b);
console.log(SHOTS.slice(i0, i1 + 1).flatMap((s) => f.map((x) => +(s.t0 + (s.t1 - s.t0) * x).toFixed(2))).join(' '));
