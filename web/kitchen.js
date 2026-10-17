// The questions screen's voxel kitchen: nine appliances round a table, a dish served every few seconds,
// a window on the back wall and a clock on the right one, both running a make-believe day (#159).
// Purely decorative. Rendered small and scaled up without smoothing for a pixel-art look.
// State for tests and styles sits on the container: data-kitchen (running, paused, still),
// data-frames (frames drawn), data-dishes (dishes on the table), data-flying (dishes in the air),
// data-sky (night, sunrise, day, sunset), data-weather (sun, cloud, rain, snow), data-light (on, off).
import * as THREE from "three";

import { nextDish } from "./dishes.js";
import { PHASE_HOUR, WEATHER_MS, handAngles, kitchenHour, lightFor, phaseAt, pickWeather, readOverrides, settleSnow } from "./sky.js";

const PALETTE = {
  floorA: 0x284c29, floorA2: 0x2f5630, floorB: 0xe4e2d6, floorB2: 0xd9d7ca,
  wall: 0xdfe6d6, wallTrim: 0xbacfa9, tile: 0xf1efe6, grout: 0xe1e4d9, frame: 0xf4f3ee,
  wood: 0x9a6a3e, woodDark: 0x6e4a2a, woodLight: 0xb07d4c, steel: 0xb9bfc0, steelDark: 0x7d8586, glass: 0x2f3437,
  brick: 0xa8553a, brickDark: 0x7e3d29, mortar: 0xb98d72, stone: 0xd6cfc0, clay: 0xc27a4a, clayDark: 0x9f5d36,
  bamboo: 0xcfae6a, bambooDark: 0xa98a4e, black: 0x2a2a2a, soot: 0x1d1714,
  ember: 0xf08a2c, flame: 0xf6c84a, oil: 0xe0b44a, foam: 0xf3d98a, white: 0xf4f3ee, plate: 0xf7f6f3, plateRim: 0xe3e1d8,
  stew: 0xc4602f, green: 0x5e9a3a, red: 0xc8372d, note: 0xf6e7b8, stick: 0xc9a46a,
};
const FRAME_MS = 1000 / 30;
const FLIGHT_MS = 1100;
// The first dish comes out shortly after the kitchen appears, then one every SERVE_MS of running time.
const FIRST_SERVE_MS = 1500;
const SERVE_MS = 4000;
// How fast the room's light follows a new phase or weather: settled in about two seconds.
const LIGHT_EASE_MS = 500;
// Places on the table top, filled in order; once all are set, each new dish takes the oldest one's place.
const SLOTS = [[-3, -1.4], [0, -1.4], [3, -1.4], [-3, 1.4], [0, 1.4], [3, 1.4]];
// The table top's surface, where plates rest.
const TABLE_Y = 2.5;

// A voxel list [[x, y, z, colour]] as one instanced mesh of cubes `size` across.
function voxelMesh(voxels, size = 1) {
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(size, size, size), new THREE.MeshLambertMaterial(), voxels.length);
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  voxels.forEach(([x, y, z, colour], i) => {
    mesh.setMatrixAt(i, m.makeTranslation(x * size, y * size, z * size));
    mesh.setColorAt(i, c.setHex(colour));
  });
  return mesh;
}

// Room and appliances are built on a half-unit grid: x and z from -4 to 3 span one appliance's
// four units, centred on its origin, and y = 0 sits on the floor.
function fineMesh(voxels) {
  const mesh = voxelMesh(voxels, 0.5);
  mesh.position.set(0.25, -0.25, 0.25);
  return mesh;
}

// A colour may be a function of position; a null colour leaves the voxel out.
function box(out, x0, x1, y0, y1, z0, z1, colour) {
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
    const c = typeof colour === "function" ? colour(x, y, z) : colour;
    if (c != null) out.push([x, y, z, c]);
  }
  return out;
}

// A disc of radius r round (cx, cz); the colour function gets the offset from the centre.
function disc(out, r, y, colour, cx = 0, cz = 0) {
  for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++) {
    const dx = x - cx;
    const dz = z - cz;
    if (dx * dx + dz * dz > r * r + 0.5) continue;
    const c = typeof colour === "function" ? colour(dx, dz) : colour;
    if (c != null) out.push([x, y, z, c]);
  }
  return out;
}

// A small repeatable scatter for specks, grain and wear.
const hash = (...n) => Math.abs(n.reduce((h, v) => Math.imul(h ^ (v + 7919), 2654435761), 17)) % 97;

// Each appliance faces +z on the half-unit grid. `mouth` (in units) is where dishes leave.
const APPLIANCE_MODELS = {
  "pizza oven": () => {
    const brick = (x, y, z) => (y % 3 === 2 || (x + z + (Math.floor(y / 3) % 2) * 2) % 4 === 0 ? PALETTE.mortar : hash(x, y, z) % 6 ? PALETTE.brick : PALETTE.brickDark);
    const v = box([], -4, 3, 0, 3, -4, 3, (x, y, z) => (brick(x, y, z) === PALETTE.mortar ? PALETTE.brickDark : PALETTE.brick));
    box(v, -4, 3, 4, 4, -4, 3, PALETTE.stone);
    const arch = (x, y) => (y <= 6 ? Math.abs(x + 0.5) <= 1.5 : y === 7 && Math.abs(x + 0.5) <= 0.5);
    // The mouth is a hollow in the dome with the fire at its back.
    [3.9, 3.8, 3.5, 3, 2.2, 1.2].forEach((r, i) => disc(v, r, 5 + i, (dx, dz) => {
      const [x, y, z] = [dx - 0.5, 5 + i, dz - 0.5];
      if (!arch(x, y) || z < 1) return brick(x, y, z);
      if (z > 1) return null;
      return y === 5 ? PALETTE.ember : y === 6 && Math.abs(x + 0.5) <= 0.5 ? PALETTE.flame : PALETTE.soot;
    }, -0.5, -0.5));
    box(v, -1, 0, 11, 12, -2, -1, PALETTE.steelDark);
    box(v, -2, 1, 13, 13, -3, 0, PALETTE.black);
    return { v, mouth: [0, 3, 2] };
  },
  oven: () => {
    const door = (x, y) => x >= -3 && x <= 2 && y >= 1 && y <= 5;
    const front = (x, y) => {
      if (y === 7) return x === -3 || x === -1 ? PALETTE.black : x >= 1 && x <= 2 ? PALETTE.ember : PALETTE.steelDark;
      if (!door(x, y)) return PALETTE.steel;
      if (x === -3 || x === 2 || y === 1 || y === 5) return PALETTE.steelDark;
      return y === 2 ? PALETTE.ember : PALETTE.glass;
    };
    const v = box([], -4, 3, 0, 7, -4, 3, (x, y, z) => {
      if (y === 0) return (x === -4 || x === 3) && (z === -4 || z === 3) ? PALETTE.black : null;
      if (z === 3) return front(x, y);
      return y === 7 && (x === -1 || x === 0 || z === -1 || z === 0) ? PALETTE.steelDark : PALETTE.steel;
    });
    box(v, -2, 1, 6, 6, 4, 4, PALETTE.black);
    return { v, mouth: [0, 2, 2] };
  },
  fryer: () => {
    const v = box([], -4, 3, 0, 6, -4, 3, (x, y, z) => {
      if (z !== 3) return PALETTE.steel;
      if (y === 0) return PALETTE.black;
      if (y === 3) return PALETTE.steelDark;
      return y === 5 && x === 2 ? PALETTE.ember : y === 5 && x === -3 ? PALETTE.black : PALETTE.steel;
    });
    box(v, -4, 3, 7, 7, -4, 3, (x, y, z) => (x < -3 || x > 2 || z < -3 || z > 2 ? PALETTE.steel : hash(x, z) % 7 ? PALETTE.oil : PALETTE.foam));
    // Two wire baskets in the oil, their handles up at the back.
    for (const [x0, x1] of [[-3, -1], [0, 2]]) {
      box(v, x0, x1, 8, 8, -3, 2, (x, y, z) => (x === x0 || x === x1 || z === -3 || z === 2 ? PALETTE.steelDark : null));
      box(v, (x0 + x1) / 2, (x0 + x1) / 2, 9, 10, -3, -3, PALETTE.steelDark);
    }
    box(v, -4, 3, 8, 9, -4, -4, PALETTE.steelDark);
    return { v, mouth: [0, 4, 0] };
  },
  hob: () => {
    // Four burners, the front two lit.
    const burners = [[-2.5, -2.5, false], [1.5, -2.5, false], [-2.5, 1.5, true], [1.5, 1.5, true]];
    const top = (x, z) => {
      for (const [cx, cz, lit] of burners) {
        const d = Math.hypot(x - cx, z - cz);
        if (d <= 0.8) return lit ? PALETTE.ember : PALETTE.steelDark;
        if (d <= 1.6) return PALETTE.black;
      }
      return PALETTE.steel;
    };
    const v = box([], -4, 3, 0, 7, -4, 3, (x, y, z) => {
      if (y === 7) return top(x, z);
      if (z !== 3) return PALETTE.steelDark;
      if (y === 0) return PALETTE.black;
      if (y === 6) return x === -3 || x === -1 || x === 1 ? PALETTE.black : PALETTE.steel;
      if (x === -1 && y < 6) return PALETTE.black;
      return (x === -2 || x === 0) && (y === 3 || y === 4) ? PALETTE.steel : PALETTE.steelDark;
    });
    // A pot of stew on the back left burner.
    for (const y of [8, 9]) disc(v, 1.7, y, (dx, dz) => (y === 9 && dx * dx + dz * dz < 1.2 ? PALETTE.stew : PALETTE.steel), -2.5, -2.5);
    return { v, mouth: [0, 4, 0] };
  },
  grill: () => {
    const v = box([], -4, 3, 0, 5, -4, 3, (x, y, z) => (z === 3 && (y === 2 || y === 3) && x % 2 === 0 ? PALETTE.steelDark : PALETTE.black));
    box(v, -4, 3, 6, 6, -4, 3, (x, y, z) => (x === -4 || x === 3 || z === -4 || z === 3 ? PALETTE.black : hash(x, z) % 3 ? PALETTE.ember : PALETTE.flame));
    box(v, -3, 2, 7, 7, -3, 2, (x, y, z) => (z % 2 === 0 ? PALETTE.steelDark : null));
    for (const [x, z] of [[-3, -1], [0, 1], [2, -3], [-1, -3]]) v.push([x, 8, z, PALETTE.flame]);
    // The lid, propped open at the back.
    box(v, -4, 3, 7, 10, -4, -4, (x, y) => (y === 10 && x >= -1 && x <= 0 ? PALETTE.steelDark : PALETTE.black));
    return { v, mouth: [0, 4, 0] };
  },
  tandoor: () => {
    const v = [];
    for (let y = 0; y <= 7; y++) disc(v, 3.9, y, (dx, dz) => {
      const d = Math.hypot(dx, dz);
      if (y === 7 && d < 1.2) return PALETTE.ember;
      if (y === 7 && d < 2.6) return PALETTE.soot;
      return y === 2 || y === 5 ? PALETTE.clayDark : hash(dx * 2, y, dz * 2) % 9 ? PALETTE.clay : PALETTE.clayDark;
    }, -0.5, -0.5);
    // Two skewers stood in the coals.
    for (const [x, z] of [[-2, 0], [1, -1]]) box(v, x, x, 8, 10, z, z, (xx, y) => (y === 9 ? PALETTE.clayDark : PALETTE.steel));
    return { v, mouth: [0, 4, 0] };
  },
  steamer: () => {
    const v = box([], -4, 3, 0, 3, -4, 3, (x, y, z) => (z === 3 && x % 3 === 0 ? PALETTE.wood : PALETTE.woodDark));
    box(v, -4, 3, 4, 4, -4, 3, PALETTE.steelDark);
    for (let y = 5; y <= 8; y++) disc(v, 3.4, y, (dx, dz) => (y % 2 === 1 ? PALETTE.bambooDark : hash(dx * 2, dz * 2) % 5 ? PALETTE.bamboo : PALETTE.bambooDark), -0.5, -0.5);
    disc(v, 3.4, 9, PALETTE.wood, -0.5, -0.5);
    disc(v, 2, 10, PALETTE.woodLight, -0.5, -0.5);
    // A wisp of steam.
    v.push([-1, 12, -1, PALETTE.white], [0, 13, -1, PALETTE.white], [-1, 14, 0, PALETTE.white]);
    return { v, mouth: [0, 5, 0] };
  },
  wok: () => {
    const v = box([], -4, 3, 0, 4, -4, 3, (x, y, z) => (z === 3 && (y === 0 || (y === 3 && (x === -3 || x === 2))) ? PALETTE.black : PALETTE.steelDark));
    disc(v, 2.4, 5, (dx, dz) => (Math.hypot(dx, dz) < 1.2 ? PALETTE.black : hash(dx * 2, dz * 2) % 2 ? PALETTE.flame : PALETTE.ember), -0.5, -0.5);
    disc(v, 1.6, 6, PALETTE.black, -0.5, -0.5);
    disc(v, 2.7, 7, (dx, dz) => {
      if (Math.hypot(dx, dz) > 1.6) return PALETTE.black;
      const h = hash(dx * 2, dz * 2) % 5;
      return h === 0 ? PALETTE.green : h === 1 ? PALETTE.red : PALETTE.oil;
    }, -0.5, -0.5);
    box(v, 3, 5, 7, 7, -1, -1, PALETTE.woodDark);
    v.push([-1, 9, 0, PALETTE.green], [0, 10, -1, PALETTE.red], [-2, 10, -1, PALETTE.oil]);
    return { v, mouth: [0, 4, 0] };
  },
  fridge: () => {
    const v = box([], -4, 3, 0, 13, -4, 1, (x, y, z) => {
      if (y === 0) return PALETTE.steelDark;
      if (z === 1 && y === 9) return PALETTE.steel;
      return PALETTE.white;
    });
    box(v, 2, 2, 3, 7, 2, 2, PALETTE.steelDark);
    box(v, 2, 2, 10, 12, 2, 2, PALETTE.steelDark);
    // A note and two magnets on the door.
    box(v, -3, -2, 11, 12, 2, 2, PALETTE.note);
    v.push([-2, 7, 2, PALETTE.ember], [-1, 5, 2, PALETTE.green]);
    return { v, mouth: [0, 3, 1.5] };
  },
};

// Three along the back wall, three down each side, all facing the table. turns: 1 faces +x, -1 faces -x.
const LAYOUT = [
  ["pizza oven", -8, -9, 0], ["oven", 0, -9, 0], ["hob", 8, -9, 0],
  ["fryer", -13, -4, 1], ["grill", -13, 1, 1], ["tandoor", -13, 6, 1],
  ["steamer", 13, -4, -1], ["wok", 13, 1, -1], ["fridge", 13, 6, -1],
];

// A dish as voxels a quarter of a unit across, on a plate with a raised rim.
function dishVoxels({ shape, colours }) {
  const [a, b = a, c = b, d = c] = colours;
  const v = disc([], 4.4, 0, (x, z) => (x * x + z * z > 13 ? PALETTE.plateRim : PALETTE.plate));
  disc(v, 4.4, 1, (x, z) => (x * x + z * z > 3.7 ** 2 ? PALETTE.plate : null));
  const speck = (x, z) => (hash(x, z) % 5 === 0 ? c : hash(z, x) % 4 === 0 ? d : b);
  const sprinkle = (x, z) => (hash(x, z, 3) % 4 === 0 ? (hash(x, z) % 2 ? c : d) : null);
  if (shape === "flat") {
    disc(v, 3.4, 1, (x, z) => (x * x + z * z > 8 ? a : speck(x, z)));
    disc(v, 2.6, 2, sprinkle);
  }
  if (shape === "bowl") {
    disc(v, 2.6, 1, a);
    disc(v, 3.4, 2, (x, z) => (x * x + z * z > 6.5 ? a : speck(x, z)));
    disc(v, 3.6, 3, (x, z) => (x * x + z * z > 9 ? a : sprinkle(x, z)));
  }
  if (shape === "stack") {
    [a, b, c, d].forEach((colour, i) => {
      for (const y of [1 + i * 2, 2 + i * 2]) disc(v, i === 0 || i === 3 ? 3 : 3.4, y, colour);
    });
    disc(v, 2.2, 9, (x, z) => (hash(x, z) % 6 === 0 ? PALETTE.white : d));
  }
  if (shape === "skewer") {
    const chunk = [-4, -3, -1, 0, 2, 3];
    for (let x = -5; x <= 5; x++) {
      if (!chunk.includes(x)) { v.push([x, 2, 0, PALETTE.stick]); continue; }
      const colour = Math.floor((x + 4) / 3) % 2 ? b : a;
      box(v, x, x, 2, 3, -1, 0, (xx, y, z) => (y === 3 && hash(x, z) % 3 === 0 ? c : colour));
    }
  }
  if (shape === "pile") {
    box(v, -2, 2, 1, 1, -2, 2, (x, y, z) => (hash(x, z) % 2 ? a : b));
    box(v, -2, 1, 2, 2, -2, 1, (x, y, z) => (hash(x, z, 1) % 2 ? c : a));
    box(v, -1, 0, 3, 3, -1, 0, (x, y, z) => (hash(x, z, 2) % 3 ? a : d));
  }
  if (shape === "slab") [a, b, a, b, c].forEach((colour, i) => box(v, -3, 3, 1 + i, 1 + i, -2, 2, i === 4 ? (x, y, z) => (hash(x, z) % 5 ? colour : b) : colour));
  return v;
}

function turn([x, y, z], turns) {
  return turns === 0 ? [x, y, z] : turns === 1 ? [z, y, -x] : [-z, y, x];
}

// Wall tiles below a green trim, plain paint above. `along` runs the wall's length.
function wallColour(along, y) {
  if (y === 8 || y === 19) return PALETTE.wallTrim;
  if (y > 8) return PALETTE.wall;
  return (along + (Math.floor(y / 2) % 2) * 2) % 4 === 0 ? PALETTE.grout : PALETTE.tile;
}

// The window's glass on the back wall: 7 units across, 4 tall, above the oven.
const WINDOW = { x: 0, y: 6.5, z: -11.49, width: 7, height: 4, texels: 8 };
// The clock on the right wall, near the back corner, where wide screens keep it clear of the questions.
const CLOCK = { x: 15.98, y: 6, z: -10, size: 2.6, texels: 24 };

function buildRoom() {
  const v = [];
  // Floor tiles one unit across, with a little wear.
  box(v, -33, 32, -1, -1, -25, 20, (x, y, z) => {
    const dark = (Math.floor(x / 2) + Math.floor(z / 2)) % 2 !== 0;
    const worn = hash(x, z) % 11 === 0;
    return dark ? (worn ? PALETTE.floorA2 : PALETTE.floorA) : worn ? PALETTE.floorB2 : PALETTE.floorB;
  });
  box(v, -33, 32, 0, 19, -24, -24, (x, y) => wallColour(x, y));
  box(v, 32, 32, 0, 19, -23, 20, (x, y, z) => wallColour(z, y));
  // The window frame, a meeting rail across the middle and a deep sill.
  box(v, -8, 7, 9, 18, -23, -23, (x, y) => (x === -8 || x === 7 || y === 9 || y === 18 || y === 14 ? PALETTE.frame : null));
  box(v, -9, 8, 8, 8, -23, -21, PALETTE.frame);
  // Table top in planks, an apron and four legs.
  box(v, -11, 10, 5, 5, -7, 6, (x, y, z) => (z % 3 === 0 ? PALETTE.woodDark : hash(x, z) % 13 ? PALETTE.wood : PALETTE.woodLight));
  box(v, -11, 10, 4, 4, -7, 6, (x, y, z) => (x === -11 || x === 10 || z === -7 || z === 6 ? PALETTE.woodDark : null));
  for (const x of [-11, 9]) for (const z of [-7, 5]) box(v, x, x + 1, 0, 3, z, z + 1, PALETTE.woodDark);
  return fineMesh(v);
}

// A small seeded generator, so the skyline and stars are the same on every visit.
function seeded(seed) {
  return () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
}

const css = (rgb) => `rgb(${rgb.map(Math.round).join(",")})`;
const rgbOf = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];

// The view from the window: sky, sun or moon, clouds, a generic skyline, rain or snow.
function makeWindowView() {
  const w = WINDOW.width * WINDOW.texels;
  const h = WINDOW.height * WINDOW.texels;
  const random = seeded(159);
  const far = [];
  const near = [];
  for (let x = -2; x < w; x += 4 + Math.floor(random() * 5)) far.push({ x, w: 5 + Math.floor(random() * 4), h: 10 + Math.floor(random() * 8) });
  for (let x = -3; x < w; x += 6 + Math.floor(random() * 5)) {
    const b = { x, w: 5 + Math.floor(random() * 5), h: 6 + Math.floor(random() * 12), lit: [] };
    for (let i = 0; i < 40; i++) b.lit.push(random() < 0.35);
    near.push(b);
  }
  const stars = Array.from({ length: 18 }, () => [Math.floor(random() * w), Math.floor(random() * h * 0.5)]);
  const drops = Array.from({ length: 26 }, () => [Math.floor(random() * w), random() * h, 0.5 + random()]);
  const clouds = Array.from({ length: 6 }, () => [random() * w, 2 + Math.floor(random() * 9), 6 + Math.floor(random() * 8)]);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  const px = (colour, x, y, cw = 1, ch = 1) => { ctx.fillStyle = colour; ctx.fillRect(Math.round(x), Math.round(y), cw, ch); };

  function cloud(x, y, size, colour) {
    const cx = ((x % (w + size * 2)) + w + size * 2) % (w + size * 2) - size;
    px(colour, cx, y + 1, size, 2);
    px(colour, cx + 2, y, size - 4, 1);
    px(colour, cx + Math.floor(size / 3), y - 1, Math.ceil(size / 3), 1);
  }

  // look: the eased light (colours as sRGB arrays); time drives drift and falling weather.
  function draw({ hour, weather, look, snow, time, still }) {
    const sky = css(look.sky);
    px(sky, 0, 0, w, h);
    px(css(look.band), 0, Math.floor(h * 0.62), w, h);
    const overcast = weather === "rain" || weather === "snow";
    const night = hour < 6 || hour >= 19;
    if (night && !overcast) for (const [x, y] of stars) px("rgb(223,230,255)", x, y);
    // The sun crosses from six to seven; the moon takes the night.
    const u = night ? (((hour - 19) % 24) + 24) % 24 / 11 : (hour - 6) / 13;
    const bx = 4 + u * (w - 8);
    const by = h * 0.62 - Math.sin(Math.PI * u) * h * 0.5;
    if (!overcast) {
      if (night) {
        px("rgb(238,240,244)", bx - 1, by - 2, 3, 5);
        px("rgb(238,240,244)", bx - 2, by - 1, 5, 3);
        px(sky, bx + 1, by - 2, 2, 3);
      } else {
        const sun = hour < 7.5 || hour > 17 ? "rgb(255,182,96)" : "rgb(255,233,160)";
        px(sun, bx - 1, by - 3, 3, 7);
        px(sun, bx - 3, by - 1, 7, 3);
        px(sun, bx - 2, by - 2, 5, 5);
      }
    }
    const drift = still ? 0 : time / 4000;
    const cloudColour = css(look.cloud);
    const shown = weather === "sun" ? 2 : clouds.length;
    clouds.slice(0, shown).forEach(([x, y, size]) => cloud(x + drift * (1 + size / 10), y, size + (overcast ? 6 : 0), cloudColour));
    if (overcast) px(cloudColour, 0, 0, w, 2);

    // Far blocks in the haze, near blocks with windows; snow lies on every roof.
    const roof = Math.round(snow * 2);
    for (const b of far) {
      px(css(look.cityFar), b.x, h - b.h, b.w, b.h);
      if (roof) px("rgb(236,240,244)", b.x, h - b.h, b.w, roof);
    }
    for (const b of near) {
      const top = h - b.h;
      px(css(look.city), b.x, top, b.w, b.h);
      let i = 0;
      for (let y = top + 2; y < h - 1; y += 3) for (let x = b.x + 1; x < b.x + b.w - 1; x += 2) {
        const lit = night && b.lit[i++ % b.lit.length];
        px(lit ? "rgb(246,200,74)" : css(look.cityWindow), x, y);
      }
      if (roof) px("rgb(244,246,248)", b.x, top - (roof > 1 ? 1 : 0), b.w, roof);
    }

    if (weather === "rain") for (const [x, y, speed] of drops) {
      const fall = still ? y : (y + time / 25 * speed) % (h + 4) - 4;
      px("rgba(220,232,240,0.75)", x, fall, 1, 3);
    }
    if (weather === "snow") for (const [x, y, speed] of drops) {
      const fall = still ? y : (y + time / 220 * speed) % h;
      const sway = still ? 0 : Math.round(Math.sin(time / 900 + x) * 1);
      px("rgb(248,250,252)", x + sway, fall);
    }
  }
  return { canvas, draw };
}

// A round clock face with four ticks and two hands, drawn pixel by pixel.
function makeClockFace() {
  const n = CLOCK.texels;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = n;
  const ctx = canvas.getContext("2d");
  const c = (n - 1) / 2;
  const px = (colour, x, y) => { ctx.fillStyle = colour; ctx.fillRect(Math.round(x), Math.round(y), 1, 1); };
  function hand(angle, length, colour) {
    for (let r = 0; r <= length; r += 0.5) px(colour, c + Math.sin(angle) * r, c - Math.cos(angle) * r);
  }
  function draw(hour) {
    ctx.clearRect(0, 0, n, n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const d = Math.hypot(x - c, y - c);
      if (d <= c + 0.3) px(d > c - 1.6 ? "#2a2a2a" : "#f4f3ee", x, y);
    }
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2;
      for (const r of [c - 3, c - 2.5]) px("#2a2a2a", c + Math.sin(a) * r, c - Math.cos(a) * r);
    }
    const hands = handAngles(hour);
    hand(hands.hour, c * 0.5, "#2a2a2a");
    hand(hands.minute, c * 0.8, "#2a2a2a");
    px("#c8372d", c, c);
  }
  return { canvas, draw };
}

function pixelTexture(canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  Object.assign(texture, { magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter, generateMipmaps: false, colorSpace: THREE.SRGBColorSpace });
  return texture;
}

// Every colour in the light, as sRGB arrays, so it can ease frame by frame.
const COLOUR_KEYS = ["background", "sky", "band", "ambient", "ground", "sun", "city", "cityFar", "cityWindow", "cloud"];
const asLook = (light) => ({ ...light, ...Object.fromEntries(COLOUR_KEYS.map((k) => [k, rgbOf(light[k])])) });

export function startKitchen(container) {
  const canvas = container.querySelector("canvas");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "low-power" });
  renderer.setPixelRatio(1);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color();
  const hemisphere = new THREE.HemisphereLight();
  const sun = new THREE.DirectionalLight();
  sun.position.set(-6, 14, 9);
  // The ceiling light: no fixture is drawn, only its glow on the room.
  const ceiling = new THREE.PointLight(0xffd9a0, 0, 0, 0);
  ceiling.position.set(0, 16, -1);
  scene.add(hemisphere, sun, ceiling, buildRoom());

  const appliances = new Map(LAYOUT.map(([name, x, z, turns]) => {
    const { v, mouth } = APPLIANCE_MODELS[name]();
    const group = new THREE.Group();
    group.add(fineMesh(v));
    group.rotation.y = (turns * Math.PI) / 2;
    group.position.set(x, 0, z);
    scene.add(group);
    const [mx, my, mz] = turn(mouth, turns);
    return [name, { group, mouth: new THREE.Vector3(x + mx, my, z + mz) }];
  }));

  const view = makeWindowView();
  const viewTexture = pixelTexture(view.canvas);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(WINDOW.width, WINDOW.height), new THREE.MeshBasicMaterial({ map: viewTexture }));
  glass.position.set(WINDOW.x, WINDOW.y, WINDOW.z);
  const face = makeClockFace();
  const faceTexture = pixelTexture(face.canvas);
  const clock = new THREE.Mesh(new THREE.PlaneGeometry(CLOCK.size, CLOCK.size), new THREE.MeshLambertMaterial({ map: faceTexture, transparent: true, alphaTest: 0.5 }));
  clock.position.set(CLOCK.x, CLOCK.y, CLOCK.z);
  clock.rotation.y = -Math.PI / 2;
  // Snow on the sill, as deep as the snow on the roofs outside.
  const sillSnow = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.25, 1.4), new THREE.MeshLambertMaterial({ color: 0xf6f8fa }));
  sillSnow.position.set(0, 4, -10.75);
  scene.add(glass, clock, sillSnow);

  const camera = new THREE.OrthographicCamera();
  const target = new THREE.Vector3(0, 3, -1);
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const forced = readOverrides(location.search);
  const startHour = Math.random() * 24;
  const weathers = [];
  // This round's dishes, and the dishes on the table oldest first, as { dish, mesh, slot }.
  const served = [];
  const table = [];
  const flights = [];
  let toServe = FIRST_SERVE_MS;
  let mode = reduced.matches ? "still" : "running";
  let frames = 0;
  let raf = 0;
  let last = 0;
  let born = 0;
  let paused = false;
  let look = null;
  let snow = 0;
  let lightOn = false;
  let lightSince = 0;

  // The kitchen's hour and weather `elapsed` ms after the page opened.
  function skyAt(elapsed) {
    const hour = forced.sky ? PHASE_HOUR[forced.sky] : kitchenHour(startHour, elapsed);
    const period = Math.floor(elapsed / WEATHER_MS);
    while (weathers.length <= period) weathers.push(pickWeather(Math.random));
    return { hour, phase: phaseAt(hour), weather: forced.weather ?? weathers[period] };
  }

  function lightUp(t, dt) {
    // A frame's timestamp can fall just before the page's own start.
    const elapsed = Math.max(0, t - born);
    const { hour, phase, weather } = skyAt(elapsed);
    const want = asLook(lightFor(phase, weather));
    const k = look ? 1 - Math.exp(-dt / LIGHT_EASE_MS) : 1;
    look ??= want;
    for (const key of COLOUR_KEYS) look[key] = look[key].map((v, i) => v + (want[key][i] - v) * k);
    look.ambientIntensity += (want.ambientIntensity - look.ambientIntensity) * k;
    look.sunIntensity += (want.sunIntensity - look.sunIntensity) * k;
    if (want.ceiling !== lightOn) { lightOn = want.ceiling; lightSince = t; }
    snow = frames === 0 && weather === "snow" ? 1 : settleSnow(snow, weather === "snow", dt);

    const rgb = (key, colour) => colour.setRGB(...look[key].map((v) => v / 255), THREE.SRGBColorSpace);
    rgb("background", scene.background);
    rgb("ambient", hemisphere.color);
    rgb("ground", hemisphere.groundColor);
    rgb("sun", sun.color);
    hemisphere.intensity = look.ambientIntensity;
    sun.intensity = look.sunIntensity;
    // On at night: a short flicker as it comes on, then steady. Off fades with the dawn.
    const flicker = mode === "running" && lightOn && t - lightSince < 400 ? [1, 0, 0.7, 0, 1][Math.floor((t - lightSince) / 80)] : 1;
    const wantCeiling = lightOn ? 1.3 * flicker : 0;
    ceiling.intensity = lightOn && mode === "running" ? wantCeiling : ceiling.intensity + (wantCeiling - ceiling.intensity) * k;
    sillSnow.visible = snow > 0.02;
    sillSnow.scale.y = Math.max(0.02, snow);
    sillSnow.position.y = 4 + 0.125 * snow;

    view.draw({ hour, weather, look, snow, time: elapsed, still: mode !== "running" });
    viewTexture.needsUpdate = true;
    face.draw(hour);
    faceTexture.needsUpdate = true;
    Object.assign(container.dataset, { sky: phase, weather, light: lightOn ? "on" : "off" });
  }

  function frameCamera(t) {
    const sway = mode === "running" ? Math.sin(t / 9000) * 0.12 : 0;
    // From the front left corner, so the back and right walls face the viewer.
    camera.position.set(-Math.sin(0.55 + sway) * 40, 30, Math.cos(0.55 + sway) * 40).add(target);
    camera.lookAt(target);
  }

  function resize() {
    // About 800 drawn pixels across, whatever the screen, so the voxels stay crisp but fine.
    const scale = Math.max(1, Math.round(container.clientWidth / 800));
    const w = Math.max(1, Math.ceil(container.clientWidth / scale));
    const h = Math.max(1, Math.ceil(container.clientHeight / scale));
    renderer.setSize(w, h, false);
    const aspect = w / h;
    let half = Math.max(20, 22 * aspect / 1.6);
    // On tall screens the questions fill the middle, so the table sits low, under the prompt box.
    const drop = aspect < 1 ? half / aspect * 0.6 : 0;
    let shift = 0;
    let lift = 0;
    // On wide screens the questions sit left: a 720px column, 32px in, centred within 1280px
    // (questions.css, results.css). Frame the window just clear of it and the clock just inside the right edge.
    if (container.clientWidth >= 1100) {
      const cover = (Math.max(0, (container.clientWidth - 1280) / 2) + 32 + 720) / container.clientWidth + 0.02;
      frameCamera(0);
      camera.updateMatrixWorld();
      const across = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse).x;
      const from = across(WINDOW.x - WINDOW.width / 2, WINDOW.y, WINDOW.z);
      const to = Math.max(...[-1, 1].map((side) => across(CLOCK.x, CLOCK.y, CLOCK.z + side * CLOCK.size / 2))) + 0.5;
      half = Math.max(half, (to - from) / (0.97 - cover) / 2);
      shift = -(from - cover * 2 * half) - half;
      // A little headroom above the clock.
      lift = 1.5;
    }
    const tall = half / aspect;
    Object.assign(camera, { left: -half - shift, right: half - shift, top: tall + drop + lift, bottom: -tall + drop + lift, near: 1, far: 200 });
    camera.updateProjectionMatrix();
  }

  function draw(t) {
    lightUp(t, Math.min(1000, t - (last || t)));
    frameCamera(t);
    renderer.render(scene, camera);
    container.dataset.frames = String(++frames);
  }

  function step(t) {
    for (const f of [...flights]) {
      const k = Math.min(1, (t - (f.start ??= t)) / FLIGHT_MS);
      f.mesh.position.lerpVectors(f.from, f.to, k);
      f.mesh.position.y += Math.sin(Math.PI * k) * 5;
      f.mesh.rotation.y = (1 - k) * Math.PI * 2;
      f.appliance.scale.y = 1 + 0.15 * Math.max(0, Math.sin(Math.PI * Math.min(1, k * 3)));
      if (k === 1) flights.splice(flights.indexOf(f), 1);
    }
    container.dataset.flying = String(flights.length);
  }

  // The day keeps turning and dishes keep flying in every mode; still only drops the sway and falling weather.
  function loop(t) {
    raf = requestAnimationFrame(loop);
    if (t - last < FRAME_MS) return;
    // Counts running time only: a pause (hidden tab, results screen) neither brings the next dish closer
    // nor sends a burst of missed ones on return.
    toServe -= Math.min(250, t - (last || t));
    if (toServe <= 0) {
      serve();
      toServe = SERVE_MS;
    }
    step(t);
    draw(t);
    last = t;
  }

  function setMode(next) {
    mode = next;
    container.dataset.kitchen = paused ? "paused" : mode;
    cancelAnimationFrame(raf);
    raf = 0;
    if (!paused) raf = requestAnimationFrame(loop);
  }

  function update() {
    paused = document.visibilityState === "hidden" || container.hidden;
    setMode(reduced.matches ? "still" : "running");
  }

  // One dish, from its appliance to the next free place, or to the oldest dish's place, which clears at take-off.
  function serve() {
    const onTable = table.map((p) => p.dish);
    let dish = nextDish(served, onTable, Math.random);
    if (!dish) {
      // Every dish has been out this round: start another.
      served.length = 0;
      dish = nextDish(served, onTable, Math.random);
    }
    served.push(dish);
    let slot = table.length;
    if (table.length === SLOTS.length) {
      const oldest = table.shift();
      scene.remove(oldest.mesh);
      oldest.mesh.geometry.dispose();
      oldest.mesh.material.dispose();
      slot = oldest.slot;
    }
    const [sx, sz] = SLOTS[slot];
    const mesh = voxelMesh(dishVoxels(dish), 0.25);
    const to = new THREE.Vector3(sx, TABLE_Y + 0.125, sz);
    const { group, mouth } = appliances.get(dish.appliance);
    table.push({ dish, mesh, slot });
    scene.add(mesh);
    container.dataset.dishes = String(table.length);
    mesh.position.copy(mouth);
    flights.push({ mesh, from: mouth.clone(), to, appliance: group });
  }

  born = performance.now();
  resize();
  new ResizeObserver(resize).observe(container);
  document.addEventListener("visibilitychange", update);
  reduced.addEventListener("change", update);
  Object.assign(container.dataset, { dishes: "0", flying: "0" });
  update();
  // Paused while the results screen shows; resumed when the questions come back.
  return { update };
}
