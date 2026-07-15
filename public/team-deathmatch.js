import * as THREE from 'three';

const PLAYER_TEAM = 'blue';
const ENEMY_TEAM = 'red';
const TEAM_SIZE = 40;
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
const WORLD_X = 112;
const WORLD_Z = 82;

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

const camera = new THREE.PerspectiveCamera(67, innerWidth / innerHeight, 0.08, 280);
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
let pitch = -0.16;
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
  head: new THREE.SphereGeometry(0.25, 10, 8),
  helmet: new THREE.SphereGeometry(0.285, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.63),
  torso: new THREE.CapsuleGeometry(0.34, 0.92, 4, 8),
  pelvis: new THREE.CapsuleGeometry(0.26, 0.34, 3, 7),
  upperLimb: new THREE.CylinderGeometry(0.09, 0.115, 0.72, 7),
  lowerLimb: new THREE.CylinderGeometry(0.075, 0.095, 0.68, 7),
  upperLeg: new THREE.CylinderGeometry(0.11, 0.14, 0.82, 7),
  lowerLeg: new THREE.CylinderGeometry(0.085, 0.11, 0.78, 7),
  hand: new THREE.SphereGeometry(0.095, 7, 6),
  foot: new THREE.CapsuleGeometry(0.1, 0.28, 3, 6),
  rifleBody: new THREE.CapsuleGeometry(0.075, 0.72, 3, 7),
  rifleBarrel: new THREE.CylinderGeometry(0.028, 0.035, 0.64, 7),
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

  // Smooth low-poly humanoid: capsule torso, spherical head, tapered cylindrical limbs.
  // The reduced mesh count keeps all 80 human soldiers performant without making them blocky.
  const torso = new THREE.Mesh(geo.torso, uniform); torso.position.y = 1.95; torso.scale.set(1.0, 1.05, 0.72); group.add(torso);
  const head = new THREE.Mesh(geo.head, shared.skin); head.position.y = 2.9; group.add(head);
  const helmet = new THREE.Mesh(geo.helmet, shared.dark); helmet.position.y = 3.0; group.add(helmet);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.075, 0.035), shared.visor); visor.position.set(0, 2.94, -0.225); group.add(visor);
  const teamLamp = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 5), glow); teamLamp.position.set(0, 2.15, -0.34); group.add(teamLamp);

  function arm(x) {
    const pivot = new THREE.Group(); pivot.position.set(x, 2.34, 0); group.add(pivot);
    const limb = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.95, 3, 6), uniform); limb.position.y = -0.58; pivot.add(limb);
    const elbow = new THREE.Group(); elbow.position.y = -1.0; pivot.add(elbow);
    return { pivot, elbow };
  }
  function leg(x) {
    const pivot = new THREE.Group(); pivot.position.set(x, 1.25, 0); group.add(pivot);
    const limb = new THREE.Mesh(new THREE.CapsuleGeometry(0.105, 1.05, 3, 6), uniform); limb.position.y = -0.66; pivot.add(limb);
    const knee = new THREE.Group(); knee.position.y = -0.9; pivot.add(knee);
    return { pivot, knee };
  }
  const leftArm = arm(-0.42), rightArm = arm(0.42), leftLeg = leg(-0.17), rightLeg = leg(0.17);

  const rifle = new THREE.Group();
  rifle.position.set(0.32, 1.82, -0.5); rifle.rotation.x = Math.PI / 2; group.add(rifle);
  const rifleBody = new THREE.Mesh(geo.rifleBody, shared.rifle); rifle.add(rifleBody);
  const barrel = new THREE.Mesh(geo.rifleBarrel, shared.rifle); barrel.position.y = -0.65; rifle.add(barrel);
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
  };
  group.userData.soldier = soldier;
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
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x596573, roughness: 0.7, metalness: 0.34 });
  const floor = mesh(new THREE.PlaneGeometry(WORLD_X, WORLD_Z), floorMat, false);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

  const ceiling = mesh(new THREE.PlaneGeometry(WORLD_X, WORLD_Z), new THREE.MeshStandardMaterial({ color: 0x38434d, roughness: 0.8, metalness: 0.25 }), false);
  ceiling.position.y = 7; ceiling.rotation.x = Math.PI / 2; scene.add(ceiling);

  const outerMat = new THREE.MeshStandardMaterial({ color: 0x3b4651, roughness: 0.72, metalness: 0.35 });
  addObstacle(0, -WORLD_Z/2 + 1, WORLD_X, 2, 7, outerMat);
  addObstacle(0, WORLD_Z/2 - 1, WORLD_X, 2, 7, outerMat);
  addObstacle(-WORLD_X/2 + 1, 0, 2, WORLD_Z, 7, outerMat);
  addObstacle(WORLD_X/2 - 1, 0, 2, WORLD_Z, 7, outerMat);

  const partitionMat = new THREE.MeshStandardMaterial({ color: 0x4e5964, roughness: 0.76, metalness: 0.3 });
  const doors = [-25, 0, 25];
  for (const x of [-28, 0, 28]) {
    for (const z0 of [-31, -10, 11, 32]) {
      const segmentStart = z0;
      const segmentEnd = z0 + 9;
      addObstacle(x, (segmentStart + segmentEnd)/2, 1.4, segmentEnd - segmentStart, 5.4, partitionMat);
    }
  }
  for (const z of [-20, 20]) {
    for (const x0 of [-47, -24, 2, 25]) {
      addObstacle(x0 + 9, z, 18, 1.4, 5.4, partitionMat);
    }
  }

  // Central command room with wide entrances.
  addObstacle(-10, -8, 1.2, 11, 4.7, partitionMat);
  addObstacle(-10, 8, 1.2, 11, 4.7, partitionMat);
  addObstacle(10, -8, 1.2, 11, 4.7, partitionMat);
  addObstacle(10, 8, 1.2, 11, 4.7, partitionMat);
  addObstacle(-5, -13, 10, 1.2, 4.7, partitionMat);
  addObstacle(5, 13, 10, 1.2, 4.7, partitionMat);

  // Consoles and cover.
  const coverMat = new THREE.MeshStandardMaterial({ color: 0x263641, roughness: 0.62, metalness: 0.48 });
  [[-43,-8],[-43,9],[-17,-31],[-17,31],[17,-31],[17,31],[43,-8],[43,9],[-4,0],[4,0]].forEach(([x,z], i) => {
    const cover = addObstacle(x,z, i%3===0?6:4, i%3===0?2:3, 1.25, coverMat);
    const panel = mesh(new THREE.BoxGeometry(1.7,0.05,0.5), new THREE.MeshStandardMaterial({ color: i%2?0x5bc9e8:0xef775d, emissive: i%2?0x0b667a:0x6b150f, emissiveIntensity: 1.25, roughness:0.3 }), false);
    panel.position.set(x,1.29,z); scene.add(panel);
  });

  // Bright ceiling strips.
  for (let x = -45; x <= 45; x += 15) {
    for (let z = -30; z <= 30; z += 15) {
      const fixture = mesh(new THREE.BoxGeometry(4.8,0.08,0.35), new THREE.MeshBasicMaterial({ color: 0xd6f4ff }), false);
      fixture.position.set(x,6.72,z); scene.add(fixture);
      const light = new THREE.PointLight(0xc7ecff, 4.1, 22, 2); light.position.set(x,6.2,z); scene.add(light);
    }
  }

  // Door labels emphasize distinct rooms.
  const labels = ['BLUE BAY','ENGINE','COMMAND','MEDICAL','CARGO','RED BAY'];
  const positions = [[-42,-35],[-16,-35],[0,-35],[16,35],[39,35],[42,-35]];
  positions.forEach(([x,z], i) => {
    const canvas = document.createElement('canvas'); canvas.width=256; canvas.height=64;
    const ctx = canvas.getContext('2d'); ctx.fillStyle='#d8f4ff'; ctx.font='bold 28px sans-serif'; ctx.textAlign='center'; ctx.fillText(labels[i],128,42);
    const tex = new THREE.CanvasTexture(canvas);
    const label = mesh(new THREE.PlaneGeometry(5.4,1.35), new THREE.MeshBasicMaterial({ map:tex, transparent:true, side:THREE.DoubleSide }), false);
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
  soldier.group.visible = true;
  soldier.shotsTaken = 0;
  soldier.health = MAX_HEALTH;
  soldier.alive = true;
  soldier.respawnTimer = 0;
  soldier.target = null;
  soldier.targetPoint.copy(waypoints[Math.floor(Math.random()*waypoints.length)]);
  if (soldier.isPlayer) {
    ammo = MAGAZINE_SIZE; reloading = false; reloadTimer = 0;
    updateHud();
  }
}

function createTeams() {
  player = createSoldier(PLAYER_TEAM, true, 0);
  for (let i=1;i<TEAM_SIZE;i++) createSoldier(PLAYER_TEAM,false,i);
  for (let i=0;i<TEAM_SIZE;i++) createSoldier(ENEMY_TEAM,false,i);
  soldiers.forEach(spawnSoldier);
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
  if(!soldier.alive) return;
  const speed=moving?8.5:2.2; soldier.walkPhase+=delta*speed;
  const swing=moving?Math.sin(soldier.walkPhase)*0.62:Math.sin(soldier.walkPhase)*0.04;
  soldier.leftLeg.pivot.rotation.x=swing; soldier.rightLeg.pivot.rotation.x=-swing;
  soldier.leftLeg.knee.rotation.x=Math.max(0,-swing)*0.55; soldier.rightLeg.knee.rotation.x=Math.max(0,swing)*0.55;
  // Rifle-ready arms with subtle counter-swing.
  soldier.leftArm.pivot.rotation.x=-1.0+swing*0.12; soldier.rightArm.pivot.rotation.x=-1.18-swing*0.08;
  soldier.leftArm.pivot.rotation.z=-0.32; soldier.rightArm.pivot.rotation.z=0.2;
  soldier.leftArm.elbow.rotation.x=-0.55; soldier.rightArm.elbow.rotation.x=-0.72;
  soldier.group.position.y=Math.abs(Math.sin(soldier.walkPhase*2))*0.025;
  if(soldier.hitFlash>0){soldier.hitFlash-=delta; soldier.muzzle.intensity=0;}
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
  if(!bot.alive||!target?.alive) return;
  const from=bot.group.position.clone().add(new THREE.Vector3(0,2.0,0));
  const to=target.group.position.clone().add(new THREE.Vector3(0,1.75,0));
  if(segmentBlocked(from,to)) return;
  const distance=from.distanceTo(to);
  bot.group.rotation.y=Math.atan2(target.group.position.x-bot.group.position.x,target.group.position.z-bot.group.position.z);
  bot.muzzle.intensity=6; setTimeout(()=>bot.muzzle.intensity=0,45);
  audio?.rifle(0.26);
  const spreadChance=THREE.MathUtils.clamp(0.84-distance/90,0.28,0.78);
  const hit=Math.random()<spreadChance;
  const end=hit?to:to.clone().add(new THREE.Vector3((Math.random()-.5)*4,(Math.random()-.5)*2,(Math.random()-.5)*4));
  fireTrace(from,end,bot.team);
  if(hit) damageSoldier(target,bot.team,bot.id.toUpperCase());
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
  if(reloading||ammo===MAGAZINE_SIZE||!player.alive||ended) return;
  reloading=true; reloadTimer=RELOAD_SECONDS; firing=false; audio?.reloadStart(); updateHud();
}

function updateReload(delta) {
  if(!reloading) return;
  reloadTimer-=delta;
  const progress=1-reloadTimer/RELOAD_SECONDS;
  player.rifle.rotation.z=Math.sin(progress*Math.PI)*0.9;
  player.rifle.position.y=1.82-Math.sin(progress*Math.PI)*0.38;
  player.rightArm.pivot.rotation.z=0.2+Math.sin(progress*Math.PI)*0.8;
  player.leftArm.elbow.rotation.x=-0.55+Math.sin(progress*Math.PI*2)*0.35;
  reloadStatus.textContent=`RELOADING ${Math.ceil(Math.max(0,reloadTimer)*10)/10}s`;
  if(reloadTimer<=0){reloading=false;ammo=MAGAZINE_SIZE;player.rifle.rotation.z=0;player.rifle.position.y=1.82;audio?.reloadEnd();updateHud();}
}

function shootUser() {
  if(!started||paused||ended||!player.alive||reloading||ammo<=0) { if(ammo<=0&&!reloading) startReload(); return; }
  ammo--; userFireTimer=USER_FIRE_INTERVAL; player.muzzle.intensity=8; setTimeout(()=>player.muzzle.intensity=0,45); audio?.rifle(0.72);
  const raycaster=new THREE.Raycaster(); raycaster.setFromCamera(new THREE.Vector2(0,0),camera); raycaster.far=90;
  const targets=redSoldiers.filter(s=>s.alive).map(s=>s.torso);
  const hits=raycaster.intersectObjects(targets,false);
  const from=player.group.position.clone().add(new THREE.Vector3(0.35,2.0,-0.45).applyAxisAngle(new THREE.Vector3(0,1,0),yaw));
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
  if(!player.alive){
    player.respawnTimer-=delta;
    if(player.respawnTimer<=0&&!ended){spawnSoldier(player);respawnOverlay.classList.remove('visible');}
    return;
  }
  const inputX=Number(keys.has('KeyD'))-Number(keys.has('KeyA'));
  const inputZ=Number(keys.has('KeyW'))-Number(keys.has('KeyS'));
  let moving=false;
  if(inputX||inputZ){
    const forward=new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw));
    const right=new THREE.Vector3(forward.z,0,-forward.x);
    const dir=forward.multiplyScalar(inputZ).add(right.multiplyScalar(inputX)).normalize();
    tryMove(player,dir.x*MOVE_SPEED*delta,dir.z*MOVE_SPEED*delta); moving=true;
    player.group.rotation.y=Math.atan2(dir.x,dir.z);
  } else player.group.rotation.y=THREE.MathUtils.lerp(player.group.rotation.y,yaw,Math.min(1,delta*9));
  animateSoldier(player,moving,delta);
  if(moving) audio?.step();
  if(firing && userFireTimer<=0) shootUser();
  userFireTimer-=delta;
  updateReload(delta);
}

function updateCamera(delta) {
  if(!player) return;
  const target=player.group.position.clone().add(new THREE.Vector3(0,2.15,0));
  const distance=5.4;
  const offset=new THREE.Vector3(-Math.sin(yaw)*Math.cos(pitch)*distance,2.0-Math.sin(pitch)*distance,-Math.cos(yaw)*Math.cos(pitch)*distance);
  const desired=target.clone().add(offset);
  // Pull camera forward if behind-wall position is blocked.
  let final=desired;
  if(segmentBlocked(target,desired)) {
    final=target.clone().lerp(desired,0.42);
  }
  camera.position.lerp(final,1-Math.exp(-delta*14));
  camera.lookAt(target.clone().add(new THREE.Vector3(Math.sin(yaw)*6,Math.sin(-pitch)*3,Math.cos(yaw)*6)));
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

function setup(){buildShip();createTeams();updateHud();drawMinimap();}
setup();

enterButton.addEventListener('click',async()=>{await audio.start();started=true;paused=false;startOverlay.classList.remove('visible');renderer.domElement.requestPointerLock();});
resumeButton.addEventListener('click',resumeGame); restartButton.addEventListener('click',()=>location.reload()); playAgainButton.addEventListener('click',()=>location.reload());
renderer.domElement.addEventListener('click',()=>{if(started&&!paused&&!ended&&document.pointerLockElement!==renderer.domElement)renderer.domElement.requestPointerLock();});
addEventListener('pointerdown',e=>{if(e.button===0)firing=true;}); addEventListener('pointerup',e=>{if(e.button===0)firing=false;});
addEventListener('keydown',e=>{keys.add(e.code);if(e.code==='Space'){e.preventDefault();firing=true;}if(e.code==='KeyR')startReload();if(e.code==='Escape')pauseGame();});
addEventListener('keyup',e=>{keys.delete(e.code);if(e.code==='Space')firing=false;});
addEventListener('mousemove',e=>{if(document.pointerLockElement!==renderer.domElement||paused||ended)return;yaw-=e.movementX*.0024;pitch=THREE.MathUtils.clamp(pitch-e.movementY*.0017,-.5,.18);});
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});

document.addEventListener('pointerlockchange',()=>{if(started&&!ended&&document.pointerLockElement!==renderer.domElement&&!paused)pauseGame();});

function loop(now){
  requestAnimationFrame(loop);
  const delta=Math.min(.05,(now-lastTime)/1000);lastTime=now;
  if(started&&!paused&&!ended){updatePlayer(delta);updateBots(delta);updateCamera(delta);updateTraces(delta);drawMinimap();}
  renderer.render(scene,camera);
}
requestAnimationFrame(loop);
