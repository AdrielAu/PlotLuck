// The questions screen's voxel kitchen: nine appliances round a table, one dish served per answer.
// Purely decorative. Rendered small and scaled up without smoothing for a pixel-art look.
// State for tests and styles sits on the container: data-kitchen (running, paused, still),
// data-frames (frames drawn) and data-dishes (dishes on the table).
import * as THREE from "three";

import { nextDish } from "./dishes.js";

const PALETTE = {
  floorA: 0x284c29, floorB: 0xe4e2d6, wall: 0xdfe6d6, wallTrim: 0xbacfa9,
  wood: 0x9a6a3e, woodDark: 0x6e4a2a, steel: 0xb9bfc0, steelDark: 0x7d8586, glass: 0x2f3437,
  brick: 0xa8553a, brickDark: 0x7e3d29, clay: 0xc27a4a, bamboo: 0xcfae6a, black: 0x2a2a2a,
  ember: 0xf08a2c, flame: 0xf6c84a, oil: 0xe0b44a, white: 0xf4f3ee, plate: 0xf7f6f3,
};
const FRAME_MS = 1000 / 30;
const FLIGHT_MS = 1100;
// Six places on the table top, filled in this order.
const SLOTS = [[-3, -1.4], [0, -1.4], [3, -1.4], [-3, 1.4], [0, 1.4], [3, 1.4]];
const TABLE_TOP = 3;

// A voxel list [[x, y, z, colour]] as one instanced mesh of unit cubes.
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

function box(out, x0, x1, y0, y1, z0, z1, colour) {
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) out.push([x, y, z, typeof colour === "function" ? colour(x, y, z) : colour]);
  return out;
}

function disc(out, r, y, colour, cx = 0, cz = 0) {
  for (let x = -Math.ceil(r); x <= Math.ceil(r); x++) for (let z = -Math.ceil(r); z <= Math.ceil(r); z++) {
    if (x * x + z * z <= r * r + 0.5) out.push([cx + x, y, cz + z, typeof colour === "function" ? colour(x, z) : colour]);
  }
  return out;
}

// Each appliance faces +z, sits on y = 0 and spans x and z from -2 to 1. `mouth` is where dishes leave.
const APPLIANCE_MODELS = {
  "pizza oven": () => {
    const v = box([], -2, 1, 0, 1, -2, 1, PALETTE.brickDark);
    box(v, -2, 1, 2, 3, -2, 1, (x, y, z) => (z === 1 && y === 2 && (x === -1 || x === 0) ? PALETTE.ember : (x + y + z) % 2 ? PALETTE.brick : PALETTE.brickDark));
    box(v, -1, 0, 4, 4, -1, 0, PALETTE.brick);
    return { v, mouth: [-0.5, 2, 1.5] };
  },
  oven: () => {
    const v = box([], -2, 1, 0, 3, -2, 1, PALETTE.steel);
    box(v, -1, 0, 1, 2, 1, 1, PALETTE.glass);
    box(v, -2, 1, 3, 3, 1, 1, (x) => (x % 2 ? PALETTE.black : PALETTE.steelDark));
    return { v, mouth: [-0.5, 2, 1.5] };
  },
  fryer: () => {
    const v = box([], -2, 1, 0, 2, -2, 1, PALETTE.steel);
    box(v, -1, 0, 3, 3, -1, 0, PALETTE.oil);
    box(v, -2, 1, 3, 3, -2, -2, PALETTE.steelDark);
    return { v, mouth: [-0.5, 3.5, -0.5] };
  },
  hob: () => {
    const v = box([], -2, 1, 0, 2, -2, 1, PALETTE.steelDark);
    box(v, -2, 1, 3, 3, -2, 1, (x, y, z) => ((x === -2 || x === 0) && (z === -2 || z === 0) ? PALETTE.black : (x === -1 || x === 1) && (z === -1 || z === 1) ? PALETTE.ember : PALETTE.steel));
    return { v, mouth: [-0.5, 3.5, -0.5] };
  },
  grill: () => {
    const v = box([], -2, 1, 0, 2, -2, 1, PALETTE.black);
    box(v, -2, 1, 3, 3, -2, 1, (x, y, z) => (z % 2 ? PALETTE.ember : PALETTE.steelDark));
    return { v, mouth: [-0.5, 3.5, -0.5] };
  },
  tandoor: () => {
    const v = [];
    for (let y = 0; y <= 3; y++) disc(v, 2, y, y === 3 ? (x, z) => (x * x + z * z <= 1 ? PALETTE.ember : PALETTE.clay) : PALETTE.clay, -0.5, -0.5);
    return { v: v.map(([x, y, z, c]) => [Math.round(x), y, Math.round(z), c]), mouth: [-0.5, 4, -0.5] };
  },
  steamer: () => {
    const v = box([], -2, 1, 0, 1, -2, 1, PALETTE.woodDark);
    for (let y = 2; y <= 4; y++) box(v, -1, 0, y, y, -1, 0, y === 4 ? PALETTE.wood : PALETTE.bamboo);
    box(v, -2, 1, 2, 3, -2, 1, (x, y, z) => (Math.abs(x + 0.5) > 1 || Math.abs(z + 0.5) > 1 ? PALETTE.bamboo : PALETTE.white));
    return { v, mouth: [-0.5, 5, -0.5] };
  },
  wok: () => {
    const v = box([], -2, 1, 0, 1, -2, 1, PALETTE.steelDark);
    box(v, -1, 0, 2, 2, -1, 0, PALETTE.flame);
    box(v, -2, 1, 3, 3, -2, 1, (x, y, z) => (Math.abs(x + 0.5) < 1 && Math.abs(z + 0.5) < 1 ? PALETTE.ember : PALETTE.black));
    return { v, mouth: [-0.5, 4, -0.5] };
  },
  fridge: () => {
    const v = box([], -2, 1, 0, 6, -2, 0, (x, y) => (y === 4 ? PALETTE.steel : PALETTE.white));
    box(v, 1, 1, 1, 3, 1, 1, PALETTE.steelDark);
    box(v, 1, 1, 5, 6, 1, 1, PALETTE.steelDark);
    return { v, mouth: [-0.5, 3, 1.5] };
  },
};

// Three along the back wall, three down each side, all facing the table. turns: 1 faces +x, -1 faces -x.
const LAYOUT = [
  ["pizza oven", -8, -9, 0], ["oven", 0, -9, 0], ["hob", 8, -9, 0],
  ["fryer", -13, -4, 1], ["grill", -13, 1, 1], ["tandoor", -13, 6, 1],
  ["steamer", 13, -4, -1], ["wok", 13, 1, -1], ["fridge", 13, 6, -1],
];

// A dish as voxels half the kitchen's size, on a plate.
function dishVoxels({ shape, colours }) {
  const [a, b = a, c = b, d = c] = colours;
  const v = disc([], 2.2, 0, PALETTE.plate);
  const speck = (x, z) => ((x * 7 + z * 13) % 5 === 0 ? c : (x * 3 + z) % 4 === 0 ? d : b);
  if (shape === "flat") disc(v, 1.7, 1, (x, z) => (x * x + z * z > 2.5 ? a : speck(x, z)));
  if (shape === "bowl") {
    disc(v, 1.9, 1, a);
    disc(v, 1.9, 2, (x, z) => (x * x + z * z > 2 ? a : speck(x, z)));
  }
  if (shape === "stack") [a, b, c, d].forEach((colour, i) => disc(v, i === 0 || i === 3 ? 1.5 : 1.7, i + 1, colour));
  if (shape === "skewer") for (let x = -2; x <= 2; x++) v.push([x, 1, 0, x % 2 ? b : a], [x, 2, 0, x === 0 ? c : a]);
  if (shape === "pile") {
    box(v, -1, 1, 1, 1, -1, 1, (x, y, z) => ((x + z) % 2 ? a : b));
    box(v, -1, 0, 2, 2, -1, 0, (x, y, z) => ((x + z) % 2 ? c : a));
  }
  if (shape === "slab") {
    box(v, -1, 1, 1, 1, -1, 0, a);
    box(v, -1, 1, 2, 2, -1, 0, b);
    box(v, -1, 1, 3, 3, -1, 0, c);
  }
  return v;
}

function turn([x, y, z], turns) {
  return turns === 0 ? [x, y, z] : turns === 1 ? [z, y, -x] : [-z, y, x];
}

function buildRoom() {
  const v = [];
  box(v, -16, 16, -1, -1, -12, 10, (x, y, z) => ((x + z) % 2 ? PALETTE.floorA : PALETTE.floorB));
  box(v, -16, 16, 0, 9, -12, -12, (x, y) => (y === 3 ? PALETTE.wallTrim : PALETTE.wall));
  // Table top, apron and legs.
  box(v, -5, 5, TABLE_TOP - 1, TABLE_TOP - 1, -3, 3, (x, y, z) => ((x + z) % 3 ? PALETTE.wood : PALETTE.woodDark));
  for (const x of [-5, 5]) for (const z of [-3, 3]) box(v, x, x, 0, TABLE_TOP - 2, z, z, PALETTE.woodDark);
  return voxelMesh(v);
}

export function startKitchen(container) {
  const canvas = container.querySelector("canvas");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "low-power" });
  renderer.setPixelRatio(1);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xeef0e8);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a9a80, 1.7));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(6, 14, 9);
  scene.add(sun, buildRoom());

  const appliances = new Map(LAYOUT.map(([name, x, z, turns]) => {
    const { v, mouth } = APPLIANCE_MODELS[name]();
    const group = new THREE.Group();
    group.add(voxelMesh(v.map(([vx, vy, vz, c]) => [...turn([vx, vy, vz], turns), c])));
    group.position.set(x, 0, z);
    scene.add(group);
    const [mx, my, mz] = turn(mouth, turns);
    return [name, { group, mouth: new THREE.Vector3(x + mx, my, z + mz) }];
  }));

  const camera = new THREE.OrthographicCamera();
  const target = new THREE.Vector3(0, 2, -1);
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const served = [];
  const flights = [];
  let mode = reduced.matches ? "still" : "running";
  let frames = 0;
  let raf = 0;
  let last = 0;
  let paused = false;

  function frameCamera(t) {
    const sway = mode === "running" ? Math.sin(t / 9000) * 0.12 : 0;
    camera.position.set(Math.sin(0.55 + sway) * 40, 30, Math.cos(0.55 + sway) * 40).add(target);
    camera.lookAt(target);
  }

  function resize() {
    // About 400 drawn pixels across, whatever the screen, so voxels stay chunky.
    const scale = Math.max(2, Math.round(container.clientWidth / 400));
    const w = Math.max(1, Math.ceil(container.clientWidth / scale));
    const h = Math.max(1, Math.ceil(container.clientHeight / scale));
    renderer.setSize(w, h, false);
    const aspect = w / h;
    const half = Math.max(20, 22 * aspect / 1.6);
    const tall = half / aspect;
    // On wide screens the questions sit left (questions.css), so the table is framed to the right;
    // on tall screens they fill the middle, so the table sits low, under the prompt box.
    const shift = container.clientWidth >= 1100 ? half * 0.45 : 0;
    const drop = aspect < 1 ? tall * 0.6 : 0;
    Object.assign(camera, { left: -half - shift, right: half - shift, top: tall + drop, bottom: -tall + drop, near: 1, far: 200 });
    camera.updateProjectionMatrix();
  }

  function draw(t) {
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
  }

  function loop(t) {
    raf = requestAnimationFrame(loop);
    if (t - last < FRAME_MS) return;
    last = t;
    step(t);
    draw(t);
  }

  function setMode(next) {
    mode = next;
    container.dataset.kitchen = paused ? "paused" : mode;
    cancelAnimationFrame(raf);
    raf = 0;
    if (paused) return;
    if (mode === "running") raf = requestAnimationFrame(loop);
    else draw(0);
  }

  function update() {
    paused = document.visibilityState === "hidden" || container.hidden;
    setMode(reduced.matches ? "still" : "running");
  }

  // One dish, from its appliance to the next free place on the table.
  function serve() {
    if (served.length >= SLOTS.length) return;
    const dish = nextDish(served, Math.random);
    if (!dish) return;
    served.push(dish);
    const [sx, sz] = SLOTS[served.length - 1];
    const mesh = voxelMesh(dishVoxels(dish), 0.5);
    const to = new THREE.Vector3(sx, TABLE_TOP, sz);
    const { group, mouth } = appliances.get(dish.appliance);
    scene.add(mesh);
    container.dataset.dishes = String(served.length);
    if (mode === "running" && !paused) {
      mesh.position.copy(mouth);
      flights.push({ mesh, from: mouth.clone(), to, appliance: group });
    } else {
      mesh.position.copy(to);
      if (!paused) draw(0);
    }
  }

  resize();
  new ResizeObserver(() => { resize(); if (mode !== "running" && !paused) draw(0); }).observe(container);
  document.addEventListener("visibilitychange", update);
  reduced.addEventListener("change", update);
  container.dataset.dishes = "0";
  update();
  // Paused while the results screen shows; resumed when the questions come back.
  return { serve, update };
}
