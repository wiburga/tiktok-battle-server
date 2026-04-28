// ==========================================================
// TikTok Battle v2.0 - Motor del Juego (Parte 1: Engine)
// ==========================================================

// --- Sistema de Partículas ---
class Particula {
  constructor(x,y,vx,vy,color,vida,tam){
    this.x=x;this.y=y;this.vx=vx;this.vy=vy;
    this.color=color;this.vida=vida;this.maxVida=vida;
    this.tam=tam;this.activa=true;
  }
  update(dt){
    this.x+=this.vx*dt;this.y+=this.vy*dt;
    this.vy+=300*dt; // gravedad
    this.vida-=dt;
    if(this.vida<=0)this.activa=false;
  }
  draw(ctx){
    const a=Math.max(0,this.vida/this.maxVida);
    ctx.globalAlpha=a;ctx.fillStyle=this.color;
    const s=this.tam*a;
    ctx.fillRect(this.x-s/2,this.y-s/2,s,s);
    ctx.globalAlpha=1;
  }
}

class SistemaParticulas {
  constructor(max=300){this.pool=[];this.max=max;}
  emitir(x,y,cantidad,config){
    for(let i=0;i<cantidad&&this.pool.length<this.max;i++){
      const ang=config.angulo!==undefined?config.angulo:(Math.random()*Math.PI*2);
      const vel=(config.velMin||50)+Math.random()*(config.velMax||150);
      const vx=Math.cos(ang)*vel;
      const vy=Math.sin(ang)*vel-(config.velY||0);
      const color=Array.isArray(config.colores)?config.colores[Math.floor(Math.random()*config.colores.length)]:config.colores||'#fff';
      const vida=config.vidaMin||0.3+Math.random()*(config.vidaMax||0.8);
      const tam=config.tamMin||2+Math.random()*(config.tamMax||4);
      this.pool.push(new Particula(x,y,vx,vy,color,vida,tam));
    }
  }
  update(dt){
    for(let i=this.pool.length-1;i>=0;i--){
      this.pool[i].update(dt);
      if(!this.pool[i].activa)this.pool.splice(i,1);
    }
  }
  draw(ctx){this.pool.forEach(p=>p.draw(ctx));}
}

// --- Popups de Daño ---
class PopupManager {
  constructor(){this.popups=[];}
  agregar(x,y,texto,color,tam=16,vida=1.2){
    this.popups.push({x,y,texto:String(texto),color,tam,vida,maxVida:vida,vx:(Math.random()-0.5)*30,vy:-60});
  }
  update(dt){
    for(let i=this.popups.length-1;i>=0;i--){
      const p=this.popups[i];
      p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=20*dt;
      p.vida-=dt;
      if(p.vida<=0)this.popups.splice(i,1);
    }
  }
  draw(ctx){
    this.popups.forEach(p=>{
      const a=Math.max(0,p.vida/p.maxVida);
      ctx.globalAlpha=a;ctx.fillStyle=p.color;
      ctx.font=`${p.tam}px 'Press Start 2P'`;ctx.textAlign='center';
      ctx.fillText(p.texto,p.x,p.y);
      ctx.globalAlpha=1;
    });
  }
}

// --- Clases / Skins (modular) ---
const CLASS_DEFS = {
  guerrero: {
    key: 'guerrero',
    hpMult: 1.25,
    atkMult: 1.05,
    palette: {cuerpo:'#4a9eff',oscuro:'#2a6ecc',claro:'#7bbfff'},
    aura: 'rgba(80,170,255,0.45)',
    drawAcc: (ctx, f, x, y, w, h) => {
      // espada simple (pixel)
      ctx.fillStyle = '#d9d9d9';
      ctx.fillRect(x + w*0.78, y + h*0.55, Math.max(2, w*0.04), h*0.28);
      ctx.fillStyle = '#8b5a2b';
      ctx.fillRect(x + w*0.76, y + h*0.80, Math.max(4, w*0.08), Math.max(2, h*0.05));
    }
  },
  arquero: {
    key: 'arquero',
    hpMult: 0.95,
    atkMult: 1.10,
    ranged: true,
    range: 320,
    palette: {cuerpo:'#ffaa4a',oscuro:'#cc882a',claro:'#ffcc7b'},
    aura: 'rgba(255,190,90,0.35)',
    drawAcc: (ctx, f, x, y, w, h) => {
      // arco
      ctx.strokeStyle = '#b47a3c';
      ctx.lineWidth = Math.max(2, w*0.04);
      ctx.beginPath();
      ctx.arc(x + w*0.22, y + h*0.55, w*0.12, -Math.PI/2, Math.PI/2);
      ctx.stroke();
      ctx.strokeStyle = '#eee';
      ctx.lineWidth = Math.max(1, w*0.015);
      ctx.beginPath();
      ctx.moveTo(x + w*0.22, y + h*0.43);
      ctx.lineTo(x + w*0.22, y + h*0.67);
      ctx.stroke();
    }
  },
  mago: {
    key: 'mago',
    hpMult: 0.9,
    atkMult: 1.15,
    ranged: true,
    range: 360,
    palette: {cuerpo:'#aa4aff',oscuro:'#882acc',claro:'#cc7bff'},
    aura: 'rgba(190,110,255,0.45)',
    drawAcc: (ctx, f, x, y, w, h) => {
      // sombrero de pico
      ctx.fillStyle = '#2b123d';
      ctx.beginPath();
      ctx.moveTo(x + w*0.50, y + h*0.12);
      ctx.lineTo(x + w*0.30, y + h*0.32);
      ctx.lineTo(x + w*0.70, y + h*0.32);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#5b2b88';
      ctx.fillRect(x + w*0.28, y + h*0.32, w*0.44, h*0.06);
    },
    onHit: (f, target) => {
      // fuego
      if(!f.particulas) return;
      f.particulas.emitir(target.x, target.y - target.alto*0.7, 10, {
        colores:['#ff3b00','#ff9900','#ffd000','#fff'],
        velMin:80, velMax:240, velY:120,
        vidaMin:0.25, vidaMax:0.75, tamMin:3, tamMax:7
      });
    }
  },
  tanque: {
    key: 'tanque',
    hpMult: 1.9,
    atkMult: 0.9,
    slowMult: 0.7,
    wideMult: 1.35,
    palette: {cuerpo:'#4affee',oscuro:'#2accbb',claro:'#7bffee'},
    aura: 'rgba(80,255,235,0.25)',
    drawAcc: (ctx, f, x, y, w, h) => {
      // escudo
      ctx.fillStyle = '#2b4a66';
      ctx.fillRect(x + w*0.10, y + h*0.55, w*0.12, h*0.25);
      ctx.fillStyle = '#99c';
      ctx.fillRect(x + w*0.12, y + h*0.58, w*0.08, h*0.19);
    }
  },
  zombie_knight: {
    key: 'zombie_knight',
    hpMult: 1.1,
    atkMult: 1.05,
    palette: {cuerpo:'#49ff6a',oscuro:'#1f9e3a',claro:'#9bffb0'},
    aura: 'rgba(80,255,110,0.35)',
    drawAcc: (ctx, f, x, y, w, h) => {
      // “armadura” sobre el cuerpo
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(x + w*0.35, y + h*0.45, w*0.30, h*0.22);
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(x + w*0.38, y + h*0.48, w*0.24, h*0.06);
    }
  },
  iron_golem: {
    key: 'iron_golem',
    isSummon: true,
    hpMult: 4.0,
    atkMult: 2.0,
    slowMult: 0.55,
    wideMult: 1.65,
    palette: {cuerpo:'#d7d7d7',oscuro:'#9f9f9f',claro:'#ffffff'},
    aura: 'rgba(220,220,220,0.25)',
    drawAcc: (ctx, f, x, y, w, h) => {
      ctx.fillStyle = '#ff3355';
      ctx.fillRect(x + w*0.42, y + h*0.24, w*0.06, h*0.06);
      ctx.fillRect(x + w*0.54, y + h*0.24, w*0.06, h*0.06);
    }
  }
};

// --- Sprite Pixel Art Procedural ---
const COLORES_PERSONAJE = [
  {cuerpo:'#4a9eff',oscuro:'#2a6ecc',claro:'#7bbfff'},
  {cuerpo:'#ff4a6a',oscuro:'#cc2a4a',claro:'#ff7b9a'},
  {cuerpo:'#4aff6a',oscuro:'#2acc4a',claro:'#7bff9a'},
  {cuerpo:'#ffaa4a',oscuro:'#cc882a',claro:'#ffcc7b'},
  {cuerpo:'#aa4aff',oscuro:'#882acc',claro:'#cc7bff'},
  {cuerpo:'#4affee',oscuro:'#2accbb',claro:'#7bffee'},
  {cuerpo:'#ff4aff',oscuro:'#cc2acc',claro:'#ff7bff'},
  {cuerpo:'#ffff4a',oscuro:'#cccc2a',claro:'#ffff7b'},
  {cuerpo:'#ff6a4a',oscuro:'#cc4a2a',claro:'#ff9a7b'},
  {cuerpo:'#4a6aff',oscuro:'#2a4acc',claro:'#7b9aff'},
];

function generarSpritesheet(colores, esBoss=false) {
  const tam = esBoss ? 32 : 16;
  const frames = 4; // idle0, idle1, ataque, daño
  const c = document.createElement('canvas');
  c.width = tam * frames; c.height = tam;
  const x = c.getContext('2d');

  function pixel(fx, px, py, color) {
    x.fillStyle = color;
    x.fillRect(fx * tam + px, py, 1, 1);
  }

  function dibujarFrame(fi, pose) {
    const s = esBoss ? 2 : 1;
    const ox = esBoss ? 8 : 3;
    const oy = esBoss ? 2 : 1;

    // Cabeza
    for(let py=0;py<4*s;py++)for(let px=0;px<4*s;px++){
      pixel(fi, ox+px, oy+py, colores.cuerpo);
    }
    // Ojos
    pixel(fi, ox+1*s, oy+1*s, '#fff');
    pixel(fi, ox+2*s, oy+1*s, '#fff');
    pixel(fi, ox+1*s, oy+2*s, '#111');
    pixel(fi, ox+2*s, oy+2*s, '#111');

    if(pose==='daño'){
      pixel(fi, ox+1*s, oy+2*s, '#f00');
      pixel(fi, ox+2*s, oy+2*s, '#f00');
    }

    // Cuerpo
    const cy = oy+4*s;
    for(let py=0;py<4*s;py++)for(let px=0;px<4*s;px++){
      pixel(fi, ox+px, cy+py, colores.oscuro);
    }

    // Piernas
    const ly = cy+4*s;
    const legOff = pose==='idle1' ? 1 : 0;
    for(let py=0;py<3*s;py++){
      pixel(fi, ox+0*s+legOff, ly+py, colores.cuerpo);
      pixel(fi, ox+1*s+legOff, ly+py, colores.cuerpo);
      pixel(fi, ox+2*s-legOff, ly+py, colores.oscuro);
      pixel(fi, ox+3*s-legOff, ly+py, colores.oscuro);
    }

    // Brazos
    const ay = cy+1*s;
    if(pose==='ataque'){
      for(let px=0;px<3*s;px++){
        pixel(fi, ox+4*s+px, ay, colores.claro);
        pixel(fi, ox+4*s+px, ay+s, colores.claro);
      }
    } else {
      for(let py=0;py<3*s;py++){
        pixel(fi, ox-1*s, cy+py, colores.cuerpo);
        pixel(fi, ox+4*s, cy+py, colores.cuerpo);
      }
    }

    // Corona de boss
    if(esBoss){
      pixel(fi,ox+1*s,oy-1,'#ffd700');pixel(fi,ox+2*s,oy-1,'#ffd700');
      pixel(fi,ox+0*s,oy-2,'#ffd700');pixel(fi,ox+1*s,oy-2,'#ffd700');
      pixel(fi,ox+2*s,oy-2,'#ffd700');pixel(fi,ox+3*s,oy-2,'#ffd700');
    }
  }

  dibujarFrame(0,'idle0');
  dibujarFrame(1,'idle1');
  dibujarFrame(2,'ataque');
  dibujarFrame(3,'daño');
  return {canvas:c, tamFrame:tam, frames};
}

// --- Clase Luchador ---
let contadorId = 0;

class Fighter {
  constructor(nombre, esBoss, W, H, particulas, popups, opts = {}) {
    this.id = ++contadorId;
    this.nombre = nombre;
    this.esBoss = esBoss;
    this.particulas = particulas;
    this.popups = popups;
    this.clase = opts.clase || (esBoss ? 'boss' : 'guerrero');
    this.classDef = CLASS_DEFS[this.clase] || CLASS_DEFS.guerrero;
    this.isSummon = !!this.classDef.isSummon;
    this.horizon = typeof opts.horizon === 'number' ? opts.horizon : 0.7;

    // Stats
    this.nivel = 1;
    this.xp = 0;
    this.maxHp = esBoss ? 900 : 120; // big & bold base
    if(!esBoss && this.classDef && this.classDef.hpMult) this.maxHp = Math.round(this.maxHp * this.classDef.hpMult);
    this.hp = this.maxHp;
    this.ataque = esBoss ? 12 : 14;
    if(!esBoss && this.classDef && this.classDef.atkMult) this.ataque = this.ataque * this.classDef.atkMult;
    this.ranged = !!this.classDef.ranged;
    this.range = this.classDef.range || 0;

    // Dimensiones
    const escala = esBoss ? 10 : 6; // x2 visual
    this.tamSprite = esBoss ? 32 : 16;
    const wideMult = (!esBoss && this.classDef && this.classDef.wideMult) ? this.classDef.wideMult : 1.0;
    this.escala = escala;
    this.ancho = this.tamSprite * escala;
    this.alto = this.tamSprite * escala;
    this.ancho *= wideMult;

    // Posición (entrada con spread horizontal)
    this.x = W * (0.15 + Math.random() * 0.7);
    // y = “suelo” (pies). Debe caer SOBRE el piso verde (desde H*horizon)
    const gy = H * this.horizon;
    const margen = Math.min(28, (H - gy) * 0.15);
    this.y = gy + margen + Math.random() * Math.max(10, (H - gy) * 0.55);
    this.targetX = this.x;
    this.targetY = this.y;
    this.velX = 0;
    this.velY = 0;
    this.knockX = 0;
    this.knockY = 0;
    // Entrada: caída con bounce
    this.spawnTimer = 0.65;
    this.spawnVy = 0;
    this.y = this.targetY - (this.esBoss ? 420 : 300);

    // Estado
    this.estado = 'idle'; // idle, atacando, dañado, muriendo
    this.timerEstado = 0;
    this.specialTimer = 0;
    this.cooldownAtaque = 2.0; // Cooldown inicial para no atacar al instante
    this.fadeAlpha = 1;
    this.muerto = false;
    this.eliminado = false;
    this.frameAnim = 0;
    this.timerAnim = 0;
    this.miraDerecha = Math.random() > 0.5;
    this.frenzyTimer = 0;

    // Boosts de regalo (sistema de tiers)
    this.boostEscala = 1.0;       // Multiplicador de tamaño visual (1.0 = normal)
    this.boostEscalaTarget = 1.0; // Target para interpolación suave
    this.boostVelocidad = 1.0;    // Multiplicador de velocidad de ataque
    this.boostTimer = 0;          // Tiempo restante del boost activo

    // Sprite
    const ci = Math.floor(Math.random()*COLORES_PERSONAJE.length);
    const colores = esBoss
      ? {cuerpo:'#cc2222',oscuro:'#881111',claro:'#ff4444'}
      : (this.classDef.palette || COLORES_PERSONAJE[ci]);
    this.sprite = generarSpritesheet(colores, esBoss);
    this.colorBase = colores.cuerpo;

    // Portrait en HUD
    if(!esBoss) this._crearPortrait();
  }

  _crearPortrait(){
    const hud = document.getElementById('hud-bottom');
    const div = document.createElement('div');
    div.className='fighter-icon';div.id=`icon-${this.id}`;
    const pc = document.createElement('canvas');
    pc.width=44;pc.height=44;
    const px = pc.getContext('2d');
    px.imageSmoothingEnabled=false;
    px.drawImage(this.sprite.canvas,0,0,this.tamSprite,this.tamSprite,2,2,40,40);
    const nm = document.createElement('span');
    nm.className='fi-name';nm.textContent=this.nombre.substring(0,8).toUpperCase();
    const lv = document.createElement('span');
    lv.className='fi-level';lv.id=`lvl-${this.id}`;lv.textContent=`LV${this.nivel}`;
    div.appendChild(pc);div.appendChild(nm);div.appendChild(lv);
    hud.appendChild(div);
  }

  setNivel(n){
    this.nivel=n;
    if(this.esBoss) return;
    const baseHp = 120 + n*26;
    const baseAtk = 14 + n*3.2;
    this.maxHp = Math.round(baseHp * (this.classDef.hpMult || 1));
    this.ataque = baseAtk * (this.classDef.atkMult || 1);
    this.hp=Math.min(this.hp,this.maxHp);
    const el=document.getElementById(`lvl-${this.id}`);
    if(el)el.textContent=`LV${n}`;
  }

  update(dt, luchadores, bosses, W, H){
    if(this.eliminado)return;

    // Animación de frames
    this.timerAnim+=dt;
    if(this.timerAnim>0.4){this.timerAnim=0;this.frameAnim=this.frameAnim===0?1:0;}

    // Timer de estado
    if(this.timerEstado>0){this.timerEstado-=dt;if(this.timerEstado<=0)this.estado='idle';}
    if(this.specialTimer>0)this.specialTimer-=dt;
    if(this.cooldownAtaque>0)this.cooldownAtaque-=dt;
    if(this.frenzyTimer>0)this.frenzyTimer-=dt;

    // Entrada bounce (caída con rebote)
    if(this.spawnTimer>0){
      this.spawnTimer -= dt;
      this.spawnVy += 2200 * dt;
      this.y += this.spawnVy * dt;
      if(this.y >= this.targetY){
        this.y = this.targetY;
        this.spawnVy = -this.spawnVy * 0.35;
        if(Math.abs(this.spawnVy) < 180) {
          this.spawnTimer = 0;
          this.spawnVy = 0;
        }
      }
    }

    // Decay de boosts de regalo
    if(this.boostTimer>0){
      this.boostTimer-=dt;
      if(this.boostTimer<=0){
        // Boost expirado: restaurar valores normales
        this.boostEscalaTarget=1.0;
        this.boostVelocidad=1.0;
      }
    }
    // Interpolación suave del tamaño
    this.boostEscala+=(this.boostEscalaTarget-this.boostEscala)*0.1;

    // Muerte
    if(this.muerto){
      this.fadeAlpha-=dt*2;
      if(this.fadeAlpha<=0){this.fadeAlpha=0;this.eliminado=true;}
      return;
    }

    // Knockback decay
    this.knockX*=0.85;this.knockY*=0.85;

    // AI: buscar objetivo
    if(!this.esBoss && this.cooldownAtaque<=0){
      if(this.isSummon && bosses.length===0){
        // Gólem aliado solo pelea contra Boss
        return;
      }
      let objetivo=null;
      if(bosses.length>0 && !bosses[0].muerto){
        objetivo=bosses[0];
      } else {
        let minD=Infinity;
        luchadores.forEach(f=>{
          if(f===this||f.muerto)return;
          const d=Math.hypot(this.x-f.x,this.y-f.y);
          if(d<minD){minD=d;objetivo=f;}
        });
      }
      if(objetivo){
        this.targetX=objetivo.x+(this.x<objetivo.x?-this.ancho:this.ancho);
        this.targetY=objetivo.y;
        this.miraDerecha=objetivo.x>this.x;
        const dist=Math.hypot(this.x-objetivo.x,this.y-objetivo.y);
        const rangoGolpe = this.ranged ? (this.range || this.ancho*4.2) : (this.ancho*2.7);
        if(dist<rangoGolpe){
          this._atacar(objetivo);
        }
      }
    }

    // Boss AI
    if(this.esBoss && this.cooldownAtaque<=0 && luchadores.length>0){
      const obj=luchadores[Math.floor(Math.random()*luchadores.length)];
      if(obj&&!obj.muerto){
        this.targetX=obj.x;this.targetY=obj.y;
        this.miraDerecha=obj.x>this.x;
        const dist=Math.hypot(this.x-obj.x,this.y-obj.y);
        if(dist<this.ancho*2){this._atacar(obj);}
      }
    }

    // Movimiento suave
    const slowMult = (!this.esBoss && this.classDef && this.classDef.slowMult) ? this.classDef.slowMult : 1.0;
    const vel=120*dt*slowMult;
    this.x+=(this.targetX-this.x)*0.08+this.knockX;
    this.y+=(this.targetY-this.y)*0.08+this.knockY;

    // Clamp
    this.x=Math.max(this.ancho/2,Math.min(W-this.ancho/2,this.x));
    const gy = H * this.horizon;
    this.y=Math.max(gy + 10,Math.min(H - 10,this.y));
  }

  _atacar(objetivo){
    if(objetivo.muerto)return;
    this.estado='atacando';this.timerEstado=0.3;
    // Cooldown reducido si hay boost de velocidad activo
    const frenzyMult = (this.frenzyTimer>0) ? 2.0 : 1.0;
    this.cooldownAtaque=(0.8+Math.random()*0.5)/(this.boostVelocidad*frenzyMult);

    let dmg=this.ataque+Math.floor(Math.random()*5);
    if(this.specialTimer>0)dmg=Math.floor(dmg*2.5);

    objetivo.recibirDaño(dmg,this);
    if(this.classDef && this.classDef.onHit) this.classDef.onHit(this, objetivo);

    // Lunge hacia objetivo
    const ang=Math.atan2(objetivo.y-this.y,objetivo.x-this.x);
    this.knockX=Math.cos(ang)*8;
    this.knockY=Math.sin(ang)*3;

    // Partículas de impacto
    this.particulas.emitir(objetivo.x,objetivo.y-this.alto/2,6,{
      colores:['#fff','#ff0','#f80'],velMin:50,velMax:150,
      vidaMin:0.2,vidaMax:0.5,tamMin:2,tamMax:4
    });
  }

  recibirDaño(cant, atacante){
    this.hp-=cant;
    this.estado='dañado';this.timerEstado=0.2;
    this.popups.agregar(this.x,this.y-this.alto,cant,'#ff4444',14);

    // Reporte de daño (para Podio). Solo cuando el objetivo es boss.
    if(this.esBoss && atacante && typeof window !== 'undefined' && typeof window.__reportDamage === 'function'){
      try { window.__reportDamage(atacante.nombre, cant, 'boss'); } catch(e){}
    }

    // Knockback
    if(atacante){
      const ang=Math.atan2(this.y-atacante.y,this.x-atacante.x);
      this.knockX=Math.cos(ang)*12;
      this.knockY=Math.sin(ang)*5;
    }

    if(this.hp<=0){this.hp=0;this.morir();}
  }

  curar(cant){
    this.hp=Math.min(this.maxHp,this.hp+cant);
    this.popups.agregar(this.x,this.y-this.alto-20,`+${cant}`,'#44ff44',12);
    this.particulas.emitir(this.x,this.y-this.alto/2,4,{
      colores:['#4f4','#8f8','#0f0'],velMin:20,velMax:80,velY:50,
      vidaMin:0.3,vidaMax:0.7,tamMin:2,tamMax:3
    });
  }

  morir(){
    this.muerto=true;
    // Explosión épica + homenaje
    this.particulas.emitir(this.x,this.y-this.alto/2,28,{
      colores:this.esBoss?['#f00','#f80','#ff0','#fff']:['#888','#aaa','#fff',this.colorBase],
      velMin:80,velMax:250,vidaMin:0.4,vidaMax:1.2,tamMin:3,tamMax:6
    });
    if(this.popups) this.popups.agregar(this.x, this.y - this.alto - 40, `F por ${this.nombre}`, '#ffffff', 16, 2.0);
  }

  remover(){
    const el=document.getElementById(`icon-${this.id}`);
    if(el){el.classList.add('dead');setTimeout(()=>el.remove(),1000);}
  }

  draw(ctx){
    if(this.eliminado)return;
    ctx.save();
    ctx.globalAlpha=this.fadeAlpha;
    ctx.imageSmoothingEnabled=false;

    // Glow especial
    if(this.frenzyTimer>0){
      ctx.shadowBlur=28;ctx.shadowColor='rgba(255,40,40,0.85)';
    } else if(this.specialTimer>0){
      ctx.shadowBlur=22;ctx.shadowColor='#ffd700';
    } else if(!this.esBoss && this.classDef && this.classDef.aura){
      ctx.shadowBlur=14;ctx.shadowColor=this.classDef.aura;
    } else if(this.esBoss){
      ctx.shadowBlur=15;ctx.shadowColor='rgba(255,0,0,0.6)';
    }

    // Frame del sprite
    let fi=this.frameAnim;
    if(this.estado==='atacando')fi=2;
    if(this.estado==='dañado')fi=3;

    // “Breathing” + boosts (vida visual)
    const breathe = 1 + Math.sin(Date.now() * 0.01 + this.id) * 0.02;
    const escalaActual = this.boostEscala * breathe;
    const anchoRender = this.ancho * escalaActual;
    const altoRender = this.alto * escalaActual;
    const dx=this.x-anchoRender/2;
    const dy=this.y-altoRender;

    ctx.save();
    if(!this.miraDerecha){
      ctx.translate(this.x,0);ctx.scale(-1,1);ctx.translate(-this.x,0);
    }
    ctx.drawImage(
      this.sprite.canvas,
      fi*this.tamSprite,0,this.tamSprite,this.tamSprite,
      dx,dy,anchoRender,altoRender
    );
    ctx.restore();

    // Accesorios de clase (encima del sprite)
    if(!this.esBoss && this.classDef && this.classDef.drawAcc){
      try { this.classDef.drawAcc(ctx, this, dx, dy, anchoRender, altoRender); } catch(e){}
    }

    // Barra HP
    if(!this.muerto){
      const bw=anchoRender+10;const bh=6;
      const bx=this.x-bw/2;const by=dy-20;

      // Nombre
      ctx.fillStyle='rgba(0,0,0,0.7)';
      ctx.fillRect(bx,by-14,bw,12);
      // Nombre grande + borde negro (legible en stream)
      ctx.font="16px 'Press Start 2P'";ctx.textAlign='center';ctx.textBaseline='alphabetic';
      let label=this.nombre.substring(0,10).toUpperCase();
      if(this.nivel>1)label=`LV${this.nivel} `+label;
      ctx.lineWidth=5;ctx.strokeStyle='rgba(0,0,0,0.95)';
      ctx.strokeText(label,this.x,by-4);
      ctx.fillStyle='#fff';
      ctx.fillText(label,this.x,by-5);

      // Barra
      ctx.fillStyle='#222';ctx.fillRect(bx,by,bw,bh);
      const pct=this.hp/this.maxHp;
      const hpColor=pct>0.5?'#0f0':pct>0.25?'#ff0':'#f00';
      ctx.fillStyle=hpColor;ctx.fillRect(bx,by,bw*pct,bh);
      ctx.strokeStyle='#000';ctx.lineWidth=1;ctx.strokeRect(bx,by,bw,bh);
    }

    ctx.restore();
  }
}
