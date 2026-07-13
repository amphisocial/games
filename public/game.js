import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

const GRID_SIZE = 35;
const CELL_SIZE = 8;
const HALF_GRID = (GRID_SIZE - 1) / 2;
const EYE_HEIGHT = 1.72;
const PLAYER_RADIUS = 0.52;
const WALK_SPEED = 3.35;
const SPRINT_SPEED = 6.6;
const MAX_STAMINA = 10;
const ENTITY_BASE_SPEED = 3.9;

const root = document.getElementById('game-root');
const staminaFill = document.getElementById('stamina-fill');
const staminaSeconds = document.getElementById('stamina-seconds');
const staminaState = document.getElementById('stamina-state');
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

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x010202);
scene.fog = new THREE.FogExp2(0x020303, 0.0215);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 450);
camera.rotation.order = 'YXZ';

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.78;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
root.appendChild(renderer.domElement);

const controls = new PointerLockControls(camera, renderer.domElement);
controls.pointerSpeed = 0.72;
scene.add(camera);

const flashlight = new THREE.SpotLight(0xd8d2b8, 34, 42, Math.PI / 7, 0.62, 1.5);
flashlight.position.set(0.18, -0.08, 0.12);
flashlight.target.position.set(0, -0.15, -8);
flashlight.castShadow = true;
flashlight.shadow.mapSize.set(512, 512);
flashlight.shadow.camera.near = 0.5;
flashlight.shadow.camera.far = 42;
camera.add(flashlight);
camera.add(flashlight.target);

scene.add(new THREE.HemisphereLight(0x79808a, 0x130e0b, 0.48));
const moonLight = new THREE.DirectionalLight(0x9eabc2, 0.72);
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

let maze;
let startCell;
let exitCell;
let distanceFromStart;
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
    context.fillStyle = '#161512';
    context.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 1800; i += 1) {
      const shade = 18 + Math.floor(random() * 28);
      context.fillStyle = `rgba(${shade},${shade - 2},${shade - 7},${0.18 + random() * 0.3})`;
      const size = 1 + random() * 2;
      context.fillRect(random() * 128, random() * 128, size, size);
    }
  } else {
    context.fillStyle = '#25282a';
    context.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 750; i += 1) {
      const shade = 22 + Math.floor(random() * 40);
      context.fillStyle = `rgba(${shade},${shade + 1},${shade},${0.08 + random() * 0.23})`;
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

const wallMaterial = new THREE.MeshStandardMaterial({ map: wallTexture, color: 0x6f7472, roughness: 1, metalness: 0 });
const outerWallMaterial = new THREE.MeshStandardMaterial({ map: wallTexture, color: 0x3f4443, roughness: 1 });
const groundMaterial = new THREE.MeshStandardMaterial({ map: groundTexture, color: 0x5e5849, roughness: 1 });
const woodMaterial = new THREE.MeshStandardMaterial({ map: woodTexture, color: 0x8d694f, roughness: 0.96 });
const darkWoodMaterial = new THREE.MeshStandardMaterial({ map: woodTexture, color: 0x35251e, roughness: 1 });
const roofMaterial = new THREE.MeshStandardMaterial({ color: 0x171413, roughness: 1, side: THREE.DoubleSide });
const interiorMaterial = new THREE.MeshStandardMaterial({ color: 0x392e27, roughness: 1 });

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

  const lanternMaterial = new THREE.MeshStandardMaterial({
    color: 0x3a1b10,
    emissive: 0xd46b27,
    emissiveIntensity: lightIndex % 3 === 0 ? 4 : 1.9,
  });
  const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), lanternMaterial);
  lantern.position.set(0, 2.12, -depth / 2 - 0.14);
  cabin.add(lantern);

  if (lightIndex < 6) {
    const glow = new THREE.PointLight(0xbc4d24, 2.6, 9, 2.1);
    glow.position.set(0, 2.05, -depth / 2 - 0.35);
    cabin.add(glow);
  }

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
  const skin = new THREE.MeshStandardMaterial({ color: 0x141112, roughness: 0.82, metalness: 0.03 });
  const rawSkin = new THREE.MeshStandardMaterial({ color: 0x3b1014, roughness: 0.9 });
  const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x110000, emissive: 0xff1329, emissiveIntensity: 7 });
  const mouthMaterial = new THREE.MeshStandardMaterial({ color: 0x050000, roughness: 1 });

  const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.65, 0.58), skin);
  pelvis.position.y = 2.55;
  group.add(pelvis);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.46, 2.7, 5, 8), skin);
  torso.scale.set(1.05, 1, 0.67);
  torso.position.y = 4.2;
  torso.rotation.z = 0.08;
  group.add(torso);

  const rib = new THREE.Mesh(new THREE.BoxGeometry(1.22, 1.9, 0.55), rawSkin);
  rib.position.set(0, 4.35, 0.06);
  rib.scale.z = 0.75;
  group.add(rib);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.26, 1.85, 7), skin);
  neck.position.y = 6.25;
  neck.rotation.z = -0.13;
  group.add(neck);

  const headPivot = new THREE.Group();
  headPivot.position.set(-0.13, 7.25, 0);
  group.add(headPivot);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.58, 12, 9), skin);
  head.scale.set(0.9, 1.55, 0.95);
  headPivot.add(head);

  const jawPivot = new THREE.Group();
  jawPivot.position.set(0, -0.22, -0.5);
  headPivot.add(jawPivot);
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.34, 1.15), mouthMaterial);
  jaw.position.z = -0.35;
  jawPivot.add(jaw);

  const eyeLeft = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), eyeMaterial);
  const eyeRight = eyeLeft.clone();
  eyeLeft.position.set(-0.21, 0.18, -0.53);
  eyeRight.position.set(0.21, 0.18, -0.53);
  headPivot.add(eyeLeft, eyeRight);

  function createLimb(x, y, upperLength, lowerLength, radius, isArm) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    group.add(pivot);

    const upper = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.78, radius, upperLength, 7), skin);
    upper.position.y = -upperLength / 2;
    pivot.add(upper);

    const lowerPivot = new THREE.Group();
    lowerPivot.position.y = -upperLength;
    pivot.add(lowerPivot);

    const lower = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.48, radius * 0.78, lowerLength, 7), skin);
    lower.position.y = -lowerLength / 2;
    lowerPivot.add(lower);

    const extremity = new THREE.Mesh(
      isArm ? new THREE.BoxGeometry(0.28, 0.22, 0.72) : new THREE.BoxGeometry(0.38, 0.28, 0.88),
      rawSkin,
    );
    extremity.position.set(0, -lowerLength - 0.08, isArm ? -0.23 : -0.28);
    lowerPivot.add(extremity);
    return { pivot, lowerPivot };
  }

  const leftArm = createLimb(-0.72, 5.25, 2.35, 2.25, 0.18, true);
  const rightArm = createLimb(0.72, 5.25, 2.35, 2.25, 0.18, true);
  const leftLeg = createLimb(-0.3, 2.55, 1.72, 1.86, 0.22, false);
  const rightLeg = createLimb(0.3, 2.55, 1.72, 1.86, 0.22, false);

  group.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  const redAura = new THREE.PointLight(0x78000c, 2.5, 9, 2);
  redAura.position.y = 6.8;
  group.add(redAura);

  scene.add(group);
  return {
    group,
    headPivot,
    jawPivot,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    redAura,
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
    this.heartbeatTimer = 0;
    this.screechCooldown = 0;
  }

  async start() {
    if (!this.context) {
      this.context = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.context.createGain();
      this.master.gain.value = 0.42;
      this.master.connect(this.context.destination);
      this.startDrone();
    }
    if (this.context.state === 'suspended') await this.context.resume();
  }

  startDrone() {
    const droneGain = this.context.createGain();
    droneGain.gain.value = 0.035;
    droneGain.connect(this.master);
    [37, 51.5, 73].forEach((frequency, index) => {
      const oscillator = this.context.createOscillator();
      oscillator.type = index === 1 ? 'sawtooth' : 'sine';
      oscillator.frequency.value = frequency;
      oscillator.detune.value = (index - 1) * 7;
      oscillator.connect(droneGain);
      oscillator.start();
    });
  }

  pulse(frequency, duration, volume, type = 'sine') {
    if (!this.context) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.03);
  }

  noise(duration, volume, highpass = 90) {
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
    source.connect(filter).connect(gain).connect(this.master);
    source.start();
  }

  footstep(sprinting) {
    this.pulse(sprinting ? 62 : 52, 0.08, sprinting ? 0.16 : 0.1, 'triangle');
    this.noise(0.06, sprinting ? 0.065 : 0.04, 180);
  }

  update(delta, entityDistance) {
    if (!this.context) return;
    this.heartbeatTimer -= delta;
    this.screechCooldown -= delta;
    const urgency = THREE.MathUtils.clamp(1 - entityDistance / 42, 0, 1);
    if (this.heartbeatTimer <= 0 && urgency > 0.08) {
      this.pulse(49, 0.13, 0.07 + urgency * 0.17, 'sine');
      window.setTimeout(() => this.pulse(44, 0.11, 0.045 + urgency * 0.12, 'sine'), 125);
      this.heartbeatTimer = 1.35 - urgency * 0.75;
    }
    if (entityDistance < 12 && this.screechCooldown <= 0 && random() < 0.008) {
      this.screech();
      this.screechCooldown = 8 + random() * 7;
    }
  }

  screech() {
    if (!this.context) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(160, now);
    oscillator.frequency.exponentialRampToValueAtTime(910, now + 0.36);
    oscillator.frequency.exponentialRampToValueAtTime(115, now + 1.05);
    filter.type = 'bandpass';
    filter.frequency.value = 1300;
    filter.Q.value = 2.5;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.24, now + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.08);
    oscillator.connect(filter).connect(gain).connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + 1.1);
    this.noise(0.75, 0.12, 700);
  }

  fall() {
    this.pulse(34, 2.2, 0.24, 'sine');
  }

  consume() {
    this.screech();
    this.noise(1.2, 0.31, 120);
  }
}

const audio = new ProceduralAudio();

function showDanger(message, duration = 1.6) {
  dangerMessage.textContent = message;
  dangerMessage.classList.add('visible');
  dangerTextTimer = duration;
}

function updateStaminaHud() {
  const ratio = stamina / MAX_STAMINA;
  staminaFill.style.transform = `scaleX(${ratio})`;
  staminaFill.classList.toggle('low', ratio < 0.25);
  staminaSeconds.textContent = `${stamina.toFixed(1)}s`;
  staminaState.textContent = exhausted ? 'EXHAUSTED — KEEP MOVING' : stamina < MAX_STAMINA ? 'RECOVERING' : 'W + SHIFT TO SPRINT';
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

  flashlight.intensity = 31 + Math.sin(nowSeconds * 17.7) * 1.6 + (random() < 0.012 ? -13 : 0);
}

function updateEntity(delta, nowSeconds) {
  const entityPosition = entityParts.group.position;
  entityPathTimer -= delta;
  if (entityPathTimer <= 0) {
    entityPath = findPath(entityPosition, camera.position);
    entityPathTimer = 0.34;
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
    const distanceToPlayer = entityPosition.distanceTo(camera.position);
    const rage = Math.min(1.35, elapsedRunTime / 170);
    let speed = ENTITY_BASE_SPEED + rage;
    if (distanceToPlayer > 55) speed += 0.7;
    if (distanceToPlayer < 7.5) speed -= 0.25;
    entityPosition.addScaledVector(pathVector, speed * delta);
    entityParts.group.rotation.y = Math.atan2(pathVector.x, pathVector.z);
  }

  const stride = nowSeconds * (5.2 + Math.min(2.2, elapsedRunTime / 80));
  const armSwing = Math.sin(stride) * 0.78;
  const legSwing = Math.sin(stride + Math.PI) * 0.5;
  entityParts.leftArm.pivot.rotation.x = armSwing + 0.28;
  entityParts.rightArm.pivot.rotation.x = -armSwing + 0.28;
  entityParts.leftArm.lowerPivot.rotation.x = -0.32 - Math.max(0, -armSwing) * 0.55;
  entityParts.rightArm.lowerPivot.rotation.x = -0.32 - Math.max(0, armSwing) * 0.55;
  entityParts.leftLeg.pivot.rotation.x = legSwing;
  entityParts.rightLeg.pivot.rotation.x = -legSwing;
  entityParts.leftLeg.lowerPivot.rotation.x = Math.max(0, -legSwing) * 0.65;
  entityParts.rightLeg.lowerPivot.rotation.x = Math.max(0, legSwing) * 0.65;
  entityParts.headPivot.rotation.z = Math.sin(nowSeconds * 2.1) * 0.09 - 0.12;
  entityParts.headPivot.rotation.x = Math.sin(nowSeconds * 1.37) * 0.06;
  entityParts.jawPivot.rotation.x = 0.12 + Math.max(0, Math.sin(nowSeconds * 3.3)) * 0.12;
  entityParts.group.position.y = Math.abs(Math.sin(stride)) * 0.08;

  const distance = Math.hypot(entityPosition.x - camera.position.x, entityPosition.z - camera.position.z);
  const threat = THREE.MathUtils.clamp(1 - distance / 24, 0, 1);
  damageVignette.style.opacity = String(threat * 0.43);
  renderer.toneMappingExposure = 0.78 - threat * 0.12;
  audio.update(delta, distance);

  if (distance < 18 && previousEntityDistance >= 18) showDanger('VERITY IS CLOSE.', 2.2);
  if (distance < 8.5 && previousEntityDistance >= 8.5) showDanger('RUN.', 1.5);
  previousEntityDistance = distance;

  if (distance < 1.18) beginDeath();
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
  crosshair.style.display = 'none';
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
  scene.fog.density = 0.0215 + fallElapsed * 0.085;
  renderer.toneMappingExposure = Math.max(0, 0.78 - fallElapsed * 0.34);
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
  crosshair.style.display = 'none';
  audio.consume();
}

function updateDeath(delta) {
  deathElapsed += delta;
  const entityHead = entityParts.group.position.clone().add(new THREE.Vector3(0, 6.7, 0));
  const direction = camera.position.clone().sub(entityParts.group.position).setY(0);
  if (direction.lengthSq() > 0.001) direction.normalize();
  entityParts.group.position.addScaledVector(direction, delta * 2.25);
  camera.lookAt(entityHead);
  camera.rotation.z = Math.sin(deathElapsed * 19) * 0.035 * deathElapsed;
  entityParts.jawPivot.rotation.x = Math.min(1.32, deathElapsed * 1.25);
  entityParts.headPivot.rotation.x = -Math.min(0.55, deathElapsed * 0.5);
  damageVignette.style.opacity = String(Math.min(1, 0.35 + deathElapsed * 0.5));
  renderer.toneMappingExposure = Math.max(0.18, 0.78 - deathElapsed * 0.36);
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
    endTitle.textContent = 'YOU SURVIVED VERITY.';
    endCopy.textContent = 'The maze closes behind you. Something is still breathing on the other side.';
    restartButton.textContent = 'ENTER AGAIN';
  } else {
    endKicker.textContent = 'THE HUNT IS OVER';
    endTitle.textContent = 'VERITY CONSUMED YOU.';
    endCopy.textContent = 'There was no rescue coming. There was only the sound behind you.';
    restartButton.textContent = 'TRY AGAIN';
  }
  endOverlay.classList.add('visible');
}

function pauseGame() {
  if (!started || paused || ended || falling || dying) return;
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

  buildMazeMeshes();
  placeCabins();
  buildExit();

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

  const worldSize = GRID_SIZE * CELL_SIZE;
  const overhead = new THREE.Mesh(
    new THREE.PlaneGeometry(worldSize * 1.6, worldSize * 1.6),
    new THREE.MeshBasicMaterial({ color: 0x020304, side: THREE.DoubleSide }),
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
  started = true;
  paused = false;
  startOverlay.classList.remove('visible');
  pauseOverlay.classList.remove('visible');
  endOverlay.classList.remove('visible');
});

controls.addEventListener('unlock', () => {
  if (started && !ended && !falling && !dying && !paused) {
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
    if (dangerTextTimer <= 0) dangerMessage.classList.remove('visible');
  }

  updateExitParticles(nowSeconds);

  if (falling && !ended) {
    updateFall(delta);
  } else if (dying && !ended) {
    updateDeath(delta);
  } else if (started && !paused && !ended) {
    elapsedRunTime += delta;
    updatePlayer(delta, nowSeconds);
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
