import * as THREE from 'three';

const PLAYER_TEAM = 'blue';
const ENEMY_TEAM = 'red';
const BOTS_PER_TEAM = 10;
const KILLS_TO_WIN = 40;
const MAX_HEALTH = 40;
const SHOTS_TO_KILL = 30;
const MAGAZINE_SIZE = 80;
const USER_FIRE_INTERVAL = 0.085;
const BOT_FIRE_INTERVAL_MIN = 0.16;
const BOT_FIRE_INTERVAL_MAX = 0.28;
const RELOAD_SECONDS = 2.25;
const RESPAWN_SECONDS = 2.6;
const MOVE_SPEED = 7.2;
const BOT_SPEED = 4.1;
const WORLD_X = 104;
const WORLD_Z = 76;

const root = document.getElementById('game-root');
const enterButton = document.getElementById('enter-button');
const startOverlay = document.getElementById('start-overlay');
const pauseOverlay = document.getElementById('pause-overlay');
const resumeButton = document.getElementById('resume-button');
const restartButton = document.getElementById('restart-button');
const playAgainButton = document.getElementById('play-again-button');
const endOverlay = document.getElementById('end-overlay');
const endKicker = document.getElementById('end-kicker');
const endTitle = document.getElementById('end-title');
const endCopy = document.getElementById('end-copy');
const blueScoreText = document.getElementById('blue-score');
const redScoreText = document.getElementById('red-score');
const ammoText = document.getElementById('ammo-text');
const healthText = document.getElementById('health-text');
const healthFill = document.getElementById('health-fill');
const reloadStatus = document.getElementById('reload-status');
const minimap = document.getElementById('tdm-minimap');
const minimapCtx = minimap.getContext('2d');
const killFeed = document.getElementById('kill-feed');
const respawnOverlay = document.getElementById('respawn-overlay');
const damageVignette = document.getElementById('damage-vignette');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x263442);
scene.fog = new THREE.FogExp2(0x263442, 0.0042);

const camera = new THREE.PerspectiveCamera(74, innerWidth / innerHeight, 0.06, 280);
camera.rotation.order = 'YXZ';
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.45;
renderer.shadowMap.enabled = false;
root.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0x8ca5b9, 1.75));
scene.add(new THREE.HemisphereLight(0xc8e2f0, 0x3b332e, 2.1));
const keyLight = new THREE.DirectionalLight(0xd8efff, 2.2);
keyLight.position.set(-20, 36, 18);
scene.add(keyLight);

const keys = new Set();
const obstacles = [];
const soldiers = [];
const blueSoldiers = [];
const redSoldiers = [];
const bulletTraces = [];
const spawnBlue = [new THREE.Vector3(-43, 0, -24), new THREE.Vector3(-43, 0, 24), new THREE.Vector3(-31, 0, 0)];
const spawnRed = [new THREE.Vector3(43, 0, -24), new THREE.Vector3(43, 0, 24), new THREE.Vector3(31, 0, 0)];
const waypoints = [
  new THREE.Vector3(-36,0,-25), new THREE.Vector3(-36,0,25), new THREE.Vector3(-17,0,-25), new THREE.Vector3(-17,0,25),
  new THREE.Vector3(0,0,-25), new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,25),
  new THREE.Vector3(17,0,-25), new THREE.Vector3(17,0,25), new THREE.Vector3(36,0,-25), new THREE.Vector3(36,0,25),
];

let player;
let yaw = Math.PI / 2;
let pitch = 0;
let started = false;
let paused = true;
let ended = false;
let firing = false;
let ammo = MAGAZINE_SIZE;
let reloading = false;
let reloadTimer = 0;
let userFireTimer = 0;
let blueScore = 0;
let redScore = 0;
let lastTime = performance.now();
let botThinkTimer = 0;
let audio;
let viewWeapon;
let viewMagazine;
let viewMuzzle;
let weaponBobPhase = 0;

const shared = {
  skin: new THREE.MeshStandardMaterial({ color: 0xc7aa91, roughness: 0.78 }),
  blueUniform: new THREE.MeshStandardMaterial({ color: 0x294f73, roughness: 0.88 }),
  redUniform: new THREE.MeshStandardMaterial({ color: 0x73312e, roughness: 0.88 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x1c2228, roughness: 0.8, metalness: 0.12 }),
  boot: new THREE.MeshStandardMaterial({ color: 0x111418, roughness: 0.92 }),
  visor: new THREE.MeshStandardMaterial({ color: 0x91d7ee, emissive: 0x1b6578, emissiveIntensity: 0.55, roughness: 0.25 }),
  rifle: new THREE.MeshStandardMaterial({ color: 0x2d3339, roughness: 0.58, metalness: 0.52 }),
  blueGlow: new THREE.MeshBasicMaterial({ color: 0x76d8ff }),
  redGlow: new THREE.MeshBasicMaterial({ color: 0xff736c }),
};

const geo = {
  head: new THREE.SphereGeometry(0.25, 14, 10),
  helmet: new THREE.SphereGeometry(0.285, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.63),
  torso: new THREE.CapsuleGeometry(0.34, 0.92, 6, 10),
  pelvis: new THREE.CapsuleGeometry(0.26, 0.34, 5, 9),
  upperArm: new THREE.CapsuleGeometry(0.095, 0.52, 4, 8),
  lowerArm: new THREE.CapsuleGeometry(0.082, 0.48, 4, 8),
  upperLeg: new THREE.CapsuleGeometry(0.115, 0.66, 4, 8),
  lowerLeg: new THREE.CapsuleGeometry(0.095, 0.62, 4, 8),
  hand: new THREE.SphereGeometry(0.095, 9, 7),
  foot: new THREE.CapsuleGeometry(0.1, 0.28, 4, 8),
  rifleBody: new THREE.CapsuleGeometry(0.075, 0.72, 4, 8),
  rifleBarrel: new THREE.CylinderGeometry(0.028, 0.035, 0.64, 9),
};

function mesh(g, m, cast = true) {
  const obj = new THREE.Mesh(g, m);
  obj.castShadow = cast;
  obj.receiveShadow = cast;
  return obj;
}

function createSoldier(team, isPlayer = false, index = 0) {
  const group = new THREE.Group();
  const uniform = team === PLAYER_TEAM ? shared.blueUniform : shared.redUniform;
  const glow = team === PLAYER_TEAM ? shared.blueGlow : shared.redGlow;

  // Smooth humanoid soldier with articulated upper/lower limbs.
  const torso = new THREE.Mesh(geo.torso, uniform); torso.position.y = 1.95; torso.scale.set(1.0, 1.05, 0.72); group.add(torso);
  const pelvis = new THREE.Mesh(geo.pelvis, shared.dark); pelvis.position.y = 1.2; pelvis.scale.set(1.05, 0.9, 0.78); group.add(pelvis);
  const head = new THREE.Mesh(geo.head, shared.skin); head.position.y = 2.9; group.add(head);
  const helmet = new THREE.Mesh(geo.helmet, shared.dark); helmet.position.y = 3.0; group.add(helmet);
  const visor = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.22, 3, 8), shared.visor); visor.rotation.z = Math.PI / 2; visor.position.set(0, 2.94, -0.225); group.add(visor);
  const teamLamp = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), glow); teamLamp.position.set(0, 2.15, -0.34); group.add(teamLamp);

  function arm(x) {
    const pivot = new THREE.Group(); pivot.position.set(x, 2.36, 0); group.add(pivot);
    const upper = new THREE.Mesh(geo.upperArm, uniform); upper.position.y = -0.36; pivot.add(upper);
    const elbow = new THREE.Group(); elbow.position.y = -0.72; pivot.add(elbow);
    const lower = new THREE.Mesh(geo.lowerArm, uniform); lower.position.y = -0.33; elbow.add(lower);
    const hand = new THREE.Mesh(geo.hand, shared.skin); hand.position.y = -0.67; elbow.add(hand);
    return { pivot, elbow, upper, lower, hand };
  }
  function leg(x) {
    const pivot = new THREE.Group(); pivot.position.set(x, 1.25, 0); group.add(pivot);
    const upper = new THREE.Mesh(geo.upperLeg, uniform); upper.position.y = -0.46; pivot.add(upper);
    const knee = new THREE.Group(); knee.position.y = -0.9; pivot.add(knee);
    const lower = new THREE.Mesh(geo.lowerLeg, uniform); lower.position.y = -0.42; knee.add(lower);
    const foot = new THREE.Mesh(geo.foot, shared.boot); foot.rotation.x = Math.PI / 2; foot.position.set(0, -0.84, -0.09); knee.add(foot);
    return { pivot, knee, upper, lower, foot };
  }
  const leftArm = arm(-0.42), rightArm = arm(0.42), leftLeg = leg(-0.17), rightLeg = leg(0.17);

  const rifle = new THREE.Group();
  rifle.position.set(0.31, 1.9, -0.54); rifle.rotation.x = Math.PI / 2; group.add(rifle);
  const rifleBody = new THREE.Mesh(geo.rifleBody, shared.rifle); rifle.add(rifleBody);
  const barrel = new THREE.Mesh(geo.rifleBarrel, shared.rifle); barrel.position.y = -0.65; rifle.add(barrel);
  const stock = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.32, 3, 7), shared.dark); stock.position.y = 0.48; rifle.add(stock);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.24, 0.17), shared.dark); mag.position.set(0, 0.08, 0.12); rifle.add(mag);
  const muzzle = new THREE.PointLight(team === PLAYER_TEAM ? 0x74d7ff : 0xff765e, 0, 4, 2); muzzle.position.y = -1.0; rifle.add(muzzle);

  const soldier = {
    id: `${team}-${index}`,
    team,
    isPlayer,
    group,
    torso,
    head,
    leftArm, rightArm, leftLeg, rightLeg,
    rifle, muzzle,
    shotsTaken: 0,
    health: MAX_HEALTH,
    alive: true,
    respawnTimer: 0,
    fireCooldown: Math.random() * 0.3,
    target: null,
    targetPoint: waypoints[Math.floor(Math.random() * waypoints.length)].clone(),
    thinkOffset: Math.random(),
    speedScale: 0.85 + Math.random() * 0.28,
    walkPhase: Math.random() * Math.PI * 2,
    hitFlash: 0,
    ammo: MAGAZINE_SIZE,
    reloading: false,
    reloadTimer: 0,
  };
  group.userData.soldier = soldier;
  group.traverse(child => { if (child.isMesh) child.userData.soldier = soldier; });
  scene.add(group);
  soldiers.push(soldier);
  (team === PLAYER_TEAM ? blueSoldiers : redSoldiers).push(soldier);
  return soldier;
}

function addObstacle(cx, cz, sx, sz, height = 5.2, material = null) {
  const mat = material || new THREE.MeshStandardMaterial({ color: 0x46515d, roughness: 0.76, metalness: 0.28 });
  const wall = mesh(new THREE.BoxGeometry(sx, height, sz), mat);
  wall.position.set(cx, height / 2, cz);
  scene.add(wall);
  obstacles.push({ minX: cx - sx / 2, maxX: cx + sx / 2, minZ: cz - sz / 2, maxZ: cz + sz / 2 });
  return wall;
}

function buildShip() {
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x4d5963, roughness: 0.58, metalness: 0.46 });
  const ceilingMat = new THREE.MeshStandardMaterial({ color: 0x303942, roughness: 0.68, metalness: 0.42 });
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x56616b, roughness: 0.6, metalness: 0.38 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x222a31, roughness: 0.48, metalness: 0.58 });
  const pipeMat = new THREE.MeshStandardMaterial({ color: 0x66727b, roughness: 0.42, metalness: 0.72 });

  const floor = mesh(new THREE.PlaneGeometry(WORLD_X, WORLD_Z), floorMat, false);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const ceiling = mesh(new THREE.PlaneGeometry(WORLD_X, WORLD_Z), ceilingMat, false);
  ceiling.position.y = 7.2; ceiling.rotation.x = Math.PI / 2; scene.add(ceiling);

  // Repeating deck plates and recessed seams give the floor a believable ship-deck scale.
  for (let x = -WORLD_X / 2 + 4; x < WORLD_X / 2; x += 8) {
    const seam = mesh(new THREE.BoxGeometry(0.045, 0.012, WORLD_Z - 4), trimMat, false);
    seam.position.set(x, 0.008, 0); scene.add(seam);
  }
  for (let z = -WORLD_Z / 2 + 4; z < WORLD_Z / 2; z += 8) {
    const seam = mesh(new THREE.BoxGeometry(WORLD_X - 4, 0.012, 0.045), trimMat, false);
    seam.position.set(0, 0.009, z); scene.add(seam);
  }

  addObstacle(0, -WORLD_Z/2 + 1, WORLD_X, 2, 7.2, wallMat);
  addObstacle(0, WORLD_Z/2 - 1, WORLD_X, 2, 7.2, wallMat);
  addObstacle(-WORLD_X/2 + 1, 0, 2, WORLD_Z, 7.2, wallMat);
  addObstacle(WORLD_X/2 - 1, 0, 2, WORLD_Z, 7.2, wallMat);

  // Room partitions with wide door openings.
  const verticalWalls = [-26, 0, 26];
  for (const x of verticalWalls) {
    for (const [z, len] of [[-30, 12], [-10, 10], [10, 10], [30, 12]]) {
      addObstacle(x, z, 1.2, len, 5.5, wallMat);
    }
  }
  for (const z of [-19, 19]) {
    for (const [x, len] of [[-39, 20], [-13, 16], [13, 16], [39, 20]]) {
      addObstacle(x, z, len, 1.2, 5.5, wallMat);
    }
  }

  // Central command room and side laboratories.
  addObstacle(-9, -7.5, 1.1, 10, 4.8, wallMat);
  addObstacle(-9, 7.5, 1.1, 10, 4.8, wallMat);
  addObstacle(9, -7.5, 1.1, 10, 4.8, wallMat);
  addObstacle(9, 7.5, 1.1, 10, 4.8, wallMat);
  addObstacle(-4.5, -12.5, 9, 1.1, 4.8, wallMat);
  addObstacle(4.5, 12.5, 9, 1.1, 4.8, wallMat);

  // Wall ribs, pipes, ventilation ducts and door-frame trim.
  for (let x = -46; x <= 46; x += 11.5) {
    for (const z of [-WORLD_Z/2 + 2.2, WORLD_Z/2 - 2.2]) {
      const rib = mesh(new THREE.BoxGeometry(0.28, 6.1, 0.5), trimMat, false); rib.position.set(x, 3.25, z); scene.add(rib);
    }
  }
  for (const z of [-29, -10, 10, 29]) {
    const pipe = mesh(new THREE.CylinderGeometry(0.12, 0.12, WORLD_X - 9, 10), pipeMat, false);
    pipe.rotation.z = Math.PI / 2; pipe.position.set(0, 6.35, z); scene.add(pipe);
    const pipe2 = pipe.clone(); pipe2.position.y = 6.0; pipe2.position.z += 0.45; scene.add(pipe2);
  }

  const coverMat = new THREE.MeshStandardMaterial({ color: 0x283640, roughness: 0.5, metalness: 0.56 });
  [[-41,-8],[-41,9],[-17,-29],[-17,29],[17,-29],[17,29],[41,-8],[41,9],[-4,0],[4,0]].forEach(([x,z], i) => {
    const cover = addObstacle(x,z, i%3===0?5.5:3.8, i%3===0?2:2.7, 1.15, coverMat);
    const panelMat = new THREE.MeshStandardMaterial({ color: i%2?0x65d7ee:0xf08a68, emissive: i%2?0x145b69:0x6d2416, emissiveIntensity: 1.4, roughness: 0.26, metalness: 0.18 });
    const panel = mesh(new THREE.BoxGeometry(1.6,0.055,0.46), panelMat, false); panel.position.set(x,1.19,z); scene.add(panel);
  });

  // Cargo containers and medical/engineering props.
  for (const [x,z,rot] of [[-35,-27,0],[-33,27,.2],[32,-27,-.1],[35,26,.1],[-18,7,.3],[18,-7,-.25]]) {
    const crate = mesh(new THREE.CapsuleGeometry(0.8, 1.7, 4, 10), new THREE.MeshStandardMaterial({ color: 0x394852, roughness:0.55, metalness:0.5 }), false);
    crate.scale.set(1.35,0.72,0.9); crate.rotation.z=Math.PI/2; crate.rotation.y=rot; crate.position.set(x,0.95,z); scene.add(crate);
  }

  // Bright ceiling strips plus localized practical lights.
  for (let x = -44; x <= 44; x += 11) {
    for (let z = -30; z <= 30; z += 15) {
      const fixture = mesh(new THREE.CapsuleGeometry(0.06, 2.5, 3, 10), new THREE.MeshBasicMaterial({ color: 0xe6f8ff }), false);
      fixture.rotation.z = Math.PI / 2; fixture.position.set(x,6.82,z); scene.add(fixture);
      const light = new THREE.PointLight(0xd8f2ff, 3.0, 19, 2); light.position.set(x,6.2,z); scene.add(light);
    }
  }

  // Colored doorway beacons help each room feel distinct.
  for (const [x,z,color] of [[-26,-19,0x62d8ff],[-26,19,0x62d8ff],[0,-19,0xffc56b],[0,19,0x8effa0],[26,-19,0xff766f],[26,19,0xff766f]]) {
    const beacon = new THREE.PointLight(color, 2.2, 9, 2); beacon.position.set(x,4.8,z); scene.add(beacon);
    const bar = mesh(new THREE.CapsuleGeometry(0.045, 0.8, 3, 8), new THREE.MeshBasicMaterial({ color }), false); bar.position.set(x,4.7,z); bar.rotation.z=Math.PI/2; scene.add(bar);
  }

  const labels = ['BLUE BAY','ENGINEERING','COMMAND','MEDICAL','CARGO','RED BAY'];
  const positions = [[-40,-34],[-17,-34],[0,-34],[17,34],[39,34],[40,-34]];
  positions.forEach(([x,z], i) => {
    const canvas = document.createElement('canvas'); canvas.width=256; canvas.height=64;
    const ctx = canvas.getContext('2d'); ctx.fillStyle='#d8f4ff'; ctx.font='bold 26px sans-serif'; ctx.textAlign='center'; ctx.fillText(labels[i],128,42);
    const tex = new THREE.CanvasTexture(canvas);
    const label = mesh(new THREE.PlaneGeometry(5.1,1.25), new THREE.MeshBasicMaterial({ map:tex, transparent:true, side:THREE.DoubleSide }), false);
    label.position.set(x,4.9,z); label.rotation.y = z>0 ? Math.PI : 0; scene.add(label);
  });
}

function collides(x, z, radius = 0.42) {
  if (Math.abs(x) > WORLD_X/2 - 2.1 || Math.abs(z) > WORLD_Z/2 - 2.1) return true;
  for (const o of obstacles) {
    const px = Math.max(o.minX, Math.min(x, o.maxX));
    const pz = Math.max(o.minZ, Math.min(z, o.maxZ));
    const dx = x-px, dz=z-pz;
    if (dx*dx + dz*dz < radius*radius) return true;
  }
  return false;
}

function segmentBlocked(a, b) {
  const steps = Math.ceil(a.distanceTo(b) / 1.2);
  for (let i=1;i<steps;i++) {
    const t=i/steps; const x=THREE.MathUtils.lerp(a.x,b.x,t); const z=THREE.MathUtils.lerp(a.z,b.z,t);
    if (collides(x,z,0.15)) return true;
  }
  return false;
}

function spawnSoldier(soldier) {
  const points = soldier.team === PLAYER_TEAM ? spawnBlue : spawnRed;
  const base = points[Math.floor(Math.random()*points.length)];
  let pos = base.clone();
  for (let tries=0;tries<20;tries++) {
    pos.set(base.x + (Math.random()-.5)*9,0,base.z+(Math.random()-.5)*9);
    if (!collides(pos.x,pos.z,0.55)) break;
  }
  soldier.group.position.copy(pos);
  soldier.group.position.y = 0;
  soldier.group.visible = !soldier.isPlayer;
  soldier.shotsTaken = 0;
  soldier.health = MAX_HEALTH;
  soldier.alive = true;
  soldier.respawnTimer = 0;
  soldier.target = null;
  soldier.ammo = MAGAZINE_SIZE;
  soldier.reloading = false;
  soldier.reloadTimer = 0;
  soldier.targetPoint.copy(waypoints[Math.floor(Math.random()*waypoints.length)]);
  if (soldier.isPlayer) {
    ammo = MAGAZINE_SIZE; reloading = false; reloadTimer = 0;
    updateHud();
  }
}

function createTeams() {
  player = createSoldier(PLAYER_TEAM, true, 0);
  for (let i = 1; i <= BOTS_PER_TEAM; i++) createSoldier(PLAYER_TEAM, false, i);
  for (let i = 0; i < BOTS_PER_TEAM; i++) createSoldier(ENEMY_TEAM, false, i);
  soldiers.forEach(spawnSoldier);
  // The local player uses a dedicated first-person view model instead of rendering their own body into the camera.
  player.group.visible = false;
  root.dataset.soldierCount = String(soldiers.length);
  root.dataset.cameraMode = 'first-person';
}

function setDamageFromShots(soldier) {
  soldier.health = Math.max(0, MAX_HEALTH * (1 - soldier.shotsTaken / SHOTS_TO_KILL));
}

function addKillFeed(text, team) {
  const line=document.createElement('div'); line.textContent=text; line.style.borderLeftColor=team===PLAYER_TEAM?'#72d6ff':'#ff736c'; killFeed.prepend(line);
  while(killFeed.children.length>6) killFeed.lastChild.remove();
  setTimeout(()=>line.remove(),5000);
}

function eliminate(victim, killerTeam, killerName='Soldier') {
  if (!victim.alive || ended) return;
  victim.alive=false; victim.group.visible=false; victim.respawnTimer=RESPAWN_SECONDS; victim.target=null;
  if (killerTeam===PLAYER_TEAM) blueScore++; else redScore++;
  addKillFeed(`${killerName} eliminated ${victim.isPlayer?'YOU':victim.id.toUpperCase()}`, killerTeam);
  audio?.death();
  updateHud();
  if (victim.isPlayer) {
    respawnOverlay.textContent='YOU WERE ELIMINATED · RESPAWNING'; respawnOverlay.classList.add('visible');
  }
  if (blueScore>=KILLS_TO_WIN || redScore>=KILLS_TO_WIN) finishMatch(blueScore>=KILLS_TO_WIN);
}

function damageSoldier(target, attackerTeam, attackerName='Soldier') {
  if (!target.alive || target.team===attackerTeam || ended) return;
  target.shotsTaken++;
  setDamageFromShots(target);
  target.hitFlash=0.09;
  if (target.isPlayer) {
    damageVignette.style.opacity='0.6';
    audio?.hurt();
    setTimeout(()=>{damageVignette.style.opacity='0';},90);
  }
  if (target.shotsTaken>=SHOTS_TO_KILL) eliminate(target,attackerTeam,attackerName);
  updateHud();
}

function nearestEnemy(soldier) {
  const enemies=soldier.team===PLAYER_TEAM?redSoldiers:blueSoldiers;
  let best=null,bestD=Infinity;
  for(const enemy of enemies){
    if(!enemy.alive) continue;
    const dx=enemy.group.position.x-soldier.group.position.x, dz=enemy.group.position.z-soldier.group.position.z;
    const d=dx*dx+dz*dz;
    if(d<bestD){bestD=d;best=enemy;}
  }
  return best;
}

function animateSoldier(soldier, moving, delta) {
  if (!soldier.alive) return;
  const cadence = moving ? 7.5 : 2.0;
  soldier.walkPhase += delta * cadence;
  const stride = moving ? Math.sin(soldier.walkPhase) : Math.sin(soldier.walkPhase) * 0.04;
  const liftL = moving ? Math.max(0, Math.sin(soldier.walkPhase)) : 0;
  const liftR = moving ? Math.max(0, Math.sin(soldier.walkPhase + Math.PI)) : 0;

  soldier.leftLeg.pivot.rotation.x = stride * 0.72;
  soldier.rightLeg.pivot.rotation.x = -stride * 0.72;
  soldier.leftLeg.knee.rotation.x = liftR * 0.7;
  soldier.rightLeg.knee.rotation.x = liftL * 0.7;
  soldier.leftLeg.knee.rotation.z = -0.02;
  soldier.rightLeg.knee.rotation.z = 0.02;

  if (soldier.reloading) {
    const rp = 1 - soldier.reloadTimer / RELOAD_SECONDS;
    soldier.leftArm.pivot.rotation.x = -0.45 - Math.sin(rp * Math.PI) * 0.7;
    soldier.rightArm.pivot.rotation.x = -0.9 + Math.sin(rp * Math.PI) * 0.25;
    soldier.leftArm.elbow.rotation.x = -0.9 + Math.sin(rp * Math.PI * 2) * 0.45;
    soldier.rightArm.elbow.rotation.x = -0.6;
    soldier.rifle.rotation.z = Math.sin(rp * Math.PI) * 0.55;
    soldier.rifle.position.y = 1.9 - Math.sin(rp * Math.PI) * 0.25;
  } else {
    // Rifle-ready upper body with natural counter-motion from the walk cycle.
    soldier.leftArm.pivot.rotation.x = -1.05 + stride * 0.1;
    soldier.rightArm.pivot.rotation.x = -1.18 - stride * 0.08;
    soldier.leftArm.pivot.rotation.z = -0.34;
    soldier.rightArm.pivot.rotation.z = 0.2;
    soldier.leftArm.elbow.rotation.x = -0.68;
    soldier.rightArm.elbow.rotation.x = -0.78;
    soldier.rifle.rotation.z = THREE.MathUtils.lerp(soldier.rifle.rotation.z, 0, Math.min(1, delta * 9));
    soldier.rifle.position.y = THREE.MathUtils.lerp(soldier.rifle.position.y, 1.9, Math.min(1, delta * 9));
  }

  soldier.group.position.y = moving ? Math.abs(Math.sin(soldier.walkPhase * 2)) * 0.035 : 0;
  if (soldier.hitFlash > 0) { soldier.hitFlash -= delta; soldier.muzzle.intensity = 0; }
}

function tryMove(soldier, dx, dz) {
  const p=soldier.group.position;
  const nx=p.x+dx, nz=p.z+dz;
  if(!collides(nx,p.z)) p.x=nx;
  if(!collides(p.x,nz)) p.z=nz;
}

function fireTrace(from, to, team) {
  const geom=new THREE.BufferGeometry().setFromPoints([from,to]);
  const mat=new THREE.LineBasicMaterial({ color:team===PLAYER_TEAM?0x8be0ff:0xff806f, transparent:true, opacity:0.95, blending:THREE.AdditiveBlending, depthWrite:false });
  const line=new THREE.Line(geom,mat); scene.add(line); bulletTraces.push({line,life:0.07});
}

function shootBot(bot, target) {
  if (!bot.alive || !target?.alive || bot.reloading) return;
  if (bot.ammo <= 0) {
    bot.reloading = true;
    bot.reloadTimer = RELOAD_SECONDS;
    return;
  }
  const from = bot.group.position.clone().add(new THREE.Vector3(0, 2.0, 0));
  const to = target.group.position.clone().add(new THREE.Vector3(0, 1.75, 0));
  if (segmentBlocked(from, to)) return;
  const distance = from.distanceTo(to);
  bot.group.rotation.y = Math.atan2(target.group.position.x - bot.group.position.x, target.group.position.z - bot.group.position.z);
  bot.ammo -= 1;
  bot.muzzle.intensity = 6; setTimeout(() => bot.muzzle.intensity = 0, 45);
  audio?.rifle(0.26);
  const spreadChance = THREE.MathUtils.clamp(0.84 - distance / 90, 0.28, 0.78);
  const hit = Math.random() < spreadChance;
  const end = hit ? to : to.clone().add(new THREE.Vector3((Math.random()-.5)*4, (Math.random()-.5)*2, (Math.random()-.5)*4));
  fireTrace(from, end, bot.team);
  if (hit) damageSoldier(target, bot.team, bot.id.toUpperCase());
  if (bot.ammo <= 0) { bot.reloading = true; bot.reloadTimer = RELOAD_SECONDS; }
}

function updateBots(delta) {
  botThinkTimer-=delta;
  const think=botThinkTimer<=0;
  if(think) botThinkTimer=0.22;
  for(const bot of soldiers){
    if(bot.isPlayer) continue;
    if(!bot.alive){
      bot.respawnTimer-=delta; if(bot.respawnTimer<=0&&!ended) spawnSoldier(bot); continue;
    }
    if (bot.reloading) {
      bot.reloadTimer -= delta;
      if (bot.reloadTimer <= 0) { bot.reloading = false; bot.ammo = MAGAZINE_SIZE; }
    }
    const renderDistance = player ? Math.hypot(bot.group.position.x-player.group.position.x, bot.group.position.z-player.group.position.z) : 0;
    bot.group.visible = bot.alive && renderDistance < 56;
    if(think || !bot.target?.alive) bot.target=nearestEnemy(bot);
    const target=bot.target;
    let moving=false;
    if(target){
      const toTarget=target.group.position.clone().sub(bot.group.position); toTarget.y=0;
      const dist=toTarget.length();
      const los=!segmentBlocked(bot.group.position.clone().add(new THREE.Vector3(0,1.5,0)),target.group.position.clone().add(new THREE.Vector3(0,1.5,0)));
      bot.fireCooldown-=delta;
      if(dist<28 && los){
        bot.group.rotation.y=Math.atan2(toTarget.x,toTarget.z);
        if(dist>11){toTarget.normalize(); tryMove(bot,toTarget.x*BOT_SPEED*bot.speedScale*delta,toTarget.z*BOT_SPEED*bot.speedScale*delta); moving=true;}
        else if(dist<6){toTarget.normalize(); tryMove(bot,-toTarget.x*BOT_SPEED*.55*delta,-toTarget.z*BOT_SPEED*.55*delta); moving=true;}
        if(bot.fireCooldown<=0){shootBot(bot,target); bot.fireCooldown=BOT_FIRE_INTERVAL_MIN+Math.random()*(BOT_FIRE_INTERVAL_MAX-BOT_FIRE_INTERVAL_MIN);}
      } else {
        const wp=bot.targetPoint; const d=wp.clone().sub(bot.group.position); d.y=0;
        if(d.length()<2.2 || collides(wp.x,wp.z,.5)) bot.targetPoint.copy(waypoints[Math.floor(Math.random()*waypoints.length)]);
        else {d.normalize(); bot.group.rotation.y=Math.atan2(d.x,d.z); tryMove(bot,d.x*BOT_SPEED*bot.speedScale*delta,d.z*BOT_SPEED*bot.speedScale*delta); moving=true;}
      }
    }
    animateSoldier(bot,moving,delta);
  }
}

function createFirstPersonRifle() {
  const weapon = new THREE.Group();
  weapon.position.set(0.42, -0.38, -0.72);
  weapon.rotation.set(-0.06, -0.08, -0.02);
  camera.add(weapon);

  const gunMetal = new THREE.MeshStandardMaterial({ color: 0x242a2f, roughness: 0.34, metalness: 0.78 });
  const darkPolymer = new THREE.MeshStandardMaterial({ color: 0x101417, roughness: 0.58, metalness: 0.12 });
  const handMat = new THREE.MeshStandardMaterial({ color: 0xc39d83, roughness: 0.78 });
  const opticGlass = new THREE.MeshStandardMaterial({ color: 0x6fd9ff, emissive: 0x165c72, emissiveIntensity: 1.15, roughness: 0.12, metalness: 0.18 });

  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.82), gunMetal); receiver.position.set(0, 0, -0.25); weapon.add(receiver);
  const handguard = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.11, 0.7, 12), darkPolymer); handguard.rotation.x = Math.PI / 2; handguard.position.set(0, -0.005, -0.92); weapon.add(handguard);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.032, 0.72, 12), gunMetal); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.005, -1.58); weapon.add(barrel);
  const muzzleBrake = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.16, 12), gunMetal); muzzleBrake.rotation.x = Math.PI / 2; muzzleBrake.position.set(0, 0.005, -1.98); weapon.add(muzzleBrake);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.22, 0.48), darkPolymer); stock.position.set(0, 0.015, 0.42); stock.rotation.x = -0.08; weapon.add(stock);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.34, 0.16), darkPolymer); grip.position.set(0, -0.24, -0.15); grip.rotation.x = -0.25; weapon.add(grip);
  const magazine = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.42, 0.22), darkPolymer); magazine.position.set(0, -0.3, -0.42); magazine.rotation.x = 0.1; weapon.add(magazine);
  viewMagazine = magazine;

  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.045, 0.9), gunMetal); rail.position.set(0, 0.13, -0.48); weapon.add(rail);
  const optic = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.27, 12), darkPolymer); optic.rotation.x = Math.PI / 2; optic.position.set(0, 0.23, -0.35); weapon.add(optic);
  const opticLens = new THREE.Mesh(new THREE.CircleGeometry(0.057, 16), opticGlass); opticLens.position.set(0, 0.23, -0.495); weapon.add(opticLens);

  const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.16, 0.05), gunMetal); frontSight.position.set(0, 0.18, -1.45); weapon.add(frontSight);

  const leftHand = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.3, 4, 10), handMat); leftHand.rotation.z = Math.PI / 2; leftHand.rotation.y = 0.25; leftHand.position.set(-0.18, -0.13, -0.95); weapon.add(leftHand);
  const rightHand = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.28, 4, 10), handMat); rightHand.rotation.z = Math.PI / 2; rightHand.rotation.y = -0.28; rightHand.position.set(0.17, -0.22, -0.18); weapon.add(rightHand);

  viewMuzzle = new THREE.PointLight(0x9ee8ff, 0, 6, 2); viewMuzzle.position.set(0, 0.02, -2.08); weapon.add(viewMuzzle);
  const weaponLight = new THREE.PointLight(0xdceeff, 1.25, 4, 2); weaponLight.position.set(0.2, 0.4, 0.2); camera.add(weaponLight);

  viewWeapon = weapon;
}

function userAimTarget() {
  const raycaster=new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(0,0),camera);
  const aliveEnemies=redSoldiers.filter(s=>s.alive).map(s=>s.torso);
  const hits=raycaster.intersectObjects(aliveEnemies,false);
  if(!hits.length) return null;
  const target=hits[0].object.parent?.userData?.soldier || hits[0].object.userData?.soldier;
  // torso belongs directly under group, so walk parents.
  let obj=hits[0].object;
  while(obj && !obj.userData?.soldier) obj=obj.parent;
  return obj?.userData?.soldier || target;
}

function startReload() {
  if (reloading || ammo === MAGAZINE_SIZE || !player.alive || ended) return;
  reloading = true; reloadTimer = RELOAD_SECONDS; firing = false; audio?.reloadStart(); updateHud();
}

function updateReload(delta) {
  if (!reloading) return;
  reloadTimer -= delta;
  const progress = THREE.MathUtils.clamp(1 - reloadTimer / RELOAD_SECONDS, 0, 1);
  const lower = Math.sin(progress * Math.PI);
  const twist = Math.sin(progress * Math.PI * 2);

  if (viewWeapon) {
    viewWeapon.position.set(0.42 + twist * 0.05, -0.38 - lower * 0.38, -0.72 + lower * 0.08);
    viewWeapon.rotation.set(-0.06 + lower * 0.28, -0.08 + twist * 0.08, -0.02 + lower * 0.48);
  }
  if (viewMagazine) {
    if (progress < 0.38) {
      const p = progress / 0.38;
      viewMagazine.position.y = -0.3 - p * 0.52;
      viewMagazine.rotation.z = p * 0.35;
    } else if (progress < 0.62) {
      viewMagazine.visible = false;
    } else {
      viewMagazine.visible = true;
      const p = (progress - 0.62) / 0.38;
      viewMagazine.position.y = -0.82 + p * 0.52;
      viewMagazine.rotation.z = (1 - p) * -0.3;
    }
  }

  reloadStatus.textContent = `RELOADING ${Math.ceil(Math.max(0,reloadTimer)*10)/10}s`;
  if (reloadTimer <= 0) {
    reloading = false; ammo = MAGAZINE_SIZE;
    if (viewWeapon) { viewWeapon.position.set(0.42,-0.38,-0.72); viewWeapon.rotation.set(-0.06,-0.08,-0.02); }
    if (viewMagazine) { viewMagazine.visible = true; viewMagazine.position.set(0,-0.3,-0.42); viewMagazine.rotation.set(0.1,0,0); }
    audio?.reloadEnd(); updateHud();
  }
}

function shootUser() {
  if(!started||paused||ended||!player.alive||reloading||ammo<=0) { if(ammo<=0&&!reloading) startReload(); return; }
  ammo--; userFireTimer=USER_FIRE_INTERVAL;
  if (viewMuzzle) { viewMuzzle.intensity = 9; setTimeout(()=>{ if(viewMuzzle) viewMuzzle.intensity=0; },38); }
  if (viewWeapon) { viewWeapon.position.z += 0.035; viewWeapon.rotation.x -= 0.015; }
  audio?.rifle(0.72);
  const raycaster=new THREE.Raycaster(); raycaster.setFromCamera(new THREE.Vector2(0,0),camera); raycaster.far=90;
  const targets=redSoldiers.filter(s=>s.alive).map(s=>s.torso);
  const hits=raycaster.intersectObjects(targets,false);
  const from = camera.getWorldPosition(new THREE.Vector3()).add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(0.45));
  let end=camera.position.clone().add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(80));
  if(hits.length){
    let obj=hits[0].object; while(obj && !obj.userData?.soldier) obj=obj.parent;
    const target=obj?.userData?.soldier;
    if(target && !segmentBlocked(from,hits[0].point)){end=hits[0].point;damageSoldier(target,PLAYER_TEAM,'YOU');}
  }
  fireTrace(from,end,PLAYER_TEAM);
  if(ammo===0) setTimeout(startReload,80);
  updateHud();
}

function updatePlayer(delta) {
  if (!player.alive) {
    player.respawnTimer -= delta;
    if (player.respawnTimer <= 0 && !ended) {
      spawnSoldier(player);
      player.group.visible = false;
      respawnOverlay.classList.remove('visible');
    }
    return;
  }

  const inputX = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
  const inputZ = Number(keys.has('KeyW')) - Number(keys.has('KeyS'));
  let moving = false;
  if (inputX || inputZ) {
    const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const right = new THREE.Vector3(forward.z, 0, -forward.x);
    const dir = forward.multiplyScalar(inputZ).add(right.multiplyScalar(inputX)).normalize();
    tryMove(player, dir.x * MOVE_SPEED * delta, dir.z * MOVE_SPEED * delta);
    moving = true;
    player.group.rotation.y = yaw;
  }

  if (moving) {
    weaponBobPhase += delta * 9.5;
    audio?.step();
  }

  if (!reloading && viewWeapon) {
    const bob = moving ? 1 : 0;
    const targetX = 0.42 + Math.sin(weaponBobPhase) * 0.018 * bob;
    const targetY = -0.38 - Math.abs(Math.cos(weaponBobPhase * 2)) * 0.018 * bob;
    const targetZ = -0.72;
    viewWeapon.position.x = THREE.MathUtils.lerp(viewWeapon.position.x, targetX, Math.min(1, delta * 14));
    viewWeapon.position.y = THREE.MathUtils.lerp(viewWeapon.position.y, targetY, Math.min(1, delta * 14));
    viewWeapon.position.z = THREE.MathUtils.lerp(viewWeapon.position.z, targetZ, Math.min(1, delta * 18));
    viewWeapon.rotation.x = THREE.MathUtils.lerp(viewWeapon.rotation.x, -0.06, Math.min(1, delta * 16));
    viewWeapon.rotation.z = THREE.MathUtils.lerp(viewWeapon.rotation.z, -0.02 + Math.sin(weaponBobPhase) * 0.008 * bob, Math.min(1, delta * 12));
  }

  if (firing && userFireTimer <= 0) shootUser();
  userFireTimer -= delta;
  updateReload(delta);
}

function updateCamera(delta) {
  if (!player) return;
  camera.position.set(player.group.position.x, 2.72, player.group.position.z);
  camera.rotation.y = yaw + Math.PI;
  camera.rotation.x = pitch;
  camera.rotation.z = 0;
}

function updateTraces(delta){
  for(let i=bulletTraces.length-1;i>=0;i--){const t=bulletTraces[i];t.life-=delta;t.line.material.opacity=Math.max(0,t.life/0.07);if(t.life<=0){scene.remove(t.line);t.line.geometry.dispose();t.line.material.dispose();bulletTraces.splice(i,1);}}
}

function updateHud(){
  blueScoreText.textContent=String(blueScore); redScoreText.textContent=String(redScore);
  ammoText.textContent=`${ammo} / ∞`; healthText.textContent=`${Math.ceil(player?.health||0)} / 40`;
  healthFill.style.transform=`scaleX(${Math.max(0,(player?.health||0)/MAX_HEALTH)})`;
  if(!reloading) reloadStatus.textContent=ammo<=12?'LOW AMMO · PRESS R':'';
}

function drawMinimap(){
  const w=minimap.width,h=minimap.height; const sx=w/WORLD_X, sz=h/WORLD_Z;
  minimapCtx.clearRect(0,0,w,h); minimapCtx.fillStyle='#0e1820'; minimapCtx.fillRect(0,0,w,h);
  minimapCtx.fillStyle='#53616d';
  for(const o of obstacles){minimapCtx.fillRect((o.minX+WORLD_X/2)*sx,(o.minZ+WORLD_Z/2)*sz,(o.maxX-o.minX)*sx,(o.maxZ-o.minZ)*sz);}
  for(const s of soldiers){if(!s.alive)continue; const x=(s.group.position.x+WORLD_X/2)*sx,z=(s.group.position.z+WORLD_Z/2)*sz; minimapCtx.beginPath();minimapCtx.fillStyle=s.team===PLAYER_TEAM?'#67d5ff':'#ff6d64';minimapCtx.arc(x,z,s.isPlayer?6:3.2,0,Math.PI*2);minimapCtx.fill();}
  if(player?.alive){const x=(player.group.position.x+WORLD_X/2)*sx,z=(player.group.position.z+WORLD_Z/2)*sz;minimapCtx.strokeStyle='#fff';minimapCtx.lineWidth=3;minimapCtx.beginPath();minimapCtx.moveTo(x,z);minimapCtx.lineTo(x+Math.sin(yaw)*12,z+Math.cos(yaw)*12);minimapCtx.stroke();}
}

class TdmAudio {
  constructor(){this.ctx=null;this.master=null;this.lastStep=0;}
  async start(){if(!this.ctx){this.ctx=new (window.AudioContext||window.webkitAudioContext)();this.master=this.ctx.createGain();this.master.gain.value=.48;this.master.connect(this.ctx.destination);this.ambient();}if(this.ctx.state==='suspended')await this.ctx.resume();}
  tone(freq,dur,vol,type='sine',endFreq=null){if(!this.ctx)return;const now=this.ctx.currentTime,o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type=type;o.frequency.setValueAtTime(freq,now);if(endFreq)o.frequency.exponentialRampToValueAtTime(endFreq,now+dur);g.gain.setValueAtTime(.0001,now);g.gain.exponentialRampToValueAtTime(vol,now+.008);g.gain.exponentialRampToValueAtTime(.0001,now+dur);o.connect(g).connect(this.master);o.start(now);o.stop(now+dur+.02);}
  noise(dur,vol,high=300){if(!this.ctx)return;const len=Math.floor(this.ctx.sampleRate*dur),buf=this.ctx.createBuffer(1,len,this.ctx.sampleRate),d=buf.getChannelData(0);for(let i=0;i<len;i++)d[i]=Math.random()*2-1;const s=this.ctx.createBufferSource(),f=this.ctx.createBiquadFilter(),g=this.ctx.createGain();s.buffer=buf;f.type='highpass';f.frequency.value=high;g.gain.setValueAtTime(vol,this.ctx.currentTime);g.gain.exponentialRampToValueAtTime(.0001,this.ctx.currentTime+dur);s.connect(f).connect(g).connect(this.master);s.start();}
  ambient(){const bus=this.ctx.createGain();bus.gain.value=.04;bus.connect(this.master);[42,58,79].forEach((f,i)=>{const o=this.ctx.createOscillator();o.type=i===1?'triangle':'sine';o.frequency.value=f;o.detune.value=(i-1)*6;o.connect(bus);o.start();});setInterval(()=>{if(this.ctx?.state==='running'&&started&&!paused&&!ended){this.tone(220+Math.random()*180,.16,.018,'sine',130+Math.random()*80);}},2400);}
  rifle(scale=1){this.noise(.055,.08*scale,900);this.tone(92,.08,.07*scale,'square',48);}
  step(){const now=performance.now();if(now-this.lastStep<330)return;this.lastStep=now;this.tone(58,.09,.055,'triangle',42);}
  reloadStart(){this.tone(410,.08,.07,'square',220);setTimeout(()=>this.tone(180,.11,.07,'triangle',110),430);}
  reloadEnd(){this.tone(620,.07,.09,'square',380);this.tone(120,.13,.04,'triangle',80);}
  hurt(){this.noise(.18,.12,180);this.tone(70,.2,.1,'sawtooth',45);}
  death(){this.tone(48,.5,.08,'sawtooth',24);}
  victory(){[240,320,420].forEach((f,i)=>setTimeout(()=>this.tone(f,.35,.08,'triangle',f*1.4),i*160));}
}

audio=new TdmAudio();

function finishMatch(blueWon){
  ended=true;paused=true;firing=false;document.exitPointerLock?.();
  endKicker.textContent=blueWon?'BLUE TEAM VICTORY':'BLUE TEAM DEFEATED';
  endTitle.textContent=blueWon?'40 KILLS. MATCH WON.':'RED TEAM REACHED 40 KILLS.';
  endCopy.textContent=`Final score: Blue ${blueScore} — Red ${redScore}. Every eliminated soldier fought again until the team kill limit was reached.`;
  endOverlay.classList.add('visible');
  if(blueWon) audio?.victory(); else audio?.death();
}

function pauseGame(){if(!started||paused||ended)return;paused=true;firing=false;document.exitPointerLock?.();pauseOverlay.classList.add('visible');}
async function resumeGame(){if(ended)return;await audio.start();paused=false;pauseOverlay.classList.remove('visible');renderer.domElement.requestPointerLock();}

function setup(){buildShip();createTeams();createFirstPersonRifle();updateHud();drawMinimap();}
setup();

enterButton.addEventListener('click',async()=>{await audio.start();started=true;paused=false;startOverlay.classList.remove('visible');renderer.domElement.requestPointerLock();});
resumeButton.addEventListener('click',resumeGame); restartButton.addEventListener('click',()=>location.reload()); playAgainButton.addEventListener('click',()=>location.reload());
renderer.domElement.addEventListener('click',()=>{if(started&&!paused&&!ended&&document.pointerLockElement!==renderer.domElement)renderer.domElement.requestPointerLock();});
addEventListener('pointerdown',e=>{if(e.button===0)firing=true;}); addEventListener('pointerup',e=>{if(e.button===0)firing=false;});
addEventListener('keydown',e=>{keys.add(e.code);if(e.code==='Space'){e.preventDefault();firing=true;}if(e.code==='KeyR')startReload();if(e.code==='Escape')pauseGame();});
addEventListener('keyup',e=>{keys.delete(e.code);if(e.code==='Space')firing=false;});
addEventListener('mousemove',e=>{if(document.pointerLockElement!==renderer.domElement||paused||ended)return;yaw-=e.movementX*.0024;pitch=THREE.MathUtils.clamp(pitch-e.movementY*.0018,-1.15,1.05);});
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});

document.addEventListener('pointerlockchange',()=>{if(started&&!ended&&document.pointerLockElement!==renderer.domElement&&!paused)pauseGame();});

function loop(now){
  requestAnimationFrame(loop);
  const delta=Math.min(.05,(now-lastTime)/1000);lastTime=now;
  if(started&&!paused&&!ended){updatePlayer(delta);updateBots(delta);updateCamera(delta);updateTraces(delta);drawMinimap();}
  renderer.render(scene,camera);
}
requestAnimationFrame(loop);
