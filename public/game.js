import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

const GRID_SIZE = 21;
const CELL_SIZE = 8;
const HALF_GRID = (GRID_SIZE - 1) / 2;
const EYE_HEIGHT = 1.72;
const PLAYER_RADIUS = 0.52;
const WALK_SPEED = 3.35;
const SPRINT_SPEED = 6.6;
const MAX_STAMINA = 10;
const ENTITY_BASE_SPEED = 4.15;
const BASE_EXPOSURE = 1.28;
const BASE_FOG_DENSITY = 0.0115;
const MAX_STUN_SHOTS = 2;
const STUN_DURATION = 6;
const STUN_RANGE = 25;
const STUN_AIM_DOT = 0.72;

const root = document.getElementById('game-root');
const staminaFill = document.getElementById('stamina-fill');
const staminaSeconds = document.getElementById('stamina-seconds');
const staminaState = document.getElementById('stamina-state');
const progressFill = document.getElementById('progress-fill');
const progressPercent = document.getElementById('progress-percent');
const startOverlay = document.getElementById('start-overlay');
const pauseOverlay = document.getElementById('pause-overlay');
const endOverlay = document.getElementById('end-overlay');
const enterButton = document.getElementById('enter-button');
const resumeButton = document.getElementById('resume-button');
const pauseButton = document.getElementById('pause-button');
const restartButton = document.getElementById('restart-button');
const restartPauseButton = document.getElementById('restart-pause-button');
const logoutButton = document.getElementById('logout-button');
const userBadge = document.getElementById('user-badge');
const damageVignette = document.getElementById('damage-vignette');
const dangerMessage = document.getElementById('danger-message');
const crosshair = document.getElementById('crosshair');
const hud = document.getElementById('hud');
const endKicker = document.getElementById('end-kicker');
const endTitle = document.getElementById('end-title');
const endCopy = document.getElementById('end-copy');
const weaponHud = document.getElementById('weapon-hud');
const weaponShotsText = document.getElementById('weapon-shots');
const weaponStatusText = document.getElementById('weapon-status');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b171d);
scene.fog = new THREE.FogExp2(0x0c171c, BASE_FOG_DENSITY);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 450);
camera.rotation.order = 'YXZ';

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = BASE_EXPOSURE;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
root.appendChild(renderer.domElement);

const controls = new PointerLockControls(camera, renderer.domElement);
controls.pointerSpeed = 0.72;
scene.add(camera);

const flashlight = new THREE.SpotLight(0xe7e1c9, 94, 78, Math.PI / 4.8, 0.58, 1.2);
flashlight.position.set(0.2, -0.09, 0.1);
flashlight.target.position.set(0, -0.2, -10);
flashlight.castShadow = true;
flashlight.shadow.mapSize.set(512, 512);
flashlight.shadow.camera.near = 0.4;
flashlight.shadow.camera.far = 78;
camera.add(flashlight);
camera.add(flashlight.target);

// A gentle near-camera fill keeps the immediate path and the player's hands readable.
const playerFill = new THREE.PointLight(0xb9d0dc, 1.8, 15, 2);
playerFill.position.set(0, 0.15, 0.4);
camera.add(playerFill);

scene.add(new THREE.AmbientLight(0x61717a, 0.82));
scene.add(new THREE.HemisphereLight(0xb7cbd6, 0x3a2a22, 1.34));
const moonLight = new THREE.DirectionalLight(0xcbdff0, 1.95);
moonLight.position.set(-45, 80, 30);
moonLight.castShadow = false;
scene.add(moonLight);

const keys = new Set();
const cabinColliders = [];
const cabinCells = new Set();
const scratchMeshes = [];
const pathVector = new THREE.Vector3();
const forwardVector = new THREE.Vector3();
const rightVector = new THREE.Vector3();
const desiredMovement = new THREE.Vector3();
const tempMatrix = new THREE.Matrix4();
const tempObject = new THREE.Object3D();
const stunOrigin = new THREE.Vector3();
const stunTarget = new THREE.Vector3();
const stunDirection = new THREE.Vector3();
const beamUpAxis = new THREE.Vector3(0, 1, 0);
const beamEffects = [];

let maze;
let startCell;
let exitCell;
let distanceFromStart;
let distanceToExit;
let startToExitDistance = 1;
let entity;
let entityParts;
let entityPath = [];
let entityPathTimer = 0;
let elapsedRunTime = 0;
let stamina = MAX_STAMINA;
let exhausted = false;
let footstepTimer = 0;
let lastFrame = performance.now();
let fallElapsed = 0;
let deathElapsed = 0;
let dangerTextTimer = 0;
let started = false;
let paused = true;
let ended = false;
let falling = false;
let dying = false;
let cameraBaseY = EYE_HEIGHT;
let bobPhase = 0;
let previousEntityDistance = Infinity;
let stalkRelocationTimer = 3.8 + randomSeedDelay() * 0.55;
let roarTimer = 2.1 + randomSeedDelay() * 0.5;
let phraseTimer = 8.8 + randomSeedDelay() * 1.2;
let entityVoiceActive = false;
let lastWhisperLineIndex = -1;
let stunGunEquipped = false;
let stunShots = MAX_STUN_SHOTS;
let entityStunTimer = 0;
let entityStunEndsAt = 0;
let stunPausedAt = 0;
let weaponCooldownUntil = 0;

const MONSTER_WHISPERS = [
  { spoken: 'I see you', display: 'I  SEE  YOU' },
  { spoken: 'Do you know what happened to me?', display: 'DO YOU KNOW WHAT HAPPENED TO ME?' },
  { spoken: 'I am hungry', display: 'I  AM  HUNGRY' },
];

function randomSeedDelay() {
  return Math.random() * 6;
}

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const seedArray = new Uint32Array(1);
crypto.getRandomValues(seedArray);
const random = seededRandom(seedArray[0]);

function shuffle(items) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function generateMaze(size) {
  const grid = Array.from({ length: size }, () => Array(size).fill(1));
  const stack = [{ x: 1, y: 1 }];
  grid[1][1] = 0;
  const directions = [
    { x: 2, y: 0 },
    { x: -2, y: 0 },
    { x: 0, y: 2 },
    { x: 0, y: -2 },
  ];

  while (stack.length > 0) {
    const current = stack[stack.length - 1];
    const candidates = shuffle([...directions]).filter(({ x, y }) => {
      const nx = current.x + x;
      const ny = current.y + y;
      return nx > 0 && nx < size - 1 && ny > 0 && ny < size - 1 && grid[ny][nx] === 1;
    });

    if (candidates.length === 0) {
      stack.pop();
      continue;
    }

    const direction = candidates[0];
    const nx = current.x + direction.x;
    const ny = current.y + direction.y;
    grid[current.y + direction.y / 2][current.x + direction.x / 2] = 0;
    grid[ny][nx] = 0;
    stack.push({ x: nx, y: ny });
  }

  // A few loops defeat simple wall-following without making the layout easy.
  const loopCandidates = [];
  for (let y = 2; y < size - 2; y += 1) {
    for (let x = 2; x < size - 2; x += 1) {
      if (grid[y][x] !== 1) continue;
      const horizontal = grid[y][x - 1] === 0 && grid[y][x + 1] === 0;
      const vertical = grid[y - 1][x] === 0 && grid[y + 1][x] === 0;
      if (horizontal || vertical) loopCandidates.push({ x, y });
    }
  }
  shuffle(loopCandidates)
    .slice(0, Math.floor(size * 0.16))
    .forEach(({ x, y }) => {
      grid[y][x] = 0;
    });

  return grid;
}

function bfsDistances(grid, source) {
  const distances = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(-1));
  const queue = [source];
  let head = 0;
  distances[source.y][source.x] = 0;

  while (head < queue.length) {
    const current = queue[head++];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      if (nx < 0 || ny < 0 || nx >= GRID_SIZE || ny >= GRID_SIZE) continue;
      if (grid[ny][nx] === 1 || distances[ny][nx] !== -1) continue;
      distances[ny][nx] = distances[current.y][current.x] + 1;
      queue.push({ x: nx, y: ny });
    }
  }
  return distances;
}

function findCellPath(grid, source, destination) {
  const queue = [source];
  let head = 0;
  const previous = new Int32Array(GRID_SIZE * GRID_SIZE);
  previous.fill(-1);
  const sourceKey = source.y * GRID_SIZE + source.x;
  const destinationKey = destination.y * GRID_SIZE + destination.x;
  previous[sourceKey] = sourceKey;

  while (head < queue.length) {
    const current = queue[head++];
    if (current.x === destination.x && current.y === destination.y) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      if (grid[ny]?.[nx] !== 0) continue;
      const nextKey = ny * GRID_SIZE + nx;
      if (previous[nextKey] !== -1) continue;
      previous[nextKey] = current.y * GRID_SIZE + current.x;
      queue.push({ x: nx, y: ny });
    }
  }

  if (previous[destinationKey] === -1) return [source];
  const path = [];
  let cursor = destinationKey;
  while (cursor !== sourceKey) {
    path.push({ x: cursor % GRID_SIZE, y: Math.floor(cursor / GRID_SIZE) });
    cursor = previous[cursor];
  }
  path.push(source);
  path.reverse();
  return path;
}

function findFarthestCell(distances, exclusions = new Set()) {
  let best = { x: 1, y: 1, distance: -1 };
  for (let y = 1; y < GRID_SIZE - 1; y += 1) {
    for (let x = 1; x < GRID_SIZE - 1; x += 1) {
      const key = `${x},${y}`;
      if (!exclusions.has(key) && distances[y][x] > best.distance) {
        best = { x, y, distance: distances[y][x] };
      }
    }
  }
  return best;
}

function worldFromCell(cell) {
  return new THREE.Vector3(
    (cell.x - HALF_GRID) * CELL_SIZE,
    0,
    (cell.y - HALF_GRID) * CELL_SIZE,
  );
}

function cellFromWorld(x, z) {
  return {
    x: Math.round(x / CELL_SIZE + HALF_GRID),
    y: Math.round(z / CELL_SIZE + HALF_GRID),
  };
}

function openNeighborCount(x, y) {
  let count = 0;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (maze[y + dy]?.[x + dx] === 0) count += 1;
  }
  return count;
}

function createCanvasTexture(kind) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');

  if (kind === 'wood') {
    context.fillStyle = '#3a2418';
    context.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 42; i += 1) {
      const y = random() * 128;
      context.strokeStyle = `rgba(${55 + Math.floor(random() * 35)}, ${27 + Math.floor(random() * 18)}, 15, ${0.16 + random() * 0.26})`;
      context.lineWidth = 1 + random() * 2;
      context.beginPath();
      context.moveTo(0, y);
      context.bezierCurveTo(32, y + random() * 8 - 4, 92, y + random() * 8 - 4, 128, y + random() * 5 - 2);
      context.stroke();
    }
    for (let x = 0; x < 128; x += 32) {
      context.fillStyle = 'rgba(8,4,2,.28)';
      context.fillRect(x, 0, 2, 128);
    }
  } else if (kind === 'ground') {
    context.fillStyle = '#4b4439';
    context.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 1800; i += 1) {
      const shade = 70 + Math.floor(random() * 38);
      context.fillStyle = `rgba(${shade},${Math.max(48, shade - 12)},${Math.max(38, shade - 22)},${0.14 + random() * 0.24})`;
      const size = 1 + random() * 2;
      context.fillRect(random() * 128, random() * 128, size, size);
    }
  } else {
    context.fillStyle = '#5a5852';
    context.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 750; i += 1) {
      const shade = 74 + Math.floor(random() * 48);
      context.fillStyle = `rgba(${shade},${shade - 2},${Math.max(52, shade - 8)},${0.08 + random() * 0.22})`;
      context.fillRect(random() * 128, random() * 128, 1 + random() * 3, 1 + random() * 3);
    }
    for (let i = 0; i < 8; i += 1) {
      context.strokeStyle = 'rgba(0,0,0,.28)';
      context.beginPath();
      context.moveTo(random() * 128, 0);
      context.lineTo(random() * 128, 128);
      context.stroke();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}

const woodTexture = createCanvasTexture('wood');
const groundTexture = createCanvasTexture('ground');
const wallTexture = createCanvasTexture('wall');
woodTexture.repeat.set(2, 1);
groundTexture.repeat.set(2, 2);
wallTexture.repeat.set(1.4, 1.4);

const wallMaterial = new THREE.MeshStandardMaterial({
  map: wallTexture,
  color: 0xa39c8f,
  emissive: 0x211d18,
  emissiveIntensity: 0.3,
  roughness: 1,
  metalness: 0,
});
const outerWallMaterial = new THREE.MeshStandardMaterial({
  map: wallTexture,
  color: 0x6f6a61,
  emissive: 0x171411,
  emissiveIntensity: 0.25,
  roughness: 1,
});
const groundMaterial = new THREE.MeshStandardMaterial({
  map: groundTexture,
  color: 0x8d806b,
  emissive: 0x2a2118,
  emissiveIntensity: 0.28,
  roughness: 1,
});
const woodMaterial = new THREE.MeshStandardMaterial({
  map: woodTexture,
  color: 0xa77b5b,
  emissive: 0x21140d,
  emissiveIntensity: 0.22,
  roughness: 0.96,
});
const darkWoodMaterial = new THREE.MeshStandardMaterial({
  map: woodTexture,
  color: 0x4e392d,
  emissive: 0x100b08,
  emissiveIntensity: 0.2,
  roughness: 1,
});
const roofMaterial = new THREE.MeshStandardMaterial({
  color: 0x302b29,
  emissive: 0x0d0b0a,
  emissiveIntensity: 0.22,
  roughness: 1,
  side: THREE.DoubleSide,
});
const interiorMaterial = new THREE.MeshStandardMaterial({
  color: 0x584a40,
  emissive: 0x17110d,
  emissiveIntensity: 0.24,
  roughness: 1,
});
const cabinWindowMaterial = new THREE.MeshStandardMaterial({
  color: 0x8b3c1e,
  emissive: 0xff7a2f,
  emissiveIntensity: 3.2,
  roughness: 0.5,
  side: THREE.DoubleSide,
});

function buildFirstPersonView() {
  const group = new THREE.Group();
  group.name = 'first-person-hands';

  const sleeveMaterial = new THREE.MeshStandardMaterial({
    color: 0x252c30,
    emissive: 0x080a0b,
    emissiveIntensity: 0.45,
    roughness: 0.92,
    depthTest: false,
    depthWrite: false,
  });
  const handMaterial = new THREE.MeshStandardMaterial({
    color: 0x765448,
    emissive: 0x100805,
    emissiveIntensity: 0.18,
    roughness: 0.9,
    depthTest: false,
    depthWrite: false,
  });
  const flashlightBodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x3d4447,
    metalness: 0.65,
    roughness: 0.35,
    emissive: 0x090b0c,
    emissiveIntensity: 0.4,
    depthTest: false,
    depthWrite: false,
  });
  const flashlightLensMaterial = new THREE.MeshBasicMaterial({
    color: 0xffefbb,
    depthTest: false,
    depthWrite: false,
  });

  const leftForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.075, 0.44, 10), sleeveMaterial);
  leftForearm.position.set(-0.18, -0.43, -0.5);
  leftForearm.rotation.set(1.05, 0, -0.2);
  group.add(leftForearm);

  const leftHand = new THREE.Mesh(new THREE.CapsuleGeometry(0.058, 0.11, 4, 10), handMaterial);
  leftHand.rotation.set(Math.PI / 2, 0, 0.22);
  leftHand.position.set(-0.12, -0.36, -0.69);
  group.add(leftHand);

  const rightForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.075, 0.46, 10), sleeveMaterial);
  rightForearm.position.set(0.25, -0.42, -0.46);
  rightForearm.rotation.set(1.1, 0, 0.2);
  group.add(rightForearm);

  const rightHand = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.12, 4, 10), handMaterial);
  rightHand.rotation.set(Math.PI / 2, 0, -0.05);
  rightHand.position.set(0.23, -0.34, -0.62);
  group.add(rightHand);

  const flashlightBody = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.32, 14), flashlightBodyMaterial);
  flashlightBody.rotation.x = Math.PI / 2;
  flashlightBody.position.set(0.255, -0.3, -0.72);
  group.add(flashlightBody);

  const flashlightHead = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.056, 0.09, 14), flashlightBodyMaterial);
  flashlightHead.rotation.x = Math.PI / 2;
  flashlightHead.position.set(0.255, -0.3, -0.92);
  group.add(flashlightHead);

  const flashlightLens = new THREE.Mesh(new THREE.CircleGeometry(0.058, 18), flashlightLensMaterial);
  flashlightLens.position.set(0.255, -0.3, -0.969);
  group.add(flashlightLens);

  group.traverse((object) => {
    if (!object.isMesh) return;
    object.frustumCulled = false;
    object.renderOrder = 1000;
  });
  camera.add(group);
  return group;
}

const firstPersonView = buildFirstPersonView();


function buildStunGunView(parent) {
  const group = new THREE.Group();
  group.name = 'stun-gun-view';
  group.position.set(-0.02, -0.34, -0.71);
  group.rotation.set(-0.03, -0.03, 0.015);

  const gunMaterial = new THREE.MeshStandardMaterial({
    color: 0x1d2930,
    metalness: 0.68,
    roughness: 0.26,
    emissive: 0x031019,
    emissiveIntensity: 0.7,
    depthTest: false,
    depthWrite: false,
  });
  const gripMaterial = new THREE.MeshStandardMaterial({
    color: 0x0d1114,
    metalness: 0.25,
    roughness: 0.72,
    depthTest: false,
    depthWrite: false,
  });
  const blueMaterial = new THREE.MeshBasicMaterial({
    color: 0x60d8ff,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
  });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.5), gunMaterial);
  body.position.set(0, 0, -0.12);
  group.add(body);

  const upperRail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.055, 0.42), gunMaterial);
  upperRail.position.set(0, 0.105, -0.12);
  group.add(upperRail);

  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.31, 0.14), gripMaterial);
  grip.position.set(0, -0.2, 0.03);
  grip.rotation.x = -0.2;
  group.add(grip);

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.072, 0.22, 12), gunMaterial);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0, -0.47);
  group.add(barrel);

  const emitter = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.014, 7, 18), blueMaterial);
  emitter.rotation.x = Math.PI / 2;
  emitter.position.set(0, 0, -0.59);
  group.add(emitter);

  const chargeCellLeft = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.07, 0.16), blueMaterial.clone());
  const chargeCellRight = chargeCellLeft.clone();
  chargeCellLeft.position.set(-0.075, 0.015, -0.05);
  chargeCellRight.position.set(0.075, 0.015, -0.05);
  group.add(chargeCellLeft, chargeCellRight);

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0, -0.63);
  group.add(muzzle);

  group.traverse((object) => {
    if (!object.isMesh) return;
    object.frustumCulled = false;
    object.renderOrder = 1002;
  });

  group.userData = {
    muzzle,
    emitter,
    chargeCells: [chargeCellLeft, chargeCellRight],
  };
  group.visible = false;
  parent.add(group);
  return group;
}

const stunGunView = buildStunGunView(firstPersonView);

function buildMazeMeshes() {
  const innerWalls = [];
  const outerWalls = [];
  const floorCells = [];

  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      const isOuter = x === 0 || y === 0 || x === GRID_SIZE - 1 || y === GRID_SIZE - 1;
      if (maze[y][x] === 1) {
        (isOuter ? outerWalls : innerWalls).push({ x, y });
      } else if (!(x === exitCell.x && y === exitCell.y)) {
        floorCells.push({ x, y });
      }
    }
  }

  const innerGeometry = new THREE.BoxGeometry(CELL_SIZE, 4.9, CELL_SIZE);
  const innerMesh = new THREE.InstancedMesh(innerGeometry, wallMaterial, innerWalls.length);
  innerMesh.receiveShadow = true;
  innerWalls.forEach((cell, index) => {
    const world = worldFromCell(cell);
    tempObject.position.set(world.x, 2.42, world.z);
    tempObject.rotation.set(0, 0, 0);
    tempObject.scale.set(1, 1, 1);
    tempObject.updateMatrix();
    innerMesh.setMatrixAt(index, tempObject.matrix);
  });
  scene.add(innerMesh);

  const outerGeometry = new THREE.BoxGeometry(CELL_SIZE, 11, CELL_SIZE);
  const outerMesh = new THREE.InstancedMesh(outerGeometry, outerWallMaterial, outerWalls.length);
  outerMesh.receiveShadow = true;
  outerWalls.forEach((cell, index) => {
    const world = worldFromCell(cell);
    tempObject.position.set(world.x, 5.48, world.z);
    tempObject.rotation.set(0, 0, 0);
    tempObject.scale.set(1, 1, 1);
    tempObject.updateMatrix();
    outerMesh.setMatrixAt(index, tempObject.matrix);
  });
  scene.add(outerMesh);

  const floorGeometry = new THREE.BoxGeometry(CELL_SIZE, 0.24, CELL_SIZE);
  const floorMesh = new THREE.InstancedMesh(floorGeometry, groundMaterial, floorCells.length);
  floorMesh.receiveShadow = true;
  floorCells.forEach((cell, index) => {
    const world = worldFromCell(cell);
    tempObject.position.set(world.x, -0.16, world.z);
    tempObject.rotation.set(0, 0, 0);
    tempObject.scale.set(1, 1, 1);
    tempObject.updateMatrix();
    floorMesh.setMatrixAt(index, tempObject.matrix);
  });
  scene.add(floorMesh);
}

function rotatedAabb(cx, cz, lx, lz, width, depth, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const points = [
    [-width / 2, -depth / 2],
    [width / 2, -depth / 2],
    [width / 2, depth / 2],
    [-width / 2, depth / 2],
  ].map(([x, z]) => {
    const localX = lx + x;
    const localZ = lz + z;
    return {
      x: cx + localX * cos + localZ * sin,
      z: cz - localX * sin + localZ * cos,
    };
  });
  return {
    minX: Math.min(...points.map((point) => point.x)),
    maxX: Math.max(...points.map((point) => point.x)),
    minZ: Math.min(...points.map((point) => point.z)),
    maxZ: Math.max(...points.map((point) => point.z)),
  };
}

function buildCabin(cell, doorDirection, lightIndex) {
  const center = worldFromCell(cell);
  const cabin = new THREE.Group();
  cabin.position.set(center.x, 0, center.z);
  const angle = Math.atan2(-doorDirection.x, -doorDirection.y);
  cabin.rotation.y = angle;
  scene.add(cabin);

  const width = 6.5;
  const depth = 6.5;
  const height = 3.25;
  const thickness = 0.22;
  const doorWidth = 1.55;
  const doorHeight = 2.28;

  function addWall(localX, localY, localZ, wallWidth, wallHeight, wallDepth, material = woodMaterial, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(wallWidth, wallHeight, wallDepth), material);
    mesh.position.set(localX, localY, localZ);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    cabin.add(mesh);
    if (collide) {
      cabinColliders.push(rotatedAabb(center.x, center.z, localX, localZ, wallWidth, wallDepth, angle));
    }
    return mesh;
  }

  addWall(0, height / 2, depth / 2, width, height, thickness);
  addWall(-width / 2, height / 2, 0, thickness, height, depth);
  addWall(width / 2, height / 2, 0, thickness, height, depth);

  const frontSegment = (width - doorWidth) / 2;
  addWall(-(doorWidth / 2 + frontSegment / 2), height / 2, -depth / 2, frontSegment, height, thickness);
  addWall(doorWidth / 2 + frontSegment / 2, height / 2, -depth / 2, frontSegment, height, thickness);
  addWall(0, doorHeight + (height - doorHeight) / 2, -depth / 2, doorWidth, height - doorHeight, thickness);

  const floor = new THREE.Mesh(new THREE.BoxGeometry(width - 0.25, 0.16, depth - 0.25), interiorMaterial);
  floor.position.y = 0.03;
  floor.receiveShadow = true;
  cabin.add(floor);

  const roof = new THREE.Mesh(new THREE.ConeGeometry(4.85, 2.15, 4), roofMaterial);
  roof.position.y = height + 0.92;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  cabin.add(roof);

  const cot = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.42, 1.15), darkWoodMaterial);
  cot.position.set(-1.35, 0.4, 1.65);
  cot.castShadow = true;
  cabin.add(cot);

  const table = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.9, 1.1), darkWoodMaterial);
  table.position.set(1.75, 0.48, 1.4);
  table.castShadow = true;
  cabin.add(table);

  // Emissive windows make cabins visible landmarks without revealing the maze layout.
  const rearWindow = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 0.72), cabinWindowMaterial);
  rearWindow.position.set(0.65, 1.65, depth / 2 + 0.121);
  cabin.add(rearWindow);

  const sideWindow = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 0.72), cabinWindowMaterial);
  sideWindow.position.set(width / 2 + 0.121, 1.62, 0.55);
  sideWindow.rotation.y = Math.PI / 2;
  cabin.add(sideWindow);

  if (lightIndex < 8) {
    const interiorGlow = new THREE.PointLight(0xff9a53, 2.7, 11, 2);
    interiorGlow.position.set(0, 1.85, 0.1);
    cabin.add(interiorGlow);
  }

  const lanternMaterial = new THREE.MeshStandardMaterial({
    color: 0x3a1b10,
    emissive: 0xd46b27,
    emissiveIntensity: lightIndex % 3 === 0 ? 5.2 : 3.1,
  });
  const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), lanternMaterial);
  lantern.position.set(0, 2.12, -depth / 2 - 0.14);
  cabin.add(lantern);

  const markCanvas = document.createElement('canvas');
  markCanvas.width = 256;
  markCanvas.height = 128;
  const markContext = markCanvas.getContext('2d');
  markContext.clearRect(0, 0, 256, 128);
  markContext.strokeStyle = 'rgba(115,0,0,.76)';
  markContext.lineWidth = 8;
  markContext.lineCap = 'round';
  markContext.beginPath();
  markContext.moveTo(35, 105);
  markContext.lineTo(65, 20);
  markContext.lineTo(95, 105);
  markContext.moveTo(52, 66);
  markContext.lineTo(82, 66);
  markContext.stroke();
  const markTexture = new THREE.CanvasTexture(markCanvas);
  const mark = new THREE.Mesh(
    new THREE.PlaneGeometry(1.2, 0.6),
    new THREE.MeshBasicMaterial({ map: markTexture, transparent: true, depthWrite: false }),
  );
  mark.position.set((random() - 0.5) * 2.5, 1.5, depth / 2 + 0.121);
  mark.rotation.y = Math.PI;
  cabin.add(mark);
  scratchMeshes.push(mark);
}

function placeCabins() {
  const deadEnds = [];
  for (let y = 1; y < GRID_SIZE - 1; y += 1) {
    for (let x = 1; x < GRID_SIZE - 1; x += 1) {
      if (maze[y][x] !== 0 || openNeighborCount(x, y) !== 1) continue;
      const distance = distanceFromStart[y][x];
      if (distance < 13) continue;
      if (Math.abs(x - exitCell.x) + Math.abs(y - exitCell.y) < 7) continue;
      deadEnds.push({ x, y, distance });
    }
  }

  deadEnds.sort((a, b) => b.distance - a.distance);
  const selected = [];
  for (const candidate of deadEnds) {
    if (selected.length >= 15) break;
    const tooClose = selected.some((existing) => Math.abs(existing.x - candidate.x) + Math.abs(existing.y - candidate.y) < 7);
    if (!tooClose) selected.push(candidate);
  }

  selected.forEach((cell, index) => {
    let doorDirection = { x: 0, y: -1 };
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (maze[cell.y + dy][cell.x + dx] === 0) {
        doorDirection = { x: dx, y: dy };
        break;
      }
    }
    cabinCells.add(`${cell.x},${cell.y}`);
    buildCabin(cell, doorDirection, index);
  });
}

function createArrowShapeGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(-1.05, -0.18);
  shape.lineTo(0.25, -0.18);
  shape.lineTo(0.25, -0.48);
  shape.lineTo(1.12, 0);
  shape.lineTo(0.25, 0.48);
  shape.lineTo(0.25, 0.18);
  shape.lineTo(-1.05, 0.18);
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

function buildExitRouteArrows() {
  const route = findCellPath(maze, startCell, exitCell);
  if (route.length < 2) return;

  const arrowGeometry = createArrowShapeGeometry();
  const arrowMaterial = new THREE.MeshBasicMaterial({
    color: 0xff1b13,
    transparent: true,
    opacity: 0.92,
    side: THREE.DoubleSide,
    depthWrite: false,
    toneMapped: false,
  });
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: 0x8e0000,
    transparent: true,
    opacity: 0.24,
    side: THREE.DoubleSide,
    depthWrite: false,
    toneMapped: false,
  });

  const arrowGroup = new THREE.Group();
  arrowGroup.name = 'exit-route-arrows';
  let placed = 0;

  for (let index = 2; index < route.length - 1; index += 1) {
    const previous = route[index - 1];
    const current = route[index];
    const next = route[index + 1];
    const direction = { x: next.x - current.x, y: next.y - current.y };
    const priorDirection = { x: current.x - previous.x, y: current.y - previous.y };
    const isTurn = direction.x !== priorDirection.x || direction.y !== priorDirection.y;
    if (!isTurn && index % 2 !== 0) continue;

    const sideCandidates = [
      { x: -direction.y, y: direction.x },
      { x: direction.y, y: -direction.x },
    ];
    if (random() < 0.5) sideCandidates.reverse();

    const wallSide = sideCandidates.find((side) => maze[current.y + side.y]?.[current.x + side.x] === 1);
    if (!wallSide) continue;

    const wallCell = { x: current.x + wallSide.x, y: current.y + wallSide.y };
    const wallWorld = worldFromCell(wallCell);
    const normal = new THREE.Vector3(-wallSide.x, 0, -wallSide.y);
    const routeDirection = new THREE.Vector3(direction.x, 0, direction.y).normalize();
    const rotationY = Math.atan2(normal.x, normal.z);
    const localRight = new THREE.Vector3(Math.cos(rotationY), 0, -Math.sin(rotationY));
    const pointsRight = routeDirection.dot(localRight) >= 0;

    const mount = new THREE.Group();
    mount.position.set(
      wallWorld.x + normal.x * (CELL_SIZE / 2 + 0.035),
      2.15 + (random() - 0.5) * 0.38,
      wallWorld.z + normal.z * (CELL_SIZE / 2 + 0.035),
    );
    mount.rotation.y = rotationY;

    const glow = new THREE.Mesh(arrowGeometry, glowMaterial);
    glow.scale.set(1.25, 1.35, 1);
    glow.position.z = 0.004;
    glow.rotation.z = (pointsRight ? 0 : Math.PI) + (random() - 0.5) * 0.08;
    mount.add(glow);

    const arrow = new THREE.Mesh(arrowGeometry, arrowMaterial);
    arrow.scale.set(0.98 + random() * 0.12, 0.92 + random() * 0.1, 1);
    arrow.position.z = 0.012;
    arrow.rotation.z = (pointsRight ? 0 : Math.PI) + (random() - 0.5) * 0.06;
    arrow.renderOrder = 8;
    mount.add(arrow);

    // Uneven drips make the arrows look painted rather than like clean UI markers.
    for (let dripIndex = 0; dripIndex < 2; dripIndex += 1) {
      const drip = new THREE.Mesh(
        new THREE.PlaneGeometry(0.045 + random() * 0.035, 0.18 + random() * 0.28),
        arrowMaterial,
      );
      drip.position.set(-0.35 + random() * 0.7, -0.3 - random() * 0.12, 0.014);
      drip.renderOrder = 8;
      mount.add(drip);
    }

    arrowGroup.add(mount);
    placed += 1;
  }

  arrowGroup.userData.arrowCount = placed;
  root.dataset.routeArrows = String(placed);
  scene.add(arrowGroup);
}

function buildExit() {
  const position = worldFromCell(exitCell);
  const abyssMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
  const abyss = new THREE.Mesh(new THREE.CylinderGeometry(3.35, 3.8, 10, 40, 1, true), abyssMaterial);
  abyss.position.set(position.x, -4.9, position.z);
  scene.add(abyss);

  const darkness = new THREE.Mesh(
    new THREE.CircleGeometry(3.35, 48),
    new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide }),
  );
  darkness.position.set(position.x, -0.04, position.z);
  darkness.rotation.x = -Math.PI / 2;
  scene.add(darkness);

  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(3.38, 0.12, 8, 48),
    new THREE.MeshStandardMaterial({ color: 0x0f0f0f, emissive: 0x1b0000, emissiveIntensity: 1.7, roughness: 1 }),
  );
  rim.position.set(position.x, 0.03, position.z);
  rim.rotation.x = Math.PI / 2;
  scene.add(rim);

  const particleGeometry = new THREE.BufferGeometry();
  const particleCount = 70;
  const positions = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount; i += 1) {
    const radius = random() * 3.2;
    const angle = random() * Math.PI * 2;
    positions[i * 3] = position.x + Math.cos(angle) * radius;
    positions[i * 3 + 1] = 0.15 + random() * 2.8;
    positions[i * 3 + 2] = position.z + Math.sin(angle) * radius;
  }
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const particles = new THREE.Points(
    particleGeometry,
    new THREE.PointsMaterial({ color: 0x4e1118, size: 0.07, transparent: true, opacity: 0.55 }),
  );
  particles.userData.isExitParticles = true;
  scene.add(particles);
}

function makeEntity() {
  const group = new THREE.Group();
  const silhouetteMaterial = new THREE.MeshStandardMaterial({
    color: 0x050607,
    emissive: 0x000000,
    roughness: 0.95,
    metalness: 0.02,
  });
  const faceMaterial = new THREE.MeshStandardMaterial({
    color: 0x8a735f,
    roughness: 0.88,
    emissive: 0x120904,
    emissiveIntensity: 0.18,
  });
  const boneMaterial = new THREE.MeshStandardMaterial({ color: 0xd7ccc0, roughness: 0.5, metalness: 0.02 });
  const eyeSocketMaterial = new THREE.MeshStandardMaterial({ color: 0x010101, roughness: 1 });
  const pupilMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf2f2f2, emissiveIntensity: 1.25 });
  const clawMaterial = new THREE.MeshStandardMaterial({ color: 0x090909, roughness: 0.55, metalness: 0.05 });
  const mouthMaterial = new THREE.MeshStandardMaterial({ color: 0x090203, roughness: 1 });

  group.position.y = 0.04;

  const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.72, 0.7), silhouetteMaterial);
  pelvis.position.set(0, 3.05, 0.22);
  pelvis.rotation.z = -0.08;
  group.add(pelvis);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.46, 3.1, 6, 10), silhouetteMaterial);
  torso.scale.set(0.9, 1.22, 0.62);
  torso.position.set(0, 5.05, -0.12);
  torso.rotation.z = -0.26;
  torso.rotation.x = 0.08;
  group.add(torso);

  const shoulderArch = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.42, 0.5), silhouetteMaterial);
  shoulderArch.position.set(0.12, 6.18, -0.18);
  shoulderArch.rotation.z = -0.18;
  group.add(shoulderArch);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.28, 2.8, 8), silhouetteMaterial);
  neck.position.set(0.36, 7.22, 0.08);
  neck.rotation.z = -1.05;
  neck.rotation.x = 0.14;
  group.add(neck);

  const headPivot = new THREE.Group();
  headPivot.position.set(1.48, 8.02, 0.1);
  group.add(headPivot);

  const headBack = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1.65, 4, 9), silhouetteMaterial);
  headBack.rotation.z = 0.08;
  headBack.rotation.x = 0.14;
  headBack.scale.set(0.76, 1.08, 0.72);
  headPivot.add(headBack);

  const face = new THREE.Mesh(new THREE.SphereGeometry(0.48, 16, 12), faceMaterial);
  face.position.set(0.02, -0.06, 0.42);
  face.scale.set(0.9, 0.78, 0.42);
  headPivot.add(face);

  const snout = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.68, 9), silhouetteMaterial);
  snout.rotation.x = Math.PI / 2;
  snout.position.set(0, -0.18, 0.63);
  headPivot.add(snout);

  const jawPivot = new THREE.Group();
  jawPivot.position.set(0.02, -0.16, 0.34);
  headPivot.add(jawPivot);
  jawPivot.rotation.x = -0.14;
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.8), mouthMaterial);
  jaw.position.set(0, -0.02, 0.28);
  jawPivot.add(jaw);

  const eyes = [];
  const pupils = [];
  for (const x of [-0.12, 0.12]) {
    const socket = new THREE.Mesh(new THREE.SphereGeometry(0.105, 10, 8), eyeSocketMaterial);
    socket.position.set(x, 0.01, 0.48);
    socket.scale.set(0.8, 1.1, 0.42);
    headPivot.add(socket);
    eyes.push(socket);

    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), pupilMaterial);
    pupil.position.set(x, 0.015, 0.56);
    headPivot.add(pupil);
    pupils.push(pupil);
  }

  const upperTeeth = [];
  const lowerTeeth = [];
  [-0.16, -0.08, 0, 0.08, 0.16].forEach((x, index) => {
    const height = index === 0 || index === 4 ? 0.26 : 0.15 + Math.abs(index - 2) * 0.03;
    const upper = new THREE.Mesh(new THREE.ConeGeometry(0.035, height, 6), boneMaterial);
    upper.rotation.x = Math.PI;
    upper.position.set(x, -0.18, 0.55);
    headPivot.add(upper);
    upperTeeth.push(upper);

    const lower = new THREE.Mesh(new THREE.ConeGeometry(0.03, height * 0.8, 6), boneMaterial);
    lower.position.set(x, 0.02, 0.48);
    jawPivot.add(lower);
    lowerTeeth.push(lower);
  });

  const earRoots = [];
  for (const side of [-1, 1]) {
    const earRoot = new THREE.Group();
    earRoot.position.set(side * 0.18, 0.43, 0.04);
    headPivot.add(earRoot);
    const ear = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.085, 1.78, 7), silhouetteMaterial);
    ear.position.y = 0.84;
    earRoot.add(ear);
    const earTip = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), silhouetteMaterial);
    earTip.position.y = 1.7;
    earRoot.add(earTip);
    earRoot.rotation.z = side * (0.34 + random() * 0.08);
    earRoot.rotation.x = side * 0.04;
    earRoots.push(earRoot);
  }

  function createArm(x) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 6.08, -0.04);
    group.add(pivot);

    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 2.45, 7), silhouetteMaterial);
    upper.position.y = -1.2;
    pivot.add(upper);

    const lowerPivot = new THREE.Group();
    lowerPivot.position.y = -2.32;
    pivot.add(lowerPivot);
    const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 2.22, 7), silhouetteMaterial);
    lower.position.y = -1.12;
    lowerPivot.add(lower);

    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.44), silhouetteMaterial);
    hand.position.set(0, -2.2, 0.02);
    lowerPivot.add(hand);

    const claws = [];
    for (const clawX of [-0.08, 0, 0.08]) {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.42, 6), clawMaterial);
      claw.rotation.x = Math.PI / 2;
      claw.position.set(clawX, -2.22, 0.3);
      lowerPivot.add(claw);
      claws.push(claw);
    }

    pivot.rotation.z = x < 0 ? 0.14 : -0.14;
    return { pivot, lowerPivot, claws };
  }

  function createLeg(x) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 3.05, 0.18);
    group.add(pivot);

    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 2.3, 8), silhouetteMaterial);
    upper.position.y = -1.15;
    pivot.add(upper);

    const knee = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), faceMaterial);
    knee.position.y = -2.28;
    pivot.add(knee);

    const lowerPivot = new THREE.Group();
    lowerPivot.position.y = -2.25;
    pivot.add(lowerPivot);
    const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 2.35, 8), silhouetteMaterial);
    lower.position.y = -1.16;
    lowerPivot.add(lower);

    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.18, 0.8), silhouetteMaterial);
    foot.position.set(0, -2.28, 0.18);
    lowerPivot.add(foot);

    const claws = [];
    for (const clawX of [-0.1, 0, 0.1]) {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.28, 6), clawMaterial);
      claw.rotation.x = Math.PI / 2;
      claw.position.set(clawX, -2.28, 0.62);
      lowerPivot.add(claw);
      claws.push(claw);
    }

    return { pivot, lowerPivot, foot, claws };
  }

  const leftArm = createArm(-0.5);
  const rightArm = createArm(0.58);
  const leftLeg = createLeg(-0.28);
  const rightLeg = createLeg(0.28);

  group.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  const aura = new THREE.PointLight(0x2d0000, 2.4, 9, 2);
  aura.position.set(1.2, 7.5, 0.4);
  group.add(aura);

  const electricField = new THREE.Group();
  electricField.visible = false;
  group.add(electricField);
  const electricLines = [];
  for (let arcIndex = 0; arcIndex < 9; arcIndex += 1) {
    const arcGeometry = new THREE.BufferGeometry();
    arcGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(15), 3));
    const arcMaterial = new THREE.LineBasicMaterial({
      color: arcIndex % 2 === 0 ? 0x72e6ff : 0x237dff,
      transparent: true,
      opacity: 0.82,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const arc = new THREE.Line(arcGeometry, arcMaterial);
    arc.frustumCulled = false;
    electricField.add(arc);
    electricLines.push(arc);
  }
  const stunLight = new THREE.PointLight(0x33aaff, 0, 13, 2);
  stunLight.position.set(0.4, 5.2, 0);
  group.add(stunLight);

  scene.add(group);
  return {
    group,
    torso,
    headPivot,
    jawPivot,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    eyes,
    pupils,
    upperTeeth,
    lowerTeeth,
    earRoots,
    redAura: aura,
    electricField,
    electricLines,
    stunLight,
  };
}

function nearestOpenCell(position) {
  const initial = cellFromWorld(position.x, position.z);
  if (maze[initial.y]?.[initial.x] === 0) return initial;
  for (let radius = 1; radius <= 4; radius += 1) {
    for (let y = initial.y - radius; y <= initial.y + radius; y += 1) {
      for (let x = initial.x - radius; x <= initial.x + radius; x += 1) {
        if (maze[y]?.[x] === 0) return { x, y };
      }
    }
  }
  return startCell;
}

function findPath(fromPosition, toPosition) {
  const source = nearestOpenCell(fromPosition);
  const destination = nearestOpenCell(toPosition);
  const sourceKey = source.y * GRID_SIZE + source.x;
  const destinationKey = destination.y * GRID_SIZE + destination.x;
  if (sourceKey === destinationKey) return [destination];

  const queue = [source];
  let head = 0;
  const previous = new Int32Array(GRID_SIZE * GRID_SIZE);
  previous.fill(-1);
  previous[sourceKey] = sourceKey;

  while (head < queue.length) {
    const current = queue[head++];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      if (maze[ny]?.[nx] !== 0) continue;
      const nextKey = ny * GRID_SIZE + nx;
      if (previous[nextKey] !== -1) continue;
      previous[nextKey] = current.y * GRID_SIZE + current.x;
      if (nextKey === destinationKey) {
        const path = [{ x: nx, y: ny }];
        let cursor = previous[nextKey];
        while (cursor !== sourceKey) {
          path.push({ x: cursor % GRID_SIZE, y: Math.floor(cursor / GRID_SIZE) });
          cursor = previous[cursor];
        }
        path.push(source);
        path.reverse();
        return path;
      }
      queue.push({ x: nx, y: ny });
    }
  }
  return [source];
}

function chooseStalkCell() {
  const playerCell = nearestOpenCell(camera.position);
  const playerDistances = bfsDistances(maze, playerCell);
  camera.getWorldDirection(forwardVector);
  forwardVector.y = 0;
  if (forwardVector.lengthSq() < 0.001) forwardVector.set(0, 0, -1);
  forwardVector.normalize();

  const candidates = [];
  for (let y = 1; y < GRID_SIZE - 1; y += 1) {
    for (let x = 1; x < GRID_SIZE - 1; x += 1) {
      if (maze[y][x] !== 0 || cabinCells.has(`${x},${y}`)) continue;
      if (x === exitCell.x && y === exitCell.y) continue;
      const pathDistance = playerDistances[y][x];
      if (pathDistance < 4 || pathDistance > 8) continue;
      const world = worldFromCell({ x, y });
      const toCandidate = world.clone().sub(camera.position).setY(0);
      const worldDistance = toCandidate.length();
      if (worldDistance < 18 || worldDistance > 54) continue;
      toCandidate.normalize();
      const facing = forwardVector.dot(toCandidate);
      // Favor corridor-end reveals in front or to the side, not an instant spawn at the player's back.
      if (facing < -0.32 || facing > 0.97) continue;
      candidates.push({ x, y, score: facing + random() * 0.85 });
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[Math.floor(random() * Math.min(6, candidates.length))];
}

function relocateEntityForStalk() {
  const distance = Math.hypot(
    entityParts.group.position.x - camera.position.x,
    entityParts.group.position.z - camera.position.z,
  );
  if (distance < 16) return false;
  const cell = chooseStalkCell();
  if (!cell) return false;
  const position = worldFromCell(cell);
  entityParts.group.position.set(position.x, 0, position.z);
  entityPath = [];
  entityPathTimer = 0;
  previousEntityDistance = Math.hypot(position.x - camera.position.x, position.z - camera.position.z);
  audio.roar(0.84);
  showDanger('THE TIMBER FIGURE IS MOVING AGAIN.', 2.4);
  return true;
}

function circleIntersectsAabb(x, z, radius, aabb) {
  const closestX = Math.max(aabb.minX, Math.min(x, aabb.maxX));
  const closestZ = Math.max(aabb.minZ, Math.min(z, aabb.maxZ));
  const dx = x - closestX;
  const dz = z - closestZ;
  return dx * dx + dz * dz < radius * radius;
}

function isWalkable(x, z, radius = PLAYER_RADIUS) {
  const currentCell = cellFromWorld(x, z);
  for (let gy = currentCell.y - 2; gy <= currentCell.y + 2; gy += 1) {
    for (let gx = currentCell.x - 2; gx <= currentCell.x + 2; gx += 1) {
      if (maze[gy]?.[gx] !== 1) continue;
      const center = worldFromCell({ x: gx, y: gy });
      const wallAabb = {
        minX: center.x - CELL_SIZE / 2,
        maxX: center.x + CELL_SIZE / 2,
        minZ: center.z - CELL_SIZE / 2,
        maxZ: center.z + CELL_SIZE / 2,
      };
      if (circleIntersectsAabb(x, z, radius, wallAabb)) return false;
    }
  }
  for (const collider of cabinColliders) {
    if (circleIntersectsAabb(x, z, radius, collider)) return false;
  }
  return true;
}

function movePlayer(deltaX, deltaZ) {
  const nextX = camera.position.x + deltaX;
  if (isWalkable(nextX, camera.position.z)) camera.position.x = nextX;
  const nextZ = camera.position.z + deltaZ;
  if (isWalkable(camera.position.x, nextZ)) camera.position.z = nextZ;
}

class ProceduralAudio {
  constructor() {
    this.context = null;
    this.master = null;
    this.musicBus = null;
    this.heartbeatTimer = 0;
    this.screechCooldown = 0;
    this.musicTimer = 0.8;
    this.lastVoiceAt = 0;
    this.cachedVoice = null;
    this.voiceListenerAttached = false;
  }

  async start() {
    if (!this.context) {
      this.context = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.context.createGain();
      this.master.gain.value = 0.48;
      this.master.connect(this.context.destination);

      this.musicBus = this.context.createGain();
      this.musicBus.gain.value = 0.23;
      this.musicBus.connect(this.master);

      this.startDrone();
    }
    this.prepareVoice();
    if (this.context.state === 'suspended') await this.context.resume();
  }

  prepareVoice() {
    if (!('speechSynthesis' in window)) return;
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      const englishVoices = voices.filter((voice) => /^en/i.test(voice.lang));
      const preferredPatterns = [
        /Google UK English Male/i,
        /Microsoft David/i,
        /Microsoft Mark/i,
        /Daniel/i,
        /Arthur/i,
        /male/i,
      ];
      this.cachedVoice = preferredPatterns
        .map((pattern) => englishVoices.find((voice) => pattern.test(voice.name)))
        .find(Boolean)
        || englishVoices.sort((a, b) => a.name.localeCompare(b.name))[0]
        || voices[0]
        || null;
    }
    if (!this.voiceListenerAttached) {
      window.speechSynthesis.addEventListener('voiceschanged', () => this.prepareVoice(), { once: true });
      this.voiceListenerAttached = true;
    }
  }

  startDrone() {
    const droneGain = this.context.createGain();
    droneGain.gain.value = 0.038;
    droneGain.connect(this.musicBus);
    [36, 43.2, 54.6].forEach((frequency, index) => {
      const oscillator = this.context.createOscillator();
      oscillator.type = index === 1 ? 'triangle' : 'sine';
      oscillator.frequency.value = frequency;
      oscillator.detune.value = (index - 1) * 9;
      const wobble = this.context.createGain();
      wobble.gain.value = 0.8 / (index + 1);
      oscillator.connect(wobble).connect(droneGain);
      oscillator.start();
    });
  }

  pulse(frequency, duration, volume, type = 'sine', destination = null) {
    if (!this.context) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(destination || this.master);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.03);
  }

  noise(duration, volume, highpass = 90, destination = null) {
    if (!this.context) return;
    const sampleCount = Math.floor(this.context.sampleRate * duration);
    const buffer = this.context.createBuffer(1, sampleCount, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i += 1) data[i] = Math.random() * 2 - 1;
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    const filter = this.context.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = highpass;
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(volume, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + duration);
    source.connect(filter).connect(gain).connect(destination || this.master);
    source.start();
  }

  footstep(sprinting) {
    this.pulse(sprinting ? 62 : 52, 0.08, sprinting ? 0.16 : 0.1, 'triangle');
    this.noise(0.06, sprinting ? 0.065 : 0.04, 180);
  }

  musicPhrase(urgency) {
    if (!this.context) return;
    const scale = [55, 62, 65, 69];
    const root = scale[Math.floor(random() * scale.length)];
    this.pulse(root, 0.7, 0.055 + urgency * 0.02, 'triangle', this.musicBus);
    window.setTimeout(() => this.pulse(root * 1.5, 0.5, 0.032 + urgency * 0.018, 'sine', this.musicBus), 180);
    window.setTimeout(() => this.pulse(root * 0.75, 0.95, 0.04 + urgency * 0.02, 'sawtooth', this.musicBus), 420);
    if (random() < 0.45 + urgency * 0.25) {
      window.setTimeout(() => this.noise(0.45, 0.02 + urgency * 0.015, 300, this.musicBus), 120);
    }
  }

  update(delta, entityDistance, suppressShriek = false) {
    if (!this.context) return;
    this.heartbeatTimer -= delta;
    this.screechCooldown -= delta;
    this.musicTimer -= delta;
    const urgency = THREE.MathUtils.clamp(1 - entityDistance / 42, 0, 1);

    if (this.musicTimer <= 0) {
      this.musicPhrase(urgency);
      this.musicTimer = 3.6 - urgency * 1.4 + random() * 1.2;
    }

    if (this.heartbeatTimer <= 0 && urgency > 0.08) {
      this.pulse(49, 0.13, 0.07 + urgency * 0.17, 'sine');
      window.setTimeout(() => this.pulse(44, 0.11, 0.045 + urgency * 0.12, 'sine'), 125);
      this.heartbeatTimer = 1.35 - urgency * 0.75;
    }

    if (!suppressShriek && entityDistance < 18 && this.screechCooldown <= 0) {
      const chance = THREE.MathUtils.lerp(0.02, 0.11, urgency);
      if (random() < chance) {
        this.screech(0.78 + urgency * 0.65);
        this.screechCooldown = (entityDistance < 9 ? 2.4 : 4.2) + random() * 2.2;
      }
    }
  }

  screech(strength = 1) {
    if (!this.context) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(150, now);
    oscillator.frequency.exponentialRampToValueAtTime(980, now + 0.28);
    oscillator.frequency.exponentialRampToValueAtTime(120, now + 0.92);
    filter.type = 'bandpass';
    filter.frequency.value = 1350;
    filter.Q.value = 2.8;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.22 * strength, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.95);
    oscillator.connect(filter).connect(gain).connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + 0.98);
    this.noise(0.82, 0.12 * strength, 650);
  }

  roar(strength = 1) {
    if (!this.context) return;
    const now = this.context.currentTime;
    const roarGain = this.context.createGain();
    const lowFilter = this.context.createBiquadFilter();
    lowFilter.type = 'lowpass';
    lowFilter.frequency.setValueAtTime(520, now);
    lowFilter.frequency.exponentialRampToValueAtTime(110, now + 1.35);
    roarGain.gain.setValueAtTime(0.0001, now);
    roarGain.gain.exponentialRampToValueAtTime(0.22 * strength, now + 0.045);
    roarGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.55);
    roarGain.connect(this.master);

    [58, 76, 101].forEach((frequency, index) => {
      const oscillator = this.context.createOscillator();
      const oscillatorGain = this.context.createGain();
      oscillator.type = index === 1 ? 'sawtooth' : 'square';
      oscillator.frequency.setValueAtTime(frequency, now);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * (0.42 + index * 0.06), now + 1.45);
      oscillator.detune.value = (index - 1) * 13;
      oscillatorGain.gain.value = 0.42 / (index + 1);
      oscillator.connect(oscillatorGain).connect(lowFilter).connect(roarGain);
      oscillator.start(now);
      oscillator.stop(now + 1.6);
    });
    this.noise(1.35, 0.16 * strength, 70);
    window.setTimeout(() => this.pulse(39, 0.75, 0.13 * strength, 'sawtooth'), 210);
  }

  whisperPhrase(text) {
    if (!this.context) return false;
    if (!('speechSynthesis' in window)) return false;
    const now = performance.now();
    if (now - this.lastVoiceAt < 7800) return false;
    this.lastVoiceAt = now;
    this.prepareVoice();

    const estimatedDuration = Math.max(2.2, Math.min(5.2, text.length * 0.095));
    const audioNow = this.context.currentTime;

    // A filtered breath layer gives every browser voice the same whispered monster texture.
    const breathBuffer = this.context.createBuffer(1, Math.floor(this.context.sampleRate * estimatedDuration), this.context.sampleRate);
    const breathData = breathBuffer.getChannelData(0);
    for (let i = 0; i < breathData.length; i += 1) {
      const fadeIn = Math.min(1, i / (this.context.sampleRate * 0.12));
      const fadeOut = Math.min(1, (breathData.length - i) / (this.context.sampleRate * 0.35));
      breathData[i] = (Math.random() * 2 - 1) * fadeIn * fadeOut;
    }
    const breath = this.context.createBufferSource();
    breath.buffer = breathBuffer;
    const breathFilter = this.context.createBiquadFilter();
    breathFilter.type = 'bandpass';
    breathFilter.frequency.value = 1850;
    breathFilter.Q.value = 0.8;
    const breathGain = this.context.createGain();
    breathGain.gain.setValueAtTime(0.0001, audioNow);
    breathGain.gain.exponentialRampToValueAtTime(0.055, audioNow + 0.08);
    breathGain.gain.exponentialRampToValueAtTime(0.0001, audioNow + estimatedDuration);
    breath.connect(breathFilter).connect(breathGain).connect(this.master);
    breath.start(audioNow);

    this.pulse(31, estimatedDuration, 0.085, 'sawtooth');
    this.pulse(47, estimatedDuration * 0.82, 0.035, 'triangle');

    if (this.musicBus) {
      this.musicBus.gain.cancelScheduledValues(audioNow);
      this.musicBus.gain.setValueAtTime(this.musicBus.gain.value, audioNow);
      this.musicBus.gain.linearRampToValueAtTime(0.075, audioNow + 0.1);
      this.musicBus.gain.linearRampToValueAtTime(0.23, audioNow + estimatedDuration + 0.6);
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = this.cachedVoice;
    utterance.rate = 0.46;
    utterance.pitch = 0.08;
    utterance.volume = 0.68;
    window.speechSynthesis.speak(utterance);
    return true;
  }

  stunBlast() {
    if (!this.context) return;
    const now = this.context.currentTime;
    const zapGain = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2400, now);
    filter.frequency.exponentialRampToValueAtTime(620, now + 0.38);
    zapGain.gain.setValueAtTime(0.0001, now);
    zapGain.gain.exponentialRampToValueAtTime(0.34, now + 0.012);
    zapGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.46);
    zapGain.connect(this.master);

    [120, 240, 620].forEach((frequency, index) => {
      const oscillator = this.context.createOscillator();
      oscillator.type = index === 2 ? 'sawtooth' : 'square';
      oscillator.frequency.setValueAtTime(frequency, now);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 2.8, now + 0.12);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.55, now + 0.42);
      const gain = this.context.createGain();
      gain.gain.value = 0.32 / (index + 1);
      oscillator.connect(gain).connect(filter).connect(zapGain);
      oscillator.start(now);
      oscillator.stop(now + 0.48);
    });
    this.noise(0.5, 0.22, 900);
    window.setTimeout(() => this.pulse(72, 0.32, 0.16, 'sawtooth'), 55);
  }

  emptyClick() {
    this.pulse(840, 0.045, 0.08, 'square');
    window.setTimeout(() => this.pulse(510, 0.05, 0.055, 'square'), 70);
  }

  fall() {
    this.pulse(34, 2.2, 0.24, 'sine');
  }

  consume() {
    this.screech(1.25);
    this.noise(1.2, 0.31, 120);
  }
}

const audio = new ProceduralAudio();

function showDanger(message, duration = 1.6, entityVoice = false) {
  dangerMessage.textContent = message;
  dangerMessage.classList.toggle('entity-voice', entityVoice);
  dangerMessage.classList.add('visible');
  entityVoiceActive = entityVoice;
  dangerTextTimer = duration;
}


function updateWeaponHud() {
  if (!weaponHud || !weaponShotsText || !weaponStatusText) return;
  weaponShotsText.textContent = `${stunShots} / ${MAX_STUN_SHOTS} SHOTS`;
  weaponHud.classList.toggle('equipped', stunGunEquipped);
  weaponHud.classList.toggle('empty', stunShots <= 0);

  let status = 'E  EQUIP';
  let targetReady = false;
  if (entityStunTimer > 0) {
    status = `FIGURE STUNNED  ${entityStunTimer.toFixed(1)}s`;
  } else if (stunGunEquipped && stunShots <= 0) {
    status = 'EMPTY';
  } else if (stunGunEquipped) {
    const targetState = getStunTargetState(false);
    targetReady = targetState.ready;
    status = targetReady ? 'SPACE  FIRE — TARGET READY' : 'SPACE  FIRE WHEN NEAR';
  }

  weaponStatusText.textContent = status;
  weaponHud.classList.toggle('target-ready', targetReady);
  crosshair.classList.toggle('stun-ready', targetReady);
  root.dataset.stunShots = String(stunShots);
  root.dataset.stunEquipped = String(stunGunEquipped);
  root.dataset.entityStunned = String(entityStunTimer > 0);

  const cells = stunGunView.userData.chargeCells;
  cells.forEach((cell, index) => {
    cell.visible = index < stunShots;
  });
}

function toggleStunGun() {
  if (!started || paused || ended || falling || dying) return;
  stunGunEquipped = !stunGunEquipped;
  stunGunView.visible = stunGunEquipped;
  if (stunGunEquipped) {
    showDanger(stunShots > 0 ? `STUN GUN READY — ${stunShots} SHOTS.` : 'THE STUN GUN IS EMPTY.', 1.6);
    audio.pulse(stunShots > 0 ? 620 : 180, 0.08, 0.08, 'square');
  } else {
    showDanger('STUN GUN HOLSTERED.', 1.1);
    audio.pulse(280, 0.07, 0.05, 'triangle');
  }
  updateWeaponHud();
}

function hasClearStunShot(origin, target) {
  const dx = target.x - origin.x;
  const dz = target.z - origin.z;
  const distance = Math.hypot(dx, dz);
  if (distance <= 1.2) return true;
  const steps = Math.ceil(distance / 0.42);
  for (let step = 2; step < steps - 2; step += 1) {
    const ratio = step / steps;
    const x = origin.x + dx * ratio;
    const z = origin.z + dz * ratio;
    if (!isWalkable(x, z, 0.11)) return false;
  }
  return true;
}

function getStunTargetState(checkLineOfSight = true) {
  if (!entityParts || ended || falling || dying) {
    return { ready: false, distance: Infinity, aimed: false, clear: false, target: null };
  }

  camera.getWorldPosition(stunOrigin);
  entityParts.torso.getWorldPosition(stunTarget);
  stunDirection.copy(stunTarget).sub(stunOrigin);
  const distance = stunDirection.length();
  if (distance < 0.001) {
    return { ready: true, distance, aimed: true, clear: true, target: stunTarget.clone() };
  }

  stunDirection.normalize();
  camera.getWorldDirection(forwardVector);
  const aimed = forwardVector.dot(stunDirection) >= STUN_AIM_DOT;
  const near = distance <= STUN_RANGE;
  const clear = !checkLineOfSight || (near && aimed && hasClearStunShot(stunOrigin, stunTarget));
  return {
    ready: near && aimed && clear && entityStunTimer <= 0,
    distance,
    aimed,
    clear,
    target: stunTarget.clone(),
  };
}

function makeBeamCylinder(start, end, radius, material) {
  const direction = end.clone().sub(start);
  const length = direction.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 10), material);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(beamUpAxis, direction.normalize());
  mesh.frustumCulled = false;
  return mesh;
}

function createStunBeam(targetPosition) {
  camera.updateMatrixWorld(true);
  stunGunView.userData.muzzle.getWorldPosition(stunOrigin);
  const start = stunOrigin.clone();
  const end = targetPosition.clone();
  const group = new THREE.Group();
  const materials = [];
  const geometries = [];

  const coreMaterial = new THREE.MeshBasicMaterial({
    color: 0xb7f4ff,
    transparent: true,
    opacity: 1,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: 0x168cff,
    transparent: true,
    opacity: 0.38,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  materials.push(coreMaterial, glowMaterial);

  const glow = makeBeamCylinder(start, end, 0.13, glowMaterial);
  const core = makeBeamCylinder(start, end, 0.035, coreMaterial);
  group.add(glow, core);
  geometries.push(glow.geometry, core.geometry);

  const beamVector = end.clone().sub(start);
  const beamLength = beamVector.length();
  const beamNormal = beamVector.clone().normalize();
  const tangent = new THREE.Vector3().crossVectors(beamNormal, camera.up).normalize();
  const bitangent = new THREE.Vector3().crossVectors(beamNormal, tangent).normalize();

  for (let arcIndex = 0; arcIndex < 4; arcIndex += 1) {
    const points = [];
    for (let pointIndex = 0; pointIndex <= 9; pointIndex += 1) {
      const ratio = pointIndex / 9;
      const point = start.clone().addScaledVector(beamNormal, beamLength * ratio);
      if (pointIndex > 0 && pointIndex < 9) {
        point.addScaledVector(tangent, (random() - 0.5) * 0.35);
        point.addScaledVector(bitangent, (random() - 0.5) * 0.35);
      }
      points.push(point);
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: arcIndex % 2 === 0 ? 0x7de9ff : 0x206cff,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    group.add(new THREE.Line(geometry, material));
    geometries.push(geometry);
    materials.push(material);
  }

  const impactMaterial = new THREE.MeshBasicMaterial({
    color: 0xa9efff,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const impact = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 10), impactMaterial);
  impact.position.copy(end);
  group.add(impact);
  geometries.push(impact.geometry);
  materials.push(impactMaterial);

  const impactLight = new THREE.PointLight(0x42c8ff, 8, 12, 2);
  impactLight.position.copy(end);
  group.add(impactLight);

  scene.add(group);
  beamEffects.push({ group, materials, geometries, impact, impactLight, ttl: 0.28, duration: 0.28 });
}

function updateBeamEffects(delta) {
  for (let index = beamEffects.length - 1; index >= 0; index -= 1) {
    const effect = beamEffects[index];
    effect.ttl -= delta;
    const alpha = Math.max(0, effect.ttl / effect.duration);
    effect.materials.forEach((material, materialIndex) => {
      material.opacity = (materialIndex === 1 ? 0.38 : 0.95) * alpha;
    });
    effect.impact.scale.setScalar(1 + (1 - alpha) * 2.5);
    effect.impactLight.intensity = 8 * alpha;
    if (effect.ttl <= 0) {
      scene.remove(effect.group);
      effect.geometries.forEach((geometry) => geometry.dispose());
      effect.materials.forEach((material) => material.dispose());
      beamEffects.splice(index, 1);
    }
  }
}

function updateStunElectricField(nowSeconds) {
  if (!entityParts?.electricLines) return;
  entityParts.electricLines.forEach((arc, arcIndex) => {
    const positions = arc.geometry.attributes.position;
    const baseY = 1.1 + ((arcIndex * 0.83 + nowSeconds * 5.5) % 6.8);
    for (let pointIndex = 0; pointIndex < positions.count; pointIndex += 1) {
      const ratio = pointIndex / (positions.count - 1);
      const angle = nowSeconds * 8.5 + arcIndex * 1.7 + ratio * Math.PI * 1.8;
      const radius = 0.5 + Math.sin(angle * 1.6) * 0.26;
      positions.setXYZ(
        pointIndex,
        Math.cos(angle) * radius + (random() - 0.5) * 0.22,
        baseY + ratio * 1.25 + (random() - 0.5) * 0.24,
        Math.sin(angle) * radius * 0.65 + (random() - 0.5) * 0.22,
      );
    }
    positions.needsUpdate = true;
    arc.material.opacity = 0.55 + random() * 0.4;
  });
}

function fireStunGun() {
  if (!started || paused || ended || falling || dying || performance.now() < weaponCooldownUntil) return;
  if (!stunGunEquipped) {
    showDanger('PRESS E TO EQUIP THE STUN GUN.', 1.5);
    return;
  }
  if (stunShots <= 0) {
    audio.emptyClick();
    showDanger('THE STUN GUN IS EMPTY.', 1.5);
    return;
  }
  if (entityStunTimer > 0) {
    showDanger(`THE FIGURE IS ALREADY STUNNED — ${entityStunTimer.toFixed(1)}s.`, 1.5);
    return;
  }

  const targetState = getStunTargetState(true);
  if (targetState.distance > STUN_RANGE) {
    showDanger('THE TIMBER FIGURE IS TOO FAR AWAY.', 1.5);
    audio.emptyClick();
    return;
  }
  if (!targetState.aimed) {
    showDanger('AIM AT THE TIMBER FIGURE.', 1.35);
    audio.emptyClick();
    return;
  }
  if (!targetState.clear) {
    showDanger('NO CLEAR SHOT.', 1.35);
    audio.emptyClick();
    return;
  }

  stunShots -= 1;
  entityStunTimer = STUN_DURATION;
  entityStunEndsAt = performance.now() + STUN_DURATION * 1000;
  stunPausedAt = 0;
  weaponCooldownUntil = performance.now() + 650;
  entityPath = [];
  entityPathTimer = 0;
  stalkRelocationTimer = Math.max(stalkRelocationTimer, STUN_DURATION + 2.5);
  roarTimer = Math.max(roarTimer, STUN_DURATION + 1.5);
  phraseTimer = Math.max(phraseTimer, STUN_DURATION + 3.5);
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();

  createStunBeam(targetState.target);
  audio.stunBlast();
  entityParts.electricField.visible = true;
  entityParts.redAura.color.setHex(0x168cff);
  entityParts.stunLight.intensity = 8;
  showDanger('DIRECT HIT — STUNNED FOR 6 SECONDS.', 2.2);
  updateWeaponHud();
}

function updateStaminaHud() {
  const ratio = stamina / MAX_STAMINA;
  staminaFill.style.transform = `scaleX(${ratio})`;
  staminaFill.classList.toggle('low', ratio < 0.25);
  staminaSeconds.textContent = `${stamina.toFixed(1)}s`;
  staminaState.textContent = exhausted ? 'EXHAUSTED — KEEP MOVING' : stamina < MAX_STAMINA ? 'RECOVERING' : 'W + SHIFT TO SPRINT';
}

function updateProgressHud() {
  if (!distanceToExit || !camera) return;
  const cell = nearestOpenCell(camera.position);
  const remaining = distanceToExit[cell.y]?.[cell.x];
  if (remaining == null || remaining < 0) return;
  const rawProgress = 1 - remaining / Math.max(1, startToExitDistance);
  const progress = THREE.MathUtils.clamp(rawProgress, 0, 1);
  const percent = Math.round(progress * 100);
  progressFill.style.transform = `scaleX(${progress})`;
  progressPercent.textContent = `${percent}%`;
}

function updatePlayer(delta, nowSeconds) {
  const movingForward = keys.has('KeyW');
  const movingBackward = keys.has('KeyS');
  const movingLeft = keys.has('KeyA');
  const movingRight = keys.has('KeyD');
  const wantsSprint = movingForward && (keys.has('ShiftLeft') || keys.has('ShiftRight'));
  const sprinting = wantsSprint && !exhausted && stamina > 0;

  if (sprinting) {
    stamina = Math.max(0, stamina - delta);
    if (stamina <= 0) {
      exhausted = true;
      showDanger('YOUR LEGS WILL NOT OBEY.', 2.2);
    }
  } else {
    const recoveryRate = exhausted ? 1.2 : 1.75;
    stamina = Math.min(MAX_STAMINA, stamina + delta * recoveryRate);
    if (exhausted && stamina >= 2.4) exhausted = false;
  }
  updateStaminaHud();

  const inputX = Number(movingRight) - Number(movingLeft);
  const inputZ = Number(movingForward) - Number(movingBackward);
  const inputLength = Math.hypot(inputX, inputZ);
  const speed = sprinting ? SPRINT_SPEED : WALK_SPEED;

  if (inputLength > 0) {
    camera.getWorldDirection(forwardVector);
    forwardVector.y = 0;
    forwardVector.normalize();
    rightVector.crossVectors(forwardVector, camera.up).normalize();
    desiredMovement
      .set(0, 0, 0)
      .addScaledVector(forwardVector, inputZ / inputLength)
      .addScaledVector(rightVector, inputX / inputLength)
      .multiplyScalar(speed * delta);
    movePlayer(desiredMovement.x, desiredMovement.z);

    bobPhase += delta * (sprinting ? 13 : 8.5);
    const bobAmount = sprinting ? 0.065 : 0.035;
    camera.position.y = cameraBaseY + Math.sin(bobPhase) * bobAmount;
    camera.rotation.z = Math.sin(bobPhase * 0.5) * (sprinting ? 0.012 : 0.006);

    footstepTimer -= delta;
    if (footstepTimer <= 0) {
      audio.footstep(sprinting);
      footstepTimer = sprinting ? 0.31 : 0.48;
    }
  } else {
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, cameraBaseY, Math.min(1, delta * 7));
    camera.rotation.z = THREE.MathUtils.lerp(camera.rotation.z, 0, Math.min(1, delta * 7));
    footstepTimer = Math.min(footstepTimer, 0.12);
  }

  const viewSway = inputLength > 0 ? 1 : 0;
  firstPersonView.position.x = THREE.MathUtils.lerp(
    firstPersonView.position.x,
    Math.sin(bobPhase * 0.5) * 0.018 * viewSway,
    Math.min(1, delta * 9),
  );
  firstPersonView.position.y = THREE.MathUtils.lerp(
    firstPersonView.position.y,
    -Math.abs(Math.sin(bobPhase)) * 0.017 * viewSway,
    Math.min(1, delta * 9),
  );
  firstPersonView.rotation.z = THREE.MathUtils.lerp(
    firstPersonView.rotation.z,
    Math.sin(bobPhase * 0.5) * 0.018 * viewSway,
    Math.min(1, delta * 8),
  );

  if (stunGunEquipped) {
    stunGunView.position.y = THREE.MathUtils.lerp(stunGunView.position.y, -0.34, Math.min(1, delta * 12));
    stunGunView.rotation.z = THREE.MathUtils.lerp(
      stunGunView.rotation.z,
      0.015 + Math.sin(bobPhase * 0.5) * 0.018 * viewSway,
      Math.min(1, delta * 9),
    );
    stunGunView.userData.emitter.material.opacity = 0.78 + Math.sin(nowSeconds * 12) * 0.18;
  }
  updateWeaponHud();

  flashlight.intensity = 90 + Math.sin(nowSeconds * 17.7) * 2.6 + (random() < 0.004 ? -12 : 0);
}

function pickMonsterWhisper() {
  let index = Math.floor(random() * MONSTER_WHISPERS.length);
  if (MONSTER_WHISPERS.length > 1 && index === lastWhisperLineIndex) {
    index = (index + 1 + Math.floor(random() * (MONSTER_WHISPERS.length - 1))) % MONSTER_WHISPERS.length;
  }
  lastWhisperLineIndex = index;
  return MONSTER_WHISPERS[index];
}

function updateEntity(delta, nowSeconds) {
  const entityPosition = entityParts.group.position;
  const currentDistance = Math.hypot(entityPosition.x - camera.position.x, entityPosition.z - camera.position.z);

  if (entityStunEndsAt > 0) {
    entityStunTimer = Math.max(0, (entityStunEndsAt - performance.now()) / 1000);
    entityPath = [];
    entityParts.electricField.visible = true;
    entityParts.redAura.color.setHex(0x168cff);
    entityParts.redAura.intensity = 5.8 + Math.sin(nowSeconds * 22) * 1.2;
    entityParts.stunLight.intensity = 7.2 + Math.sin(nowSeconds * 31) * 1.8;
    updateStunElectricField(nowSeconds);

    const seizure = Math.sin(nowSeconds * 34) * 0.12;
    entityParts.group.position.y = 0.04 + Math.abs(Math.sin(nowSeconds * 19)) * 0.08;
    entityParts.torso.rotation.z = -0.26 + seizure;
    entityParts.headPivot.rotation.z = -0.28 - seizure * 1.8;
    entityParts.headPivot.rotation.x = 0.18 + Math.sin(nowSeconds * 27) * 0.09;
    entityParts.jawPivot.rotation.x = 0.12 + Math.abs(Math.sin(nowSeconds * 18)) * 0.35;
    entityParts.leftArm.pivot.rotation.x = 0.3 + Math.sin(nowSeconds * 25) * 0.18;
    entityParts.rightArm.pivot.rotation.x = 0.2 - Math.sin(nowSeconds * 26) * 0.18;
    entityParts.leftLeg.pivot.rotation.x = -0.12 + Math.sin(nowSeconds * 23) * 0.12;
    entityParts.rightLeg.pivot.rotation.x = -0.12 - Math.sin(nowSeconds * 24) * 0.12;

    const threat = THREE.MathUtils.clamp(1 - currentDistance / 28, 0, 1);
    damageVignette.style.opacity = String(threat * 0.26);
    renderer.toneMappingExposure = BASE_EXPOSURE - threat * 0.06;
    audio.update(delta, currentDistance, true);
    updateWeaponHud();

    if (entityStunTimer <= 0) {
      entityStunEndsAt = 0;
      stunPausedAt = 0;
      entityParts.electricField.visible = false;
      entityParts.stunLight.intensity = 0;
      entityParts.redAura.color.setHex(0x2d0000);
      entityParts.redAura.intensity = 2.4;
      stalkRelocationTimer = 3.5 + random() * 3.5;
      roarTimer = 1.2 + random() * 2.2;
      phraseTimer = 4.5 + random() * 5;
      showDanger('THE TIMBER FIGURE CAN MOVE AGAIN.', 2.1);
      audio.roar(0.62);
    }
    previousEntityDistance = currentDistance;
    return;
  }

  if (entityParts.electricField.visible) {
    entityParts.electricField.visible = false;
    entityParts.stunLight.intensity = 0;
    entityParts.redAura.color.setHex(0x2d0000);
  }

  stalkRelocationTimer -= delta;
  roarTimer -= delta;
  phraseTimer -= delta;

  if (stalkRelocationTimer <= 0) {
    const relocated = relocateEntityForStalk();
    stalkRelocationTimer = (relocated ? 7.5 : 3.8) + random() * 5.2;
  }

  const initialDistance = Math.hypot(entityPosition.x - camera.position.x, entityPosition.z - camera.position.z);
  if (roarTimer <= 0) {
    audio.roar(initialDistance < 20 ? 1 : 0.74);
    if (initialDistance < 24) showDanger('THE TIMBER FIGURE ROARS.', 1.7);
    roarTimer = 4.1 + random() * 5.2;
  }
  if (phraseTimer <= 0) {
    const whisper = pickMonsterWhisper();
    const spoken = audio.whisperPhrase(whisper.spoken);
    if (spoken) showDanger(whisper.display, whisper.spoken.length > 18 ? 4.2 : 2.8, true);
    phraseTimer = 10 + random() * 11;
  }

  entityPathTimer -= delta;
  if (entityPathTimer <= 0) {
    entityPath = findPath(entityPosition, camera.position);
    entityPathTimer = 0.24;
  }

  let target = camera.position;
  if (entityPath.length > 1) {
    target = worldFromCell(entityPath[1]);
    if (entityPosition.distanceTo(target) < 0.62) {
      entityPath.shift();
      target = entityPath.length > 1 ? worldFromCell(entityPath[1]) : camera.position;
    }
  }

  pathVector.set(target.x - entityPosition.x, 0, target.z - entityPosition.z);
  const pathDistance = pathVector.length();
  if (pathDistance > 0.001) {
    pathVector.normalize();
    const distanceToPlayer = Math.hypot(entityPosition.x - camera.position.x, entityPosition.z - camera.position.z);
    const rage = Math.min(1.55, elapsedRunTime / 135);
    let speed = ENTITY_BASE_SPEED + rage;
    if (distanceToPlayer > 42) speed += 1.0;
    if (distanceToPlayer < 6.2) speed -= 0.16;
    entityPosition.addScaledVector(pathVector, speed * delta);
    entityParts.group.rotation.y = Math.atan2(pathVector.x, pathVector.z);
  }

  const stride = nowSeconds * (4.75 + Math.min(2.1, elapsedRunTime / 85));
  const legSwing = Math.sin(stride) * 0.62;
  const armSwing = Math.sin(stride + Math.PI) * 0.7;

  entityParts.leftLeg.pivot.rotation.x = legSwing - 0.08;
  entityParts.rightLeg.pivot.rotation.x = -legSwing - 0.08;
  entityParts.leftLeg.lowerPivot.rotation.x = 0.18 + Math.max(0, -legSwing) * 0.65;
  entityParts.rightLeg.lowerPivot.rotation.x = 0.18 + Math.max(0, legSwing) * 0.65;

  entityParts.leftArm.pivot.rotation.x = armSwing + 0.36;
  entityParts.rightArm.pivot.rotation.x = -armSwing + 0.18;
  entityParts.leftArm.lowerPivot.rotation.x = -0.26 - Math.max(0, armSwing) * 0.38;
  entityParts.rightArm.lowerPivot.rotation.x = -0.22 - Math.max(0, -armSwing) * 0.38;

  const twitch = random() < 0.026 ? (random() - 0.5) * 0.42 : 0;
  entityParts.headPivot.rotation.z = -0.28 + Math.sin(nowSeconds * 1.8) * 0.1 + twitch;
  entityParts.headPivot.rotation.x = 0.18 + Math.sin(nowSeconds * 1.1) * 0.08;
  entityParts.headPivot.rotation.y = Math.sin(nowSeconds * 0.7) * 0.12;
  entityParts.jawPivot.rotation.x = -0.12 + Math.max(0, Math.sin(nowSeconds * 3.3)) * 0.32;
  entityParts.torso.rotation.z = -0.26 + Math.sin(stride * 0.5) * 0.05;
  entityParts.group.position.y = 0.04 + Math.abs(Math.sin(stride)) * 0.12;
  entityParts.redAura.intensity = 2.0 + Math.sin(nowSeconds * 10.7) * 0.5;

  entityParts.pupils.forEach((pupil, index) => {
    const scale = 0.74 + Math.sin(nowSeconds * 9.2 + index) * 0.2;
    pupil.scale.setScalar(scale);
  });
  entityParts.earRoots.forEach((ear, index) => {
    ear.rotation.z = (index === 0 ? -1 : 1) * (0.32 + Math.sin(nowSeconds * 2.5 + index) * 0.12);
    ear.rotation.x = Math.sin(nowSeconds * 1.6 + index) * 0.1;
  });

  const distance = Math.hypot(entityPosition.x - camera.position.x, entityPosition.z - camera.position.z);
  const threat = THREE.MathUtils.clamp(1 - distance / 28, 0, 1);
  damageVignette.style.opacity = String(threat * 0.48);
  renderer.toneMappingExposure = BASE_EXPOSURE - threat * 0.12;
  audio.update(delta, distance);

  if (distance < 20 && previousEntityDistance >= 20) showDanger('THE TIMBER FIGURE IS NEAR.', 2.2);
  if (distance < 8.5 && previousEntityDistance >= 8.5) showDanger('RUN.', 1.5);
  previousEntityDistance = distance;

  if (distance < 1.35) beginDeath();
}

function updateExitParticles(nowSeconds) {
  scene.traverse((object) => {
    if (object.userData?.isExitParticles) {
      const positions = object.geometry.attributes.position;
      for (let i = 0; i < positions.count; i += 1) {
        let y = positions.getY(i) - 0.004 - (i % 5) * 0.0007;
        if (y < -0.15) y = 2.8 + (i % 7) * 0.08;
        positions.setY(i, y);
      }
      positions.needsUpdate = true;
      object.rotation.y = nowSeconds * 0.04;
    }
  });
}

function checkExit() {
  const exitPosition = worldFromCell(exitCell);
  const distance = Math.hypot(camera.position.x - exitPosition.x, camera.position.z - exitPosition.z);
  if (distance < 2.42) beginFall();
}

function beginFall() {
  if (falling || dying || ended) return;
  falling = true;
  paused = false;
  fallElapsed = 0;
  keys.clear();
  controls.unlock();
  startOverlay.classList.remove('visible');
  pauseOverlay.classList.remove('visible');
  hud.style.display = 'none';
  weaponHud.style.display = 'none';
  crosshair.style.display = 'none';
  firstPersonView.visible = false;
  audio.fall();
}

function updateFall(delta) {
  fallElapsed += delta;
  const exitPosition = worldFromCell(exitCell);
  camera.position.x = THREE.MathUtils.lerp(camera.position.x, exitPosition.x, Math.min(1, delta * 1.4));
  camera.position.z = THREE.MathUtils.lerp(camera.position.z, exitPosition.z, Math.min(1, delta * 1.4));
  camera.position.y = EYE_HEIGHT - fallElapsed * fallElapsed * 6.8;
  camera.rotation.x = THREE.MathUtils.lerp(camera.rotation.x, -0.32, Math.min(1, delta * 1.7));
  camera.rotation.z += delta * 0.24;
  scene.fog.density = BASE_FOG_DENSITY + fallElapsed * 0.085;
  renderer.toneMappingExposure = Math.max(0, BASE_EXPOSURE - fallElapsed * 0.42);
  if (fallElapsed >= 2.35) finishGame('survived');
}

function beginDeath() {
  if (dying || falling || ended) return;
  dying = true;
  deathElapsed = 0;
  keys.clear();
  controls.unlock();
  pauseOverlay.classList.remove('visible');
  hud.style.display = 'none';
  weaponHud.style.display = 'none';
  crosshair.style.display = 'none';
  firstPersonView.visible = false;
  audio.consume();
}

function updateDeath(delta) {
  deathElapsed += delta;
  const entityHead = entityParts.headPivot.getWorldPosition(new THREE.Vector3());
  const direction = camera.position.clone().sub(entityParts.group.position).setY(0);
  if (direction.lengthSq() > 0.001) direction.normalize();
  entityParts.group.position.addScaledVector(direction, delta * 2.25);
  camera.lookAt(entityHead);
  camera.rotation.z = Math.sin(deathElapsed * 19) * 0.035 * deathElapsed;
  entityParts.jawPivot.rotation.x = Math.min(1.08, 0.24 + deathElapsed * 1.05);
  entityParts.headPivot.rotation.x = -Math.min(0.38, deathElapsed * 0.42);
  damageVignette.style.opacity = String(Math.min(1, 0.35 + deathElapsed * 0.5));
  renderer.toneMappingExposure = Math.max(0.2, BASE_EXPOSURE - deathElapsed * 0.46);
  if (deathElapsed >= 1.65) finishGame('consumed');
}

function finishGame(result) {
  if (ended) return;
  ended = true;
  falling = false;
  dying = false;
  paused = true;
  document.body.classList.add(result);
  if (result === 'survived') {
    endKicker.textContent = 'THE VOID LET YOU GO';
    endTitle.textContent = 'YOU SURVIVED THE TIMBER FIGURE.';
    endCopy.textContent = 'The maze closes behind you. Something is still breathing on the other side.';
    restartButton.textContent = 'ENTER AGAIN';
  } else {
    endKicker.textContent = 'THE HUNT IS OVER';
    endTitle.textContent = 'THE TIMBER FIGURE CONSUMED YOU.';
    endCopy.textContent = 'There was no rescue coming. There was only the sound behind you.';
    restartButton.textContent = 'TRY AGAIN';
  }
  endOverlay.classList.add('visible');
}

function freezeStunTimerForPause() {
  if (entityStunEndsAt > 0 && stunPausedAt === 0) stunPausedAt = performance.now();
}

function resumeStunTimerAfterPause() {
  if (entityStunEndsAt > 0 && stunPausedAt > 0) {
    entityStunEndsAt += performance.now() - stunPausedAt;
    stunPausedAt = 0;
  }
}

function pauseGame() {
  if (!started || paused || ended || falling || dying) return;
  freezeStunTimerForPause();
  paused = true;
  keys.clear();
  controls.unlock();
  pauseOverlay.classList.add('visible');
}

function resumeGame() {
  if (ended || falling || dying) return;
  controls.lock();
}

function restartGame() {
  window.location.reload();
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  window.location.assign('/');
}

function setupGameWorld() {
  maze = generateMaze(GRID_SIZE);
  startCell = { x: 1, y: 1 };
  distanceFromStart = bfsDistances(maze, startCell);
  exitCell = findFarthestCell(distanceFromStart);
  distanceToExit = bfsDistances(maze, exitCell);
  startToExitDistance = Math.max(1, distanceToExit[startCell.y][startCell.x]);

  buildMazeMeshes();
  placeCabins();
  buildExit();
  buildExitRouteArrows();

  const startPosition = worldFromCell(startCell);
  camera.position.set(startPosition.x, EYE_HEIGHT, startPosition.z);
  cameraBaseY = EYE_HEIGHT;
  camera.lookAt(startPosition.x + CELL_SIZE, EYE_HEIGHT, startPosition.z);

  entityParts = makeEntity();
  entity = entityParts.group;
  const exclusions = new Set([`${exitCell.x},${exitCell.y}`, ...cabinCells]);
  const entitySpawn = findFarthestCell(distanceFromStart, exclusions);
  const spawnPosition = worldFromCell(entitySpawn);
  entity.position.set(spawnPosition.x, 0, spawnPosition.z);
  updateWeaponHud();

  const worldSize = GRID_SIZE * CELL_SIZE;
  const overhead = new THREE.Mesh(
    new THREE.PlaneGeometry(worldSize * 1.6, worldSize * 1.6),
    new THREE.MeshBasicMaterial({ color: 0x101f27, side: THREE.DoubleSide }),
  );
  overhead.position.y = 24;
  overhead.rotation.x = Math.PI / 2;
  scene.add(overhead);
}

async function loadUser() {
  const response = await fetch('/api/auth/me', { credentials: 'same-origin' });
  if (!response.ok) {
    window.location.assign('/');
    return;
  }
  const data = await response.json();
  userBadge.innerHTML = '';
  if (data.user.picture) {
    const image = document.createElement('img');
    image.src = data.user.picture;
    image.alt = '';
    image.referrerPolicy = 'no-referrer';
    userBadge.appendChild(image);
  }
  const name = document.createElement('span');
  name.textContent = data.user.givenName || data.user.name || 'Player';
  userBadge.appendChild(name);
}

controls.addEventListener('lock', () => {
  if (ended || falling || dying) return;
  resumeStunTimerAfterPause();
  started = true;
  paused = false;
  startOverlay.classList.remove('visible');
  pauseOverlay.classList.remove('visible');
  endOverlay.classList.remove('visible');
});

controls.addEventListener('unlock', () => {
  if (started && !ended && !falling && !dying && !paused) {
    freezeStunTimerForPause();
    paused = true;
    keys.clear();
    pauseOverlay.classList.add('visible');
  }
});

window.addEventListener('keydown', (event) => {
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight'].includes(event.code)) {
    keys.add(event.code);
    event.preventDefault();
  }
  if (event.code === 'KeyE' && !event.repeat) {
    event.preventDefault();
    toggleStunGun();
  }
  if (event.code === 'Space' && !event.repeat) {
    event.preventDefault();
    fireStunGun();
  }
  if (event.code === 'KeyP') pauseGame();
});

window.addEventListener('keyup', (event) => {
  keys.delete(event.code);
});

window.addEventListener('blur', pauseGame);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseGame();
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
});

enterButton.addEventListener('click', () => {
  audio.start().catch((error) => console.warn('Audio could not start:', error));
  controls.lock();
});
resumeButton.addEventListener('click', resumeGame);
pauseButton.addEventListener('click', pauseGame);
restartButton.addEventListener('click', restartGame);
restartPauseButton.addEventListener('click', restartGame);
logoutButton.addEventListener('click', logout);

function animate(frameTime) {
  requestAnimationFrame(animate);
  const delta = Math.min((frameTime - lastFrame) / 1000, 0.05);
  lastFrame = frameTime;
  const nowSeconds = frameTime / 1000;

  if (dangerTextTimer > 0) {
    dangerTextTimer -= delta;
    if (dangerTextTimer <= 0) {
      dangerMessage.classList.remove('visible');
      if (entityVoiceActive) {
        dangerMessage.classList.remove('entity-voice');
        entityVoiceActive = false;
      }
    }
  }

  updateExitParticles(nowSeconds);
  updateBeamEffects(delta);

  if (falling && !ended) {
    updateFall(delta);
  } else if (dying && !ended) {
    updateDeath(delta);
  } else if (started && !paused && !ended) {
    elapsedRunTime += delta;
    updatePlayer(delta, nowSeconds);
    updateProgressHud();
    updateEntity(delta, nowSeconds);
    checkExit();
  }

  scratchMeshes.forEach((mesh, index) => {
    mesh.material.opacity = 0.72 + Math.sin(nowSeconds * 1.2 + index) * 0.08;
  });

  renderer.render(scene, camera);
}

async function initialize() {
  await loadUser();
  setupGameWorld();
  updateStaminaHud();
  updateProgressHud();
  requestAnimationFrame(animate);
}

initialize().catch((error) => {
  console.error(error);
  endKicker.textContent = 'THE MAZE COULD NOT OPEN';
  endTitle.textContent = 'STARTUP ERROR';
  endCopy.textContent = error.message || 'The game failed to initialize.';
  restartButton.textContent = 'RELOAD';
  endOverlay.classList.add('visible');
});
