'use strict';

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const W = 800;
const H = 600;

// ── Input ─────────────────────────────────────────────────────────────────────
const keys = {};
const justPressed = {};

window.addEventListener('keydown', e => {
  justPressed[e.code] = !keys[e.code];
  keys[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code))
    e.preventDefault();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

function pressed(code) {
  const val = justPressed[code];
  justPressed[code] = false;
  return val;
}

// ── Utils ─────────────────────────────────────────────────────────────────────
const wrap  = (v, max) => ((v % max) + max) % max;
const dist  = (a, b)   => Math.hypot(a.x - b.x, a.y - b.y);
const rand  = (min, max) => min + Math.random() * (max - min);
const randInt = (min, max) => Math.floor(rand(min, max + 1));

// ── Bullet ────────────────────────────────────────────────────────────────────
class Bullet {
  constructor(x, y, angle) {
    this.x = x;
    this.y = y;
    const SPEED = 520;
    this.vx = Math.cos(angle) * SPEED;
    this.vy = Math.sin(angle) * SPEED;
    this.ttl  = 1.1;
    this.radius = 2;
    this.dead = false;
  }

  update(dt) {
    this.x = wrap(this.x + this.vx * dt, W);
    this.y = wrap(this.y + this.vy * dt, H);
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw() {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── Asteroid ──────────────────────────────────────────────────────────────────
const RADII  = [0, 16, 30, 50];   // por tamaño 1, 2, 3
const SPEEDS = [0, 85, 55, 32];   // velocidad base por tamaño
const POINTS = [0, 100, 50, 20];  // puntos por tamaño

// ── Power-ups ─────────────────────────────────────────────────────────────────
// Para agregar un poder nuevo: sumar una entrada acá y consultar
// isPowerUpActive('<id>') donde corresponda aplicar su efecto.
const POWERUP_CHANCE = 0.35;  // probabilidad de soltar un poder por asteroide destruido
const SPREAD         = 0.22;  // rad entre balas del disparo triple (~12°)

const POWERUPS = {
  triple: {
    label:    'TRIPLE',            // texto del HUD
    message:  '¡DISPARO TRIPLE!',  // aviso al activarse
    rgb:      '0,255,255',         // color (r,g,b)
    duration: 10,                  // segundos
    once:     true,                // solo una vez por nivel
    pickup:   true,                // aparece como ítem que hay que agarrar
    icon:     'T',                 // letra dibujada en el ítem
  },
  shield: {
    label:    'ESCUDO',
    message:  '¡ESCUDO DE ENERGÍA!',
    rgb:      '80,160,255',
    duration: 5,                   // o hasta absorber un impacto
    once:     true,
    pickup:   true,                // aparece como ítem que hay que agarrar
    icon:     'S',                 // letra dibujada en el ítem
  },
};
const ITEM_RADIUS = 11;   // radio del ítem recogible
const ITEM_TTL    = 8;    // segundos antes de desaparecer
const ITEM_SPEED  = 30;   // deriva lenta (px/s)
const SHIELD_RADIUS     = 24;   // radio del círculo de energía
const SHIELD_GRACE_TIME = 1;    // invencibilidad tras absorber un golpe (s)

class Asteroid {
  constructor(x, y, size = 3) {
    this.x    = x;
    this.y    = y;
    this.size = size;
    this.radius = RADII[size];
    this.dead = false;

    const angle = rand(0, Math.PI * 2);
    const speed = SPEEDS[size] + rand(-15, 15);
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.rotSpeed = rand(-1.2, 1.2);
    this.rot = rand(0, Math.PI * 2);

    // Polígono irregular
    const n = randInt(8, 13);
    this.verts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = this.radius * rand(0.6, 1.0);
      this.verts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
  }

  update(dt) {
    this.x   = wrap(this.x + this.vx * dt, W);
    this.y   = wrap(this.y + this.vy * dt, H);
    this.rot += this.rotSpeed * dt;
  }

  split() {
    if (this.size <= 1) return [];
    return [
      new Asteroid(this.x, this.y, this.size - 1),
      new Asteroid(this.x, this.y, this.size - 1),
    ];
  }

  draw() {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth   = 1.5;
    ctx.lineJoin    = 'round';
    ctx.beginPath();
    ctx.moveTo(this.verts[0][0], this.verts[0][1]);
    for (let i = 1; i < this.verts.length; i++)
      ctx.lineTo(this.verts[i][0], this.verts[i][1]);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
}

// ── Ship ──────────────────────────────────────────────────────────────────────
class Ship {
  constructor() { this.reset(); }

  reset() {
    this.x      = W / 2;
    this.y      = H / 2;
    this.angle  = -Math.PI / 2;
    this.vx     = 0;
    this.vy     = 0;
    this.radius = 12;
    this.thrusting     = false;
    this.invincible    = 3;
    this.shootCooldown = 0;
    this.dead          = false;
  }

  update(dt) {
    if (this.dead) return;
    if (this.invincible    > 0) this.invincible    -= dt;
    if (this.shootCooldown > 0) this.shootCooldown -= dt;

    const ROT   = 3.5;   // rad/s
    const THRUST = 260;  // px/s²
    const DRAG   = 0.987;

    if (keys['ArrowLeft'])  this.angle -= ROT * dt;
    if (keys['ArrowRight']) this.angle += ROT * dt;

    this.thrusting = !!keys['ArrowUp'];
    if (this.thrusting) {
      this.vx += Math.cos(this.angle) * THRUST * dt;
      this.vy += Math.sin(this.angle) * THRUST * dt;
    }

    this.vx *= DRAG;
    this.vy *= DRAG;
    this.x = wrap(this.x + this.vx * dt, W);
    this.y = wrap(this.y + this.vy * dt, H);
  }

  tryShoot() {
    if (this.shootCooldown > 0 || this.dead) return [];
    this.shootCooldown = 0.2;
    const NOSE = 21;
    const ox = this.x + Math.cos(this.angle) * NOSE;
    const oy = this.y + Math.sin(this.angle) * NOSE;
    if (isPowerUpActive('triple')) {
      return [-SPREAD, 0, SPREAD].map(d => new Bullet(ox, oy, this.angle + d));
    }
    return [new Bullet(ox, oy, this.angle)];
  }

  draw() {
    if (this.dead) return;
    if (isPowerUpActive('shield')) this.drawShield();
    // Parpadeo durante invencibilidad de reaparición
    if (this.invincible > 0 && Math.floor(this.invincible * 8) % 2 === 0) return;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth   = 1.5;
    ctx.lineJoin    = 'round';

    // Silueta clásica: triángulo con muesca trasera
    ctx.beginPath();
    ctx.moveTo( 20,  0);   // nariz
    ctx.lineTo(-12, -9);   // ala izquierda
    ctx.lineTo( -7,  0);   // muesca trasera
    ctx.lineTo(-12,  9);   // ala derecha
    ctx.closePath();
    ctx.stroke();

    // Llama del propulsor
    if (this.thrusting && Math.random() > 0.35) {
      ctx.beginPath();
      ctx.moveTo(-8, -4);
      ctx.lineTo(-8 - rand(6, 14), 0);
      ctx.lineTo(-8,  4);
      ctx.strokeStyle = 'rgba(255, 130, 0, 0.85)';
      ctx.stroke();
    }

    ctx.restore();
  }

  drawShield() {
    const left = activePowerUps.shield;
    // Parpadea el último segundo y medio para avisar que se acaba
    if (left < 1.5 && Math.floor(left * 10) % 2 === 0) return;
    const pulse = 0.55 + 0.3 * Math.sin(performance.now() / 120);
    const rgb = POWERUPS.shield.rgb;
    ctx.save();
    ctx.lineWidth   = 2;
    ctx.strokeStyle = `rgba(${rgb},${pulse.toFixed(2)})`;
    ctx.fillStyle   = `rgba(${rgb},0.08)`;
    ctx.shadowColor = `rgb(${rgb})`;
    ctx.shadowBlur  = 12;
    ctx.beginPath();
    ctx.arc(this.x, this.y, SHIELD_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

// ── Partículas (explosión) ────────────────────────────────────────────────────
class Particle {
  constructor(x, y) {
    this.x  = x;
    this.y  = y;
    const angle = rand(0, Math.PI * 2);
    const speed = rand(30, 130);
    this.vx   = Math.cos(angle) * speed;
    this.vy   = Math.sin(angle) * speed;
    this.life = rand(0.4, 1.1);
    this.ttl  = this.life;
    this.dead = false;
  }

  update(dt) {
    this.x  += this.vx * dt;
    this.y  += this.vy * dt;
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw() {
    const alpha = this.ttl / this.life;
    ctx.strokeStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.x - this.vx * 0.05, this.y - this.vy * 0.05);
    ctx.stroke();
  }
}

// ── Ítem de poder (recogible) ─────────────────────────────────────────────────
class PowerUpItem {
  constructor(x, y, id) {
    this.x  = x;
    this.y  = y;
    this.id = id;
    const angle = rand(0, Math.PI * 2);
    this.vx = Math.cos(angle) * ITEM_SPEED;
    this.vy = Math.sin(angle) * ITEM_SPEED;
    this.radius = ITEM_RADIUS;
    this.ttl  = ITEM_TTL;
    this.dead = false;
  }

  update(dt) {
    this.x = wrap(this.x + this.vx * dt, W);
    this.y = wrap(this.y + this.vy * dt, H);
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw() {
    // Parpadea los últimos 2 segundos
    if (this.ttl < 2 && Math.floor(this.ttl * 8) % 2 === 0) return;
    const p = POWERUPS[this.id];
    const pulse = 1 + 0.12 * Math.sin(performance.now() / 150);
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.strokeStyle = `rgb(${p.rgb})`;
    ctx.fillStyle   = `rgba(${p.rgb},0.15)`;
    ctx.shadowColor = `rgb(${p.rgb})`;
    ctx.shadowBlur  = 10;
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle    = `rgb(${p.rgb})`;
    ctx.font         = 'bold 13px monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.icon, 0, 1);
    ctx.restore();
  }
}

// ── Estado del juego ──────────────────────────────────────────────────────────
let ship, bullets, asteroids, particles, items;
let score, lives, level;
let state;      // 'playing' | 'dead' | 'gameover'
let deadTimer;
let activePowerUps;   // { id: segundos restantes }
let usedPowerUps;     // Set de ids ya aparecidos en el nivel actual
let powerUpMsg;       // { text, rgb, timer } | null
let levelKills;       // asteroides destruidos en el nivel
let levelTotalKills;  // asteroides totales a destruir en el nivel

// Cada asteroide grande genera 7 destrucciones: 1 grande + 2 medianos + 4 chicos
const KILLS_PER_LARGE = 7;

const isPowerUpActive = id => (activePowerUps[id] || 0) > 0;

function activatePowerUp(id) {
  const p = POWERUPS[id];
  activePowerUps[id] = p.duration;
  usedPowerUps.add(id);
  powerUpMsg = { text: p.message, rgb: p.rgb, timer: 1.5 };
}

// Reinicia el control de poderes al empezar un nivel
function startLevelPowerUps(largeCount) {
  usedPowerUps    = new Set();
  levelKills      = 0;
  levelTotalKills = largeCount * KILLS_PER_LARGE;
}

// Al destruir un asteroide: chance de activar un poder disponible al azar.
// Garantía: si a mitad del nivel no salió ninguno, se fuerza uno.
function tryDropPowerUp(x, y) {
  levelKills++;
  const forced = usedPowerUps.size === 0 && levelKills >= levelTotalKills / 2;
  if (!forced && Math.random() >= POWERUP_CHANCE) return;

  const notUsed = Object.keys(POWERUPS)
    .filter(id => !(POWERUPS[id].once && usedPowerUps.has(id)));
  const onScreen = id => items.some(it => it.id === id);
  let available = notUsed.filter(id => !isPowerUpActive(id) && !onScreen(id));
  // Forzado y todos activos (p. ej. arrastrado del nivel anterior): se renueva
  if (forced && available.length === 0) available = notUsed.filter(id => !onScreen(id));
  if (available.length === 0) return;

  const id = available[randInt(0, available.length - 1)];
  if (POWERUPS[id].pickup) {
    // Se suelta un ítem; cuenta como "aparecido" aunque no se agarre
    items.push(new PowerUpItem(x, y, id));
    usedPowerUps.add(id);
  } else {
    activatePowerUp(id);
    explode(x, y, 12);
  }
}

function updatePowerUps(dt) {
  for (const id in activePowerUps) {
    activePowerUps[id] -= dt;
    if (activePowerUps[id] <= 0) delete activePowerUps[id];
  }
  if (powerUpMsg && (powerUpMsg.timer -= dt) <= 0) powerUpMsg = null;
}

function spawnAsteroids(count) {
  const SAFE_DIST = 130;
  for (let i = 0; i < count; i++) {
    let x, y;
    do {
      x = rand(0, W);
      y = rand(0, H);
    } while (Math.hypot(x - W / 2, y - H / 2) < SAFE_DIST);
    asteroids.push(new Asteroid(x, y, 3));
  }
}

function initGame() {
  ship          = new Ship();
  bullets   = [];
  asteroids = [];
  particles = [];
  items     = [];
  score  = 0;
  lives  = 3;
  level  = 1;
  state  = 'playing';
  activePowerUps = {};
  powerUpMsg     = null;
  startLevelPowerUps(4);
  spawnAsteroids(4);
}

function nextLevel() {
  level++;
  bullets   = [];
  particles = [];
  items     = [];
  ship.reset();
  startLevelPowerUps(3 + level);
  spawnAsteroids(3 + level);
}

function explode(x, y, count = 8) {
  for (let i = 0; i < count; i++) particles.push(new Particle(x, y));
}

function killShip() {
  explode(ship.x, ship.y, 14);
  ship.dead = true;
  activePowerUps = {};  // se pierden los poderes al morir
  lives--;
  if (lives <= 0) {
    state = 'gameover';
  } else {
    state     = 'dead';
    deadTimer = 2;
  }
}

// El escudo absorbe el impacto: se rompe, destruye el asteroide
// y deja una breve invencibilidad para no morir con los fragmentos.
function absorbHit(a) {
  delete activePowerUps.shield;
  ship.invincible = SHIELD_GRACE_TIME;
  a.dead = true;
  score += POINTS[a.size];
  explode(a.x, a.y, a.size * 5);
  explode(ship.x, ship.y, 10);
  asteroids = asteroids.filter(x => !x.dead).concat(a.split());
  tryDropPowerUp(a.x, a.y);
}

// ── Update ────────────────────────────────────────────────────────────────────
function update(dt) {
  if (state === 'gameover') {
    if (pressed('Space')) initGame();
    particles.forEach(p => p.update(dt));
    particles = particles.filter(p => !p.dead);
    return;
  }

  if (state === 'dead') {
    deadTimer -= dt;
    particles.forEach(p => p.update(dt));
    particles = particles.filter(p => !p.dead);
    asteroids.forEach(a => a.update(dt));
    items.forEach(it => it.update(dt));
    items = items.filter(it => !it.dead);
    if (deadTimer <= 0) { state = 'playing'; ship.reset(); }
    return;
  }

  // Disparar
  if (pressed('Space')) {
    bullets.push(...ship.tryShoot());
  }

  updatePowerUps(dt);

  ship.update(dt);
  bullets.forEach(b => b.update(dt));
  asteroids.forEach(a => a.update(dt));
  particles.forEach(p => p.update(dt));
  items.forEach(it => it.update(dt));

  bullets   = bullets.filter(b => !b.dead);
  particles = particles.filter(p => !p.dead);

  // Nave vs ítem de poder
  for (const it of items) {
    if (!it.dead && dist(ship, it) < ship.radius + it.radius) {
      it.dead = true;
      activatePowerUp(it.id);
      explode(it.x, it.y, 12);
    }
  }
  items = items.filter(it => !it.dead);

  // Bala vs asteroide
  const newAsteroids = [];
  for (const b of bullets) {
    for (const a of asteroids) {
      if (!a.dead && !b.dead && dist(b, a) < a.radius) {
        b.dead = true;
        a.dead = true;
        score += POINTS[a.size];
        explode(a.x, a.y, a.size * 5);
        newAsteroids.push(...a.split());
        tryDropPowerUp(a.x, a.y);
      }
    }
  }
  asteroids = asteroids.filter(a => !a.dead).concat(newAsteroids);
  bullets   = bullets.filter(b => !b.dead);

  // Nave vs asteroide
  if (ship.invincible <= 0) {
    const shielded = isPowerUpActive('shield');
    const hitR     = shielded ? SHIELD_RADIUS : ship.radius;
    for (const a of asteroids) {
      if (dist(ship, a) < hitR + a.radius * 0.82) {
        if (shielded) absorbHit(a);
        else          killShip();
        break;
      }
    }
  }

  // Nivel completado
  if (asteroids.length === 0) nextLevel();
}

// ── Draw ──────────────────────────────────────────────────────────────────────
function drawLifeIcon(x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-Math.PI / 2);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth   = 1.2;
  ctx.lineJoin    = 'round';
  ctx.beginPath();
  ctx.moveTo( 9,  0);
  ctx.lineTo(-6, -5);
  ctx.lineTo(-3,  0);
  ctx.lineTo(-6,  5);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawHUD() {
  ctx.fillStyle = '#fff';
  ctx.font = '15px monospace';

  ctx.textAlign = 'left';
  ctx.fillText(`SCORE  ${score}`, 14, 26);

  ctx.textAlign = 'center';
  ctx.fillText(`NIVEL ${level}`, W / 2, 26);

  for (let i = 0; i < lives; i++)
    drawLifeIcon(W - 16 - i * 22, 18);

  // Poderes activos, uno por línea bajo el score
  ctx.textAlign = 'left';
  Object.keys(activePowerUps).forEach((id, i) => {
    const p = POWERUPS[id];
    ctx.fillStyle = `rgb(${p.rgb})`;
    ctx.fillText(`${p.label} ${activePowerUps[id].toFixed(1)}s`, 14, 46 + i * 20);
  });
}

function drawOverlay(title, sub) {
  ctx.textAlign   = 'center';
  ctx.fillStyle   = '#fff';
  ctx.font        = 'bold 46px monospace';
  ctx.fillText(title, W / 2, H / 2 - 18);
  ctx.font        = '18px monospace';
  ctx.fillStyle   = 'rgba(255,255,255,0.65)';
  ctx.fillText(sub, W / 2, H / 2 + 22);
}

function draw() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  particles.forEach(p => p.draw());
  asteroids.forEach(a => a.draw());
  items.forEach(it => it.draw());
  bullets.forEach(b => b.draw());
  ship.draw();

  drawHUD();

  if (powerUpMsg) {
    ctx.textAlign = 'center';
    ctx.font      = 'bold 28px monospace';
    ctx.fillStyle = `rgba(${powerUpMsg.rgb},${Math.min(1, powerUpMsg.timer).toFixed(2)})`;
    ctx.fillText(powerUpMsg.text, W / 2, H / 2 - 80);
  }

  if (state === 'gameover')
    drawOverlay('GAME OVER', `PUNTAJE: ${score}   —   ESPACIO PARA REINICIAR`);
}

// ── Loop principal ────────────────────────────────────────────────────────────
let lastTime = null;

function loop(ts) {
  const dt = lastTime === null ? 0 : Math.min((ts - lastTime) / 1000, 0.05);
  lastTime = ts;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

initGame();
requestAnimationFrame(loop);
