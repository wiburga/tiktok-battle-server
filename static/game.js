// ==========================================================
// TikTok Battle v2.0 - Game Loop & SSE (Parte 2)
// ==========================================================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const hudBottom = document.getElementById('hud-bottom');
const winCountEl = document.getElementById('win-count');
const fighterCountEl = document.getElementById('fighter-count');
const koText = document.getElementById('ko-text');
const levelupText = document.getElementById('levelup-text');
const bossWarning = document.getElementById('boss-warning');
const shareFlash = document.getElementById('share-flash');
const rageFill = document.getElementById('rage-fill');
const megaText = document.getElementById('mega-text');
const podiumModal = document.getElementById('podium-modal');
const podiumList = document.getElementById('podium-list');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');

let W, H;
let luchadores = [];
let bosses = [];
let summons = [];
const MAX_LUCHADORES = 20;
const HORIZONTE = 0.7;

const particulas = new SistemaParticulas(400);
const popups = new PopupManager();

let lastTime = 0;
let totalWins = 0;
let frenzyUntil = 0;

// --- Resize ---
function resize() {
  const rect = canvas.getBoundingClientRect();
  W = canvas.width = rect.width;
  H = canvas.height = rect.height;
}
window.addEventListener('resize', resize);
resize();
setTimeout(resize, 150);

// --- Fondo ---
const estrellas = Array.from({length:40}, () => ({
  x: Math.random(), y: Math.random() * 0.6,
  s: 1 + Math.random() * 2, b: Math.random()
}));

// Cache edificios (evita flicker)
const edificios = [
  [0.05, 0.18, 0.12], [0.2, 0.14, 0.08], [0.35, 0.22, 0.1],
  [0.55, 0.16, 0.09], [0.7, 0.25, 0.13], [0.88, 0.12, 0.1]
].map(([xp, hp, wp]) => ({
  xp, hp, wp,
  windows: Array.from({length: 22}, () => Math.random() > 0.3)
}));

function dibujarCielo() {
  const grd = ctx.createLinearGradient(0, 0, 0, H * HORIZONTE);
  grd.addColorStop(0, '#05051a');
  grd.addColorStop(0.5, '#0a0a3a');
  grd.addColorStop(1, '#1a0530');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, W, H * HORIZONTE);

  // Estrellas
  estrellas.forEach(s => {
    s.b += 0.01;
    const a = 0.3 + Math.abs(Math.sin(s.b)) * 0.7;
    ctx.globalAlpha = a;
    ctx.fillStyle = '#fff';
    ctx.fillRect(s.x * W, s.y * H, s.s, s.s);
  });
  ctx.globalAlpha = 1;
}

function dibujarEdificios() {
  ctx.fillStyle = '#0a0a1e';
  const gy = H * HORIZONTE;
  // Siluetas de edificios
  edificios.forEach((bld) => {
    const bx = bld.xp * W, bh = bld.hp * H, bw = bld.wp * W;
    ctx.fillRect(bx, gy - bh, bw, bh);
    // Ventanas
    ctx.fillStyle = 'rgba(255,200,50,0.15)';
    let wi = 0;
    for(let wy = gy - bh + 8; wy < gy - 8; wy += 14) {
      for(let wx = bx + 5; wx < bx + bw - 5; wx += 10) {
        if(bld.windows[wi++ % bld.windows.length]) ctx.fillRect(wx, wy, 5, 6);
      }
    }
    ctx.fillStyle = '#0a0a1e';
  });
}

function dibujarSuelo() {
  const gy = H * HORIZONTE;
  const grd = ctx.createLinearGradient(0, gy, 0, H);
  grd.addColorStop(0, '#1a2810');
  grd.addColorStop(0.3, '#243618');
  grd.addColorStop(1, '#1a2a10');
  ctx.fillStyle = grd;
  ctx.fillRect(0, gy, W, H - gy);

  // Grid pixelado
  ctx.strokeStyle = 'rgba(60,100,40,0.3)';
  ctx.lineWidth = 1;
  for(let x = 0; x < W; x += 32) {
    ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x, H); ctx.stroke();
  }
  for(let y = gy; y < H; y += 16) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
}

// --- KO y Level Up ---
function mostrarKO() {
  koText.style.display = 'block';
  koText.style.animation = 'none';
  koText.offsetHeight; // reflow
  koText.style.animation = 'koFlash 0.6s cubic-bezier(0.22,1,0.36,1)';
  setTimeout(() => { koText.style.display = 'none'; }, 1200);
}

function mostrarLevelUp(nombre, nivel) {
  levelupText.textContent = `${nombre} → LV${nivel}!`;
  levelupText.style.display = 'block';
  levelupText.style.animation = 'none';
  levelupText.offsetHeight;
  levelupText.style.animation = 'lvlUp 0.8s cubic-bezier(0.22,1,0.36,1)';
  setTimeout(() => { levelupText.style.display = 'none'; }, 1500);
}

function mostrarBossWarning() {
  bossWarning.style.display = 'block';
  setTimeout(() => { bossWarning.style.display = 'none'; }, 2000);
}

function flashShare() {
  shareFlash.style.display = 'block';
  shareFlash.style.opacity = '1';
  setTimeout(() => { shareFlash.style.display = 'none'; }, 500);
}

function mostrarMega(texto, ms = 2200) {
  if(!megaText) return;
  megaText.textContent = texto;
  megaText.style.display = 'block';
  megaText.style.animation = 'none';
  megaText.offsetHeight;
  megaText.style.animation = 'koFlash 0.75s cubic-bezier(0.22,1,0.36,1)';
  setTimeout(() => { megaText.style.display = 'none'; }, ms);
}

function mostrarPodio(top) {
  if(!podiumModal || !podiumList) return;
  podiumList.innerHTML = '';
  (top || []).slice(0,3).forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'podium-row';
    row.innerHTML = `
      <div class="podium-rank">${i+1}</div>
      <div class="podium-name">${(p.user || '').toUpperCase()}</div>
      <div class="podium-meta">DMG ${p.damage || 0}<br/>💎 ${p.giftCoins || 0}</div>
    `;
    podiumList.appendChild(row);
  });
  podiumModal.style.display = 'flex';
  setTimeout(() => { podiumModal.style.display = 'none'; }, 5000);
}

// --- Game Loop ---
function loop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000, 0.05); // cap delta
  lastTime = timestamp;

  ctx.clearRect(0, 0, W, H);
  dibujarCielo();
  dibujarEdificios();
  dibujarSuelo();

  // Update & draw luchadores
  luchadores.forEach(f => f.update(dt, luchadores, bosses, W, H));
  bosses.forEach(b => b.update(dt, luchadores, bosses, W, H));
  summons.forEach(s => s.update(dt, luchadores, bosses, W, H));

  // Ordenar por Y para pseudo-profundidad
  const todos = [...luchadores, ...bosses, ...summons].filter(f => !f.eliminado);
  todos.sort((a, b) => a.y - b.y);
  todos.forEach(f => f.draw(ctx));

  // Limpiar muertos
  luchadores.forEach(f => {
    if(f.eliminado) {
      f.remover();
      totalWins++;
      winCountEl.textContent = totalWins;
      mostrarKO();
      reportarXP(f.nombre, 10, false);
    }
  });
  bosses.forEach(b => {
    if(b.eliminado) {
      b.remover();
      popups.agregar(W/2, H*0.35, 'BOSS DERROTADO', '#ffd700', 24, 2);
      // Curar y dar XP a todos
      luchadores.forEach(f => {
        if(!f.muerto) {
          f.curar(40);
          reportarXP(f.nombre, 50, true);
        }
      });
      // Podio end-game
      fetch('/podium').then(r => r.json()).then(data => {
        mostrarPodio(data.top || []);
      }).catch(()=>{});
    }
  });

  luchadores = luchadores.filter(f => !f.eliminado);
  bosses = bosses.filter(b => !b.eliminado);
  summons = summons.filter(s => !s.eliminado);

  // Partículas y popups
  particulas.update(dt);
  particulas.draw(ctx);
  popups.update(dt);
  popups.draw(ctx);

  // Contador
  if(fighterCountEl) fighterCountEl.textContent = luchadores.length;

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// --- Reporte XP al servidor ---
function reportarXP(nombre, cantidad, esBossKill) {
  fetch('/xp', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({user: nombre, amount: cantidad, bossKill: esBossKill})
  }).catch(() => {});
}

// --- Reporte de daño para Podio (throttle) ---
let dmgBuffer = {};
let dmgLastFlush = 0;
window.__reportDamage = (user, amount, targetType) => {
  if(!user || !amount) return;
  if(targetType !== 'boss') return;
  dmgBuffer[user] = (dmgBuffer[user] || 0) + amount;
  const now = performance.now();
  if(now - dmgLastFlush < 350) return;
  dmgLastFlush = now;
  const payload = dmgBuffer;
  dmgBuffer = {};
  Object.entries(payload).forEach(([u, a]) => {
    fetch('/damage', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({user: u, amount: a, targetType: 'boss'})
    }).catch(()=>{});
  });
};

// --- SSE Stability Logic ---
let es = null;
let reconnectDelay = 2000; // Iniciar en 2s según pedido
const MAX_RECONNECT_DELAY = 30000;

function updateStatusUI(state) {
  if (!statusDot || !statusText) return;
  if (state === 'connected') {
    statusDot.style.background = '#0f0';
    statusDot.style.boxShadow = '0 0 5px #0f0';
    statusText.textContent = 'ONLINE';
    statusText.style.color = '#fff';
  } else if (state === 'reconnecting') {
    statusDot.style.background = '#ff0';
    statusDot.style.boxShadow = '0 0 5px #ff0';
    statusText.textContent = 'RECONECTANDO...';
    statusText.style.color = '#ff0';
  } else if (state === 'failed') {
    statusDot.style.background = '#f00';
    statusDot.style.boxShadow = '0 0 5px #f00';
    statusText.textContent = 'DESCONECTADO';
    statusText.style.color = '#f44';
  }
}

function connectSSE() {
  if (es) {
    es.close();
  }
  
  updateStatusUI('reconnecting');
  es = new EventSource('/stream');
  
  es.onopen = () => {
    console.log('[SSE] Conexión establecida');
    reconnectDelay = 2000; // Resetear delay
    updateStatusUI('connected');
  };

  es.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if(data.type === 'connected' || data.type === 'ping') return;

    if(data.type === 'comment') {
    if(luchadores.length < MAX_LUCHADORES) {
      const f = new Fighter(data.user, false, W, H, particulas, popups, {clase: data.class || 'guerrero', horizon: HORIZONTE});
      if(data.nivel) f.setNivel(data.nivel);
      luchadores.push(f);
      popups.agregar(W/2, H*0.25, `${data.user} ENTRA!`, '#4af', 12, 1.5);
    }
  }
  // ==========================================================
  // SISTEMA DE REGALOS POR VALOR (3 Tiers)
  // ==========================================================
  else if(data.type === 'gift') {
    // Buscar luchador del usuario o asignar uno aleatorio
    let f = luchadores.find(x => x.nombre === data.user);
    if(!f && luchadores.length > 0) f = luchadores[Math.floor(Math.random()*luchadores.length)];
    if(!f || f.muerto) return;

    const coins = data.coins || 1;
    const tier = data.giftTier || (coins >= 500 ? 'HIGH' : coins >= 10 ? 'MEDIUM' : 'LOW');
    const giftName = data.giftName || 'Gift';

    // --- TIER LOW: Efecto Básico (coins < 10) ---
    // Brillo leve + recupera 5% de vida + pocas partículas blancas
    if(tier === 'LOW') {
      f.specialTimer = 2; // Brillo leve por 2 segundos
      const curacion = Math.ceil(f.maxHp * 0.05);
      f.curar(curacion);
      // Popup blanco con valor del regalo
      popups.agregar(f.x, f.y - f.alto - 10, `🎁 ${coins}💎`, '#ffffff', 12, 1.5);
      popups.agregar(f.x, f.y - f.alto - 30, giftName, '#cccccc', 10, 1.2);
      // Partículas blancas sutiles (pocas, ~5)
      particulas.emitir(f.x, f.y - f.alto/2, 5, {
        colores:['#fff','#ddd','#eee'], velMin:20, velMax:80, velY:40,
        vidaMin:0.3, vidaMax:0.6, tamMin:2, tamMax:3
      });
    }
    // --- TIER MEDIUM: Efecto Especial (10 <= coins < 500) ---
    // Boost tamaño +20%, velocidad ataque x2, dura 10 segundos
    else if(tier === 'MEDIUM') {
      f.specialTimer = 10;
      // Activar boosts de tamaño y velocidad
      f.boostEscalaTarget = 1.2;  // +20% tamaño visual
      f.boostVelocidad = 2.0;     // Velocidad de ataque x2
      f.boostTimer = 10;          // Duración: 10 segundos
      // Curación proporcional
      f.curar(Math.min(coins, 80));
      // Popup azul con valor del regalo
      popups.agregar(W/2, H*0.18, `⚡ GIFT: ${coins} 💎`, '#44aaff', 18, 2.5);
      popups.agregar(W/2, H*0.22, `${data.user} → ${giftName}`, '#88ccff', 12, 2);
      // Partículas azules medias (~15)
      particulas.emitir(f.x, f.y - f.alto/2, 15, {
        colores:['#44f','#88f','#aaf','#fff','#4af'], velMin:40, velMax:150, velY:60,
        vidaMin:0.4, vidaMax:0.9, tamMin:3, tamMax:5
      });
    }
    // --- TIER HIGH: Efecto Legendario (coins >= 500) ---
    // Ataque Global AOE: -50HP a TODOS los enemigos + texto dorado gigante
    else if(tier === 'HIGH') {
      f.specialTimer = 15;
      // Boost visual máximo
      f.boostEscalaTarget = 1.4;  // +40% tamaño visual (WHALE effect)
      f.boostVelocidad = 3.0;     // Velocidad de ataque x3
      f.boostTimer = 15;
      f.curar(f.maxHp);           // Curación completa
      // Texto dorado gigante con nombre del regalo
      popups.agregar(W/2, H*0.12, `🌟 ${giftName.toUpperCase()} 🌟`, '#ffd700', 28, 3.5);
      popups.agregar(W/2, H*0.17, `${data.user}: ${coins} 💎`, '#ffee44', 20, 3);
      popups.agregar(W/2, H*0.22, '¡ATAQUE GLOBAL!', '#ff4444', 16, 2.5);
      // ATAQUE AOE: -50 HP a todos los enemigos
      if(bosses.length > 0) {
        // Si hay boss, daño al boss
        bosses.forEach(b => { if(!b.muerto) b.recibirDaño(50, f); });
      } else {
        // Si no hay boss, daño a todos los demás luchadores
        luchadores.forEach(o => { if(o !== f && !o.muerto) o.recibirDaño(50, f); });
      }
      // Explosión masiva de partículas doradas (~40)
      particulas.emitir(f.x, f.y - f.alto/2, 40, {
        colores:['#ffd700','#ff0','#fff','#f80','#ffa500'], velMin:80, velMax:280, velY:100,
        vidaMin:0.6, vidaMax:1.5, tamMin:4, tamMax:8
      });
      // Onda expansiva desde el luchador (~25 partículas adicionales)
      particulas.emitir(f.x, f.y, 25, {
        colores:['#ffd700','#ff4444','#fff'], velMin:150, velMax:350,
        vidaMin:0.3, vidaMax:0.8, tamMin:2, tamMax:5
      });
    }
  }
  else if(data.type === 'multigift') {
    const combo = data.comboCount || 3;
    const coins = data.coins || 50;
    // Daño a todos los enemigos + boost a aliados
    popups.agregar(W/2, H*0.15, `💎 COMBO x${combo}!`, '#ff44ff', 22, 2.5);
    luchadores.forEach(f => {
      if(!f.muerto) {
        f.specialTimer = 5;
        f.curar(20);
      }
    });
    bosses.forEach(b => {
      if(!b.muerto) b.recibirDaño(coins * combo * 0.1, null);
    });
    particulas.emitir(W/2, H*0.4, 40, {
      colores:['#f0f','#f4f','#faf','#fff','#ff0'],velMin:100,velMax:300,
      vidaMin:0.5,vidaMax:1.5,tamMin:3,tamMax:7
    });
  }
  else if(data.type === 'like') {
    if(luchadores.length > 0) {
      const f = luchadores[Math.floor(Math.random()*luchadores.length)];
      if(!f.muerto) f.curar(15);
    }
  }
  else if(data.type === 'follow') {
    if(bosses.length === 0) {
      const b = new Fighter(data.user, true, W, H, particulas, popups, {horizon: HORIZONTE});
      bosses.push(b);
      mostrarBossWarning();
      popups.agregar(W/2, H*0.2, '⚠ BOSS INCOMING!', '#ff2222', 22, 2.5);
      particulas.emitir(W/2, H*0.5, 30, {
        colores:['#f00','#f80','#ff0'],velMin:60,velMax:200,
        vidaMin:0.5,vidaMax:1.2,tamMin:3,tamMax:6
      });
    }
  }
  else if(data.type === 'share') {
    // Ataque especial global - daño AOE
    flashShare();
    popups.agregar(W/2, H*0.18, `⚡ ${data.user} SHARE!`, '#00ddff', 20, 2);
    // Daño a boss si existe, sino a todos
    if(bosses.length > 0) {
      bosses.forEach(b => { if(!b.muerto) b.recibirDaño(30, null); });
    } else {
      luchadores.forEach(f => { if(!f.muerto) f.recibirDaño(15, null); });
    }
    particulas.emitir(W/2, H*0.45, 35, {
      colores:['#0df','#0ff','#fff','#88f'],velMin:100,velMax:280,
      vidaMin:0.4,vidaMax:1,tamMin:2,tamMax:6
    });
  }
  else if(data.type === 'levelup') {
    mostrarLevelUp(data.user, data.nivel);
    const f = luchadores.find(x => x.nombre === data.user);
    if(f) {
      f.setNivel(data.nivel);
      particulas.emitir(f.x, f.y - f.alto/2, 20, {
        colores:['#ffd700','#ff0','#fff','#f80'],velMin:40,velMax:160,velY:60,
        vidaMin:0.5,vidaMax:1.2,tamMin:3,tamMax:5
      });
    }
  }
  else if(data.type === 'rage_update') {
    if(rageFill) {
      const pct = Math.max(0, Math.min(1, (data.value || 0) / (data.max || 1)));
      rageFill.style.width = `${(pct*100).toFixed(1)}%`;
    }
  }
  else if(data.type === 'frenzy') {
    const dur = data.duration || 5;
    frenzyUntil = performance.now() + dur*1000;
    mostrarMega('¡PODER DEL PÚBLICO ACTIVADO!', 2500);
    // Todos en frenesí
    [...luchadores, ...summons].forEach(f => { if(!f.muerto) f.frenzyTimer = dur; });
  }
  else if(data.type === 'summon_golem') {
    // Invocar Gólem de Hierro aliado (gigante)
    mostrarMega('GOLEM DE HIERRO INVOCADO', 1800);
    const g = new Fighter('IRON GOLEM', false, W, H, particulas, popups, {clase: 'iron_golem', horizon: HORIZONTE});
    g.targetX = W * 0.5;
    g.targetY = H * 0.64;
    g.y = g.targetY - 520;
    g.spawnTimer = 0.75;
    summons.push(g);
    particulas.emitir(W/2, H*0.55, 30, {
      colores:['#fff','#ddd','#bbb','#ff3355'],velMin:80,velMax:220, velY:120,
      vidaMin:0.4,vidaMax:1.2,tamMin:4,tamMax:8
    });
  }
};

  es.onerror = () => {
    updateStatusUI('failed');
    console.warn(`[SSE] Conexión perdida, reintentando en ${reconnectDelay}ms...`);
    es.close();
    setTimeout(connectSSE, reconnectDelay);
    // Exponential backoff
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
  };
}

// Iniciar conexión
connectSSE();

// --- Test ---
function test(tipo) { fetch(`/test/${tipo}`); }
