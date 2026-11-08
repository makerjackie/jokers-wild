// Bench registry (main agent owns it): ?bench=<name>
import * as set from './set.js';
import * as props from './props.js';
import * as kings from './kings.js';
import * as cards from './cards.js';
export const BENCHES = { set, props, kings, cards };
import * as cardking from './cardking.js'; BENCHES.cardking = cardking;
import * as paper from './paper.js'; BENCHES.paper = paper;
