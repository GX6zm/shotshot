/* ============================================================================
   60 秒塔防 · TOWER 60
   ----------------------------------------------------------------------------
   俯视角生存塔防：鼠标瞄准、自动开火、60 秒一波、三选一强化。
   打击感优先：定格、震屏、击退、挤压拉伸、粒子、飘字、暴击、慢镜。
   零依赖，Canvas 2D + WebAudio 合成音效。
   ========================================================================== */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ 常量 */
  const W = 1000, H = 700;
  const CX = 500, CY = 388;
  const ARENA_R = 266;
  const TOWER_R = 26;
  const TAU = Math.PI * 2;
  const FONT = '"Microsoft YaHei","PingFang SC","Noto Sans SC",system-ui,sans-serif';
  const MONO = '"Consolas","SF Mono","JetBrains Mono",monospace';

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
  const rgb = (c) => 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
  const rgba = (c, a) => 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  const angDiff = (a, b) => {
    let d = a - b;
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    return d;
  };
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  /* ------------------------------------------------------------------ 画布 */
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  let DPR = 1;

  function fit() {
    const s = Math.min((window.innerWidth - 24) / W, (window.innerHeight - 24) / H, 1.3);
    DPR = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = Math.round(W * s) + 'px';
    canvas.style.height = Math.round(H * s) + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
  }
  window.addEventListener('resize', fit);
  fit();

  /* ------------------------------------------------------------------ 音效 */
  const Sfx = {
    ac: null, master: null, noiseBuf: null, muted: false, _t: {},

    init() {
      if (this.ac) { this.resume(); return; }
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ac = new AC();
        this.master = this.ac.createGain();
        this.master.gain.value = 0.5;
        this.master.connect(this.ac.destination);
        const n = Math.floor(this.ac.sampleRate * 0.5);
        this.noiseBuf = this.ac.createBuffer(1, n, this.ac.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      } catch (e) { this.ac = null; }
    },
    resume() { if (this.ac && this.ac.state === 'suspended') this.ac.resume(); },
    ok() { return !!this.ac && !this.muted; },
    gate(name, ms) {
      if (!this.ac) return false;
      const t = this.ac.currentTime;
      if (this._t[name] !== undefined && t - this._t[name] < ms / 1000) return false;
      this._t[name] = t;
      return true;
    },
    osc(type, f0, f1, dur, vol, delay) {
      if (!this.ok()) return;
      const t0 = this.ac.currentTime + (delay || 0);
      const o = this.ac.createOscillator();
      const g = this.ac.createGain();
      o.type = type;
      o.frequency.setValueAtTime(Math.max(20, f0), t0);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + Math.min(0.008, dur * 0.3));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(this.master);
      o.start(t0); o.stop(t0 + dur + 0.04);
    },
    noise(dur, vol, ftype, freq, delay, q) {
      if (!this.ok() || !this.noiseBuf) return;
      const t0 = this.ac.currentTime + (delay || 0);
      const s = this.ac.createBufferSource();
      s.buffer = this.noiseBuf; s.loop = true;
      const f = this.ac.createBiquadFilter();
      f.type = ftype || 'highpass';
      f.frequency.setValueAtTime(freq || 1200, t0);
      f.Q.value = q || 0.8;
      const g = this.ac.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + Math.min(0.006, dur * 0.3));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      s.connect(f); f.connect(g); g.connect(this.master);
      s.start(t0); s.stop(t0 + dur + 0.04);
    },

    shoot() {
      if (!this.gate('shoot', 42)) return;
      this.osc('square', rand(880, 1000), 240, 0.055, 0.045);
      this.noise(0.03, 0.025, 'highpass', 2600);
    },
    hit() {
      if (!this.gate('hit', 28)) return;
      this.noise(0.035, 0.05, 'bandpass', 2000, 0, 1.4);
      this.osc('triangle', 520, 340, 0.03, 0.02);
    },
    kill(combo) {
      if (!this.gate('kill', 34)) return;
      const base = 220 + Math.min(260, (combo || 0) * 7);
      this.osc('sine', base * 1.6, base * 0.45, 0.13, 0.10);
      this.noise(0.1, 0.05, 'lowpass', 1100);
    },
    bigKill() {
      this.osc('sine', 170, 34, 0.45, 0.22);
      this.noise(0.42, 0.16, 'lowpass', 700);
      this.noise(0.18, 0.10, 'bandpass', 2400, 0.05, 1.2);
    },
    hurt() {
      this.osc('sawtooth', 190, 46, 0.34, 0.20);
      this.noise(0.28, 0.14, 'lowpass', 520);
    },
    shield() {
      this.osc('sine', 880, 300, 0.22, 0.12);
      this.noise(0.2, 0.07, 'bandpass', 1400, 0, 2);
    },
    pulse() {
      this.osc('sawtooth', 90, 760, 0.26, 0.10);
      this.osc('sine', 60, 150, 0.4, 0.16);
      this.noise(0.34, 0.11, 'bandpass', 700, 0, 1.2);
    },
    upgrade() {
      this.osc('triangle', 523.25, 523.25, 0.16, 0.10, 0);
      this.osc('triangle', 659.25, 659.25, 0.16, 0.10, 0.07);
      this.osc('triangle', 783.99, 783.99, 0.22, 0.12, 0.14);
      this.osc('sine', 1046.5, 1046.5, 0.3, 0.06, 0.2);
    },
    waveStart() {
      this.osc('sine', 150, 62, 0.34, 0.14);
      this.noise(0.30, 0.06, 'highpass', 1100);
      this.osc('triangle', 392, 659.25, 0.18, 0.055, 0.05);
    },
    aim(on) {
      if (on) {
        this.osc('sine', 660, 1320, 0.10, 0.06);
        this.osc('sine', 990, 1480, 0.12, 0.05, 0.06);
      } else {
        this.osc('sine', 880, 440, 0.12, 0.05);
      }
    },
    waveClear() {
      this.osc('sine', 392, 392, 0.18, 0.09, 0);
      this.osc('sine', 523.25, 523.25, 0.18, 0.09, 0.08);
      this.osc('sine', 659.25, 659.25, 0.35, 0.10, 0.16);
    },
    boss() {
      this.osc('sawtooth', 55, 110, 0.9, 0.13);
      this.noise(0.9, 0.10, 'lowpass', 320);
    },
    over() {
      this.osc('sawtooth', 330, 300, 0.3, 0.12, 0);
      this.osc('sawtooth', 247, 220, 0.35, 0.12, 0.16);
      this.osc('sawtooth', 165, 82, 0.9, 0.16, 0.34);
      this.noise(0.7, 0.10, 'lowpass', 500, 0.3);
    }
  };

  /* ------------------------------------------------------------------ 特效 */
  const FX = {
    trauma: 0, flash: 0, flashCol: [255, 255, 255],
    hitstop: 0, stopCd: 0,
    timeScale: 1, targetTS: 1, slowT: 0,
    zoom: 1,

    reset() {
      this.trauma = 0; this.flash = 0; this.hitstop = 0; this.stopCd = 0;
      this.timeScale = 1; this.targetTS = 1; this.slowT = 0; this.zoom = 1;
      this.flashCol = [255, 255, 255];
    },
    punch(v) { this.trauma = Math.min(1, this.trauma + v); },
    stop(sec, force) {
      if (!force && this.stopCd > 0) return;
      this.hitstop = Math.max(this.hitstop, sec);
      this.stopCd = 0.055;
    },
    flashScreen(col, a) {
      if (a > this.flash) { this.flash = a; this.flashCol = col; }
    },
    slowmo(sec) {
      this.targetTS = 0.24;
      this.slowT = sec;
    }
  };

  /* -------------------------------------------------------------- 实体容器 */
  const enemies = [];
  const bullets = [];
  const parts = [];
  const texts = [];
  const rings = [];
  const portals = [];
  const turrets = [];
  let UID = 0;

  /* -------------------------------------------------------------- 升级定义 */
  const RARITY = {
    common: { name: '常规', col: [125, 211, 252], w: 6.0 },
    rare: { name: '稀有', col: [192, 132, 252], w: 2.4 },
    epic: { name: '史诗', col: [251, 191, 36], w: 0.8 }
  };

  const UPGRADES = [
    { id: 'rapid', name: '连射装置', ch: '射', rarity: 'common', max: 6, desc: '射速 +25%', apply() { stats.fireRate *= 1.25; } },
    { id: 'power', name: '高爆弹头', ch: '伤', rarity: 'common', max: 6, desc: '子弹伤害 +25%', apply() { stats.dmg *= 1.25; } },
    { id: 'velo', name: '弹道加速', ch: '速', rarity: 'common', max: 4, desc: '子弹速度 +28%', apply() { stats.bspd *= 1.28; } },
    { id: 'repair', name: '紧急维修', ch: '修', rarity: 'common', max: 5, desc: '立刻回复 35 生命，生命上限 +10', apply() { tower.maxHp += 10; tower.hp = Math.min(tower.maxHp, tower.hp + 35); } },
    { id: 'pulse', name: '脉冲充能', ch: '冲', rarity: 'common', max: 4, desc: '脉冲冷却 -18%，范围 +12%', apply() { stats.pulseCd *= 0.82; stats.pulseR *= 1.12; stats.pulseDmg *= 1.18; } },
    { id: 'multi', name: '多管齐射', ch: '多', rarity: 'rare', max: 4, desc: '每次射击 +1 发弹丸', apply() { stats.multi += 1; } },
    { id: 'pierce', name: '穿甲弹芯', ch: '穿', rarity: 'rare', max: 3, desc: '子弹多穿透 1 个敌人', apply() { stats.pierce += 1; } },
    { id: 'bounce', name: '跳弹', ch: '弹', rarity: 'rare', max: 2, desc: '命中后弹射到最近的敌人', apply() { stats.bounce += 1; } },
    { id: 'freeze', name: '冷冻弹', ch: '冰', rarity: 'rare', max: 2, desc: '命中使敌人减速 45%（1.6 秒）', apply() { stats.freeze += 1; } },
    { id: 'crit', name: '暴击核心', ch: '暴', rarity: 'rare', max: 4, desc: '暴击率 +12%（3 倍伤害）', apply() { stats.crit += 0.12; } },
    { id: 'drone', name: '维修无人机', ch: '无', rarity: 'rare', max: 3, desc: '每击杀 12 个敌人回复 2 生命', apply() { stats.lifesteal += 1; } },
    { id: 'shield', name: '能量护盾', ch: '盾', rarity: 'rare', max: 3, desc: '每波开始获得 1 层护盾', apply() { stats.shieldLayers += 1; } },
    { id: 'turret', name: '副炮台', ch: '炮', rarity: 'epic', max: 3, desc: '增加一座自动索敌的副炮', apply() { stats.turretCount += 1; rebuildTurrets(); } },
    { id: 'explode', name: '爆裂弹', ch: '爆', rarity: 'epic', max: 2, desc: '命中时对周围造成 50% 溅射', apply() { stats.explode += 1; } },
    { id: 'warp', name: '时间扭曲', ch: '缓', rarity: 'epic', max: 2, desc: '全场敌人移速 -13%', apply() { stats.enemySlow *= 0.87; } }
  ];

  /* -------------------------------------------------------------- 敌人定义 */
  const ET = {
    grunt: { hp: 22, spd: 46, r: 16, dmg: 4, score: 10, sides: 4, spin: 1.1, col: [74, 222, 128] },
    runner: { hp: 13, spd: 112, r: 12, dmg: 3, score: 16, sides: 3, spin: 2.6, col: [251, 191, 36] },
    tank: { hp: 88, spd: 31, r: 24, dmg: 9, score: 32, sides: 4, spin: 0.5, col: [167, 139, 250] },
    split: { hp: 46, spd: 44, r: 19, dmg: 5, score: 26, sides: 6, spin: 1.2, col: [244, 114, 182], split: 2 },
    splitling: { hp: 11, spd: 84, r: 10, dmg: 2, score: 5, sides: 3, spin: 2.4, col: [244, 114, 182] },
    boss: { hp: 430, spd: 26, r: 40, dmg: 20, score: 500, sides: 8, spin: 0.35, col: [248, 113, 113], boss: true }
  };

  /* -------------------------------------------------------------- 运行状态 */
  const tower = {
    x: CX, y: CY, hp: 120, maxHp: 120, aim: -Math.PI / 2,
    cd: 0, recoil: 0, muzzle: 0, pulseCd: 0, shield: 0, hitFlash: 0
  };

  let stats = freshStats();

  const G = {
    mode: 'menu',           // menu | playing | upgrade | over
    wave: 1, waveT: 0, waveLen: 60,
    score: 0, kills: 0, combo: 0, comboT: 0,
    spawnT: 0, bossPending: 0,
    cards: [], owned: {}, hover: -1,
    paused: false, overT: 0, banner: null,
    best: 0, newBest: false, time: 0
  };

  try { G.best = parseInt(localStorage.getItem('td60.best') || '0', 10) || 0; } catch (e) { G.best = 0; }

  const mouse = { x: CX, y: CY - 150 };
  let autoAim = false;      // 自瞄模式：炮塔自己锁最靠近核心的敌人
  let lockTarget = null;    // 当前锁定的目标（画准星用）

  function freshStats() {
    return {
      fireRate: 5.5, dmg: 14, bspd: 660, multi: 1, spread: 0.075,
      pierce: 0, bounce: 0, freeze: 0, explode: 0,
      crit: 0.03, lifesteal: 0, shieldLayers: 0, turretCount: 0,
      pulseCd: 16, pulseR: 132, pulseDmg: 42, enemySlow: 1
    };
  }

  function rebuildTurrets() {
    turrets.length = 0;
    for (let i = 0; i < stats.turretCount; i++) {
      turrets.push({ base: (i / stats.turretCount) * TAU, cd: 0.25, aim: 0 });
    }
  }

  /* -------------------------------------------------------------- 输入回调 */
  function toGame(e) {
    const r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) / r.width * W,
      y: (e.clientY - r.top) / r.height * H
    };
  }

  canvas.addEventListener('pointermove', (e) => {
    const p = toGame(e);
    mouse.x = p.x; mouse.y = p.y;
    if (G.mode === 'upgrade') {
      G.hover = -1;
      for (let i = 0; i < G.cards.length; i++) {
        const r = cardRect(i, G.cards.length);
        if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) { G.hover = i; break; }
      }
    }
  });

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    Sfx.init(); Sfx.resume();
    const p = toGame(e);
    mouse.x = p.x; mouse.y = p.y;
    handleClick(p.x, p.y);
  });

  function handleClick(x, y) {
    if (G.mode === 'menu') { startRun(); return; }
    if (G.mode === 'over') { if (G.overT > 0.6) startRun(); return; }
    if (G.mode === 'upgrade') {
      for (let i = 0; i < G.cards.length; i++) {
        const r = cardRect(i, G.cards.length);
        if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) { chooseCard(i); return; }
      }
      return;
    }
    if (G.paused) G.paused = false;
  }

  window.addEventListener('keydown', (e) => {
    const k = e.key;
    if (k === ' ' || e.code === 'Space') e.preventDefault();
    Sfx.init(); Sfx.resume();

    if (k === ' ' || e.code === 'Space') {
      if (G.mode === 'menu') { startRun(); return; }
      if (G.mode === 'over') { if (G.overT > 0.6) startRun(); return; }
      if (G.mode === 'playing' && !G.paused) { pulse(); return; }
    }
    if (G.mode === 'upgrade' && (k === '1' || k === '2' || k === '3')) {
      const i = parseInt(k, 10) - 1;
      if (i < G.cards.length) chooseCard(i);
      return;
    }
    if (k === 'Escape' || k === 'p' || k === 'P') {
      if (G.mode === 'playing') G.paused = !G.paused;
      return;
    }
    if (k === 'm' || k === 'M') {
      Sfx.muted = !Sfx.muted;
      if (Sfx.master) Sfx.master.gain.value = Sfx.muted ? 0 : 0.5;
      return;
    }
    if (k === 'f' || k === 'F') {
      autoAim = !autoAim;
      if (!autoAim) lockTarget = null;
      Sfx.aim(autoAim);
      return;
    }
    if ((k === 'r' || k === 'R') && G.mode === 'over' && G.overT > 0.6) startRun();
  });

  window.addEventListener('blur', () => { if (G.mode === 'playing' && !G.paused) G.paused = true; });

  /* -------------------------------------------------------------- 流程控制 */
  function startRun() {
    G.mode = 'playing';
    G.wave = 1; G.waveT = 0;
    G.score = 0; G.kills = 0; G.combo = 0; G.comboT = 0;
    G.spawnT = 0.9; G.bossPending = 0;
    G.cards = []; G.owned = {}; G.hover = -1;
    G.paused = false; G.overT = 0; G.banner = null; G.newBest = false;

    enemies.length = 0; bullets.length = 0; parts.length = 0;
    texts.length = 0; rings.length = 0; portals.length = 0;

    stats = freshStats();
    tower.hp = 120; tower.maxHp = 120; tower.cd = 0; tower.recoil = 0;
    tower.muzzle = 0; tower.pulseCd = 0; tower.shield = 0; tower.hitFlash = 0;
    rebuildTurrets();
    FX.reset();
    startWave(1);
  }

  function startWave(n) {
    G.wave = n;
    G.waveT = 0;
    G.spawnT = 0.75;
    tower.shield = stats.shieldLayers;
    G.banner = { text: '第 ' + n + ' 波', sub: 'WAVE ' + n, t: 0, life: 1.5, boss: false };
    G.bossPending = (n % 5 === 0) ? 1.4 : 0;

    // 开场环形突袭：一开波就有敌人扑上来，别让场地空着
    const burstN = Math.min(4 + n, 10);
    const off = Math.random() * TAU;
    for (let i = 0; i < burstN; i++) {
      const a = off + (i / burstN) * TAU;
      const d = ARENA_R + rand(20, 62);
      spawnEnemy(pickType(), CX + Math.cos(a) * d, CY + Math.sin(a) * d);
    }
    Sfx.waveStart();
  }

  function endWave() {
    for (const e of enemies) {
      if (e.dead) continue;
      e.dead = true;
      burst(e.x, e.y, e.col, 7, 150);
    }
    enemies.length = 0;
    bullets.length = 0;

    G.score += G.wave * 50;
    tower.hp = Math.min(tower.maxHp, tower.hp + 8);
    rings.push({ x: CX, y: CY, t: 0, life: 0.6, r0: 20, r1: ARENA_R + 60, col: [125, 211, 252], w: 5 });

    G.cards = rollUpgrades();
    G.hover = -1;
    G.mode = 'upgrade';
    G.combo = 0; G.comboT = 0;

    FX.punch(0.32);
    FX.flashScreen([125, 211, 252], 0.22);
    Sfx.waveClear();
  }

  function chooseCard(i) {
    const u = G.cards[i];
    if (!u) return;
    G.owned[u.id] = (G.owned[u.id] || 0) + 1;
    u.apply();
    G.mode = 'playing';
    G.cards = [];
    FX.punch(0.25);
    FX.flashScreen([253, 224, 71], 0.26);
    Sfx.upgrade();
    startWave(G.wave + 1);
  }

  function gameOver() {
    G.mode = 'over';
    G.overT = 0;
    G.paused = false;
    FX.targetTS = 0.35;
    FX.slowT = 1.4;
    FX.punch(1);
    FX.flashScreen([248, 113, 113], 0.6);
    Sfx.over();
    if (G.score > G.best) {
      G.best = G.score;
      G.newBest = true;
      try { localStorage.setItem('td60.best', String(G.best)); } catch (e) { /* ignore */ }
    }
  }

  function rollUpgrades() {
    const pool = UPGRADES.filter((u) => (G.owned[u.id] || 0) < u.max);
    const out = [];
    while (out.length < 3 && pool.length) {
      let total = 0;
      for (const u of pool) total += RARITY[u.rarity].w;
      let r = Math.random() * total;
      let idx = pool.length - 1;
      for (let i = 0; i < pool.length; i++) {
        r -= RARITY[pool[i].rarity].w;
        if (r <= 0) { idx = i; break; }
      }
      out.push(pool.splice(idx, 1)[0]);
    }
    return out;
  }

  /* -------------------------------------------------------------- 生成敌人 */
  function waveCfg(w) {
    // 总血量 ≈ 密度 × 单只血量：早期温和（让玩家尝到爽），10 波后加速收紧
    const late = w > 10 ? Math.pow(1.09, w - 10) : 1;
    return {
      interval: Math.max(0.32, 0.98 * Math.pow(0.955, w - 1)),
      hpMul: Math.pow(1.135, w - 1) * late,
      spdMul: Math.min(2.1, 1 + (w - 1) * 0.022)
    };
  }

  function pickType() {
    const w = G.wave;
    const table = [['grunt', Math.max(18, 62 - w * 2)]];
    if (w >= 2) table.push(['runner', Math.min(34, 10 + w * 3)]);
    if (w >= 3) table.push(['tank', Math.min(26, 6 + w * 2)]);
    if (w >= 4) table.push(['split', Math.min(22, 4 + w * 1.5)]);
    let total = 0;
    for (const t of table) total += t[1];
    let r = Math.random() * total;
    for (const t of table) { r -= t[1]; if (r <= 0) return t[0]; }
    return 'grunt';
  }

  function spawnEnemy(type, px, py) {
    const def = ET[type];
    const cfg = waveCfg(G.wave);
    let x = px, y = py;
    if (x === undefined) {
      const a = Math.random() * TAU;
      const d = ARENA_R + rand(24, 46);
      x = CX + Math.cos(a) * d;
      y = CY + Math.sin(a) * d;
    }
    const hp = def.hp * cfg.hpMul;
    const e = {
      id: ++UID, type: type, x: x, y: y,
      hp: hp, maxHp: hp,
      spd: def.spd * cfg.spdMul,
      r: def.r, dmg: def.dmg, score: def.score,
      sides: def.sides, spin: def.spin,
      col: def.col, colStr: rgb(def.col), colLow: rgba(def.col, 0.16),
      boss: !!def.boss,
      rot: Math.random() * TAU,
      flash: 0, sq: 0, kx: 0, ky: 0,
      slow: 0, stun: 0, dead: false
    };
    enemies.push(e);
    portals.push({ x: x, y: y, t: 0, life: 0.55, r: def.r + 12, col: def.col });
    if (def.split) e.splitCount = def.split;
    return e;
  }

  function spawnBoss() {
    const a = -Math.PI / 2 + rand(-0.5, 0.5);
    const d = ARENA_R + 40;
    spawnEnemy('boss', CX + Math.cos(a) * d, CY + Math.sin(a) * d);
    G.banner = { text: 'BOSS 降临', sub: 'DANGER', t: 0, life: 2.1, boss: true };
    FX.punch(0.55);
    FX.flashScreen([248, 113, 113], 0.3);
    Sfx.boss();
  }

  /* -------------------------------------------------------------- 战斗逻辑 */
  function spawnBulletAt(x, y, ang, dmg) {
    const sp = stats.bspd;
    bullets.push({
      x: x, y: y, px: x, py: y,
      vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
      dmg: dmg, life: 1.2, r: 4.4,
      pierce: stats.pierce, bounce: stats.bounce,
      hits: [], dead: false
    });
  }

  function fireVolley() {
    const n = stats.multi;
    const base = tower.aim;
    for (let i = 0; i < n; i++) {
      const off = n === 1 ? 0 : (i - (n - 1) / 2) * stats.spread;
      const ang = base + off;
      spawnBulletAt(
        CX + Math.cos(ang) * (TOWER_R + 8),
        CY + Math.sin(ang) * (TOWER_R + 8),
        ang, stats.dmg
      );
    }
    tower.recoil = 1;
    tower.muzzle = 1;
    const mx = CX + Math.cos(base) * (TOWER_R + 18);
    const my = CY + Math.sin(base) * (TOWER_R + 18);
    for (let i = 0; i < 4; i++) {
      parts.push(makeSpark(mx, my, base + rand(-0.45, 0.45), rand(140, 340), rand(0.07, 0.16), [186, 230, 253]));
    }
    FX.punch(0.022);
    Sfx.shoot();
  }

  function updateTower(dt) {
    tower.cd -= dt;
    tower.recoil = Math.max(0, tower.recoil - dt * 9);
    tower.muzzle = Math.max(0, tower.muzzle - dt * 18);
    tower.hitFlash = Math.max(0, tower.hitFlash - dt * 4);
    tower.pulseCd = Math.max(0, tower.pulseCd - dt);

    let target;
    if (autoAim) {
      lockTarget = pickAimTarget();
      if (lockTarget) {
        // 提前量：按子弹飞到目标所需时间预判（敌人朝核心直线走）
        const ex = lockTarget.x, ey = lockTarget.y;
        const dx = CX - ex, dy = CY - ey;
        const dd = Math.hypot(dx, dy) || 1;
        const lead = Math.min(0.32, dd / stats.bspd);
        const px = ex + (dx / dd) * lockTarget.spd * lead;
        const py = ey + (dy / dd) * lockTarget.spd * lead;
        target = Math.atan2(py - CY, px - CX);
        tower.aim += angDiff(target, tower.aim) * Math.min(1, dt * 42);
      }
    } else {
      lockTarget = null;
      target = Math.atan2(mouse.y - CY, mouse.x - CX);
      tower.aim += angDiff(target, tower.aim) * Math.min(1, dt * 26);
    }

    if (tower.cd <= 0 && (!autoAim || lockTarget)) {
      tower.cd = 1 / stats.fireRate;
      fireVolley();
    }

    const now = G.time;
    for (let i = 0; i < turrets.length; i++) {
      const t = turrets[i];
      t.cd -= dt;
      const orb = t.base + now * 0.8;
      const tx = CX + Math.cos(orb) * (TOWER_R + 16);
      const ty = CY + Math.sin(orb) * (TOWER_R + 16);
      const tgt = nearestEnemy(tx, ty, null);
      if (tgt) {
        const ang = Math.atan2(tgt.y - ty, tgt.x - tx);
        t.aim += angDiff(ang, t.aim) * Math.min(1, dt * 18);
        if (t.cd <= 0) {
          t.cd = 1 / (stats.fireRate * 0.85);
          spawnBulletAt(tx, ty, t.aim, stats.dmg * 0.62);
          for (let k = 0; k < 2; k++) {
            parts.push(makeSpark(tx, ty, t.aim + rand(-0.5, 0.5), rand(100, 220), rand(0.06, 0.12), [186, 230, 253]));
          }
        }
      }
    }
  }

  function nearestEnemy(x, y, exclude) {
    let best = null, bd = Infinity;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.dead || e === exclude) continue;
      const dx = e.x - x, dy = e.y - y;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  // 自瞄目标：离核心最近的（最急），同距离优先血薄的
  function pickAimTarget() {
    let best = null, bd = Infinity;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.dead) continue;
      const dx = e.x - CX, dy = e.y - CY;
      const d = dx * dx + dy * dy - (e.hp < 40 ? 0.0001 : 0);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  function updateEnemies(dt) {
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.dead) continue;
      e.flash = Math.max(0, e.flash - dt * 11);
      e.sq = Math.max(0, e.sq - dt * 6.5);
      e.slow = Math.max(0, e.slow - dt);
      e.stun = Math.max(0, e.stun - dt);

      const dx = CX - e.x, dy = CY - e.y;
      const dist = Math.hypot(dx, dy) || 1;
      const slowF = e.slow > 0 ? (1 - Math.min(0.72, 0.45 * stats.freeze)) : 1;
      const spd = e.spd * slowF * stats.enemySlow;

      if (e.stun <= 0) {
        e.x += (dx / dist) * spd * dt;
        e.y += (dy / dist) * spd * dt;
      }
      e.x += e.kx * dt;
      e.y += e.ky * dt;
      const kdecay = Math.exp(-9 * dt);
      e.kx *= kdecay;
      e.ky *= kdecay;

      if (dist < TOWER_R + e.r * 0.7) {
        hitTower(e);
      }
    }
  }

  function updateBullets(dt) {
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.px = b.x; b.py = b.y;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;

      if (b.life <= 0 || b.x < -50 || b.x > W + 50 || b.y < -50 || b.y > H + 50) {
        bullets.splice(i, 1);
        continue;
      }

      let gone = false;
      for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j];
        if (e.dead) continue;
        if (b.hits.indexOf(e.id) >= 0) continue;
        const rr = b.r + e.r;
        const ddx = b.x - e.x, ddy = b.y - e.y;
        if (ddx * ddx + ddy * ddy <= rr * rr) {
          hitEnemy(b, e);
          if (b.dead) { bullets.splice(i, 1); gone = true; break; }
        }
      }
      if (gone) continue;
    }
  }

  function hitEnemy(b, e) {
    let dmg = b.dmg;
    let crit = false;
    if (Math.random() < stats.crit) { dmg *= 3; crit = true; }

    const ang = Math.atan2(b.vy, b.vx);
    impactFX(b.x, b.y, ang, crit, e.col);

    if (stats.explode > 0) {
      splash(b.x, b.y, 44 + stats.explode * 16, dmg * 0.5 * stats.explode, e);
    }
    if (stats.freeze > 0) e.slow = 1.6;

    hurtEnemy(e, dmg, crit);

    if (b.bounce > 0) {
      b.bounce--;
      const t = nearestEnemy(e.x, e.y, e);
      if (t) {
        const a2 = Math.atan2(t.y - b.y, t.x - b.x);
        const sp = Math.hypot(b.vx, b.vy);
        b.vx = Math.cos(a2) * sp;
        b.vy = Math.sin(a2) * sp;
        b.x = e.x; b.y = e.y;
        b.hits.length = 0;
        b.hits.push(e.id);
        return;
      }
    }
    if (b.pierce > 0) {
      b.pierce--;
      b.hits.push(e.id);
    } else {
      b.dead = true;
    }
  }

  function splash(x, y, radius, dmg, skip) {
    const list = enemies.slice();
    for (const o of list) {
      if (o.dead || o === skip) continue;
      const dx = o.x - x, dy = o.y - y;
      if (dx * dx + dy * dy <= (radius + o.r) * (radius + o.r)) {
        hurtEnemy(o, dmg, false);
      }
    }
    rings.push({ x: x, y: y, t: 0, life: 0.3, r0: 6, r1: radius, col: [251, 191, 36], w: 3 });
  }

  function hurtEnemy(e, dmg, crit) {
    if (e.dead) return;
    e.hp -= dmg;
    e.flash = 1;
    e.sq = 1;
    const a = Math.atan2(e.y - CY, e.x - CX);
    const kb = e.boss ? 14 : 68;
    e.kx += Math.cos(a) * kb;
    e.ky += Math.sin(a) * kb;

    floatText(e.x, e.y - e.r - 6, Math.round(dmg), crit, e.boss);

    if (e.hp <= 0) killEnemy(e);
    else Sfx.hit();
  }

  function killEnemy(e) {
    if (e.dead) return;
    e.dead = true;

    G.kills++;
    G.combo++;
    G.comboT = 2.2;
    const mult = 1 + Math.min(2, G.combo * 0.02);
    G.score += Math.round(e.score * mult);
    if (stats.lifesteal > 0 && G.kills % 12 === 0) {
      tower.hp = Math.min(tower.maxHp, tower.hp + 2 * stats.lifesteal);
    }

    burst(e.x, e.y, e.col, e.boss ? 46 : 13, e.boss ? 430 : 190);
    rings.push({
      x: e.x, y: e.y, t: 0,
      life: e.boss ? 0.75 : 0.34,
      r0: e.r * 0.5, r1: e.r * (e.boss ? 8 : 3.2),
      col: e.col, w: e.boss ? 6 : 2.4
    });

    if (e.boss) {
      FX.stop(0.16, true);
      FX.punch(0.95);
      FX.flashScreen([255, 255, 255], 0.55);
      FX.slowmo(0.4);
      FX.zoom = 1.035;
      Sfx.bigKill();
      G.score += 200;
    } else if (e.maxHp > 55) {
      FX.stop(0.045, true);
      FX.punch(0.2);
      Sfx.kill(G.combo);
    } else {
      FX.punch(0.1);
      Sfx.kill(G.combo);
    }

    // 分裂
    if (e.type === 'split') {
      for (let i = 0; i < 2; i++) {
        const a = rand(0, TAU);
        const child = spawnEnemy('splitling', e.x + Math.cos(a) * 10, e.y + Math.sin(a) * 10);
        child.kx = Math.cos(a) * 160;
        child.ky = Math.sin(a) * 160;
      }
    }
  }

  function hitTower(e) {
    if (e.dead) return;
    if (G.mode !== 'playing') { e.dead = true; return; }
    e.dead = true;

    if (tower.shield > 0) {
      tower.shield--;
      rings.push({ x: e.x, y: e.y, t: 0, life: 0.45, r0: 10, r1: 90, col: [125, 211, 252], w: 5 });
      burst(e.x, e.y, [125, 211, 252], 22, 260);
      FX.punch(0.35);
      FX.flashScreen([125, 211, 252], 0.2);
      Sfx.shield();
      floatText(e.x, e.y - 20, '护盾', false, false, '#7dd3fc');
      return;
    }

    tower.hp -= e.dmg;
    tower.hitFlash = 1;
    FX.punch(0.62);
    FX.flashScreen([248, 113, 113], 0.42);
    FX.zoom = 1.02;
    burst(e.x, e.y, e.col, 16, 220);
    floatText(CX, CY - 46, '-' + e.dmg, false, true, '#fca5a5');
    Sfx.hurt();

    if (tower.hp <= 0) {
      tower.hp = 0;
      burst(CX, CY, [248, 113, 113], 90, 520);
      rings.push({ x: CX, y: CY, t: 0, life: 1.0, r0: 20, r1: 560, col: [248, 113, 113], w: 9 });
      gameOver();
    }
  }

  function pulse() {
    if (tower.pulseCd > 0 || G.mode !== 'playing') return;
    tower.pulseCd = stats.pulseCd;

    rings.push({ x: CX, y: CY, t: 0, life: 0.5, r0: 8, r1: stats.pulseR, col: [125, 211, 252], w: 9 });
    rings.push({ x: CX, y: CY, t: 0, life: 0.32, r0: 8, r1: stats.pulseR * 0.62, col: [224, 242, 254], w: 4 });
    FX.punch(0.4);
    FX.flashScreen([125, 211, 252], 0.22);
    FX.zoom = 1.025;

    const list = enemies.slice();
    for (const e of list) {
      if (e.dead) continue;
      const dx = e.x - CX, dy = e.y - CY;
      const d = Math.hypot(dx, dy);
      if (d < stats.pulseR + e.r) {
        const a = Math.atan2(dy, dx);
        const kb = e.boss ? 60 : 340;
        e.kx += Math.cos(a) * kb;
        e.ky += Math.sin(a) * kb;
        e.stun = 0.26;
        hurtEnemy(e, stats.pulseDmg, false);
      }
    }
    Sfx.pulse();
  }

  /* -------------------------------------------------------------- 粒子系统 */
  function makeSpark(x, y, ang, spd, life, col) {
    return {
      x: x, y: y,
      vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
      t: 0, life: life, size: rand(1.4, 3.0),
      col: col || [255, 255, 255], kind: 0, drag: 3.4, grav: 0
    };
  }

  function makeShard(x, y, ang, spd, life, col) {
    return {
      x: x, y: y,
      vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
      t: 0, life: life, size: rand(2.0, 4.6),
      col: col || [255, 255, 255], kind: 1, drag: 1.6, grav: 110,
      rot: rand(0, TAU), vr: rand(-9, 9)
    };
  }

  function burst(x, y, col, n, spd) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const s = rand(spd * 0.3, spd);
      if (Math.random() < 0.5) parts.push(makeSpark(x, y, a, s, rand(0.22, 0.5), col));
      else parts.push(makeShard(x, y, a, s * 0.8, rand(0.3, 0.65), col));
    }
    parts.push(makeSpark(x, y, rand(0, TAU), 0, 0.12, [255, 255, 255]));
    if (parts.length > 1400) parts.splice(0, parts.length - 1400);
  }

  function impactFX(x, y, ang, crit, col) {
    const c = crit ? [253, 224, 71] : [224, 242, 254];
    const n = crit ? 11 : 6;
    for (let i = 0; i < n; i++) {
      const a = ang + Math.PI + rand(-1.0, 1.0);
      parts.push(makeSpark(x, y, a, rand(90, crit ? 420 : 260), rand(0.1, 0.28), c));
    }
    parts.push(makeSpark(x, y, rand(0, TAU), 0, crit ? 0.14 : 0.09, [255, 255, 255]));
    if (crit) {
      rings.push({ x: x, y: y, t: 0, life: 0.22, r0: 3, r1: 34, col: [253, 224, 71], w: 2.5 });
      FX.punch(0.05);
    }
  }

  function floatText(x, y, val, crit, big, colOverride) {
    if (texts.length > 90) texts.shift();
    texts.push({
      x: x + rand(-7, 7), y: y,
      vx: rand(-26, 26), vy: -rand(70, 105),
      val: String(val), t: 0,
      life: crit ? 0.9 : 0.62,
      size: crit ? 24 : (big ? 18 : 14),
      col: colOverride || (crit ? '#fde047' : '#e0f2fe'),
      crit: !!crit
    });
  }

  /* -------------------------------------------------------------- 特效推进 */
  function tickFX(raw, dt) {
    FX.trauma = Math.max(0, FX.trauma - raw * 3.0);
    FX.flash = Math.max(0, FX.flash - raw * 3.8);
    FX.stopCd = Math.max(0, FX.stopCd - raw);
    FX.zoom += (1 - FX.zoom) * Math.min(1, raw * 11);
    if (FX.slowT > 0) {
      FX.slowT -= raw;
      if (FX.slowT <= 0) FX.targetTS = 1;
    }
    if (G.banner) {
      G.banner.t += raw;
      if (G.banner.t >= G.banner.life) G.banner = null;
    }
    if (G.mode === 'over') G.overT += raw;

    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.t += dt;
      if (p.t >= p.life) { parts.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const dk = Math.exp(-(p.drag || 0) * dt);
      p.vx *= dk;
      p.vy *= dk;
      if (p.grav) p.vy += p.grav * dt;
      if (p.vr) p.rot += p.vr * dt;
    }

    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.t += dt;
      if (r.t >= r.life) rings.splice(i, 1);
    }

    for (let i = texts.length - 1; i >= 0; i--) {
      const t = texts[i];
      t.t += dt;
      if (t.t >= t.life) { texts.splice(i, 1); continue; }
      t.x += t.vx * dt;
      t.y += t.vy * dt;
      t.vy += 150 * dt;
      t.vx *= Math.exp(-3 * dt);
    }

    for (let i = portals.length - 1; i >= 0; i--) {
      const p = portals[i];
      p.t += dt;
      if (p.t >= p.life) portals.splice(i, 1);
    }
  }

  /* ------------------------------------------------------------ 每帧游戏逻辑 */
  function updateGame(dt) {
    G.time += dt;
    G.waveT += dt;

    if (G.comboT > 0) {
      G.comboT -= dt;
      if (G.comboT <= 0) G.combo = 0;
    }

    if (G.waveT >= G.waveLen) { endWave(); return; }

    if (G.bossPending > 0) {
      G.bossPending -= dt;
      if (G.bossPending <= 0) spawnBoss();
    }

    G.spawnT -= dt;
    if (G.spawnT <= 0) {
      const cfg = waveCfg(G.wave);
      const rush = G.waveT > G.waveLen - 15 ? 0.6 : 1;   // 最后 15 秒狂暴
      G.spawnT = cfg.interval * rush * rand(0.82, 1.18);

      let n = 1;
      if (G.wave >= 2 && Math.random() < 0.35) n++;
      if (G.wave >= 4 && Math.random() < 0.3) n++;
      let bossAlive = false;
      for (let i = 0; i < enemies.length; i++) {
        if (enemies[i].type === 'boss' && !enemies[i].dead) { bossAlive = true; break; }
      }
      if (bossAlive) n = Math.max(1, n - 1);           // BOSS 战时别太挤
      // 同一小怪群从相邻方位涌出，"成群"比"排队"更爽
      const a0 = Math.random() * TAU;
      const d0 = ARENA_R + rand(24, 46);
      for (let i = 0; i < n; i++) {
        const a = a0 + rand(-0.24, 0.24);
        const d = d0 + rand(-9, 9);
        spawnEnemy(pickType(), CX + Math.cos(a) * d, CY + Math.sin(a) * d);
      }
    }

    updateTower(dt);
    updateEnemies(dt);
    updateBullets(dt);

    for (let i = enemies.length - 1; i >= 0; i--) if (enemies[i].dead) enemies.splice(i, 1);
    for (let i = bullets.length - 1; i >= 0; i--) if (bullets[i].dead) bullets.splice(i, 1);
  }

  /* ------------------------------------------------------------------ 主循环 */
  let lastT = performance.now();

  function frame(now) {
    const raw = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;

    if (FX.hitstop > 0) {
      FX.hitstop -= raw;
    } else if (!G.paused) {
      FX.timeScale += (FX.targetTS - FX.timeScale) * Math.min(1, raw * 12);
      const dt = raw * FX.timeScale;
      tickFX(raw, dt);
      if (G.mode === 'playing') updateGame(dt);
    } else {
      tickFX(0, 0);
    }

    render(now / 1000);
    requestAnimationFrame(frame);
  }

  /* -------------------------------------------------------------------- 绘制 */
  function rr(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function label(str, x, y, size, col, align, weight, font) {
    ctx.font = (weight || 400) + ' ' + size + 'px ' + (font || FONT);
    ctx.fillStyle = col;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(str, x, y);
  }

  function bar(x, y, w, h, pct, fg, bg) {
    pct = clamp(pct, 0, 1);
    ctx.fillStyle = bg || 'rgba(255,255,255,0.07)';
    rr(x, y, w, h, h / 2); ctx.fill();
    if (pct > 0.001) {
      ctx.fillStyle = fg;
      rr(x, y, Math.max(h, w * pct), h, h / 2); ctx.fill();
    }
  }

  function polyPath(sides, r) {
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const a = -Math.PI / 2 + i * TAU / sides;
      const px = Math.cos(a) * r, py = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  function render(t) {
    // 背景
    ctx.fillStyle = '#04060c';
    ctx.fillRect(0, 0, W, H);

    ctx.save();

    const amt = FX.trauma * FX.trauma;
    if (amt > 0.0004) {
      ctx.translate(rand(-1, 1) * amt * 24, rand(-1, 1) * amt * 24);
      ctx.translate(CX, CY);
      ctx.rotate(rand(-1, 1) * amt * 0.014);
      ctx.translate(-CX, -CY);
    }
    if (Math.abs(FX.zoom - 1) > 0.0004) {
      ctx.translate(CX, CY);
      ctx.scale(FX.zoom, FX.zoom);
      ctx.translate(-CX, -CY);
    }

    drawBackground(t);
    drawArena(t);
    drawPortals();
    drawParts(0);
    drawRings();
    drawBullets();
    drawEnemies(t);
    drawTower(t);
    drawTurretOrbs(t);
    drawParts(1);
    drawTexts();
    drawAim();

    ctx.restore();

    drawHUD(t);
    drawOverlay(t);

    if (FX.flash > 0.01) {
      ctx.fillStyle = 'rgba(' + FX.flashCol[0] + ',' + FX.flashCol[1] + ',' + FX.flashCol[2] + ',' + (FX.flash * 0.34) + ')';
      ctx.fillRect(0, 0, W, H);
    }
  }

  function drawBackground(t) {
    const g = ctx.createRadialGradient(CX, CY, 30, CX, CY, 640);
    g.addColorStop(0, 'rgba(16,44,72,0.85)');
    g.addColorStop(0.45, 'rgba(8,18,32,0.6)');
    g.addColorStop(1, 'rgba(4,6,12,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(56,189,248,0.045)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 40; x < W; x += 44) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = 40; y < H; y += 44) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
  }

  function drawArena(t) {
    ctx.save();
    // 场地内圈淡淡的地面光
    const floor = ctx.createRadialGradient(CX, CY, ARENA_R * 0.25, CX, CY, ARENA_R);
    floor.addColorStop(0, 'rgba(56,189,248,0.035)');
    floor.addColorStop(1, 'rgba(56,189,248,0.09)');
    ctx.fillStyle = floor;
    ctx.beginPath();
    ctx.arc(CX, CY, ARENA_R, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = 'rgba(56,189,248,0.26)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(CX, CY, ARENA_R, 0, TAU);
    ctx.stroke();

    ctx.setLineDash([5, 16]);
    ctx.lineDashOffset = -t * 26;
    ctx.strokeStyle = 'rgba(56,189,248,0.32)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(CX, CY, ARENA_R + 13, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);

    // 危险区脉动
    const p = (t * 0.35) % 1;
    ctx.strokeStyle = 'rgba(56,189,248,' + (0.18 * (1 - p)) + ')';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(CX, CY, ARENA_R * (0.15 + p * 0.85), 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  function drawPortals() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of portals) {
      const k = p.t / p.life;
      const r = p.r * (0.5 + k * 1.6);
      ctx.strokeStyle = rgba(p.col, 0.5 * (1 - k));
      ctx.lineWidth = 3 * (1 - k) + 0.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawParts(layer) {
    ctx.save();
    if (layer === 1) ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      const isGlow = p.kind === 0;
      if ((layer === 1) !== isGlow) continue;
      const k = 1 - p.t / p.life;
      const a = clamp(k * 1.2, 0, 1);
      ctx.globalAlpha = a;
      if (p.kind === 0) {
        ctx.fillStyle = rgb(p.col);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.4 + k * 0.6), 0, TAU);
        ctx.fill();
      } else {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot || 0);
        ctx.fillStyle = rgb(p.col);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 1.5);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawRings() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const r of rings) {
      const k = r.t / r.life;
      const rad = lerp(r.r0, r.r1, easeOut(k));
      ctx.strokeStyle = rgba(r.col, (1 - k) * 0.85);
      ctx.lineWidth = Math.max(0.5, r.w * (1 - k));
      ctx.beginPath();
      ctx.arc(r.x, r.y, rad, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBullets() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const b of bullets) {
      const a = Math.atan2(b.vy, b.vx);
      const ca = Math.cos(a), sa = Math.sin(a);
      // 拖尾
      ctx.strokeStyle = 'rgba(56,189,248,0.30)';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(b.x - ca * 34, b.y - sa * 34);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(125,211,252,0.75)';
      ctx.lineWidth = 3.6;
      ctx.beginPath();
      ctx.moveTo(b.x - ca * 20, b.y - sa * 20);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();

      ctx.fillStyle = 'rgba(125,211,252,0.3)';
      ctx.beginPath();
      ctx.arc(b.x, b.y, 10, 0, TAU);
      ctx.fill();

      ctx.fillStyle = '#f0f9ff';
      ctx.beginPath();
      ctx.arc(b.x, b.y, 3.4, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawEnemies(t) {
    for (const e of enemies) {
      if (e.dead) continue;
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.rot + e.spin * t);
      const sq = e.sq;
      ctx.scale(1 + sq * 0.34, 1 - sq * 0.26);
      polyPath(e.sides, e.r);

      if (e.flash > 0.03) {
        ctx.fillStyle = 'rgba(255,255,255,' + (0.35 + 0.6 * e.flash) + ')';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.6;
        ctx.stroke();
      } else {
        // 外发光：宽描边低透明度，比 shadowBlur 便宜得多
        ctx.strokeStyle = rgba(e.col, 0.22);
        ctx.lineWidth = 9;
        ctx.stroke();
        ctx.strokeStyle = rgba(e.col, 0.36);
        ctx.lineWidth = 4;
        ctx.stroke();

        ctx.fillStyle = rgba(e.col, 0.3);
        ctx.fill();
        ctx.strokeStyle = e.colStr;
        ctx.lineWidth = e.boss ? 3.4 : 2.2;
        ctx.stroke();

        // 内核
        ctx.fillStyle = rgba(e.col, 0.85);
        polyPath(e.sides, e.r * 0.36);
        ctx.fill();
      }
      ctx.restore();

      // 减速冰晶
      if (e.slow > 0) {
        ctx.strokeStyle = 'rgba(147,197,253,0.75)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r + 5, 0, TAU);
        ctx.stroke();
      }

      // 血条：受损就显示，重装 / BOSS 常显
      const hurt = e.hp < e.maxHp - 0.01;
      if (hurt || e.maxHp > 60) {
        const w = Math.max(18, e.r * 2), pct = clamp(e.hp / e.maxHp, 0, 1);
        const by = e.y - e.r - (e.boss ? 14 : 11);
        bar(e.x - w / 2, by, w, e.boss ? 5 : 3.5, pct,
          e.boss ? '#f87171' : (pct > 0.55 ? e.colStr : '#fbbf24'),
          'rgba(0,0,0,0.5)');
      }
    }
  }

  function drawTower(t) {
    const hpRatio = tower.hp / tower.maxHp;
    const core = hpRatio > 0.5 ? [56, 189, 248] : hpRatio > 0.25 ? [251, 191, 36] : [248, 113, 113];
    const pulse = 0.5 + 0.5 * Math.sin(t * 3);

    // 光晕
    const g = ctx.createRadialGradient(CX, CY, 0, CX, CY, 170);
    g.addColorStop(0, rgba(core, 0.22 + pulse * 0.06));
    g.addColorStop(0.5, rgba(core, 0.06));
    g.addColorStop(1, rgba(core, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(CX, CY, 170, 0, TAU);
    ctx.fill();

    // 外旋环
    ctx.save();
    ctx.translate(CX, CY);
    ctx.rotate(t * 0.7);
    ctx.strokeStyle = rgba(core, 0.55);
    ctx.lineWidth = 2.4;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(0, 0, TOWER_R + 13, i * TAU / 3, i * TAU / 3 + 0.85);
      ctx.stroke();
    }
    ctx.restore();

    // 炮管
    ctx.save();
    ctx.translate(CX, CY);
    ctx.rotate(tower.aim);
    const recoil = tower.recoil * 7;
    ctx.fillStyle = rgba(core, 0.9);
    rr(-10 - recoil, -5.5, TOWER_R + 20, 11, 5);
    ctx.fill();
    ctx.fillStyle = 'rgba(224,242,254,0.9)';
    rr(TOWER_R + 4 - recoil, -3, 9, 6, 3);
    ctx.fill();

    if (tower.muzzle > 0.02) {
      const mr = 12 + tower.muzzle * 26;
      const mg = ctx.createRadialGradient(TOWER_R + 18, 0, 0, TOWER_R + 18, 0, mr);
      mg.addColorStop(0, 'rgba(255,255,255,' + tower.muzzle + ')');
      mg.addColorStop(0.4, 'rgba(125,211,252,' + (tower.muzzle * 0.55) + ')');
      mg.addColorStop(1, 'rgba(56,189,248,0)');
      ctx.fillStyle = mg;
      ctx.beginPath();
      ctx.arc(TOWER_R + 18, 0, mr, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    // 主体
    ctx.save();
    ctx.translate(CX, CY);
    const shake = tower.hitFlash * 3;
    ctx.translate(rand(-shake, shake), rand(-shake, shake));
    polyPath(6, TOWER_R);
    ctx.fillStyle = 'rgba(8,20,34,0.96)';
    ctx.fill();
    ctx.strokeStyle = tower.hitFlash > 0.1 ? '#fecaca' : rgba(core, 0.95);
    ctx.lineWidth = 2.6;
    ctx.stroke();
    polyPath(6, TOWER_R - 8);
    ctx.strokeStyle = rgba(core, 0.35);
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // 核心
    const cr = 7 + pulse * 2.5 + tower.recoil * 4;
    ctx.fillStyle = tower.hitFlash > 0.1 ? '#ffffff' : rgba(core, 0.9);
    ctx.beginPath();
    ctx.arc(0, 0, cr, 0, TAU);
    ctx.fill();
    ctx.restore();

    // 护盾
    if (tower.shield > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(125,211,252,' + (0.35 + 0.25 * pulse) + ')';
      ctx.lineWidth = 2;
      for (let i = 0; i < tower.shield; i++) {
        ctx.beginPath();
        ctx.arc(CX, CY, TOWER_R + 22 + i * 7, t * 1.2 + i, t * 1.2 + i + 4.4);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 低血警告
    if (hpRatio < 0.32) {
      const a = (0.16 + 0.14 * Math.sin(t * 9)) * (1 - hpRatio / 0.32);
      const rg = ctx.createRadialGradient(CX, CY, 150, CX, CY, 620);
      rg.addColorStop(0, 'rgba(248,113,113,0)');
      rg.addColorStop(1, 'rgba(248,113,113,' + a + ')');
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, W, H);
    }
  }

  function drawTurretOrbs(t) {
    for (let i = 0; i < turrets.length; i++) {
      const tr = turrets[i];
      const orb = tr.base + G.time * 0.8;
      const x = CX + Math.cos(orb) * (TOWER_R + 16);
      const y = CY + Math.sin(orb) * (TOWER_R + 16);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(tr.aim);
      polyPath(3, 7);
      ctx.fillStyle = '#38bdf8';
      ctx.fill();
      ctx.strokeStyle = '#e0f2fe';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawTexts() {
    for (const t of texts) {
      const k = t.t / t.life;
      const a = k < 0.1 ? k / 0.1 : (k > 0.6 ? (1 - k) / 0.4 : 1);
      const pop = 1 + 0.55 * Math.exp(-t.t * 20);
      ctx.save();
      ctx.globalAlpha = clamp(a, 0, 1);
      ctx.translate(t.x, t.y);
      ctx.scale(pop, pop);
      ctx.font = (t.crit ? 800 : 700) + ' ' + t.size + 'px ' + MONO;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = 'rgba(2,6,15,0.85)';
      ctx.strokeText(t.val, 0, 0);
      ctx.fillStyle = t.col;
      ctx.fillText(t.val, 0, 0);
      ctx.restore();
    }
  }

  function drawAim() {
    if (G.mode !== 'playing' || G.paused) return;
    const locked = autoAim && lockTarget;
    if (autoAim && !lockTarget) return;          // 自瞄没目标时不画准星
    const ax = locked ? lockTarget.x : mouse.x;
    const ay = locked ? lockTarget.y : mouse.y;
    const dx = ax - CX, dy = ay - CY;
    const d = Math.hypot(dx, dy) || 1;
    const ux = dx / d, uy = dy / d;

    ctx.save();
    ctx.setLineDash([3, 11]);
    ctx.lineDashOffset = -G.time * 70;
    ctx.strokeStyle = locked ? 'rgba(251,191,36,0.30)' : 'rgba(125,211,252,0.18)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(CX + ux * (TOWER_R + 26), CY + uy * (TOWER_R + 26));
    ctx.lineTo(ax - ux * 18, ay - uy * 18);
    ctx.stroke();
    ctx.setLineDash([]);

    // 准星
    const spin = G.time * 1.4;
    ctx.translate(ax, ay);
    ctx.rotate(spin);
    ctx.strokeStyle = locked ? 'rgba(251,191,36,0.95)' : 'rgba(125,211,252,0.85)';
    ctx.lineWidth = 1.8;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(0, 0, 11, i * TAU / 4 + 0.28, i * TAU / 4 + 0.28 + 0.9);
      ctx.stroke();
    }
    ctx.strokeStyle = locked ? 'rgba(254,243,199,0.95)' : 'rgba(224,242,254,0.9)';
    ctx.beginPath();
    ctx.arc(0, 0, 1.6, 0, TAU);
    ctx.stroke();
    ctx.restore();

    // 锁定括号
    if (locked) {
      const r = (lockTarget.r || 14) + 10;
      const k = G.time * 2.2;
      ctx.save();
      ctx.translate(lockTarget.x, lockTarget.y);
      ctx.rotate(-k);
      ctx.strokeStyle = 'rgba(251,191,36,0.65)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(0, 0, r, i * TAU / 4, i * TAU / 4 + 0.42);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  /* ------------------------------------------------------------------- HUD */
  function drawHUD(t) {
    // 顶部 / 底部渐隐遮罩
    let g = ctx.createLinearGradient(0, 0, 0, 118);
    g.addColorStop(0, 'rgba(4,6,12,0.95)');
    g.addColorStop(1, 'rgba(4,6,12,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, 118);

    g = ctx.createLinearGradient(0, H, 0, H - 92);
    g.addColorStop(0, 'rgba(4,6,12,0.92)');
    g.addColorStop(1, 'rgba(4,6,12,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, H - 92, W, 92);

    // ---- 生命
    const hpPct = tower.hp / tower.maxHp;
    const hpCol = hpPct > 0.55 ? '#38bdf8' : hpPct > 0.28 ? '#fbbf24' : '#f87171';
    label('核心装甲', 34, 34, 12, 'rgba(148,197,255,0.62)', 'left', 600);
    bar(34, 44, 246, 15, hpPct, hpCol, 'rgba(255,255,255,0.08)');
    label(Math.ceil(tower.hp) + ' / ' + tower.maxHp, 34, 78, 13, hpCol, 'left', 700, MONO);

    // ---- 得分
    label('得分', W - 34, 34, 12, 'rgba(148,197,255,0.62)', 'right', 600);
    label(G.score.toLocaleString('en-US'), W - 34, 66, 27, '#fbbf24', 'right', 800, MONO);
    label('最高 ' + G.best.toLocaleString('en-US'), W - 34, 86, 12, 'rgba(148,197,255,0.45)', 'right', 500, MONO);

    // ---- 波次
    label('第 ' + G.wave + ' 波', CX, 32, 16, '#7dd3fc', 'center', 700);
    const remain = Math.max(0, G.waveLen - G.waveT);
    label(remain.toFixed(1), CX, 68, 30, '#e2e8f0', 'center', 800, MONO);
    bar(CX - 128, 78, 256, 5, 1 - G.waveT / G.waveLen, '#38bdf8', 'rgba(255,255,255,0.08)');

    // ---- BOSS 血条
    let boss = null;
    for (const e of enemies) if (e.boss && !e.dead) { boss = e; break; }
    if (boss) {
      const pct = clamp(boss.hp / boss.maxHp, 0, 1);
      const bw = 420;
      label('BOSS', CX - bw / 2, 108, 11, '#fca5a5', 'left', 800);
      bar(CX - bw / 2, 113, bw, 8, pct, '#f87171', 'rgba(248,113,113,0.14)');
    }

    // ---- 脉冲
    const ready = tower.pulseCd <= 0;
    const pPct = 1 - tower.pulseCd / stats.pulseCd;
    label('SPACE · 过载脉冲', 34, H - 52, 11, ready ? '#7dd3fc' : 'rgba(148,197,255,0.35)', 'left', 700);
    bar(34, H - 44, 168, 9, pPct, ready ? '#38bdf8' : 'rgba(56,189,248,0.35)', 'rgba(255,255,255,0.07)');
    label(ready ? 'READY' : tower.pulseCd.toFixed(1) + 's', 212, H - 36, 11,
      ready ? '#38bdf8' : 'rgba(148,197,255,0.35)', 'left', 700, MONO);

    // ---- 自瞄状态
    if (autoAim) {
      const bl = 0.7 + 0.3 * Math.sin(G.time * 6);
      label('● 自瞄 ON', 34, H - 68, 11, 'rgba(251,191,36,' + bl.toFixed(2) + ')', 'left', 800);
      if (lockTarget) label('LOCK', 96, H - 68, 10, 'rgba(251,191,36,0.55)', 'left', 700, MONO);
    }

    // ---- 已获强化
    let cx = W - 34;
    for (let i = UPGRADES.length - 1; i >= 0; i--) {
      const u = UPGRADES[i];
      const lv = G.owned[u.id] || 0;
      if (!lv) continue;
      const cw = 40;
      cx -= (cw + 4);
      const rar = RARITY[u.rarity];
      ctx.fillStyle = 'rgba(9,16,28,0.92)';
      rr(cx, H - 56, cw, 24, 7);
      ctx.fill();
      ctx.strokeStyle = rgba(rar.col, 0.75);
      ctx.lineWidth = 1.3;
      ctx.stroke();
      label(u.ch, cx + 12, H - 39, 12, rgb(rar.col), 'center', 700);
      label('×' + lv, cx + cw - 5, H - 39, 10, 'rgba(224,242,254,0.75)', 'right', 700, MONO);
    }

    // ---- 连杀
    if (G.comboT > 0 && G.combo >= 3) {
      const a = clamp(G.comboT / 0.55, 0, 1);
      const pop = 1 + Math.max(0, G.comboT - 1.9) * 0.55;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(CX, CY - 132);
      ctx.scale(pop, pop);
      label(G.combo + '', 0, 0, 40, '#fde047', 'center', 900, MONO);
      label('COMBO', 0, 20, 11, 'rgba(253,224,71,0.8)', 'center', 800, MONO);
      ctx.restore();
    }
  }

  /* ---------------------------------------------------------------- 覆盖层 */
  function cardRect(i, n) {
    const w = 276, h = 250, gap = 22;
    const total = n * w + (n - 1) * gap;
    const x0 = (W - total) / 2;
    return { x: x0 + i * (w + gap), y: 224, w: w, h: h };
  }

  function drawOverlay(t) {
    if (G.paused && G.mode === 'playing') {
      ctx.fillStyle = 'rgba(4,6,12,0.72)';
      ctx.fillRect(0, 0, W, H);
      label('已暂停', CX, H / 2 - 8, 42, '#e2e8f0', 'center', 800);
      label('P / ESC 继续', CX, H / 2 + 34, 15, 'rgba(148,197,255,0.6)', 'center', 600);
      return;
    }

    if (G.mode === 'menu') { drawMenu(t); return; }
    if (G.mode === 'upgrade') { drawUpgrade(t); return; }
    if (G.mode === 'over') { drawOver(t); }
  }

  function drawMenu(t) {
    ctx.fillStyle = 'rgba(4,6,12,0.90)';
    ctx.fillRect(0, 0, W, H);

    // 标题
    const g = ctx.createLinearGradient(CX - 260, 0, CX + 260, 0);
    g.addColorStop(0, '#38bdf8');
    g.addColorStop(0.5, '#e0f2fe');
    g.addColorStop(1, '#818cf8');
    ctx.save();
    ctx.font = '900 66px ' + FONT;
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(56,189,248,0.75)';
    ctx.shadowBlur = 34;
    ctx.fillStyle = g;
    ctx.fillText('60 秒塔防', CX, H / 2 - 118);
    ctx.restore();

    label('T O W E R   6 0', CX, H / 2 - 82, 13, 'rgba(125,211,252,0.75)', 'center', 700, MONO);
    label('守住核心 60 秒，然后变强', CX, H / 2 - 40, 17, 'rgba(226,232,240,0.85)', 'center', 500);

    // 操作说明
    const items = [
      ['鼠标移动', '瞄准开火（自动射击）'],
      ['空格', '过载脉冲 · 清场击退'],
      ['P / ESC', '暂停']
    ];
    for (let i = 0; i < items.length; i++) {
      const y = H / 2 + 18 + i * 30;
      label(items[i][0], CX - 22, y, 14, '#7dd3fc', 'right', 700);
      label(items[i][1], CX + 22, y, 14, 'rgba(203,213,225,0.75)', 'left', 400);
    }
    {
      const y = H / 2 + 18 + items.length * 30;
      label('F', CX - 22, y, 14, autoAim ? '#fbbf24' : '#7dd3fc', 'right', 700);
      label(autoAim ? '自瞄模式 · 已开启' : '自瞄模式 · 炮塔自动锁敌',
        CX + 22, y, 14, autoAim ? 'rgba(251,191,36,0.95)' : 'rgba(203,213,225,0.75)', 'left', autoAim ? 700 : 400);
    }

    const a = 0.55 + 0.45 * Math.sin(t * 3.2);
    ctx.save();
    ctx.globalAlpha = a;
    label('点击 或 按空格 开始', CX, H / 2 + 168, 19, '#fbbf24', 'center', 800);
    ctx.restore();

    if (G.best > 0) label('历史最高 ' + G.best.toLocaleString('en-US'), CX, H / 2 + 202, 13, 'rgba(148,197,255,0.5)', 'center', 600, MONO);
  }

  function drawUpgrade(t) {
    ctx.fillStyle = 'rgba(4,6,12,0.84)';
    ctx.fillRect(0, 0, W, H);

    label('第 ' + G.wave + ' 波 已清空', CX, 128, 15, 'rgba(125,211,252,0.8)', 'center', 700);
    label('选择一项强化', CX, 176, 34, '#e2e8f0', 'center', 800);
    const n = G.cards.length;
    for (let i = 0; i < n; i++) {
      drawCard(G.cards[i], i, n, G.hover === i, t);
    }
    label('按 1 / 2 / 3 快速选择', CX, 528, 13, 'rgba(148,197,255,0.55)', 'center', 600);
  }

  function drawCard(u, i, n, hover, t) {
    const r = cardRect(i, n);
    const rar = RARITY[u.rarity];
    const col = rar.col;
    const x = r.x, y = r.y + (hover ? -6 : 0), w = r.w, h = r.h;

    ctx.save();
    if (hover) {
      ctx.shadowColor = rgba(col, 0.65);
      ctx.shadowBlur = 34;
    }
    // 卡片底面
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, hover ? 'rgba(18,30,50,0.99)' : 'rgba(10,17,30,0.97)');
    g.addColorStop(1, hover ? 'rgba(10,18,32,0.99)' : 'rgba(7,12,22,0.97)');
    ctx.fillStyle = g;
    rr(x, y, w, h, 15);
    ctx.fill();
    ctx.shadowBlur = 0;

    // 边框
    ctx.strokeStyle = hover ? rgba(col, 0.95) : rgba(col, 0.38);
    ctx.lineWidth = hover ? 2.4 : 1.2;
    rr(x, y, w, h, 15);
    ctx.stroke();

    // 顶部色条
    ctx.fillStyle = rgba(col, hover ? 0.95 : 0.6);
    rr(x + 1.2, y + 1.2, w - 2.4, 4, 2);
    ctx.fill();

    // 序号
    label(String(i + 1), x + 18, y + 29, 12, 'rgba(148,197,255,0.55)', 'left', 700, MONO);
    // 稀有度
    label(rar.name, x + w - 18, y + 29, 11, rgb(col), 'right', 700);
    // 已拥有
    const lv = G.owned[u.id] || 0;
    if (lv > 0) label('Lv.' + lv + ' → ' + (lv + 1), x + w - 18, y + 50, 10, 'rgba(148,197,255,0.5)', 'right', 600, MONO);

    // 图标
    ctx.save();
    ctx.translate(x + w / 2, y + 92);
    ctx.fillStyle = rgba(col, 0.13);
    ctx.beginPath();
    ctx.arc(0, 0, 34, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = rgba(col, 0.5);
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.font = '800 30px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = rgb(col);
    ctx.fillText(u.ch, 0, 2);
    ctx.restore();

    // 名称
    label(u.name, x + w / 2, y + 158, 21, '#f1f5f9', 'center', 800);

    // 描述（自动换行）
    ctx.font = '400 13px ' + FONT;
    const words = u.desc.split('');
    let line = '';
    const lines = [];
    for (const ch of words) {
      if (ctx.measureText(line + ch).width > w - 44) { lines.push(line); line = ch; }
      else line += ch;
    }
    if (line) lines.push(line);
    for (let k = 0; k < lines.length; k++) {
      label(lines[k], x + w / 2, y + 186 + k * 20, 13, 'rgba(203,213,225,0.8)', 'center', 400);
    }

    // 底部按钮
    ctx.fillStyle = hover ? rgba(col, 0.9) : rgba(col, 0.14);
    rr(x + 18, y + h - 34, w - 36, 20, 10);
    ctx.fill();
    label(hover ? '选择' : '点击选取', x + w / 2, y + h - 19, 11, hover ? '#04060c' : rgba(col, 0.65), 'center', 700);

    ctx.restore();
  }

  function drawOver(t) {
    const a = clamp(G.overT / 0.5, 0, 1);
    ctx.fillStyle = 'rgba(4,6,12,' + (0.9 * a) + ')';
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.globalAlpha = a;
    label('核 心 失 守', CX, 176, 46, '#f87171', 'center', 900);
    label(G.newBest ? '★ 新纪录 ★' : 'GAME OVER', CX, 208, 13, G.newBest ? '#fbbf24' : 'rgba(148,197,255,0.55)', 'center', 800, MONO);

    label('最终得分', CX, 268, 12, 'rgba(148,197,255,0.6)', 'center', 600);
    label(G.score.toLocaleString('en-US'), CX, 318, 56, '#fbbf24', 'center', 900, MONO);

    // 统计
    const stats3 = [
      ['坚持波次', G.wave + ' 波'],
      ['击杀数量', G.kills + ' 个'],
      ['历史最高', G.best.toLocaleString('en-US')]
    ];
    for (let i = 0; i < stats3.length; i++) {
      const x = CX - 260 + i * 260;
      label(stats3[i][0], x, 366, 12, 'rgba(148,197,255,0.55)', 'center', 600);
      label(stats3[i][1], x, 396, 20, '#e2e8f0', 'center', 800, MONO);
    }

    // 强化回顾
    const owned = UPGRADES.filter((u) => (G.owned[u.id] || 0) > 0);
    if (owned.length) {
      label('本局强化', CX, 444, 11, 'rgba(148,197,255,0.45)', 'center', 600);
      const cw = 40, gap = 4;
      let x = CX - (owned.length * (cw + gap) - gap) / 2;
      for (const u of owned) {
        const rar = RARITY[u.rarity];
        ctx.fillStyle = 'rgba(9,16,28,0.9)';
        rr(x, 456, cw, 24, 7);
        ctx.fill();
        ctx.strokeStyle = rgba(rar.col, 0.8);
        ctx.lineWidth = 1.2;
        ctx.stroke();
        label(u.ch, x + 12, 473, 12, rgb(rar.col), 'center', 700);
        label('×' + G.owned[u.id], x + cw - 5, 473, 10, 'rgba(224,242,254,0.75)', 'right', 700, MONO);
        x += cw + gap;
      }
    }

    if (G.overT > 0.6) {
      const p = 0.55 + 0.45 * Math.sin(t * 3.2);
      ctx.globalAlpha = a * p;
      label('点击 或 按空格 再来一局', CX, 556, 18, '#7dd3fc', 'center', 800);
    }
    ctx.restore();
  }

  /* ---------------------------------------------------------------- 调试钩子 */
  window.TD60 = {
    G: G, tower: tower, enemies: enemies, bullets: bullets, parts: parts,
    stats: function () { return stats; },
    startRun: startRun, chooseCard: chooseCard, pulse: pulse, gameOver: gameOver,
    autoAim: function (v) {
      if (v !== undefined) autoAim = !!v;
      if (!autoAim) lockTarget = null;
      return autoAim;
    },
    lockTarget: function () { return lockTarget; }
  };

  /* ------------------------------------------------------------------ 启动 */
  requestAnimationFrame(frame);
})();
