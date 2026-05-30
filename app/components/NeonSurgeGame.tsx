'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';

// ==================== BLOCKCHAIN (Wagmi + Viem) ====================
import { useAccount, useConnect, useDisconnect, usePublicClient, useWalletClient } from 'wagmi';
import { parseEventLogs, type Log } from 'viem';
import { sepolia } from 'wagmi/chains';
import {
  LEADERBOARD_ADDRESS,
  NFT_ADDRESS,
  LEADERBOARD_ABI,
  NFT_ABI,
  NFT_TIERS,
  NSH_ADDRESS,
  ERC20_ABI,
  IS_DEMO_MODE,
} from '../lib/wagmi';

// ==================== GAME CONSTANTS ====================
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const PLAYER_SPEED = 285;
const PLAYER_RADIUS = 12;
const ENEMY_BASE_SPEED = 92;
const ENEMY_RADIUS = 9.5;
const PROJECTILE_SPEED = 520;
const PROJECTILE_RADIUS = 3.2;
const ORB_RADIUS = 5.5;
const AUTO_FIRE_COOLDOWN = 0.48;
const INITIAL_ENEMY_COUNT = 4;
const SPAWN_INTERVAL = 920;
const DIFFICULTY_INTERVAL = 15000;
const SPAWN_RATE_INCREASE_INTERVAL = 30000; // every 30s
const BASE_PLAYER_HEALTH = 3;
const PLAYER_INVULN_DURATION = 0.95; // seconds of i-frames after being hit

// Neon colors
const COLORS = {
  cyan: '#00f9ff',
  cyanDark: '#00c2cc',
  purple: '#c026ff',
  pink: '#ff2a6d',
  pinkDark: '#c41e55',
  blue: '#00b4ff',
  enemy: '#ff3366',
  bg: '#0a0a0f',
  grid: '#1a1a25',
};

// ==================== UPGRADE SYSTEM ====================
type UpgradeKey = 'rapidFire' | 'biggerDamage' | 'tripleShot' | 'piercing' | 'speedBoost' | 'areaExplosion';

interface UpgradeDef {
  key: UpgradeKey;
  name: string;
  desc: string;
  icon: string;
}

// Level-up choice — only Active/Passive skills (new or upgrade to existing slotted ones)
type LevelUpChoice =
  | { type: 'newActive';     key: ActiveSkillKey; name: string; desc: string; icon: string }
  | { type: 'newPassive';    key: PassiveSkillKey; name: string; desc: string; icon: string }
  | { type: 'upgradeActive'; key: ActiveSkillKey; name: string; desc: string; icon: string }
  | { type: 'upgradePassive';key: PassiveSkillKey; name: string; desc: string; icon: string }
  | { type: 'fusion'; active: ActiveSkillKey; passive: PassiveSkillKey; name: string; desc: string; icon: string };

const ALL_UPGRADES: UpgradeDef[] = [
  { key: 'rapidFire',     name: 'Rapid Fire',     desc: 'Shoot 25% faster per stack', icon: '⚡' },
  { key: 'biggerDamage',  name: 'Bigger Damage',  desc: 'Deal significantly more damage', icon: '💥' },
  { key: 'tripleShot',    name: 'Triple Shot',    desc: 'Fire three projectiles at once', icon: '🔱' },
  { key: 'piercing',      name: 'Piercing Shot',  desc: 'Projectiles pierce through enemies', icon: '🗡️' },
  { key: 'speedBoost',    name: 'Speed Boost',    desc: 'Move much faster', icon: '🏃' },
  { key: 'areaExplosion', name: 'Area Explosion', desc: 'Kills trigger powerful explosions', icon: '💣' },
];

// ==================== NEW SKILL SYSTEM ====================
type ActiveSkillKey = 'orbitalDrones' | 'energyDash' | 'shockwaveBlast' | 'homingMissiles' | 'laserBeam' | 'neonOverdrive';
type PassiveSkillKey = 'damageBoost' | 'attackSpeed' | 'maxHealth' | 'critChance' | 'xpMagnet' | 'barrier';

interface ActiveSkillDef {
  key: ActiveSkillKey;
  name: string;
  desc: string;
  icon: string;
  maxLevel: number;
}

interface PassiveSkillDef {
  key: PassiveSkillKey;
  name: string;
  desc: string;
  icon: string;
  maxLevel: number;
}

const ACTIVE_SKILLS: ActiveSkillDef[] = [
  { key: 'neonOverdrive', name: 'Pulse Fire', desc: 'Hero\'s signature weapon. Powers up your main shots and unlocks powerful energy bolts at higher levels', icon: '✦', maxLevel: 5 },
  { key: 'orbitalDrones', name: 'Orbital Drones', desc: 'Deploy orbiting drones that fire at enemies', icon: '🛸', maxLevel: 5 },
  { key: 'energyDash',    name: 'Energy Dash',    desc: 'Dash forward dealing damage and gaining brief invulnerability', icon: '⚡', maxLevel: 5 },
  { key: 'shockwaveBlast',name: 'Shockwave Blast',desc: 'Release a powerful shockwave around you', icon: '💥', maxLevel: 5 },
  { key: 'homingMissiles',name: 'Homing Missiles',desc: 'Launch seeking missiles at nearby enemies', icon: '🚀', maxLevel: 5 },
  { key: 'laserBeam',     name: 'Laser Beam',     desc: 'Fire a powerful piercing laser beam', icon: '🔥', maxLevel: 5 },
];

const PASSIVE_SKILLS: PassiveSkillDef[] = [
  { key: 'damageBoost', name: 'Damage Boost', desc: 'Increases all damage dealt', icon: '💪', maxLevel: 5 },
  { key: 'attackSpeed', name: 'Attack Speed', desc: 'Faster projectile firing rate', icon: '⏱️', maxLevel: 5 },
  { key: 'maxHealth',   name: 'Max Health',   desc: 'Increases maximum health', icon: '❤️', maxLevel: 5 },
  { key: 'critChance',  name: 'Crit Chance',  desc: 'Chance for critical hits', icon: '🎯', maxLevel: 5 },
  { key: 'xpMagnet',    name: 'XP Magnet',    desc: 'Increased XP orb collection range', icon: '🧲', maxLevel: 5 },
  { key: 'barrier',     name: 'Barrier',      desc: 'Reduces damage taken from all sources', icon: '🛡️', maxLevel: 5 },
];

// Fusion Recipes: Active Lv5 + Passive >= Lv1 → Active skill changes name to this
interface FusionRecipe {
  active: ActiveSkillKey;
  passive: PassiveSkillKey;
  fusionName: string;
  icon?: string;
  desc: string;
}

const FUSION_RECIPES: FusionRecipe[] = [
  // Exactly one fusion per active skill (6 total)
  { active: 'neonOverdrive',  passive: 'critChance',   fusionName: 'Lethal Surge',       desc: 'Devastating high-crit pulses' },
  { active: 'orbitalDrones',  passive: 'damageBoost',  fusionName: 'Explosive Drones',   desc: 'Drones explode on impact for area damage' },
  { active: 'energyDash',     passive: 'maxHealth',    fusionName: 'Titan Dash',         desc: 'Dash leaves damaging trail + shields' },
  { active: 'shockwaveBlast', passive: 'attackSpeed',  fusionName: 'Rapid Shockwaves',   desc: 'Shockwaves fire faster and chain' },
  { active: 'homingMissiles', passive: 'barrier',      fusionName: 'Aegis Missiles',     desc: 'Homing missiles with protective barrier' },
  { active: 'laserBeam',      passive: 'xpMagnet',     fusionName: 'Siphon Laser',       desc: 'Powerful laser that pulls in XP orbs' },
];

interface PlayerSkills {
  active: Record<ActiveSkillKey, number>;
  passive: Record<PassiveSkillKey, number>;
  fusions: string[]; // list of fused skill names

  // Fusion system: when Active Lv5 + compatible Passive Lv1+, the Active skill changes name
  fusedActives: Partial<Record<ActiveSkillKey, string>>;

  // Slot system - max 5 active + 5 passive equipped at once
  equippedActive: ActiveSkillKey[];
  equippedPassive: PassiveSkillKey[];
}

interface Upgrades {
  rapidFire: number;
  biggerDamage: number;
  tripleShot: number;
  piercing: number;
  speedBoost: number;
  areaExplosion: number;
}

// ==================== ENTITY CLASSES ====================
class Player {
  x: number;
  y: number;
  radius: number;
  hitFlashUntil: number;
  health: number;
  maxHealth: number;
  invulnerableUntil: number;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.radius = PLAYER_RADIUS;
    this.hitFlashUntil = 0;
    this.health = 3;
    this.maxHealth = 3;
    this.invulnerableUntil = 0;
  }

  update(keys: Set<string>, dt: number, speed: number) {
    let dx = 0;
    let dy = 0;

    if (keys.has('w') || keys.has('arrowup')) dy -= 1;
    if (keys.has('s') || keys.has('arrowdown')) dy += 1;
    if (keys.has('a') || keys.has('arrowleft')) dx -= 1;
    if (keys.has('d') || keys.has('arrowright')) dx += 1;

    if (dx !== 0 || dy !== 0) {
      const len = Math.hypot(dx, dy);
      dx /= len;
      dy /= len;

      this.x += dx * speed * dt;
      this.y += dy * speed * dt;

      // Clamp to bounds with padding
      const pad = this.radius + 4;
      this.x = Math.max(pad, Math.min(CANVAS_WIDTH - pad, this.x));
      this.y = Math.max(pad, Math.min(CANVAS_HEIGHT - pad, this.y));
    }
  }
}

class Enemy {
  x: number;
  y: number;
  radius: number;
  speed: number;
  health: number;
  maxHealth: number;
  hitFlashUntil: number;
  type: 'drone' | 'tank' | 'shooter';
  lastShotTime: number; // for shooters

  constructor(x: number, y: number, type: 'drone' | 'tank' | 'shooter' = 'drone', stage: number = 1) {
    this.x = x;
    this.y = y;
    this.type = type;
    this.lastShotTime = 0;

    // Smoother per-band scaling for fair 1-10 curve + health system
    // Early (1-3): forgiving but present threats
    // Mid (4-6): meaningful durability
    // Late (7-10): chunky elites that reward good builds/positioning
    const stageMult = 0.92 + (stage * 0.135);

    if (type === 'tank') {
      this.radius = 13.5;
      this.speed = ENEMY_BASE_SPEED * 0.57 * (0.96 + stage * 0.022);
      this.health = Math.floor(5.2 * stageMult);
      this.maxHealth = this.health;
    } else if (type === 'shooter') {
      this.radius = 10;
      this.speed = ENEMY_BASE_SPEED * 0.80 * (0.96 + stage * 0.018);
      this.health = Math.floor(2.6 * stageMult);
      this.maxHealth = this.health;
    } else {
      this.radius = ENEMY_RADIUS;
      this.speed = ENEMY_BASE_SPEED + (Math.random() - 0.5) * 28 * (0.94 + stage * 0.025);
      this.health = Math.max(1, Math.floor(1.35 * stageMult));
      this.maxHealth = this.health;
    }

    this.hitFlashUntil = 0;
  }

  update(player: Player, dt: number, state: GameState) {
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.hypot(dx, dy) || 1;

    this.x += (dx / dist) * this.speed * dt;
    this.y += (dy / dist) * this.speed * dt;

    // Shooter behavior (fires slower in early stages for fair learning curve)
    const s = state.currentStage || 1;
    const shooterCooldown = this.type === 'shooter' ? (1.95 - Math.min(s * 0.06, 0.7)) : 1.8;
    if (this.type === 'shooter' && Date.now() / 1000 - this.lastShotTime > shooterCooldown) {
      const distToPlayer = Math.hypot(dx, dy);
      if (distToPlayer < 380) {
        const speed = 370;
        const vx = (dx / dist) * speed;
        const vy = (dy / dist) * speed;
        state.projectiles.push(new Projectile(this.x, this.y, vx, vy, 1, 0));
        this.lastShotTime = Date.now() / 1000;
      }
    }
  }
}

class Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  life: number;
  damage: number;
  pierce: number;

  constructor(x: number, y: number, vx: number, vy: number, damage: number = 1, pierce: number = 0) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.radius = PROJECTILE_RADIUS;
    this.life = 1.8;
    this.damage = damage;
    this.pierce = pierce;
  }

  update(dt: number) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
  }
}

class XPOrb {
  x: number;
  y: number;
  radius: number;
  value: number;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.radius = ORB_RADIUS;
    this.value = 22;
  }
}

class Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  alpha: number;
  friction: number;
  glow: boolean;

  constructor(
    x: number, 
    y: number, 
    vx: number, 
    vy: number, 
    color: string, 
    options: { life?: number; size?: number; friction?: number; glow?: boolean } = {}
  ) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.life = options.life ?? (0.4 + Math.random() * 0.25);
    this.maxLife = this.life;
    this.size = options.size ?? (2.0 + Math.random() * 2.0);
    this.color = color;
    this.alpha = 1;
    this.friction = options.friction ?? 0.96;
    this.glow = options.glow ?? false;
  }

  update(dt: number) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vx *= this.friction;
    this.vy *= this.friction;
    this.life -= dt;
    this.alpha = Math.max(0, this.life / this.maxLife);
    this.size *= 0.985;
  }
}

class FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  vy: number;
  size: number;

  constructor(x: number, y: number, text: string, color: string, size = 13) {
    this.x = x;
    this.y = y;
    this.text = text;
    this.color = color;
    this.life = 0.85;
    this.vy = -38;
    this.size = size;
  }

  update(dt: number) {
    this.y += this.vy * dt;
    this.vy *= 0.96;
    this.life -= dt;
  }
}

class Boss {
  x: number;
  y: number;
  radius: number;
  health: number;
  maxHealth: number;
  speed: number;
  stage: number;
  lastAttackTime: number;
  lastChargeTime: number;
  isCharging: boolean;
  chargeTargetX: number;
  chargeTargetY: number;

  constructor(stage: number, x: number, y: number) {
    this.stage = stage;
    this.x = x;
    this.y = y;
    this.radius = 38 + stage * 4;
    // Boss HP tuned for new player health + full power curve (Equipment 0-10 + Skills/Fusions)
    this.maxHealth = 52 + stage * 42;
    if (stage === 10) {
      this.maxHealth = Math.floor(this.maxHealth * 2.05); // epic final
      this.speed = (52 + stage * 7.5) * 1.22;
    } else if (stage >= 7) {
      this.maxHealth = Math.floor(this.maxHealth * 1.18);
      this.speed = 52 + stage * 7.8;
    } else {
      this.speed = 52 + stage * 7.5;
    }
    this.health = this.maxHealth;
    this.lastAttackTime = 0;
    this.lastChargeTime = 0;
    this.isCharging = false;
    this.chargeTargetX = x;
    this.chargeTargetY = y;
  }

  update(player: Player, dt: number, state: GameState) {
    const now = Date.now() / 1000;
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.hypot(dx, dy) || 1;
    const stage = this.stage;

    // === Stage 10 Final Boss Special Behavior (Phase 2 at 50% HP) ===
    const isFinalBoss = stage === 10;
    const phase2 = isFinalBoss && this.health < this.maxHealth * 0.5;

    if (this.isCharging) {
      const chargeSpeed = this.speed * (phase2 ? 4.0 : 3.2);
      this.x += (dx / dist) * chargeSpeed * dt;
      this.y += (dy / dist) * chargeSpeed * dt;

      if (dist < this.radius + 15 || now - this.lastChargeTime > (phase2 ? 0.8 : 1.1)) {
        this.isCharging = false;
      }
    } else {
      const moveSpeed = this.speed * (phase2 ? 1.3 : 1.0);
      this.x += (dx / dist) * moveSpeed * dt;
      this.y += (dy / dist) * moveSpeed * dt;

      // Charge more frequently in later stages and phase 2 (early stages give clear reaction windows)
      let chargeCooldown = phase2 ? 3.2 : (7.2 + Math.random() * 2.8 - stage * 0.28);
      if (stage <= 3) chargeCooldown += 1.4;
      if (now - this.lastChargeTime > chargeCooldown && dist > 50) {
        this.isCharging = true;
        this.lastChargeTime = now;
        state.screenShake = Math.min(22, (state.screenShake || 0) + (phase2 ? 8 : 5));
        // (Charge tell is visible via boss isCharging state + faster movement + screen shake)
      }
    }

    // Clamp to bounds
    const pad = this.radius + 10;
    this.x = Math.max(pad, Math.min(CANVAS_WIDTH - pad, this.x));
    this.y = Math.max(pad, Math.min(CANVAS_HEIGHT - pad, this.y));

    // === Shooting Patterns — clearer tells + fair reaction windows per band ===
    let fireRate = 1.72 - Math.min(stage * 0.105, 0.85);
    if (stage === 10) fireRate *= 0.82;
    else if (stage <= 3) fireRate += 0.35; // early bosses more predictable
    if (now - this.lastAttackTime > fireRate) {
      this.lastAttackTime = now;

      const patternSeed = Math.floor(now / 2) % 5;
      const pattern = (stage + patternSeed) % 5;

      if (pattern === 0 || stage <= 2) {
        // Spread shot (gentle in early stages)
        const spreadCount = stage <= 3 ? 2 : (3 + Math.floor(stage / 3));
        for (let i = -1; i <= spreadCount - 2; i++) {
          const spread = i * (0.28 - stage * 0.008);
          const vx = (dx / dist) * (380 + stage * 9);
          const vy = (dy / dist) * (380 + stage * 9);
          const rotX = vx * Math.cos(spread) - vy * Math.sin(spread);
          const rotY = vx * Math.sin(spread) + vy * Math.cos(spread);
          const pdmg = stage <= 3 ? 1.5 : (2 + this.stage * 0.7);
          state.projectiles.push(new Projectile(this.x, this.y, rotX, rotY, pdmg, 1));
        }
      } 
      else if (pattern === 1 || stage === 6 || stage === 7) {
        // Circle burst (minion summon feel for stage 6/7)
        const shots = 6 + Math.floor(stage / 1.5);
        for (let i = 0; i < shots; i++) {
          const angle = (i / shots) * Math.PI * 2 + (now % 1);
          const speed = 360 + stage * 8;
          const vx = Math.cos(angle) * speed;
          const vy = Math.sin(angle) * speed;
          state.projectiles.push(new Projectile(this.x, this.y, vx, vy, 1 + Math.floor(stage / 2), 0));
        }
      } 
      else if (pattern === 2 || stage >= 8) {
        // Targeted heavy shots + occasional minions (Stage 8+)
        for (let i = 0; i < 2; i++) {
          const spread = (i - 0.5) * 0.12;
          const vx = (dx / dist) * (480 + stage * 12);
          const vy = (dy / dist) * (480 + stage * 12);
          const rotX = vx * Math.cos(spread) - vy * Math.sin(spread);
          const rotY = vx * Math.sin(spread) + vy * Math.cos(spread);
          state.projectiles.push(new Projectile(this.x, this.y, rotX, rotY, 3 + this.stage, 2));
        }
      } 
      else {
        // Dense circle + targeted
        const shots = 7 + Math.floor(stage / 1.2);
        for (let i = 0; i < shots; i++) {
          const angle = (i / shots) * Math.PI * 2;
          const vx = Math.cos(angle) * 390;
          const vy = Math.sin(angle) * 390;
          state.projectiles.push(new Projectile(this.x, this.y, vx, vy, 1 + Math.floor(stage / 2), 0));
        }
        // Extra aimed shot
        const vx = (dx / dist) * 520;
        const vy = (dy / dist) * 520;
        state.projectiles.push(new Projectile(this.x, this.y, vx, vy, 3 + this.stage, 1));
      }
    }

    // Stage 10 special: occasional minion spawn from boss (more aggressive in phase 2)
    if (stage === 10 && now - (this as any).lastMinionSpawn > (phase2 ? 3.2 : 4.8)) {
      (this as any).lastMinionSpawn = now;
      const count = phase2 ? 4 : 2;
      for (let i = 0; i < count; i++) {
        const mx = this.x + (Math.random() - 0.5) * 90;
        const my = this.y + (Math.random() - 0.5) * 70;
        const drone = new Enemy(mx, my, 'drone', 10);
        state.enemies.push(drone);
      }
    }
  }
}

// ==================== GAME STATE ====================
interface GameState {
  player: Player;
  enemies: Enemy[];
  projectiles: Projectile[];
  orbs: XPOrb[];
  particles: Particle[];
  floatingTexts: FloatingText[];
  score: number;
  kills: number;
  xp: number;
  level: number;
  xpToNextLevel: number;
  upgrades: Upgrades;
  startTime: number;
  lastShotTime: number;
  lastDifficultyTime: number;
  lastSpawnRateIncrease: number;
  nextSpawnTime: number;
  enemyCap: number;
  isRunning: boolean;
  isPaused: boolean;
  pendingLevelUp: boolean;
  levelUpFlashUntil: number;
  screenShake: number;
  combo: number;
  lastKillTime: number;
  currentStage: number;
  lastStageAdvance: number;
  playerTrail: Array<{x: number; y: number}>;
  boss: Boss | null;
  bossActive: boolean;

  // Timer pause tracking (for level-up pauses + tab visibility)
  totalPausedDuration: number;
  pauseStartTime: number | null;
  pausedByVisibility?: boolean;

  // New Skill System
  skills: PlayerSkills;
  pendingFusion: { active: ActiveSkillKey; passive: PassiveSkillKey } | null;

  // Skill runtime state
  lastDroneFire?: number;
  lastShockwaveTime?: number;
  lastHomingTime?: number;
  lastLaserTime?: number;
  lastDashTime?: number;
  lastNeonOverdriveTime?: number;
  isDashing?: boolean;
  dashUntil?: number;
  lastAssaultDroneFire?: number;
}

interface HUDState {
  score: number;
  kills: number;
  time: number;
  xp: number;
  level: number;
  xpToNextLevel: number;
  isGameOver: boolean;
  isLevelingUp: boolean;
  combo: number;
  currentStage: number;
}

// Simple 2D distance helper
function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function circleCollide(
  ax: number, ay: number, ar: number,
  bx: number, by: number, br: number
): boolean {
  const r = ar + br;
  return dist2(ax, ay, bx, by) < r * r;
}

// ==================== MAIN COMPONENT ====================
export default function NeonSurgeGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keysRef = useRef(new Set<string>());
  const gameRef = useRef<GameState | null>(null);
  const animationRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const ambientOscRef = useRef<OscillatorNode | null>(null);
  const ambientGainRef = useRef<GainNode | null>(null);
  const lastTimeRef = useRef<number>(0);
  const hudUpdateRef = useRef<number>(0);

  const [hud, setHud] = useState<HUDState>({
    score: 0,
    kills: 0,
    time: 0,
    xp: 0,
    level: 1,
    xpToNextLevel: 12,
    isGameOver: false,
    isLevelingUp: false,
    combo: 0,
    currentStage: 1,
  });

  const [showStageClear, setShowStageClear] = useState(false);
  const [stageClearRewards, setStageClearRewards] = useState({ xp: 0, shards: 0 });

  // Classic random 3 upgrades (or new skill unlocks) on level up
  const [levelUpChoices, setLevelUpChoices] = useState<LevelUpChoice[]>([]);

  // === Main Menu + Stage Selector States ===
  const [screen, setScreen] = useState<'menu' | 'game'>('menu');
  const screenRef = useRef<'menu' | 'game'>('menu');
  const gameActiveRef = useRef(false);
  const [selectedStage, setSelectedStage] = useState(1);
  const [unlockedUpTo, setUnlockedUpTo] = useState(1);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [showSkillPanel, setShowSkillPanel] = useState(false);

  // === Equipment System ===
  const [neonShards, setNeonShards] = useState(0);
  const [showEquipment, setShowEquipment] = useState(false);

  // ==================== BLOCKCHAIN UI STATE ====================
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showNFT, setShowNFT] = useState(false);
  const [leaderboardScores, setLeaderboardScores] = useState<Array<{ player: string; score: number; timestamp: number }>>([]);
  const [isLoadingLeaderboard, setIsLoadingLeaderboard] = useState(false);
  const [lastRunScore, setLastRunScore] = useState(0); // for submit after clear/boss
  const [isSubmittingScore, setIsSubmittingScore] = useState(false);
  const [mintEligibility, setMintEligibility] = useState<{ eligible: boolean; tier: 0 | 1 | 2; reason: string; stageCleared?: number }>({ eligible: false, tier: 0, reason: '' });
  const [isMinting, setIsMinting] = useState(false);
  const [mintSuccess, setMintSuccess] = useState<{ txHash: string; tier: 0 | 1 | 2; tokenId?: number; stageCleared?: number } | null>(null);
  const [myNFTs, setMyNFTs] = useState<Array<{ tier: 0 | 1 | 2; txHash: string; time: number; stageCleared?: number; tokenId?: number }>>([]);
  const [isNftContractOwner, setIsNftContractOwner] = useState(false);
  const [isRefreshingNFTs, setIsRefreshingNFTs] = useState(false);

  // ==================== NSH (Neon Shard) TOKEN STATE ====================
  const [nshBalance, setNshBalance] = useState(0n);
  const [pendingNshRewards, setPendingNshRewards] = useState(0n);
  const [isLoadingNshBalance, setIsLoadingNshBalance] = useState(false);
  const [isNshTxPending, setIsNshTxPending] = useState(false);
  const [lastNshTxHash, setLastNshTxHash] = useState<string | null>(null);

  const [equipmentLevels, setEquipmentLevels] = useState({
    neonRifle: 0,
    plasmaVest: 0,
    quantumBoots: 0,
    fusionCore: 0,
    neuralChip: 0,
    assaultDrone: 0,
  });

  // Save Neon Shards
  const saveNeonShards = (amount: number) => {
    setNeonShards(amount);
    if (typeof window !== 'undefined') {
      localStorage.setItem('neonSurgeShards', amount.toString());
    }
  };

  // Auto-persist Neon Shards whenever the value changes (extra safety)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('neonSurgeShards', neonShards.toString());
    }
  }, [neonShards]);

  // Save Equipment
  const saveEquipment = (newLevels: typeof equipmentLevels) => {
    setEquipmentLevels(newLevels);
    if (typeof window !== 'undefined') {
      localStorage.setItem('neonSurgeEquipment', JSON.stringify(newLevels));
    }
  };

  // Get current level of an equipment
  const getEquipLevel = (key: keyof typeof equipmentLevels) => equipmentLevels[key] || 0;

  // ==================== WAGMI BLOCKCHAIN HOOKS ====================
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  // Short wallet display
  const shortAddress = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '';

  // Calculate upgrade cost (exponential)
  const getUpgradeCost = (level: number) => {
    return Math.floor(50 * Math.pow(1.6, level));
  };

  // ==================== BLOCKCHAIN HELPERS ====================
  const saveMyNFTs = (nfts: typeof myNFTs) => {
    setMyNFTs(nfts);
    if (typeof window !== 'undefined') {
      localStorage.setItem('neonSurgeMyNFTs', JSON.stringify(nfts));
    }
  };

  const loadMyNFTs = () => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('neonSurgeMyNFTs');
        if (saved) {
          const parsed = JSON.parse(saved);
          setMyNFTs(parsed);
        }
      } catch {}
    }
  };

  // Fetch authoritative tier + stageCleared from the on-chain tokenData mapping
  const refreshMyNFTsFromChain = useCallback(async () => {
    if (!publicClient || IS_DEMO_MODE) {
      return;
    }

    const nftsWithTokenIds = myNFTs.filter(n => typeof n.tokenId === 'number');
    if (nftsWithTokenIds.length === 0) return;

    setIsRefreshingNFTs(true);

    try {
      const updates = await Promise.all(
        nftsWithTokenIds.map(async (nft) => {
          try {
            const raw = await publicClient.readContract({
              address: NFT_ADDRESS as `0x${string}`,
              abi: NFT_ABI,
              functionName: 'tokenData',
              args: [BigInt(nft.tokenId!)],
            });

            // viem can return structs as objects or as tuples — normalize both
            const data = Array.isArray(raw)
              ? { tier: Number(raw[0]), stageCleared: raw[1] as bigint }
              : { tier: Number((raw as any).tier), stageCleared: (raw as any).stageCleared as bigint };

            return {
              ...nft,
              tier: (data.tier as 0 | 1 | 2),
              stageCleared: Number(data.stageCleared),
            };
          } catch {
            return nft; // keep local data if read fails
          }
        })
      );

      // Merge live data back into the full list
      const updatedMap = new Map(updates.map(n => [n.txHash, n]));
      const merged = myNFTs.map(nft => updatedMap.get(nft.txHash) || nft);

      // Only update if something actually changed
      const hasChanges = merged.some((m, i) => 
        m.tier !== myNFTs[i].tier || m.stageCleared !== myNFTs[i].stageCleared
      );

      if (hasChanges) {
        saveMyNFTs(merged);
      }
    } finally {
      setIsRefreshingNFTs(false);
    }
  }, [publicClient, myNFTs]);

  // Discover NFTs the user owns by scanning Transfer events + enrich with live tokenData
  const syncNFTCollectionWithChain = useCallback(async () => {
    if (!publicClient || !address || IS_DEMO_MODE) {
      return;
    }

    setIsRefreshingNFTs(true);

    try {
      // === 1. DISCOVERY: Find NFTs sent to this address via Transfer events ===
      const currentBlock = await publicClient.getBlockNumber();
      // Scan last ~300k blocks (~2-3 weeks on Sepolia). Adjust if needed.
      const fromBlock = currentBlock > 300_000n ? currentBlock - 300_000n : 0n;

      const transferLogs = await publicClient.getLogs({
        address: NFT_ADDRESS as `0x${string}`,
        event: {
          type: 'event',
          name: 'Transfer',
          inputs: [
            { indexed: true, name: 'from', type: 'address' },
            { indexed: true, name: 'to', type: 'address' },
            { indexed: true, name: 'tokenId', type: 'uint256' },
          ],
        },
        args: {
          to: address,
        },
        fromBlock,
        toBlock: 'latest',
      });

      const discovered = new Map<number, { tokenId: number; txHash: string; time: number }>();

      for (const log of transferLogs) {
        if (log.args?.tokenId !== undefined) {
          const tokenId = Number(log.args.tokenId);
          if (!discovered.has(tokenId)) {
            discovered.set(tokenId, {
              tokenId,
              txHash: log.transactionHash,
              time: Date.now(), // best effort; we could fetch block timestamp if wanted
            });
          }
        }
      }

      // === 2. Verify current ownership + fetch live tokenData for discovered + existing ===
      const allTokenIds = new Set<number>();

      // Existing ones we already track
      myNFTs.forEach(n => {
        if (typeof n.tokenId === 'number') allTokenIds.add(n.tokenId);
      });

      // Newly discovered
      discovered.forEach((_, tokenId) => allTokenIds.add(tokenId));

      if (allTokenIds.size === 0) {
        setIsRefreshingNFTs(false);
        return;
      }

      const onChainData = await Promise.all(
        Array.from(allTokenIds).map(async (tokenId) => {
          try {
            // Confirm this user still owns it
            const currentOwner = await publicClient.readContract({
              address: NFT_ADDRESS as `0x${string}`,
              abi: NFT_ABI,
              functionName: 'ownerOf',
              args: [BigInt(tokenId)],
            }) as string;

            if (currentOwner.toLowerCase() !== address.toLowerCase()) {
              return null; // no longer owns it
            }

            // Get live tier + stageCleared
            const raw = await publicClient.readContract({
              address: NFT_ADDRESS as `0x${string}`,
              abi: NFT_ABI,
              functionName: 'tokenData',
              args: [BigInt(tokenId)],
            });

            const data = Array.isArray(raw)
              ? { tier: Number(raw[0]), stageCleared: Number(raw[1]) }
              : { tier: Number((raw as any).tier), stageCleared: Number((raw as any).stageCleared) };

            // Try to find existing local entry for this tokenId
            const existing = myNFTs.find(n => n.tokenId === tokenId);
            const discoveredInfo = discovered.get(tokenId);

            return {
              tier: data.tier as 0 | 1 | 2,
              tokenId,
              stageCleared: data.stageCleared,
              txHash: existing?.txHash || discoveredInfo?.txHash || `0x_discovered_${tokenId}`,
              time: existing?.time || discoveredInfo?.time || Date.now(),
            };
          } catch {
            return null;
          }
        })
      );

      // Filter valid owned NFTs
      const validOwned = onChainData.filter(Boolean) as Array<{
        tier: 0 | 1 | 2;
        tokenId: number;
        stageCleared: number;
        txHash: string;
        time: number;
      }>;

      // Merge with existing (preserve any local-only demo NFTs without tokenId)
      const localOnly = myNFTs.filter(n => typeof n.tokenId !== 'number');
      const finalList = [...localOnly, ...validOwned];

      // Deduplicate by tokenId (keep newest)
      const deduped = Array.from(
        new Map(finalList.map(n => [n.tokenId ?? `local_${n.txHash}`, n])).values()
      );

      // Sort by time desc
      deduped.sort((a, b) => b.time - a.time);

      const limited = deduped.slice(0, 12);

      // Only save if we actually gained or updated data
      const existingTokenIds = new Set(myNFTs.map(n => n.tokenId).filter(Boolean));
      const hasNew = validOwned.some(v => !existingTokenIds.has(v.tokenId));

      if (hasNew || limited.length !== myNFTs.length) {
        saveMyNFTs(limited as any);
      }
    } catch (err) {
      console.warn('NFT discovery scan failed (may be rate limited):', err);
    } finally {
      setIsRefreshingNFTs(false);
    }
  }, [publicClient, address, myNFTs]);

  // ==================== NFT OWNER CHECK (for new owner-only contract) ====================
  const checkIfNftContractOwner = useCallback(async () => {
    if (!publicClient || !address || IS_DEMO_MODE) {
      setIsNftContractOwner(false);
      return;
    }
    try {
      const owner = await publicClient.readContract({
        address: NFT_ADDRESS as `0x${string}`,
        abi: NFT_ABI,
        functionName: 'owner',
      }) as string;

      setIsNftContractOwner(owner.toLowerCase() === address.toLowerCase());
    } catch {
      setIsNftContractOwner(false);
    }
  }, [publicClient, address]);

  // ==================== NSH TOKEN HELPERS ====================
  const refreshNshBalance = useCallback(async () => {
    if (!publicClient || !address) {
      setNshBalance(0n);
      return;
    }
    setIsLoadingNshBalance(true);
    try {
      const bal = await publicClient.readContract({
        address: NSH_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address],
      }) as bigint;
      setNshBalance(bal + pendingNshRewards);
    } catch (e) {
      console.warn('Failed to read NSH balance:', e);
      setNshBalance(pendingNshRewards);
    } finally {
      setIsLoadingNshBalance(false);
    }
  }, [publicClient, address, pendingNshRewards]);

  // Auto-refresh NSH balance — only when NOT in an active game run to avoid console spam and potential interference during gameplay.
  useEffect(() => {
    const shouldRefresh = isConnected && address && screen !== 'game';
    if (shouldRefresh) {
      refreshNshBalance();
    } else if (!isConnected) {
      setNshBalance(pendingNshRewards);
    }
  }, [isConnected, address, pendingNshRewards, refreshNshBalance, screen]);

  // Fetch top scores from on-chain events (client-side sort of recent high scores)
  const fetchOnChainLeaderboard = useCallback(async () => {
    if (!publicClient || IS_DEMO_MODE) {
      // Demo fallback data when not deployed yet
      setLeaderboardScores([
        { player: '0xD4c3...aA1b', score: 8740, timestamp: Date.now() - 100000 },
        { player: '0x8f2E...cC99', score: 7210, timestamp: Date.now() - 260000 },
        { player: '0x3b9F...12dE', score: 6890, timestamp: Date.now() - 400000 },
      ]);
      return;
    }

    setIsLoadingLeaderboard(true);
    try {
      const logs = await publicClient.getLogs({
        address: LEADERBOARD_ADDRESS as `0x${string}`,
        event: LEADERBOARD_ABI.find((a: any) => a.type === 'event' && a.name === 'ScoreSubmitted') as any,
        fromBlock: 'earliest',
      });

      const parsed = logs
        .map((log: Log) => {
          try {
            const decoded = parseEventLogs({
              abi: LEADERBOARD_ABI,
              logs: [log],
            })[0];
            return {
              player: decoded.args.player as string,
              score: Number(decoded.args.score),
              timestamp: Number(decoded.args.timestamp) * 1000,
            };
          } catch {
            return null;
          }
        })
        .filter(Boolean) as Array<{ player: string; score: number; timestamp: number }>;

      // Sort desc by score, take top 10 (unique highest per address for fairness)
      const bestByAddress = new Map<string, { player: string; score: number; timestamp: number }>();
      for (const entry of parsed) {
        const existing = bestByAddress.get(entry.player.toLowerCase());
        if (!existing || entry.score > existing.score) {
          bestByAddress.set(entry.player.toLowerCase(), entry);
        }
      }

      const top = Array.from(bestByAddress.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);

      setLeaderboardScores(top);
    } catch (e) {
      console.warn('Leaderboard fetch failed (using demo):', e);
      setLeaderboardScores([
        { player: address || '0xYou...Demo', score: lastRunScore || 4200, timestamp: Date.now() },
      ]);
    } finally {
      setIsLoadingLeaderboard(false);
    }
  }, [publicClient, address, lastRunScore]);

  // Submit current run score on-chain
  const submitScoreToLeaderboard = useCallback(async (score: number) => {
    if (!isConnected || !walletClient || !address) {
      alert('Connect your wallet first to submit on-chain scores!');
      return;
    }
    if (IS_DEMO_MODE) {
      // Demo mode
      setIsSubmittingScore(true);
      setTimeout(() => {
        setIsSubmittingScore(false);
        alert(`Demo: Score ${score} "submitted" (deploy contract & update address in wagmi.ts for real on-chain)`);
        setLeaderboardScores(prev => [{ player: shortAddress, score, timestamp: Date.now() }, ...prev].slice(0, 10));
      }, 650);
      return;
    }

    setIsSubmittingScore(true);
    try {
      const hash = await walletClient.writeContract({
        address: LEADERBOARD_ADDRESS as `0x${string}`,
        abi: LEADERBOARD_ABI,
        functionName: 'submitScore',
        args: [BigInt(score)],
        chain: sepolia,
        account: address,
      });

      // Wait for 1 confirmation (optional but nice UX)
      await publicClient?.waitForTransactionReceipt({ hash });

      alert(`Score ${score} submitted on-chain!\nTx: ${hash.slice(0, 10)}...`);
      // Refresh leaderboard
      await fetchOnChainLeaderboard();
    } catch (err: any) {
      console.error(err);
      alert('Submit failed: ' + (err?.shortMessage || err?.message || 'User rejected or contract not deployed'));
    } finally {
      setIsSubmittingScore(false);
    }
  }, [isConnected, walletClient, address, shortAddress, publicClient, fetchOnChainLeaderboard]);

  // Determine mint tier based on achievement (new contract: 0=Common, 1=Rare, 2=Epic)
  const updateMintEligibility = (stage: number, score: number) => {
    if (stage === 10) {
      const tier: 0 | 1 | 2 = score >= 6500 ? 2 : (score >= 4200 ? 1 : 0);
      setMintEligibility({
        eligible: true,
        tier,
        reason: tier === 2 ? 'Legendary Stage 10 Clear' : tier === 1 ? 'Stage 10 Elite Clear' : 'Stage 10 Survivor',
        stageCleared: 10,
      });
      return;
    }
    if (score >= 5000) {
      setMintEligibility({ eligible: true, tier: 1, reason: 'High Score Run (5000+)', stageCleared: stage });
      return;
    }
    setMintEligibility({ eligible: false, tier: 0, reason: '' });
  };

  // Mint the NFT using the new owner-only contract design
  const mintSurvivorNFT = useCallback(async () => {
    if (!mintEligibility.eligible) return;
    if (!isConnected || !walletClient || !address) {
      alert('Connect wallet to mint your NeonXurge Survivor NFT!');
      return;
    }

    const tier = mintEligibility.tier;
    const stageCleared = mintEligibility.stageCleared ?? 10;

    // Demo mode (no real contract)
    if (IS_DEMO_MODE) {
      setIsMinting(true);
      setTimeout(() => {
        const fakeHash = '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
        const newNFT = { tier, txHash: fakeHash, time: Date.now(), stageCleared };
        const updated = [newNFT, ...myNFTs].slice(0, 12);
        saveMyNFTs(updated);

        setIsMinting(false);
        setMintSuccess({ txHash: fakeHash, tier, stageCleared });
        setShowNFT(true);
        setShowStageClear(false);
      }, 1100);
      return;
    }

    // Real contract: only the owner can mint
    if (!isNftContractOwner) {
      alert('NFT minting is restricted to the contract owner on this deployment.\n\nConnect the wallet that deployed the NeonXurge Survivor NFT contract to mint badges for players.');
      return;
    }

    setIsMinting(true);
    try {
      const hash = await walletClient.writeContract({
        address: NFT_ADDRESS as `0x${string}`,
        abi: NFT_ABI,
        functionName: 'mint',
        args: [address, tier, BigInt(stageCleared) as unknown as bigint],
        chain: sepolia,
        account: address,
      });

      const receipt = await publicClient?.waitForTransactionReceipt({ hash });

      // Try to extract tokenId from Transfer event
      let tokenId: number | undefined;
      try {
        const decoded = parseEventLogs({ abi: NFT_ABI, logs: receipt?.logs || [] });
        const transfer = decoded.find((l: any) => l.eventName === 'Transfer');
        if (transfer) tokenId = Number(transfer.args.tokenId);
      } catch {}

      const newNFT = { tier, txHash: hash, time: Date.now(), stageCleared, tokenId };
      const updated = [newNFT, ...myNFTs].slice(0, 12);
      saveMyNFTs(updated);

      setMintSuccess({ txHash: hash, tier, tokenId, stageCleared });
      setShowNFT(true);
      setShowStageClear(false);

      // Pull live data + run discovery scan for the new mint
      setTimeout(() => syncNFTCollectionWithChain(), 1200);
    } catch (err: any) {
      console.error(err);
      alert('Mint failed: ' + (err?.shortMessage || 'Check contract address, owner permissions, and Sepolia balance'));
    } finally {
      setIsMinting(false);
    }
  }, [mintEligibility, isConnected, walletClient, address, publicClient, myNFTs, isNftContractOwner]);

  // Get current stats for an equipment
  const getEquipmentStats = (key: keyof typeof equipmentLevels) => {
    const level = getEquipLevel(key);
    switch (key) {
      case 'neonRifle':
        return `+${Math.floor(level * 8)}% Damage`;
      case 'plasmaVest':
        return `+${Math.floor(level * 6)} Max HP • ${Math.floor(level * 2)}% DR (survivability core)`;
      case 'quantumBoots':
        return `+${Math.floor(level * 5)}% Speed • -${Math.floor(level * 3)}% Dash CD`;
      case 'fusionCore':
        return `+${Math.floor(level * 4)}% Attack Speed`;
      case 'neuralChip':
        return `+${Math.floor(level * 7)}% XP • +${Math.floor(level * 1.5)}% Fusion Chance`;
      case 'assaultDrone':
        return level > 0 ? 'Active Companion Drone' : 'Inactive';
      default:
        return '';
    }
  };

  // Calculate equipment bonuses (used when starting a run)
  const getEquipmentBonuses = () => {
    const levels = equipmentLevels;
    return {
      damageMult: 1 + (levels.neonRifle * 0.08),
      maxHealthBonus: Math.floor(levels.plasmaVest * 6),
      damageReduction: levels.plasmaVest * 0.02,
      speedMult: 1 + (levels.quantumBoots * 0.05),
      attackSpeedMult: 1 + (levels.fusionCore * 0.04),
      xpMult: 1 + (levels.neuralChip * 0.055), // slightly nerfed for long runs
      hasAssaultDrone: levels.assaultDrone > 0,
    };
  };

  // Equipment Definitions
  const EQUIPMENT = {
    neonRifle: {
      name: 'Neon Rifle',
      icon: '🔫',
      slot: 'Weapon',
      description: 'Increases base damage of all attacks.',
    },
    plasmaVest: {
      name: 'Plasma Vest',
      icon: '🛡️',
      slot: 'Armor',
      description: 'Grants +6 Max HP and 2% DR per level. Essential for surviving late stages.',
    },
    quantumBoots: {
      name: 'Quantum Boots',
      icon: '👟',
      slot: 'Mobility',
      description: 'Increases movement speed and reduces dash cooldown.',
    },
    fusionCore: {
      name: 'Fusion Core',
      icon: '⚛️',
      slot: 'Core',
      description: 'Increases attack speed of all weapons.',
    },
    neuralChip: {
      name: 'Neural Chip',
      icon: '🧠',
      slot: 'Implant',
      description: 'Increases XP gain and improves fusion chance.',
    },
    assaultDrone: {
      name: 'Assault Drone',
      icon: '🤖',
      slot: 'Companion',
      description: 'Deploys a loyal combat drone that fights alongside you.',
    },
  };

  const STAGE_NAMES = [
    'Neon District',
    'Data Core',
    'Void Spire',
    'Cyber Abyss',
    'Neon Ruins',
    'Quantum Lab',
    'Shadow Network',
    'Eclipse Tower',
    'Void Protocol',
    'Final Protocol'
  ];

  const STAGE_DESCRIPTIONS = [
    'Neon District - Starting area - Basic enemies',
    'Data Core - Tech-heavy area with fast drones',
    'Void Spire - Tall tower with flying enemies',
    'Cyber Abyss - Dark underground with tanky enemies',
    'Neon Ruins - Abandoned city with mixed enemy types',
    'Quantum Lab - High-tech lab with fast and aggressive enemies',
    'Shadow Network - Hacking-themed stage with stealth enemies',
    'Eclipse Tower - Massive tower with powerful ranged enemies',
    'Void Protocol - Final area before the end',
    'Final Protocol - Epic final stage with the ultimate boss'
  ];


  // ==================== AUDIO (neon SFX) ====================
  const playSound = useCallback((type: 'shoot' | 'hit' | 'collect' | 'death' | 'level' | 'stageClear' | 'enemyDeathTank' | 'enemyDeathShooter') => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      const t = ctx.currentTime;

      if (type === 'shoot') {
        // Impactful cyberpunk laser
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        osc.type = 'sawtooth';
        osc.frequency.value = 1050;
        filter.type = 'lowpass';
        filter.frequency.value = 2800;
        gain.gain.value = 0.085;

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        osc.start(t);
        osc.frequency.linearRampToValueAtTime(420, t + 0.07);
        gain.gain.linearRampToValueAtTime(0.0001, t + 0.13);
        osc.stop(t + 0.15);
      }

      if (type === 'hit') {
        // Sharp satisfying hit
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = 145;
        gain.gain.value = 0.11;

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(t);
        gain.gain.linearRampToValueAtTime(0.0001, t + 0.17);
        osc.stop(t + 0.19);
      }

      if (type === 'collect') {
        // Pleasant cyberpunk ding
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 980;
        gain.gain.value = 0.09;

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(t);
        osc.frequency.exponentialRampToValueAtTime(1520, t + 0.1);
        gain.gain.linearRampToValueAtTime(0.0001, t + 0.2);
        osc.stop(t + 0.22);
      }

      if (type === 'death') {
        // Generic dramatic death
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        osc.type = 'sawtooth';
        osc.frequency.value = 210;
        filter.type = 'lowpass';
        filter.frequency.value = 780;
        gain.gain.value = 0.26;

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        osc.start(t);
        osc.frequency.linearRampToValueAtTime(38, t + 0.9);
        gain.gain.linearRampToValueAtTime(0.0001, t + 1.05);
        osc.stop(t + 1.1);
      }

      if (type === 'level') {
        // Epic level up chime
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();
        osc1.type = 'sine';
        osc2.type = 'sine';
        osc1.frequency.value = 620;
        osc2.frequency.value = 780;
        gain.gain.value = 0.09;

        const g = ctx.createGain();
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(g);
        g.connect(ctx.destination);

        osc1.start(t);
        osc2.start(t);
        osc1.frequency.linearRampToValueAtTime(980, t + 0.14);
        osc1.frequency.linearRampToValueAtTime(1520, t + 0.32);
        osc2.frequency.linearRampToValueAtTime(1240, t + 0.28);
        gain.gain.linearRampToValueAtTime(0.0001, t + 0.55);
        osc1.stop(t + 0.58);
        osc2.stop(t + 0.58);
      }

      if (type === 'stageClear') {
        // Triumphant stage advance
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 720;
        gain.gain.value = 0.1;

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(t);
        osc.frequency.linearRampToValueAtTime(980, t + 0.18);
        osc.frequency.linearRampToValueAtTime(1420, t + 0.38);
        gain.gain.linearRampToValueAtTime(0.0001, t + 0.7);
        osc.stop(t + 0.72);
      }

      if (type === 'enemyDeathTank') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.value = 95;
        gain.gain.value = 0.22;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.frequency.linearRampToValueAtTime(28, t + 0.65);
        gain.gain.linearRampToValueAtTime(0.0001, t + 0.8);
        osc.stop(t + 0.82);
      }

      if (type === 'enemyDeathShooter') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = 280;
        gain.gain.value = 0.13;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.frequency.linearRampToValueAtTime(95, t + 0.4);
        gain.gain.linearRampToValueAtTime(0.0001, t + 0.55);
        osc.stop(t + 0.57);
      }
    } catch {
      // Audio not available (silent fallback)
    }
  }, []);

  // ==================== SPAWN HELPERS ====================
  const spawnEnemy = (state: GameState) => {
    const edge = Math.floor(Math.random() * 4);
    let x = 0, y = 0;
    const margin = 28;

    if (edge === 0) { // top
      x = Math.random() * CANVAS_WIDTH;
      y = -margin;
    } else if (edge === 1) { // right
      x = CANVAS_WIDTH + margin;
      y = Math.random() * CANVAS_HEIGHT;
    } else if (edge === 2) { // bottom
      x = Math.random() * CANVAS_WIDTH;
      y = CANVAS_HEIGHT + margin;
    } else { // left
      x = -margin;
      y = Math.random() * CANVAS_HEIGHT;
    }

    // Determine enemy type based on current stage — SMOOTH DIFFICULTY CURVE
    // 1-3 Easy: gentle introduction of variety (learn mechanics)
    // 4-6 Medium: real mix, pressure builds
    // 7-10 Hard/Extreme: heavy tank + shooter pressure, few weak drones
    let enemyType: 'drone' | 'tank' | 'shooter' = 'drone';
    const r = Math.random();
    const stage = state.currentStage;

    if (stage === 1) {
      // Neon District (Easy) — welcoming but not trivial
      enemyType = r < 0.14 ? 'tank' : 'drone';
    } else if (stage === 2) {
      // Data Core (Easy) — introduce shooters lightly
      if (r < 0.22) enemyType = 'tank';
      else if (r < 0.38) enemyType = 'shooter';
      else enemyType = 'drone';
    } else if (stage === 3) {
      // Void Spire (Easy) — first real mix
      if (r < 0.28) enemyType = 'tank';
      else if (r < 0.52) enemyType = 'shooter';
      else enemyType = 'drone';
    } else if (stage === 4) {
      // Cyber Abyss (Medium) — tank heavy
      if (r < 0.48) enemyType = 'tank';
      else if (r < 0.72) enemyType = 'shooter';
      else enemyType = 'drone';
    } else if (stage === 5) {
      // Neon Ruins (Medium) — balanced pressure
      if (r < 0.38) enemyType = 'tank';
      else if (r < 0.72) enemyType = 'shooter';
      else enemyType = 'drone';
    } else if (stage === 6) {
      // Quantum Lab (Medium) — aggressive shooters
      if (r < 0.32) enemyType = 'tank';
      else if (r < 0.82) enemyType = 'shooter';
      else enemyType = 'drone';
    } else if (stage === 7) {
      // Shadow Network (Hard) — shooter dominant
      if (r < 0.32) enemyType = 'tank';
      else enemyType = 'shooter';
    } else if (stage === 8) {
      // Eclipse Tower (Hard) — heavy armor + ranged
      if (r < 0.48) enemyType = 'tank';
      else enemyType = 'shooter';
    } else if (stage === 9) {
      // Void Protocol (Hard) — brutal mix
      if (r < 0.52) enemyType = 'tank';
      else enemyType = 'shooter';
    } else {
      // Final Protocol (Extreme) — maximum density of elites
      if (r < 0.55) enemyType = 'tank';
      else enemyType = 'shooter';
    }

    const enemy = new Enemy(x, y, enemyType, state.currentStage);
    state.enemies.push(enemy);
  };

  const spawnInitialEnemies = (state: GameState) => {
    for (let i = 0; i < INITIAL_ENEMY_COUNT; i++) {
      spawnEnemy(state);
    }
  };

  const createExplosion = (state: GameState, x: number, y: number, count: number, color: string) => {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.9;
      const speed = 95 + Math.random() * 175;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      state.particles.push(new Particle(x, y, vx, vy, color, { 
        life: 0.45 + Math.random() * 0.3, 
        size: 2.4 + Math.random() * 2.2,
        glow: true 
      }));
    }
  };

  // Premium juice effects
  const createImpactSparks = (state: GameState, x: number, y: number, count: number = 6) => {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 80 + Math.random() * 140;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      state.particles.push(new Particle(x, y, vx, vy, COLORS.cyan, { 
        life: 0.18 + Math.random() * 0.12, 
        size: 1.6 + Math.random() * 1.2,
        friction: 0.88,
        glow: true 
      }));
    }
  };

  const createOrbCollectEffect = (state: GameState, x: number, y: number) => {
    // Small inward + outward blue particles
    for (let i = 0; i < 7; i++) {
      const angle = (i / 7) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const speed = 35 + Math.random() * 55;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      state.particles.push(new Particle(x, y, vx, vy, COLORS.blue, { 
        life: 0.32 + Math.random() * 0.18, 
        size: 2.8 + Math.random() * 1.5,
        friction: 0.94,
        glow: true 
      }));
    }
  };

  const createLevelUpBurst = (state: GameState, x: number, y: number) => {
    // Big cyan/purple burst
    for (let i = 0; i < 26; i++) {
      const angle = (i / 26) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
      const speed = 120 + Math.random() * 210;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      const color = Math.random() > 0.6 ? COLORS.purple : COLORS.cyan;
      state.particles.push(new Particle(x, y, vx, vy, color, { 
        life: 0.55 + Math.random() * 0.35, 
        size: 3.2 + Math.random() * 2.8,
        friction: 0.965,
        glow: true 
      }));
    }
  };

  // Epic fusion transformation visual
  const createFusionEffect = (state: GameState, x: number, y: number) => {
    // Massive multi-color burst (purple + cyan + white)
    for (let i = 0; i < 60; i++) {
      const angle = (i / 60) * Math.PI * 2 + (Math.random() - 0.5) * 1.2;
      const speed = 180 + Math.random() * 380;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;

      let color = COLORS.purple;
      if (Math.random() > 0.75) color = '#ffffff';
      else if (Math.random() > 0.5) color = COLORS.cyan;

      state.particles.push(new Particle(x, y, vx, vy, color, {
        life: 0.9 + Math.random() * 0.8,
        size: 4.5 + Math.random() * 5,
        friction: 0.94,
        glow: true
      }));
    }

    // Inner bright core burst
    for (let i = 0; i < 35; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 140;
      state.particles.push(new Particle(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, '#ffffff', {
        life: 0.6 + Math.random() * 0.5,
        size: 2.5 + Math.random() * 3,
        friction: 0.88,
        glow: true
      }));
    }

    // Expanding energy rings (visual only via particles)
    for (let r = 0; r < 3; r++) {
      const ringRadius = 40 + r * 35;
      for (let i = 0; i < 18; i++) {
        const angle = (i / 18) * Math.PI * 2;
        const speed = 40 + r * 25;
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;
        state.particles.push(new Particle(x + Math.cos(angle) * ringRadius, y + Math.sin(angle) * ringRadius, vx, vy, '#c026ff', {
          life: 0.75 + Math.random() * 0.4,
          size: 3 + r,
          friction: 0.96,
          glow: true
        }));
      }
    }

    // Extra dramatic screen shake
    addScreenShake(state, 22);
  };

  // ==================== RESET / INIT ====================
  const initGame = useCallback((startingStage = 1): GameState => {
    const now = Date.now();

    const player = new Player(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);

    const state: GameState = {
      player,
      enemies: [],
      projectiles: [],
      orbs: [],
      particles: [],
      floatingTexts: [],
      score: 0,
      kills: 0,
      xp: 0,
      level: 1,
      xpToNextLevel: 12,
      upgrades: {
        rapidFire: 0,
        biggerDamage: 0,
        tripleShot: 0,
        piercing: 0,
        speedBoost: 0,
        areaExplosion: 0,
      },
      startTime: now,
      lastShotTime: now / 1000 - 0.6,
      lastDifficultyTime: now / 1000,
      lastSpawnRateIncrease: now / 1000,
      nextSpawnTime: now / 1000 + 0.6,
      enemyCap: 5, // will be overwritten by stage-specific in reset path, safe default
      isRunning: true,
      isPaused: false,
      pendingLevelUp: false,
      levelUpFlashUntil: 0,
      screenShake: 0,
      combo: 0,
      lastKillTime: 0,
      currentStage: startingStage,
      lastStageAdvance: now / 1000,
      playerTrail: [],
      boss: null,
      bossActive: false,

      // Timer pause tracking
      totalPausedDuration: 0,
      pauseStartTime: null,
      pausedByVisibility: false,

      // New Skill System init
      skills: {
        active: {
          neonOverdrive: 0,
          orbitalDrones: 0,
          energyDash: 0,
          shockwaveBlast: 0,
          homingMissiles: 0,
          laserBeam: 0,
        },
        passive: {
          damageBoost: 0,
          attackSpeed: 0,
          maxHealth: 0,
          critChance: 0,
          xpMagnet: 0,
          barrier: 0,
        },
        fusions: [],
        fusedActives: {},
        equippedActive: [],
        equippedPassive: [],
      },
      pendingFusion: null,
    };

    grantHeroStartingSkill(state); // Hero always starts each stage with Pulse Fire (Lv1) in slot 1

    // Apply Equipment bonuses to starting player health (Plasma Vest)
    const vestBonus = Math.floor(equipmentLevels.plasmaVest * 6);
    const startingMax = BASE_PLAYER_HEALTH + vestBonus;
    state.player.maxHealth = startingMax;
    state.player.health = startingMax;
    state.player.invulnerableUntil = 0;

    spawnInitialEnemies(state);
    startAmbientHum();
    return state;
  }, [equipmentLevels]);

  const resetGame = useCallback((startingStage = 1) => {
    const newState = initGame(startingStage);
    gameRef.current = newState;
    keysRef.current.clear();

    setHud({
      score: 0,
      kills: 0,
      time: 0,
      xp: 0,
      level: 1,
      xpToNextLevel: 12,
      isGameOver: false,
      isLevelingUp: false,
      combo: 0,
      currentStage: 1,
    });

    lastTimeRef.current = 0;
    hudUpdateRef.current = 0;

    // Restart loop if needed
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    startAmbientHum();
    startGameLoop();
  }, [initGame]);

  // Start a specific stage from the menu
  const startSelectedStage = useCallback(() => {
    const stageToStart = Math.min(selectedStage, unlockedUpTo);
    
    const newState = initGame(stageToStart);
    gameRef.current = newState;
    keysRef.current.clear();

    // Reset timing refs
    lastTimeRef.current = 0;
    hudUpdateRef.current = 0;

    setHud({
      score: 0,
      kills: 0,
      time: 0,
      xp: 0,
      level: 1,
      xpToNextLevel: 12,
      isGameOver: false,
      isLevelingUp: false,
      combo: 0,
      currentStage: stageToStart,
    });

    // Force-sync the refs immediately (setState is async, RAF would see old values otherwise)
    screenRef.current = 'game';
    gameActiveRef.current = true;

    setScreen('game');
    setShowStageClear(false);

    // NOTE: Do NOT call startGameLoop() here.
    // The canvas is not mounted yet (setState is async). A dedicated effect below
    // waits for the canvas ref + game state to be ready before starting the RAF loop.
  }, [selectedStage, unlockedUpTo, initGame]);

  const returnToMenu = useCallback(() => {
    // Stop any ambient sounds
    stopAmbientHum();

    // Stop the game loop
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    // Clear game state + force-sync refs
    gameRef.current = null;
    screenRef.current = 'menu';
    gameActiveRef.current = false;

    // Save progress if we unlocked something new (including beating the current boss)
    let newUnlocked = Math.max(unlockedUpTo, hud.currentStage);
    if (hud.currentStage >= unlockedUpTo) {
      newUnlocked = Math.min(10, hud.currentStage + 1);
    }

    if (newUnlocked > unlockedUpTo) {
      setUnlockedUpTo(newUnlocked);
      if (typeof window !== 'undefined') {
        localStorage.setItem('neonSurgeUnlocked', newUnlocked.toString());
      }
    }

    // Always persist current Neon Shards when leaving a run (prevents loss on death)
    if (typeof window !== 'undefined') {
      localStorage.setItem('neonSurgeShards', neonShards.toString());
    }

    setScreen('menu');
    setShowStageClear(false);
  }, [unlockedUpTo, hud.currentStage, neonShards]);

  // ==================== DIFFICULTY RAMP (15s enemy count + 30s spawn rate) ====================
  const handleDifficulty = (state: GameState, currentTime: number) => {
    // Enemy count / waves (every 15s) — controlled ramp per band
    if (currentTime - state.lastDifficultyTime > DIFFICULTY_INTERVAL / 1000) {
      const maxCap = state.currentStage >= 8 ? 46 : (state.currentStage >= 5 ? 36 : 28);
      state.enemyCap = Math.min(maxCap, state.enemyCap + (state.currentStage >= 7 ? 3 : 2));
      state.lastDifficultyTime = currentTime;

      const extra = Math.min(state.currentStage >= 7 ? 4 : 3, Math.floor(state.enemyCap / 7));
      for (let i = 0; i < extra; i++) {
        spawnEnemy(state);
      }
    }

    // Spawn rate increases every 30 seconds (makes game much harder over time)
    if (currentTime - state.lastSpawnRateIncrease > SPAWN_RATE_INCREASE_INTERVAL / 1000) {
      state.lastSpawnRateIncrease = currentTime;
      // We don't store interval in state for simplicity — next spawn logic uses a dynamic calculation
    }
  };

  // ==================== UPGRADE HELPERS ====================
  const getCurrentFireCooldown = (state: GameState): number => {
    const stacks = state.upgrades.rapidFire;
    let cooldown = AUTO_FIRE_COOLDOWN / (1 + 0.25 * stacks);

    // Equipment: Fusion Core attack speed
    const coreBonus = 1 + (equipmentLevels.fusionCore * 0.04);
    cooldown = cooldown / coreBonus;

    return cooldown;
  };

  const getProjectileDamage = (state: GameState): number => {
    const stacks = state.upgrades.biggerDamage;
    const base = 1 + Math.floor(0.4 * stacks);

    // Pulse Fire (hero exclusive) enhances your main shots
    const odLevel = state.skills.active.neonOverdrive || 0;
    const isEquipped = state.skills.equippedActive.includes('neonOverdrive');
    const odBonus = (odLevel > 0 && isEquipped) ? (1 + odLevel * 0.35) : 1;

    // Equipment: Neon Rifle
    const rifleBonus = 1 + (equipmentLevels.neonRifle * 0.08);

    return Math.floor(getEffectiveDamage(state, base) * odBonus * rifleBonus);
  };

  const getPlayerSpeed = (state: GameState): number => {
    const stacks = state.upgrades.speedBoost;
    const passiveMult = getPassiveMultiplier(state, 'damageBoost');
    const baseSpeed = PLAYER_SPEED * (1 + 0.30 * stacks) * getPassiveMultiplier(state, 'attackSpeed');

    // Equipment: Quantum Boots
    const bootBonus = 1 + (equipmentLevels.quantumBoots * 0.05);
    return baseSpeed * bootBonus;
  };

  const getPierceCount = (state: GameState): number => {
    return state.upgrades.piercing; // 0 = no pierce, 1 = pierces 1 extra, etc.
  };

  // ==================== STAGE TIMER PAUSE HELPERS ====================
  const pauseStageTimer = (state: GameState) => {
    if (state.pauseStartTime === null) {
      state.pauseStartTime = Date.now() / 1000;
    }
  };

  const resumeStageTimer = (state: GameState) => {
    if (state.pauseStartTime !== null) {
      const pausedFor = Date.now() / 1000 - state.pauseStartTime;
      state.totalPausedDuration = (state.totalPausedDuration || 0) + pausedFor;
      state.pauseStartTime = null;
    }
  };

  const getEffectiveStageElapsed = (state: GameState): number => {
    const now = Date.now() / 1000;
    let paused = state.totalPausedDuration || 0;
    if (state.pauseStartTime !== null) {
      paused += now - state.pauseStartTime;
    }
    return now - state.lastStageAdvance - paused;
  };

  // Reset all skills when advancing to a new stage
  const resetSkillsForNewStage = (state: GameState) => {
    // Reset levels
    (Object.keys(state.skills.active) as ActiveSkillKey[]).forEach(key => {
      state.skills.active[key] = 0;
    });
    (Object.keys(state.skills.passive) as PassiveSkillKey[]).forEach(key => {
      state.skills.passive[key] = 0;
    });

    // Clear equipped slots
    state.skills.equippedActive = [];
    state.skills.equippedPassive = [];

    // Clear fusions
    state.skills.fusions = [];
    state.skills.fusedActives = {};

    // Clear runtime skill timers/state
    delete state.lastDroneFire;
    delete state.lastShockwaveTime;
    delete state.lastHomingTime;
    delete state.lastLaserTime;
    delete state.lastDashTime;
    state.isDashing = false;
    state.dashUntil = undefined;

    // Clear Pulse Fire (hero exclusive) timer + Assault Drone companion
    delete state.lastNeonOverdriveTime;
    delete state.lastAssaultDroneFire;
  };

  // Full clean reset when advancing to a new stage via Stage Clear.
  // This makes continuing to Stage 2 feel identical to selecting it fresh from the main menu.
  const resetForNewStage = (state: GameState, nextStage: number) => {
    const now = Date.now();
    const nowSec = now / 1000;

    state.currentStage = nextStage;
    state.lastStageAdvance = nowSec;
    state.boss = null;
    state.bossActive = false;

    // Clear all leftover world objects (this fixes "exp orb is everywhere")
    state.enemies = [];
    state.projectiles = [];
    state.orbs = [];
    state.particles = [];
    state.floatingTexts = [];
    state.playerTrail = [];

    // Reset spawn timing + difficulty so the new stage starts clean and calm (like menu)
    state.lastShotTime = nowSec - 0.6;
    state.lastDifficultyTime = nowSec;
    state.lastSpawnRateIncrease = nowSec;
    // Stage-based starting difficulty — smooth bands (Easy 1-3 slower start, Hard 7-10 starts hotter but fair with player power)
    const stage = nextStage;
    let baseInterval: number;
    let baseCap: number;
    if (stage <= 3) {
      baseInterval = Math.max(780, 980 - (stage - 1) * 28);
      baseCap = 6 + Math.floor(stage * 1.1);
    } else if (stage <= 6) {
      baseInterval = Math.max(580, 860 - (stage - 1) * 32);
      baseCap = 8 + Math.floor(stage * 1.6);
    } else {
      baseInterval = Math.max(460, 720 - (stage - 1) * 26);
      baseCap = 11 + Math.floor(stage * 2.1);
    }
    baseCap = Math.min(baseCap, stage >= 8 ? 46 : 36);

    state.nextSpawnTime = nowSec + (baseInterval / 1000) * 0.55;
    state.enemyCap = baseCap;

    // Reset classic upgrades so each stage feels fresh (matches selecting from main menu)
    state.upgrades = {
      rapidFire: 0,
      biggerDamage: 0,
      tripleShot: 0,
      piercing: 0,
      speedBoost: 0,
      areaExplosion: 0,
    };

    // Fresh pause tracking for the new stage's 3-minute timer
    state.totalPausedDuration = 0;
    state.pauseStartTime = null;
    state.pausedByVisibility = false;

    // Recenter the player for a clean start
    if (state.player) {
      state.player.x = CANVAS_WIDTH / 2;
      state.player.y = CANVAS_HEIGHT / 2;
    }

    // Skill system: full reset then grant the hero's exclusive Pulse Fire Lv1
    resetSkillsForNewStage(state);
    grantHeroStartingSkill(state);

    // Spawn a few starting enemies so the new stage feels alive immediately (matches menu start)
    spawnInitialEnemies(state);
  };

  // Grant the hero's exclusive starting Active Skill (Pulse Fire Lv1)
  // This ensures every stage starts with exactly 1 active skill slot filled.
  const grantHeroStartingSkill = (state: GameState) => {
    const heroSkill: ActiveSkillKey = 'neonOverdrive';
    if (!state.skills.equippedActive.includes(heroSkill)) {
      state.skills.equippedActive.push(heroSkill);
    }
    state.skills.active[heroSkill] = 1;
  };

  // ==================== NEW SKILL HELPERS ====================
  const getPassiveMultiplier = (state: GameState, key: PassiveSkillKey): number => {
    // Only counts if the passive is equipped in one of the 5 slots
    const isEquipped = state.skills.equippedPassive.includes(key);
    const level = isEquipped ? (state.skills.passive[key] || 0) : 0;
    switch (key) {
      case 'damageBoost': return 1 + (level * 0.12); // tuned for healthy power curve with new HP system
      case 'attackSpeed': return 1 + (level * 0.115);
      case 'maxHealth':   return 1 + (level * 0.18);
      case 'critChance':  return level * 0.048;
      case 'xpMagnet':    return 1 + (level * 0.22);
      case 'barrier':     return 1 - (level * 0.05); // up to 25% DR at Lv5 — critical with contact damage
      default: return 1;
    }
  };

  const getEffectiveDamage = (state: GameState, baseDamage: number): number => {
    let dmg = baseDamage * getPassiveMultiplier(state, 'damageBoost');
    // Crit chance
    const crit = getPassiveMultiplier(state, 'critChance');
    if (Math.random() < crit) {
      dmg *= 2.5;
    }
    return Math.floor(dmg);
  };

  // ==================== SKILL SLOT HELPERS (max 5 active + 5 passive) ====================
  const canEquipMoreActive = (state: GameState): boolean => {
    return state.skills.equippedActive.length < 5;
  };

  const canEquipMorePassive = (state: GameState): boolean => {
    return state.skills.equippedPassive.length < 5;
  };

  const equipActive = (state: GameState, key: ActiveSkillKey) => {
    if (!state.skills.equippedActive.includes(key) && canEquipMoreActive(state)) {
      state.skills.equippedActive.push(key);
    }
  };

  const equipPassive = (state: GameState, key: PassiveSkillKey) => {
    if (!state.skills.equippedPassive.includes(key) && canEquipMorePassive(state)) {
      state.skills.equippedPassive.push(key);
    }
  };

  // ==================== NEW SKILL LEVEL UP & FUSION LOGIC ====================
  const levelUpActiveSkill = (key: ActiveSkillKey) => {
    const state = gameRef.current;
    if (!state) return;

    if (state.skills.active[key] >= 5) return;

    // Auto-equip into a free active slot (max 5)
    equipActive(state, key);

    state.skills.active[key] += 1;
    playSound('level');
    createLevelUpBurst(state, state.player.x, state.player.y);

    // Check for fusion eligibility
    // Fusion is now offered directly as a level-up choice when conditions are met

    // Advance level
    state.level += 1;
    state.xp -= state.xpToNextLevel;
    state.xpToNextLevel = Math.floor(10 + (state.level - 1) * 9);
    state.pendingLevelUp = false;
    state.isPaused = false;
    resumeStageTimer(state); // Resume the 3-minute stage timer

    setHud(prev => ({
      ...prev,
      level: state.level,
      xp: state.xp,
      xpToNextLevel: state.xpToNextLevel,
      isLevelingUp: false,
    }));
  };

  const levelUpPassiveSkill = (key: PassiveSkillKey) => {
    const state = gameRef.current;
    if (!state) return;

    if (state.skills.passive[key] >= 5) return;

    // Auto-equip into a free passive slot (max 5)
    equipPassive(state, key);

    state.skills.passive[key] += 1;
    playSound('level');
    createLevelUpBurst(state, state.player.x, state.player.y);

    // Fusion is now offered directly as a level-up choice when conditions are met

    state.level += 1;
    state.xp -= state.xpToNextLevel;
    state.xpToNextLevel = Math.floor(10 + (state.level - 1) * 9);
    state.pendingLevelUp = false;
    state.isPaused = false;
    resumeStageTimer(state); // Resume the 3-minute stage timer

    setHud(prev => ({
      ...prev,
      level: state.level,
      xp: state.xp,
      xpToNextLevel: state.xpToNextLevel,
      isLevelingUp: false,
    }));
  };

  const checkForFusionEligibility = (state: GameState) => {
    let hasFusion = false;
    for (const activeKey of Object.keys(state.skills.active) as ActiveSkillKey[]) {
      if (state.skills.active[activeKey] >= 5) {
        for (const passiveKey of Object.keys(state.skills.passive) as PassiveSkillKey[]) {
          if (state.skills.passive[passiveKey] >= 1) {
            hasFusion = true;
            break;
          }
        }
      }
    }
    // We use pendingFusion as a simple flag for now
    if (hasFusion && !state.pendingFusion) {
      // We'll let the UI decide which fusion when player chooses the tab
    }
  };

  const getAvailableFusions = () => {
    const state = gameRef.current;
    if (!state) return [];

    const fusions: any[] = [];

    // Example fusion mappings
    if (state.skills.active.orbitalDrones >= 5 && state.skills.passive.damageBoost >= 1) {
      fusions.push({
        active: 'orbitalDrones',
        passive: 'damageBoost',
        name: 'Explosive Drones',
        desc: 'Drones now explode on impact for massive area damage'
      });
    }

    if (state.skills.active.energyDash >= 5 && state.skills.passive.maxHealth >= 1) {
      fusions.push({
        active: 'energyDash',
        passive: 'maxHealth',
        name: 'Titan Dash',
        desc: 'Dash leaves behind a damaging trail and grants temporary shields'
      });
    }

    if (state.skills.active.shockwaveBlast >= 5 && state.skills.passive.attackSpeed >= 1) {
      fusions.push({
        active: 'shockwaveBlast',
        passive: 'attackSpeed',
        name: 'Rapid Shockwaves',
        desc: 'Shockwaves fire much faster and chain between enemies'
      });
    }

    return fusions;
  };

  const performFusion = (activeKey: ActiveSkillKey, passiveKey: PassiveSkillKey) => {
    const state = gameRef.current;
    if (!state) return;

    const fusionName = getAvailableFusions().find(f => f.active === activeKey && f.passive === passiveKey)?.name || 'Mystic Fusion';

    // Add to fusions list + mark the active as fused (for visuals + renamed shots)
    state.skills.fusions.push(fusionName);
    state.skills.fusedActives[activeKey] = fusionName;

    // Epic dedicated fusion VFX + feedback (purple/cyan rings + massive burst)
    playSound('stageClear');
    createFusionEffect(state, state.player.x, state.player.y);
    addScreenShake(state, 14);

    // Strong power spike on fusion (helps feel the "build complete" moment)
    state.skills.passive.damageBoost = Math.max(state.skills.passive.damageBoost, 2);

    state.pendingLevelUp = false;
    state.isPaused = false;

    setHud(prev => ({
      ...prev,
      isLevelingUp: false,
    }));

    // Extra "FUSED" floating text for satisfaction
    addFloatingText(state, state.player.x, state.player.y - 42, 'FUSED!', '#c026ff', 15);
  };

  const getCurrentSpawnInterval = (state: GameState): number => {
    const timeSurvived = (Date.now() - state.startTime) / 1000;
    const reductions = Math.floor(timeSurvived / 30);
    // Slightly gentler min for early stages, tighter (but not insane) for late
    const minInterval = state.currentStage <= 3 ? 520 : (state.currentStage <= 6 ? 410 : 340);
    const reductionStep = state.currentStage >= 7 ? 88 : 95;
    return Math.max(minInterval, SPAWN_INTERVAL - reductions * reductionStep);
  };

  // Pick 3 choices for level up.
  // ONLY from Active Skills and Passive Skills (respects 5-slot limit)
  const pickRandomUpgrades = (): LevelUpChoice[] => {
    const state = gameRef.current;
    if (!state) {
      // Fallback (shouldn't normally happen) — return empty so we don't offer old upgrades
      return [];
    }

    const choices: LevelUpChoice[] = [];

    const equippedActives = state.skills.equippedActive;
    const equippedPassives = state.skills.equippedPassive;

    const freeActiveSlots = 5 - equippedActives.length;
    const freePassiveSlots = 5 - equippedPassives.length;

    // Collect possible choices:
    // 1. New skills (if we have free slots)
    const newActiveOptions = ACTIVE_SKILLS
      .filter(s => !equippedActives.includes(s.key) && freeActiveSlots > 0);

    const newPassiveOptions = PASSIVE_SKILLS
      .filter(s => !equippedPassives.includes(s.key) && freePassiveSlots > 0);

    // 2. Upgrades to already equipped skills
    const upgradeActiveOptions = equippedActives
      .map(key => ACTIVE_SKILLS.find(s => s.key === key)!)
      .filter(s => (state.skills.active[s.key] || 0) < 5);

    const upgradePassiveOptions = equippedPassives
      .map(key => PASSIVE_SKILLS.find(s => s.key === key)!)
      .filter(s => (state.skills.passive[s.key] || 0) < 5);

    // 3. Fusion options: Active Lv5 + compatible Passive >= Lv1 (not yet fused)
    const fusionChoices: LevelUpChoice[] = [];
    for (const recipe of FUSION_RECIPES) {
      const activeLevel = state.skills.active[recipe.active] || 0;
      const passiveLevel = state.skills.passive[recipe.passive] || 0;
      const isEquipped = equippedActives.includes(recipe.active);
      const alreadyFused = !!state.skills.fusedActives[recipe.active];

      if (activeLevel >= 5 && passiveLevel >= 1 && isEquipped && !alreadyFused) {
        const baseDef = ACTIVE_SKILLS.find(s => s.key === recipe.active)!;
        fusionChoices.push({
          type: 'fusion',
          active: recipe.active,
          passive: recipe.passive,
          name: `FUSE → ${recipe.fusionName}`,
          desc: recipe.desc,
          icon: recipe.icon || baseDef.icon,
        });
      }
    }

    // Build a pool of all valid skill choices
    const allSkillChoices: Array<{ type: 'newActive' | 'newPassive' | 'upgradeActive' | 'upgradePassive'; key: any; name: string; desc: string; icon: string }> = [];

    newActiveOptions.forEach(s => {
      allSkillChoices.push({ type: 'newActive', key: s.key, name: s.name, desc: s.desc, icon: s.icon });
    });

    newPassiveOptions.forEach(s => {
      allSkillChoices.push({ type: 'newPassive', key: s.key, name: s.name, desc: s.desc, icon: s.icon });
    });

    upgradeActiveOptions.forEach(s => {
      const currentLevel = state.skills.active[s.key] || 0;
      allSkillChoices.push({
        type: 'upgradeActive',
        key: s.key,
        name: `${s.name} (Lv ${currentLevel} → ${currentLevel + 1})`,
        desc: s.desc,
        icon: s.icon
      });
    });

    upgradePassiveOptions.forEach(s => {
      const currentLevel = state.skills.passive[s.key] || 0;
      allSkillChoices.push({
        type: 'upgradePassive',
        key: s.key,
        name: `${s.name} (Lv ${currentLevel} → ${currentLevel + 1})`,
        desc: s.desc,
        icon: s.icon
      });
    });

    // Prioritize fusions (they are special and only available when conditions are met)
    const shuffledFusions = fusionChoices.sort(() => Math.random() - 0.5);
    for (let i = 0; i < shuffledFusions.length && choices.length < 3; i++) {
      choices.push(shuffledFusions[i]);
    }

    // Shuffle and pick remaining choices from normal skills
    const shuffled = allSkillChoices.sort(() => Math.random() - 0.5);
    for (let i = 0; i < shuffled.length && choices.length < 3; i++) {
      const opt = shuffled[i];
      choices.push({
        type: opt.type,
        key: opt.key,
        name: opt.name,
        desc: opt.desc,
        icon: opt.icon
      });
    }

    // Fallback: if for some reason we have less than 3 (very full build), fill with any available upgrade
    while (choices.length < 3) {
      if (upgradeActiveOptions.length > 0) {
        const s = upgradeActiveOptions[choices.length % upgradeActiveOptions.length];
        const lvl = state.skills.active[s.key] || 0;
        choices.push({
          type: 'upgradeActive',
          key: s.key,
          name: `${s.name} (Lv ${lvl} → ${lvl + 1})`,
          desc: s.desc,
          icon: s.icon
        });
      } else if (upgradePassiveOptions.length > 0) {
        const s = upgradePassiveOptions[choices.length % upgradePassiveOptions.length];
        const lvl = state.skills.passive[s.key] || 0;
        choices.push({
          type: 'upgradePassive',
          key: s.key,
          name: `${s.name} (Lv ${lvl} → ${lvl + 1})`,
          desc: s.desc,
          icon: s.icon
        });
      } else {
        break;
      }
    }

    return choices;
  };

  // Stable function to immediately trigger the classic "pick 3 upgrades" UI
  const triggerLevelUpUI = useCallback(() => {
    const choices = pickRandomUpgrades();
    setLevelUpChoices(choices);
    setHud(prev => ({
      ...prev,
      isLevelingUp: true,
    }));
  }, []);

  const applyUpgrade = (state: GameState, key: UpgradeKey) => {
    state.upgrades[key] = (state.upgrades[key] || 0) + 1;

    playSound('level');
    createLevelUpBurst(state, state.player.x, state.player.y);
    state.levelUpFlashUntil = Date.now() + 520;
  };

  // Called when player picks one of the 3 random upgrades
  const chooseUpgrade = useCallback((upgrade: UpgradeDef) => {
    const state = gameRef.current;
    if (!state) return;

    applyUpgrade(state, upgrade.key);

    // Advance level + prepare next threshold
    state.level += 1;
    state.xp -= state.xpToNextLevel;
    state.xpToNextLevel = Math.floor(10 + (state.level - 1) * 9);
    state.pendingLevelUp = false;
    state.isPaused = false;
    resumeStageTimer(state); // Resume the 3-minute stage timer

    // Clear choices + resume game
    setLevelUpChoices([]);
    setHud(prev => ({
      ...prev,
      level: state.level,
      xp: state.xp,
      xpToNextLevel: state.xpToNextLevel,
      isLevelingUp: false,
    }));
  }, []);

  const addScreenShake = (state: GameState, amount: number) => {
    state.screenShake = Math.min(18, (state.screenShake || 0) + amount);
  };

  const startAmbientHum = () => {
    if (!soundEnabled) return;

    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;

      if (ambientOscRef.current) {
        try { ambientOscRef.current.stop(); } catch {}
      }

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.type = 'sine';
      osc.frequency.value = 48;
      filter.type = 'lowpass';
      filter.frequency.value = 120;
      gain.gain.value = 0.028;

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      ambientOscRef.current = osc;
      ambientGainRef.current = gain;
    } catch {}
  };

  const stopAmbientHum = () => {
    if (ambientGainRef.current && ambientOscRef.current) {
      try {
        // Smooth fade out to avoid click/pop
        ambientGainRef.current.gain.linearRampToValueAtTime(0.0001, audioCtxRef.current!.currentTime + 0.25);
        
        setTimeout(() => {
          if (ambientOscRef.current) {
            try { ambientOscRef.current.stop(); } catch {}
            ambientOscRef.current = null;
            ambientGainRef.current = null;
          }
        }, 300);
      } catch {
        // Fallback hard stop
        try { ambientOscRef.current.stop(); } catch {}
        ambientOscRef.current = null;
        ambientGainRef.current = null;
      }
    }
  };

  const addFloatingText = (state: GameState, x: number, y: number, text: string, color: string, size = 13) => {
    state.floatingTexts.push(new FloatingText(x, y, text, color, size));
  };

  // ==================== AUTO ATTACK (with upgrades) ====================
  const tryAutoAttack = (state: GameState, currentTime: number) => {
    const cooldown = getCurrentFireCooldown(state);
    if (currentTime - state.lastShotTime < cooldown) return;
    if (state.enemies.length === 0) return;

    const p = state.player;
    let nearest: Enemy | null = null;
    let minDist = Infinity;

    for (const e of state.enemies) {
      const d = dist2(p.x, p.y, e.x, e.y);
      if (d < minDist) {
        minDist = d;
        nearest = e;
      }
    }

    if (!nearest || minDist > 560 * 560) return;

    const dx = nearest.x - p.x;
    const dy = nearest.y - p.y;
    const len = Math.hypot(dx, dy) || 1;

    const baseVx = (dx / len) * PROJECTILE_SPEED;
    const baseVy = (dy / len) * PROJECTILE_SPEED;

    const damage = getProjectileDamage(state);
    const pierce = getPierceCount(state);
    const triple = state.upgrades.tripleShot > 0;

    // Check if Pulse Fire skill is enhancing the main shots
    const odLevel = state.skills.active.neonOverdrive || 0;
    const odEquipped = state.skills.equippedActive.includes('neonOverdrive');
    const isOverdriveEnhanced = odLevel > 0 && odEquipped;
    const isFused = !!state.skills.fusedActives['neonOverdrive'];

    if (triple) {
      // Spread shot: 3 projectiles
      const spread = 0.28; // radians ~16 degrees
      const angles = [-spread, 0, spread];

      angles.forEach((angle) => {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const vx = baseVx * cos - baseVy * sin;
        const vy = baseVx * sin + baseVy * cos;
        const proj = new Projectile(p.x, p.y, vx, vy, damage, pierce);
        if (isOverdriveEnhanced) {
          (proj as any).isOverdriveEnhanced = true;
          (proj as any).overdriveLevel = odLevel;
        }
        if (isFused) {
          (proj as any).isFused = true;
        }
        state.projectiles.push(proj);
      });
    } else {
      const proj = new Projectile(p.x, p.y, baseVx, baseVy, damage, pierce);
      if (isOverdriveEnhanced) {
        (proj as any).isOverdriveEnhanced = true;
        (proj as any).overdriveLevel = odLevel;
      }
      if (isFused) {
        (proj as any).isFused = true;
      }
      state.projectiles.push(proj);
    }

    state.lastShotTime = currentTime;
    playSound('shoot');
  };

  // ==================== KILL ENEMY (with Area Explosion support) ====================
  const killEnemy = (state: GameState, enemyIndex: number, x: number, y: number) => {
    const e = state.enemies[enemyIndex];

    // Enhanced death by type + distinct sounds
    if (e.type === 'tank') {
      createExplosion(state, x, y, 16, '#c026ff');
      createExplosion(state, x, y, 8, '#ff88ff');
      addScreenShake(state, 5.5);
      playSound('enemyDeathTank');
    } else if (e.type === 'shooter') {
      createExplosion(state, x, y, 11, '#f9e900');
      addScreenShake(state, 2.8);
      playSound('enemyDeathShooter');
    } else {
      createExplosion(state, x, y, 9, COLORS.pink);
      addScreenShake(state, 2.2);
      playSound('hit');
    }

    state.orbs.push(new XPOrb(x + (Math.random() - 0.5) * 9, y + (Math.random() - 0.5) * 9));

    state.score += 18;
    state.kills += 1;
    playSound('hit');

    const now = Date.now();
    if (now - state.lastKillTime < 3000) {
      state.combo += 1;
    } else {
      state.combo = 1;
    }
    state.lastKillTime = now;

    // Area Explosion upgrade
    if (state.upgrades.areaExplosion > 0) {
      const radius = 68 + state.upgrades.areaExplosion * 6;
      const explosionDamage = 1 + Math.floor(state.upgrades.areaExplosion * 0.6);

      for (let j = state.enemies.length - 1; j >= 0; j--) {
        if (j === enemyIndex) continue;
        const other = state.enemies[j];
        if (dist2(x, y, other.x, other.y) < radius * radius) {
          other.health -= explosionDamage;
          if (other.health <= 0) {
            const ox = other.x, oy = other.y;
            state.enemies.splice(j, 1);
            createExplosion(state, ox, oy, 4, COLORS.pinkDark);
            addScreenShake(state, 1.8);
            state.orbs.push(new XPOrb(ox, oy));
            state.score += 9;
            state.kills += 1;
            state.lastKillTime = Date.now();
          }
        }
      }
    }

    state.enemies.splice(enemyIndex, 1);
  };

  const handleBossDefeat = (state: GameState) => {
    if (!state.boss) return;

    const b = state.boss;
    const isFinal = state.currentStage === 10;

    // Epic death particles (extra for final boss)
    createExplosion(state, b.x, b.y, isFinal ? 52 : 30, COLORS.cyan);
    createExplosion(state, b.x, b.y, isFinal ? 36 : 20, '#c026ff');
    createExplosion(state, b.x, b.y, isFinal ? 24 : 12, '#ff2a6d');
    addScreenShake(state, isFinal ? 28 : 18);

    // Big XP reward
    const xpReward = (isFinal ? 220 : 120) + state.currentStage * 45;
    state.xp += xpReward;
    addFloatingText(state, b.x, b.y - 30, `+${xpReward} XP`, COLORS.cyan, 18);

    if (isFinal) {
      addFloatingText(state, b.x, b.y - 52, 'PROTOCOL COMPLETE', '#c026ff', 16);
    }

    // Stage clear announcement
    playSound('stageClear');
    const reward = (isFinal ? 180 : 120) + state.currentStage * 55;
    state.xp += reward;

    // Trigger React Stage Clear screen with rewards
    const shardsEarned = (isFinal ? 55 : 25) + state.currentStage * 15;
    setStageClearRewards({ xp: reward, shards: shardsEarned });
    setShowStageClear(true);

    // Blockchain eligibility
    const finalScore = Math.floor(state.score);
    setLastRunScore(finalScore);
    updateMintEligibility(state.currentStage, finalScore);

    // Award Neon Shards (permanent currency)
    // Read from localStorage to avoid stale closure / state issues across stage continues
    const currentSaved = parseInt(localStorage.getItem('neonSurgeShards') || '0', 10);
    const newShards = currentSaved + shardsEarned;
    saveNeonShards(newShards);

    // ==================== NSH REWARD ====================
    const nshReward = BigInt((isFinal ? 80 : 40) + state.currentStage * 12);
    if (nshReward > 0n) {
      setPendingNshRewards(prev => prev + nshReward);
      // Show nice notification (will be picked up in UI)
      addFloatingText(state, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 60, `+${nshReward.toString()} NSH`, '#c026ff', 16);
    }

    state.boss = null;
    state.bossActive = false;
  };

  // ==================== COLLISIONS (with piercing + health + area) ====================
  const handleCollisions = (state: GameState) => {
    const p = state.player;

    // Projectiles vs Enemies
    const remainingProjectiles: Projectile[] = [];

    for (const proj of state.projectiles) {
      let hitCount = 0;
      const maxHits = proj.pierce + 1;

      // Boss collision first (higher priority)
      if (state.boss) {
        const b = state.boss;
        if (circleCollide(proj.x, proj.y, proj.radius, b.x, b.y, b.radius)) {
          b.health -= proj.damage;
          hitCount = maxHits; // consume projectile
          addScreenShake(state, 2.5);
          createImpactSparks(state, b.x, b.y, 4);

          if (b.health <= 0) {
            // Boss defeated!
            handleBossDefeat(state);
          }
        }
      }

      if (hitCount === 0) {
        for (let i = state.enemies.length - 1; i >= 0; i--) {
          const e = state.enemies[i];
          if (circleCollide(proj.x, proj.y, proj.radius, e.x, e.y, e.radius)) {
            hitCount++;
            e.health -= proj.damage;
            e.hitFlashUntil = Date.now() + 90;

            if (e.health <= 0) {
              killEnemy(state, i, e.x, e.y);
            } else {
              playSound('hit');
              createImpactSparks(state, e.x, e.y, 5);
              addFloatingText(state, e.x, e.y - 12, `-${proj.damage}`, '#ff99aa', 11);
            }

            if (hitCount >= maxHits) break;
          }
        }
      }

      if (proj.life > 0.02 && hitCount < maxHits) {
        remainingProjectiles.push(proj);
      }
    }

    state.projectiles = remainingProjectiles;

    // Player vs Enemies — Health + Invuln + Barrier/Plasma DR (core survival polish for fair late-game)
    const nowMs = Date.now();
    const nowSec = nowMs / 1000;
    for (const e of state.enemies) {
      if (circleCollide(p.x, p.y, p.radius - 1.5, e.x, e.y, e.radius - 1)) {
        if (nowSec < (state.player.invulnerableUntil || 0)) {
          break; // still i-framed
        }

        // Base 1 damage per contact (can be higher for tank enemies later)
        let dmg = 1;
        if (e.type === 'tank') dmg = 1.5;

        // Apply Barrier passive DR + Plasma Vest equipment DR
        const barrierDR = getPassiveMultiplier(state, 'barrier'); // returns e.g. 0.75 at Lv5 (1 - 0.05*5)
        const vestDR = 1 - (equipmentLevels.plasmaVest * 0.02);
        const finalDR = Math.max(0.35, barrierDR * vestDR); // hard floor so not invincible
        dmg = Math.max(1, Math.floor(dmg * finalDR));

        state.player.health -= dmg;
        state.player.hitFlashUntil = nowMs + 220;
        state.player.invulnerableUntil = nowSec + PLAYER_INVULN_DURATION;
        addScreenShake(state, 9);
        playSound('hit');

        // Visual feedback on player
        addFloatingText(state, p.x, p.y - 18, `-${dmg}`, '#ff3366', 13);
        createImpactSparks(state, p.x, p.y, 7);

        if (state.player.health <= 0) {
          triggerGameOver(state);
          return;
        }
        break; // one hit processed per frame
      }
    }

    // Player vs XP Orbs + Level Up check
    const remainingOrbs: XPOrb[] = [];

    // XP Magnet pulling effect
    const magnetLevel = state.skills.passive.xpMagnet || 0;
    const isMagnetEquipped = state.skills.equippedPassive.includes('xpMagnet');

    if (isMagnetEquipped && magnetLevel > 0) {
      const magnetRange = 17.5 + magnetLevel * 7.5;   // 25% of original radius range (user requested)
      const pullForce = 0.06 + magnetLevel * 0.035;   // full (normal) pulling power

      for (const orb of state.orbs) {
        const dx = p.x - orb.x;
        const dy = p.y - orb.y;
        const dist = Math.hypot(dx, dy);

        if (dist < magnetRange && dist > 4) {
          orb.x += dx * pullForce;
          orb.y += dy * pullForce;
        }
      }
    }

    for (const orb of state.orbs) {
      // Increased collection radius based on XP Magnet (scaled to 25% strength)
      const baseCollection = p.radius + 3;
      const magnetBonus = isMagnetEquipped ? (1 + (magnetLevel * 0.25) * 0.25) : 1; // 25% of original multiplier effect
      const collectionRadius = baseCollection * magnetBonus;

      if (circleCollide(p.x, p.y, collectionRadius, orb.x, orb.y, orb.radius)) {
        const xpValue = Math.floor(orb.value * (1 + equipmentLevels.neuralChip * 0.055));
        state.xp += xpValue;
        state.score += 3;
        playSound('collect');
        createOrbCollectEffect(state, orb.x, orb.y);
        addFloatingText(state, orb.x, orb.y - 8, `+${xpValue} XP`, COLORS.blue, 12);

        // Check for level up (PAUSE GAME + show UI immediately)
        if (state.xp >= state.xpToNextLevel && !state.pendingLevelUp) {
          state.pendingLevelUp = true;
          state.isPaused = true;
          state.pausedByVisibility = false; // ensure visibility logic doesn't interfere
          pauseStageTimer(state);   // Freeze the 3-minute stage timer
          playSound('level');
          triggerLevelUpUI();   // Direct React state update → no delay, no perceived freeze
        }
      } else {
        remainingOrbs.push(orb);
      }
    }
    state.orbs = remainingOrbs;
  };

  const triggerGameOver = (state: GameState) => {
    state.isRunning = false;
    state.isPaused = false;
    state.screenShake = 14;
    stopAmbientHum();
    playSound('death');

    // Final HUD update
    const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
    setHud({
      score: Math.floor(state.score),
      kills: state.kills,
      time: elapsed,
      xp: state.xp,
      level: state.level,
      xpToNextLevel: state.xpToNextLevel,
      isGameOver: true,
      isLevelingUp: false,
      combo: 0,
      currentStage: state.currentStage,
    });
  };

  // ==================== UPDATE ====================
  const update = (dt: number) => {
    const state = gameRef.current;
    if (!state || !state.isRunning || state.isPaused || !state.player) return;

    const currentTime = Date.now() / 1000;

    // Player (with dynamic speed from upgrades)
    const currentSpeed = getPlayerSpeed(state);
    const wasMoving = keysRef.current.size > 0;
    state.player.update(keysRef.current, dt, currentSpeed);

    // Maintain short player trail for afterimage
    if (wasMoving) {
      state.playerTrail.push({ x: state.player.x, y: state.player.y });
      if (state.playerTrail.length > 6) state.playerTrail.shift();
    } else {
      state.playerTrail = [];
    }

    // Enemies chase player (shooter variant also fires)
    for (const e of state.enemies) {
      e.update(state.player, dt, state);
    }

    // Projectiles
    for (const proj of state.projectiles) {
      proj.update(dt);
    }

    // Particles
    for (const part of state.particles) {
      part.update(dt);
    }
    state.particles = state.particles.filter((pr) => pr.life > 0.02);

    // Remove dead projectiles
    state.projectiles = state.projectiles.filter((pr) => pr.life > 0.02);

    // Spawning (dynamic interval based on time survived)
    const spawnInterval = getCurrentSpawnInterval(state);
    if (currentTime >= state.nextSpawnTime && state.enemies.length < state.enemyCap) {
      spawnEnemy(state);
      state.nextSpawnTime = currentTime + (spawnInterval / 1000) * (0.7 + Math.random() * 0.55);
    }

    // Difficulty ramp (15s + 30s spawn rate)
    handleDifficulty(state, currentTime);

    // === STRICT 3-MINUTE STAGE + BOSS SYSTEM ===
    const stageElapsed = getEffectiveStageElapsed(state);
    const STAGE_DURATION = 180; // 3 minutes

    if (!state.bossActive && stageElapsed >= STAGE_DURATION && !state.boss) {
      // Time to spawn boss — stop normal spawning
      state.bossActive = true;
      state.boss = new Boss(state.currentStage, CANVAS_WIDTH / 2, 80);

      // Warning effect
      addScreenShake(state, 12);
      addFloatingText(state, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 40, "BOSS INCOMING!", '#ff2a6d', 32);

      // Clear some normal enemies for drama
      state.enemies = state.enemies.slice(0, Math.floor(state.enemies.length * 0.3));
    }

    // Boss logic
    if (state.boss) {
      state.boss.update(state.player, dt, state);

      // Boss collision with player (high damage)
      const b = state.boss;
      if (circleCollide(state.player.x, state.player.y, state.player.radius + 4, b.x, b.y, b.radius - 8)) {
        state.player.hitFlashUntil = Date.now() + 200;
        addScreenShake(state, 11);
        triggerGameOver(state);
        return;
      }
    }

    // Auto attack (respects Rapid Fire + Triple Shot)
    tryAutoAttack(state, currentTime);

    // Collisions + scoring + orbs + death + level checks
    handleCollisions(state);

    // ==================== ACTIVE SKILL BEHAVIORS (distinct visual shooting) ====================
    const skills = state.skills;
    const now = Date.now();

    if (!state.player) return; // defensive guard - player can be missing in rare reset/transition frames

    // 1. ORBITAL DRONES — cyan rotating drones that fire small fast shots
    if (skills.active.orbitalDrones > 0 && skills.equippedActive.includes('orbitalDrones')) {
      const droneCount = 2 + Math.floor(skills.active.orbitalDrones / 2);
      const fireCooldown = Math.max(420, 820 - skills.active.orbitalDrones * 70);

      if (!state.lastDroneFire || now - state.lastDroneFire > fireCooldown) {
        state.lastDroneFire = now;

        for (let i = 0; i < droneCount; i++) {
          const angle = (now / 280) + (i * (Math.PI * 2 / droneCount));
          const radius = 32 + Math.sin(now / 180 + i) * 4;
          const dx = Math.cos(angle) * radius;
          const dy = Math.sin(angle) * radius;

          let target = state.enemies[0];
          if (target) {
            const tdx = target.x - (state.player.x + dx);
            const tdy = target.y - (state.player.y + dy);
            const tlen = Math.hypot(tdx, tdy) || 1;

            const pvx = (tdx / tlen) * 520;
            const pvy = (tdy / tlen) * 520;

            const dmg = 1 + Math.floor(skills.active.orbitalDrones * 0.6);
            const droneProj = new Projectile(state.player.x + dx, state.player.y + dy, pvx, pvy, dmg, 0);
            if (state.skills.fusedActives['orbitalDrones']) {
              (droneProj as any).isFusedDroneShot = true;
            }
            state.projectiles.push(droneProj);
          }
        }
      }
    }

    // 2. LASER BEAM — powerful piercing cyan beam toward nearest enemy
    if (skills.active.laserBeam > 0 && skills.equippedActive.includes('laserBeam')) {
      const cooldown = Math.max(1400, 2600 - skills.active.laserBeam * 220);
      if (!state.lastLaserTime || now - state.lastLaserTime > cooldown) {
        state.lastLaserTime = now;

        const target = state.enemies[0];
        if (target) {
          const dx = target.x - state.player.x;
          const dy = target.y - state.player.y;
          const len = Math.hypot(dx, dy) || 1;
          const dirX = dx / len;
          const dirY = dy / len;

          // Deal heavy piercing damage along the line
          const beamDamage = 4 + skills.active.laserBeam * 2.2;
          const beamLength = 620;

          // Damage enemies in a wide line
          if (state.player) {
            for (let i = state.enemies.length - 1; i >= 0; i--) {
              const e = state.enemies[i];
              if (!e) continue;
              const toEnemyX = e.x - state.player.x;
              const toEnemyY = e.y - state.player.y;
              const proj = toEnemyX * dirX + toEnemyY * dirY;
              if (proj > 0 && proj < beamLength) {
                const perpDist = Math.abs(toEnemyX * dirY - toEnemyY * dirX);
                if (perpDist < 28) {
                  e.health -= beamDamage;
                  e.hitFlashUntil = now + 120;
                  if (e.health <= 0) {
                    killEnemy(state, i, e.x, e.y);
                    i++; // compensate for splice
                  }
                }
              }
            }
          }

          // Visual: store beam data for drawing this frame
          const isLaserFused = !!state.skills.fusedActives['laserBeam'];
          (state as any).activeLaserBeam = {
            x: state.player.x,
            y: state.player.y,
            dirX,
            dirY,
            length: beamLength,
            power: skills.active.laserBeam,
            until: now + 180,
            isFused: isLaserFused
          };

          addScreenShake(state, 3 + skills.active.laserBeam * 0.6);
          playSound('shoot');
        }
      }
    }

    // 3. HOMING MISSILES — slower, strong seeking rockets
    if (skills.active.homingMissiles > 0 && skills.equippedActive.includes('homingMissiles')) {
      const cooldown = Math.max(950, 1850 - skills.active.homingMissiles * 160);
      if (!state.lastHomingTime || now - state.lastHomingTime > cooldown) {
        state.lastHomingTime = now;

        const count = 1 + Math.floor(skills.active.homingMissiles / 2);
        for (let m = 0; m < count; m++) {
          const spread = (m - (count - 1) / 2) * 0.6;
          const baseAngle = Math.atan2(
            (state.enemies[0]?.y || state.player.y + 100) - state.player.y,
            (state.enemies[0]?.x || state.player.x) - state.player.x
          ) + spread;

          const speed = 340;
          const vx = Math.cos(baseAngle) * speed;
          const vy = Math.sin(baseAngle) * speed;

          const missile = new Projectile(
            state.player.x, 
            state.player.y, 
            vx, vy, 
            3 + Math.floor(skills.active.homingMissiles * 0.8), 
            2
          );
          (missile as any).isHoming = true;
          (missile as any).homingStrength = 0.035 + skills.active.homingMissiles * 0.006;

          // Mark as fused for special visuals
          if (state.skills.fusedActives['homingMissiles']) {
            (missile as any).isFusedHoming = true;
          }
          state.projectiles.push(missile);
        }
      }
    }

    // 4. SHOCKWAVE BLAST — big expanding ring that damages everything nearby
    if (skills.active.shockwaveBlast > 0 && skills.equippedActive.includes('shockwaveBlast')) {
      const cooldown = Math.max(1350, 2400 - skills.active.shockwaveBlast * 180);
      if (!state.lastShockwaveTime || now - state.lastShockwaveTime > cooldown) {
        state.lastShockwaveTime = now;

        const radius = 82 + skills.active.shockwaveBlast * 17;
        const damage = 3.5 + skills.active.shockwaveBlast * 1.85; // slightly stronger early for good feel

        // Damage all enemies in range
        if (state.player) {
          for (let i = state.enemies.length - 1; i >= 0; i--) {
            const e = state.enemies[i];
            if (!e) continue;
            const dist = Math.hypot(e.x - state.player.x, e.y - state.player.y);
            if (dist < radius) {
              e.health -= damage;
              e.hitFlashUntil = now + 160;
              if (e.health <= 0) {
                killEnemy(state, i, e.x, e.y);
                i++; // compensate for splice in killEnemy during backward iteration
              }
            }
          }
        }

        // Visual shockwave (stored for draw)
        const isShockFused = !!state.skills.fusedActives['shockwaveBlast'];
        (state as any).activeShockwave = {
          x: state.player.x,
          y: state.player.y,
          maxRadius: radius,
          startTime: now,
          duration: 520,
          power: skills.active.shockwaveBlast,
          isFused: isShockFused
        };

        addScreenShake(state, 8 + skills.active.shockwaveBlast);
        playSound('hit');
      }
    }

    // 5. ENERGY DASH — periodic short dash with trail + damage
    if (skills.active.energyDash > 0 && skills.equippedActive.includes('energyDash')) {
      const cooldown = Math.max(1600, 2900 - skills.active.energyDash * 220);

      if (!state.isDashing && (!state.lastDashTime || now - state.lastDashTime > cooldown)) {
        // Start dash
        state.isDashing = true;
        state.dashUntil = now + 280;
        state.lastDashTime = now;

        // Strong forward momentum
        const moveX = (keysRef.current.has('d') || keysRef.current.has('arrowright')) ? 1 : 
                      (keysRef.current.has('a') || keysRef.current.has('arrowleft')) ? -1 : 0;
        const moveY = (keysRef.current.has('s') || keysRef.current.has('arrowdown')) ? 1 : 
                      (keysRef.current.has('w') || keysRef.current.has('arrowup')) ? -1 : -0.6;

        const len = Math.hypot(moveX, moveY) || 1;
        const dashSpeed = 920 + skills.active.energyDash * 80;

        // Apply instant velocity burst
        state.player.x += (moveX / len) * dashSpeed * 0.028;
        state.player.y += (moveY / len) * dashSpeed * 0.028;

        addScreenShake(state, 6);
      }

      if (state.isDashing && state.dashUntil && now > state.dashUntil) {
        state.isDashing = false;
        state.dashUntil = 0;
      }

      // While dashing, damage enemies we touch + spawn energy trail particles
      if (state.isDashing && state.player) {
        const dashDamage = 2 + skills.active.energyDash * 0.7;
        for (let i = state.enemies.length - 1; i >= 0; i--) {
          const e = state.enemies[i];
          if (!e) continue;
          const dist = Math.hypot(e.x - state.player.x, e.y - state.player.y);
          if (dist < 38) {
            e.health -= dashDamage;
            e.hitFlashUntil = now + 90;
            if (e.health <= 0) {
              killEnemy(state, i, e.x, e.y);
              i++; // compensate for splice
            }
          }
        }

        // Energy dash trail particles
        for (let p = 0; p < 3; p++) {
          state.particles.push(new Particle(
            state.player.x + (Math.random() - 0.5) * 18,
            state.player.y + (Math.random() - 0.5) * 18,
            (Math.random() - 0.5) * 80,
            (Math.random() - 0.5) * 80,
            '#00f9ff',
            { life: 0.35 + Math.random() * 0.25, size: 3.5 + Math.random() * 2.5, glow: true }
          ));
        }
      }
    }

    // 6. PULSE FIRE — hero's exclusive signature skill
    // At low levels (1-2) it only powers up your main shots (no extra bolt type).
    // Powerful independent bolts unlock starting at level 3 for clear progression.
    if (skills.active.neonOverdrive >= 3 && skills.equippedActive.includes('neonOverdrive')) {
      const cooldown = Math.max(1050, 1650 - skills.active.neonOverdrive * 105);
      if (!state.lastNeonOverdriveTime || now - state.lastNeonOverdriveTime > cooldown) {
        state.lastNeonOverdriveTime = now;

        // Find nearest enemy
        let target: Enemy | null = null;
        let minDist = Infinity;
        for (const e of state.enemies) {
          const d = dist2(state.player.x, state.player.y, e.x, e.y);
          if (d < minDist) {
            minDist = d;
            target = e;
          }
        }

        if (target) {
          const dx = target.x - state.player.x;
          const dy = target.y - state.player.y;
          const len = Math.hypot(dx, dy) || 1;

          const speed = 780;
          const vx = (dx / len) * speed;
          const vy = (dy / len) * speed;

          const damage = 7.5 + Math.floor(skills.active.neonOverdrive * 1.85); // signature power progression
          const pierce = skills.active.neonOverdrive >= 4 ? 1 : 0;

          const bolt = new Projectile(state.player.x, state.player.y, vx, vy, damage, pierce);
          (bolt as any).isOverdrive = true;
          (bolt as any).overdriveLevel = skills.active.neonOverdrive;
          state.projectiles.push(bolt);

          addScreenShake(state, 2.5 + skills.active.neonOverdrive * 0.5);
          playSound('shoot');
        }
      }
    }

    // 7. ASSAULT DRONE (Equipment) — companion that auto-fires at enemies. Scales with upgrade level.
    const hasDrone = equipmentLevels.assaultDrone > 0;
    if (hasDrone && state.enemies.length > 0) {
      const droneLv = equipmentLevels.assaultDrone;
      const droneCooldown = Math.max(680, 1150 - droneLv * 55);
      if (!state.lastAssaultDroneFire || now - state.lastAssaultDroneFire > droneCooldown) {
        state.lastAssaultDroneFire = now;

        // Find a good target (prefer closer)
        let target: Enemy | null = null;
        let minDist = Infinity;
        for (const e of state.enemies) {
          const d = dist2(state.player.x, state.player.y, e.x, e.y);
          if (d < minDist) { minDist = d; target = e; }
        }
        if (target) {
          const dx = target.x - state.player.x;
          const dy = target.y - state.player.y;
          const len = Math.hypot(dx, dy) || 1;
          const speed = 620;
          const vx = (dx / len) * speed;
          const vy = (dy / len) * speed;

          const dmg = 1.6 + droneLv * 0.55;
          const proj = new Projectile(state.player.x + (Math.random()-0.5)*6, state.player.y - 8, vx, vy, dmg, 0);
          (proj as any).isAssaultDroneShot = true;
          state.projectiles.push(proj);

          // Small visual tracer from "drone" position above player
          state.particles.push(new Particle(state.player.x, state.player.y - 9, vx * 0.15, vy * 0.15, '#a5f3fc', { life: 0.22, size: 2.1, glow: true }));
        }
      }
    }

    // Decay screen shake
    if (state.screenShake > 0.1) {
      state.screenShake *= 0.86;
    } else {
      state.screenShake = 0;
    }

    // Floating texts
    for (const ft of state.floatingTexts) ft.update(dt);
    state.floatingTexts = state.floatingTexts.filter(ft => ft.life > 0.05);

    // Occasional HUD sync
    if (currentTime - hudUpdateRef.current > 0.09) {
      hudUpdateRef.current = currentTime;
      const elapsed = Math.floor((Date.now() - state.startTime) / 1000);

      setHud((prev) => {
        const next = {
          score: Math.floor(state.score),
          kills: state.kills,
          time: elapsed,
          xp: state.xp,
          level: state.level,
          xpToNextLevel: state.xpToNextLevel,
          isGameOver: !state.isRunning,
          isLevelingUp: state.pendingLevelUp,
          combo: (Date.now() - state.lastKillTime < 3000) ? state.combo : 0,
          currentStage: state.currentStage,
        };
        if (
          prev.score !== next.score ||
          prev.kills !== next.kills ||
          prev.time !== next.time ||
          prev.xp !== next.xp ||
          prev.level !== next.level ||
          prev.isLevelingUp !== next.isLevelingUp
        ) {
          return next;
        }
        return prev;
      });
    }
  };

  // ==================== RENDER / DRAW ====================
  const draw = () => {
    const canvas = canvasRef.current;
    const state = gameRef.current;
    if (!canvas || !state) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    // Clear
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Subtle vignette + neon border
    const grad = ctx.createRadialGradient(
      CANVAS_WIDTH/2, CANVAS_HEIGHT/2, Math.min(CANVAS_WIDTH, CANVAS_HEIGHT) * 0.35,
      CANVAS_WIDTH/2, CANVAS_HEIGHT/2, Math.max(CANVAS_WIDTH, CANVAS_HEIGHT) * 0.72
    );
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Neon frame border
    ctx.strokeStyle = 'rgba(0, 249, 255, 0.15)';
    ctx.lineWidth = 3;
    ctx.strokeRect(6, 6, CANVAS_WIDTH - 12, CANVAS_HEIGHT - 12);

    // Screen shake
    ctx.save();
    if (state.screenShake > 0.5) {
      const shakeX = (Math.random() - 0.5) * state.screenShake * 1.8;
      const shakeY = (Math.random() - 0.5) * state.screenShake * 1.8;
      ctx.translate(shakeX, shakeY);
    }

    // Subtle cyberpunk grid
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    const gridSize = 42;
    for (let x = gridSize; x < CANVAS_WIDTH; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_HEIGHT);
      ctx.stroke();
    }
    for (let y = gridSize; y < CANVAS_HEIGHT; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_WIDTH, y);
      ctx.stroke();
    }

    // Faint horizon accent lines (city vibe)
    ctx.strokeStyle = 'rgba(26, 26, 37, 0.6)';
    ctx.lineWidth = 2;
    for (let i = 1; i < 5; i++) {
      const yy = 110 + i * 95;
      ctx.beginPath();
      ctx.moveTo(0, yy);
      ctx.lineTo(CANVAS_WIDTH, yy + (i - 2) * 8);
      ctx.stroke();
    }

    // ===== XP ORBS (glowing blue) =====
    const t = Date.now() / 1000;
    for (const orb of state.orbs) {
      const pulse = Math.sin(t * 5.4 + orb.x) * 0.9 + 1.15;
      const r = orb.radius * pulse;

      // Outer glow
      ctx.save();
      ctx.shadowColor = COLORS.blue;
      ctx.shadowBlur = 18;
      ctx.fillStyle = COLORS.blue;
      ctx.beginPath();
      ctx.arc(orb.x, orb.y, r * 1.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Core
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(orb.x, orb.y, r * 0.55, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = COLORS.cyan;
      ctx.beginPath();
      ctx.arc(orb.x, orb.y, r * 0.32, 0, Math.PI * 2);
      ctx.fill();
    }

    // ===== ENEMIES (3 distinct types) =====
    for (const e of state.enemies) {
      const isFlashing = e.hitFlashUntil > Date.now();

      if (e.type === 'tank') {
        // Tank - big purple brute
        ctx.save();
        ctx.shadowColor = '#c026ff';
        ctx.shadowBlur = 22;
        ctx.fillStyle = isFlashing ? '#ffffff' : '#4a1a6b';
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.radius * 1.25, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.fillStyle = isFlashing ? '#ffeeee' : '#2a0f18';
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.radius * 0.7, 0, Math.PI * 2);
        ctx.fill();

        // Heavy armor plates
        ctx.strokeStyle = isFlashing ? '#ffffff' : '#aa66ff';
        ctx.lineWidth = 2.5;
        for (let i = 0; i < 6; i++) {
          const ang = (i * Math.PI * 2) / 6;
          ctx.beginPath();
          ctx.moveTo(e.x + Math.cos(ang) * (e.radius * 0.65), e.y + Math.sin(ang) * (e.radius * 0.65));
          ctx.lineTo(e.x + Math.cos(ang) * (e.radius * 1.1), e.y + Math.sin(ang) * (e.radius * 1.1));
          ctx.stroke();
        }

        // Health bar for Tank
        const hpRatio = e.health / e.maxHealth;
        ctx.fillStyle = '#111';
        ctx.fillRect(e.x - 14, e.y - e.radius - 11, 28, 5);
        ctx.fillStyle = hpRatio > 0.5 ? '#c026ff' : '#ff2a6d';
        ctx.fillRect(e.x - 14, e.y - e.radius - 11, 28 * hpRatio, 5);

      } else if (e.type === 'shooter') {
        // Shooter - yellow, angular
        ctx.save();
        ctx.shadowColor = '#f9e900';
        ctx.shadowBlur = 18;
        ctx.fillStyle = isFlashing ? '#ffffff' : '#665500';
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.radius * 1.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.fillStyle = isFlashing ? '#ffffcc' : '#332200';
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.radius * 0.6, 0, Math.PI * 2);
        ctx.fill();

        // Turret look
        ctx.strokeStyle = isFlashing ? '#ffffff' : '#ffcc00';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.radius * 0.85, 0, Math.PI * 2);
        ctx.stroke();

        // Health bar
        const hpRatio = e.health / e.maxHealth;
        ctx.fillStyle = '#111';
        ctx.fillRect(e.x - 10, e.y - e.radius - 11, 20, 4);
        ctx.fillStyle = '#ffcc00';
        ctx.fillRect(e.x - 10, e.y - e.radius - 11, 20 * hpRatio, 4);

      } else {
        // Drone - classic fast red
        ctx.save();
        ctx.shadowColor = COLORS.pink;
        ctx.shadowBlur = 19;
        ctx.fillStyle = COLORS.pinkDark;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.radius * 1.45, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.fillStyle = isFlashing ? '#ffffff' : COLORS.enemy;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = isFlashing ? '#ffeeee' : '#2a0f18';
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.radius * 0.55, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#ff88aa';
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 4; i++) {
          const ang = (i * Math.PI * 2) / 4;
          ctx.beginPath();
          ctx.moveTo(e.x + Math.cos(ang) * (e.radius - 1), e.y + Math.sin(ang) * (e.radius - 1));
          ctx.lineTo(e.x + Math.cos(ang) * (e.radius + 4.5), e.y + Math.sin(ang) * (e.radius + 4.5));
          ctx.stroke();
        }
      }
    }

    // Draw Boss if active
    if (state.boss) {
      const b = state.boss;
      const isFlashing = (Date.now() % 180) < 90 && b.health < b.maxHealth * 0.6;

      ctx.save();
      ctx.shadowColor = '#ff2a6d';
      ctx.shadowBlur = 35;
      ctx.fillStyle = isFlashing ? '#ffffff' : '#3a0a1f';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = isFlashing ? '#ffaaaa' : '#661133';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius * 0.65, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = isFlashing ? '#ff6666' : '#ff2a6d';
      ctx.lineWidth = 4;
      for (let i = 0; i < 8; i++) {
        const ang = (i * Math.PI * 2) / 8 + (Date.now() / 800);
        ctx.beginPath();
        ctx.moveTo(b.x + Math.cos(ang) * b.radius * 0.7, b.y + Math.sin(ang) * b.radius * 0.7);
        ctx.lineTo(b.x + Math.cos(ang) * (b.radius + 14), b.y + Math.sin(ang) * (b.radius + 14));
        ctx.stroke();
      }
    }

    // ===== PROJECTILES (neon energy bolts) =====
    for (const proj of state.projectiles) {
      const isHoming = (proj as any).isHoming;
      const len = isHoming ? 26 : 18;
      const dx = (proj.vx / PROJECTILE_SPEED) * len;
      const dy = (proj.vy / PROJECTILE_SPEED) * len;

      if (isHoming) {
        const isFusedHoming = (proj as any).isFusedHoming;

        if (isFusedHoming) {
          // FUSED HOMING MISSILES (Aegis Missiles) — premium purple/cyan with shield-like effects
          ctx.save();
          ctx.shadowColor = '#c026ff';
          ctx.shadowBlur = 32;

          // Thick fusion body with purple
          ctx.strokeStyle = 'rgba(192, 38, 255, 0.9)';
          ctx.lineWidth = 8;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(proj.x - dx * 0.55, proj.y - dy * 0.55);
          ctx.lineTo(proj.x + dx * 0.95, proj.y + dy * 0.95);
          ctx.stroke();

          // Cyan energy core layer
          ctx.shadowColor = '#00f9ff';
          ctx.shadowBlur = 18;
          ctx.strokeStyle = 'rgba(0, 249, 255, 0.7)';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(proj.x - dx * 0.4, proj.y - dy * 0.4);
          ctx.lineTo(proj.x + dx * 0.88, proj.y + dy * 0.88);
          ctx.stroke();

          // Bright white/magenta tip with shield spark
          ctx.fillStyle = '#ffccff';
          ctx.beginPath();
          ctx.arc(proj.x + dx * 0.15, proj.y + dy * 0.15, 4.5, 0, Math.PI * 2);
          ctx.fill();

          // Extra energy rings for "Aegis" shield feel
          ctx.strokeStyle = 'rgba(255, 200, 255, 0.6)';
          ctx.lineWidth = 2;
          for (let r = 0; r < 2; r++) {
            const ringDist = 0.25 + r * 0.15;
            ctx.beginPath();
            ctx.arc(proj.x + dx * ringDist, proj.y + dy * ringDist, 3 + r, 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.restore();
        } else {
          // Normal HOMING MISSILES — orange/red with thick body + trail
          ctx.save();
          ctx.shadowColor = '#ff6600';
          ctx.shadowBlur = 22;

          // Thick glowing body
          ctx.strokeStyle = 'rgba(255, 140, 40, 0.85)';
          ctx.lineWidth = 6.5;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(proj.x - dx * 0.5, proj.y - dy * 0.5);
          ctx.lineTo(proj.x + dx * 0.9, proj.y + dy * 0.9);
          ctx.stroke();

          // Hot core
          ctx.strokeStyle = '#ffdd88';
          ctx.lineWidth = 2.8;
          ctx.beginPath();
          ctx.moveTo(proj.x - dx * 0.3, proj.y - dy * 0.3);
          ctx.lineTo(proj.x + dx * 0.85, proj.y + dy * 0.85);
          ctx.stroke();

          // Bright tip
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(proj.x + dx * 0.2, proj.y + dy * 0.2, 3.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      } else if ((proj as any).isOverdrive) {
        // NEON OVERDRIVE (hero exclusive) — thick, intense, high-impact energy bolt
        const odLevel = (proj as any).overdriveLevel || 1;
        const extraGlow = odLevel * 3;
        const trailLen = len * (1.35 + odLevel * 0.06);

        ctx.save();
        ctx.shadowColor = '#00f9ff';
        ctx.shadowBlur = 32 + extraGlow;

        // Outer intense glow (very bright)
        ctx.strokeStyle = 'rgba(120, 255, 255, 0.35)';
        ctx.lineWidth = 13 + odLevel * 0.8;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(proj.x - dx * 0.7, proj.y - dy * 0.7);
        ctx.lineTo(proj.x + dx * trailLen, proj.y + dy * trailLen);
        ctx.stroke();

        // Main thick cyan-white body
        ctx.strokeStyle = 'rgba(180, 255, 255, 0.95)';
        ctx.lineWidth = 7.5 + odLevel * 0.7;
        ctx.beginPath();
        ctx.moveTo(proj.x - dx * 0.55, proj.y - dy * 0.55);
        ctx.lineTo(proj.x + dx * (trailLen - 0.05), proj.y + dy * (trailLen - 0.05));
        ctx.stroke();

        // Brilliant white core
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3.2 + odLevel * 0.35;
        ctx.beginPath();
        ctx.moveTo(proj.x - dx * 0.35, proj.y - dy * 0.35);
        ctx.lineTo(proj.x + dx * (trailLen - 0.12), proj.y + dy * (trailLen - 0.12));
        ctx.stroke();

        // Sharp bright tip
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(proj.x + dx * 0.15, proj.y + dy * 0.15, 3.8 + odLevel * 0.25, 0, Math.PI * 2);
        ctx.fill();

        // Extra energy rings near tip for "overdrive" feel
        ctx.strokeStyle = 'rgba(200, 255, 255, 0.6)';
        ctx.lineWidth = 1.5;
        for (let r = 0; r < 2; r++) {
          const ringDist = 0.22 + r * 0.12;
          ctx.beginPath();
          ctx.arc(proj.x + dx * ringDist, proj.y + dy * ringDist, 2.2 + r * 0.8, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      } else {
        const isEnhanced = (proj as any).isOverdriveEnhanced;
        const isFusedShot = (proj as any).isFused;
        const enhLevel = (proj as any).overdriveLevel || 1;

        if (isFusedShot) {
          // FUSED PULSE FIRE — dramatically more awesome fusion visuals (purple + cyan theme)
          const extra = (enhLevel - 1) * 1.2;
          const trailLen = len * (1.5 + enhLevel * 0.08);

          ctx.save();
          ctx.shadowColor = '#c026ff';
          ctx.shadowBlur = 38 + extra * 2;

          // Outer intense purple fusion glow
          ctx.strokeStyle = 'rgba(192, 38, 255, 0.35)';
          ctx.lineWidth = 14 + extra * 1.2;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(proj.x - dx * 0.8, proj.y - dy * 0.8);
          ctx.lineTo(proj.x + dx * trailLen, proj.y + dy * trailLen);
          ctx.stroke();
          ctx.restore();

          // Secondary cyan fusion layer
          ctx.save();
          ctx.shadowColor = '#00f9ff';
          ctx.shadowBlur = 26 + extra;
          ctx.strokeStyle = 'rgba(0, 249, 255, 0.55)';
          ctx.lineWidth = 8 + extra * 0.9;
          ctx.beginPath();
          ctx.moveTo(proj.x - dx * 0.6, proj.y - dy * 0.6);
          ctx.lineTo(proj.x + dx * (trailLen - 0.05), proj.y + dy * (trailLen - 0.05));
          ctx.stroke();
          ctx.restore();

          // Core bright fusion body (white + magenta mix)
          ctx.strokeStyle = 'rgba(255, 200, 255, 0.95)';
          ctx.lineWidth = 4.5 + extra * 0.6;
          ctx.beginPath();
          ctx.moveTo(proj.x - dx * 0.45, proj.y - dy * 0.45);
          ctx.lineTo(proj.x + dx * (trailLen - 0.1), proj.y + dy * (trailLen - 0.1));
          ctx.stroke();

          // Brilliant white/magenta core
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2.2 + extra * 0.4;
          ctx.beginPath();
          ctx.moveTo(proj.x - dx * 0.3, proj.y - dy * 0.3);
          ctx.lineTo(proj.x + dx * (trailLen - 0.15), proj.y + dy * (trailLen - 0.15));
          ctx.stroke();

          // Sharp glowing tip with fusion spark
          ctx.fillStyle = '#ffccff';
          ctx.beginPath();
          ctx.arc(proj.x + dx * 0.12, proj.y + dy * 0.12, 3.2 + extra * 0.3, 0, Math.PI * 2);
          ctx.fill();

          // Extra fusion energy rings / accents
          ctx.strokeStyle = 'rgba(255, 100, 255, 0.7)';
          ctx.lineWidth = 1.8;
          for (let r = 0; r < 3; r++) {
            const ringDist = 0.18 + r * 0.14;
            ctx.beginPath();
            ctx.arc(proj.x + dx * ringDist, proj.y + dy * ringDist, 2.8 + r * 0.9 + extra * 0.2, 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.restore();

        } else if (isEnhanced) {
          // Pulse Fire enhanced shots (cooler starter look, same family)
          const extra = (enhLevel - 1) * 0.8;

          ctx.save();
          ctx.shadowColor = '#00f9ff';
          ctx.shadowBlur = 22 + extra;

          // Stronger outer glow
          ctx.strokeStyle = 'rgba(100, 255, 255, 0.45)';
          ctx.lineWidth = 5.5 + extra;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(proj.x - dx * 0.65, proj.y - dy * 0.65);
          ctx.lineTo(proj.x + dx * 1.12, proj.y + dy * 1.12);
          ctx.stroke();
          ctx.restore();

          // Bright main body
          ctx.save();
          ctx.shadowColor = '#a0ffff';
          ctx.shadowBlur = 10;
          ctx.strokeStyle = 'rgba(180, 255, 255, 0.95)';
          ctx.lineWidth = 3.2 + extra * 0.5;
          ctx.beginPath();
          ctx.moveTo(proj.x - dx * 0.5, proj.y - dy * 0.5);
          ctx.lineTo(proj.x + dx * 1.0, proj.y + dy * 1.0);
          ctx.stroke();
          ctx.restore();

          // White hot core
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(proj.x - dx * 0.3, proj.y - dy * 0.3);
          ctx.lineTo(proj.x + dx * 0.92, proj.y + dy * 0.92);
          ctx.stroke();

          // Bright tip + small energy accent
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(proj.x + dx * 0.18, proj.y + dy * 0.18, 2.1 + extra * 0.2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Normal cyan player projectiles
          ctx.save();
          ctx.shadowColor = COLORS.cyan;
          ctx.shadowBlur = 16;
          ctx.strokeStyle = 'rgba(0, 249, 255, 0.55)';
          ctx.lineWidth = 4.5;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(proj.x - dx * 0.6, proj.y - dy * 0.6);
          ctx.lineTo(proj.x + dx * 1.05, proj.y + dy * 1.05);
          ctx.stroke();
          ctx.restore();

          ctx.save();
          ctx.shadowColor = '#ffffff';
          ctx.shadowBlur = 4;
          ctx.strokeStyle = COLORS.cyan;
          ctx.lineWidth = 1.8;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(proj.x - dx * 0.25, proj.y - dy * 0.25);
          ctx.lineTo(proj.x + dx * 0.95, proj.y + dy * 0.95);
          ctx.stroke();
          ctx.restore();

          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(proj.x, proj.y, proj.radius * 0.9, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // ===== PARTICLES =====
    for (const pr of state.particles) {
      const alpha = Math.max(0.1, pr.life / 0.55);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = pr.color;
      ctx.fillRect(pr.x - pr.size / 2, pr.y - pr.size / 2, pr.size, pr.size);
    }
    ctx.globalAlpha = 1;

    // ===== FLOATING TEXT (damage +XP) =====
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const ft of state.floatingTexts) {
      const alpha = Math.max(0.1, ft.life / 0.85);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = ft.color;
      ctx.font = `bold ${ft.size}px var(--font-geist-mono)`;
      ctx.fillText(ft.text, ft.x, ft.y);
    }
    ctx.globalAlpha = 1;

    // ===== PLAYER (Hero Polish) =====
    const player = state.player;
    const pulseT = Date.now() / 1000;
    const pulse = 1 + Math.sin(pulseT * 4.2) * 0.08;
    const isHit = player.hitFlashUntil > Date.now();

    // Movement trail (afterimages)
    ctx.globalAlpha = 0.35;
    for (let i = 0; i < state.playerTrail.length; i++) {
      const tPos = state.playerTrail[i];
      const alpha = (i / state.playerTrail.length) * 0.6;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = isHit ? '#ff6666' : COLORS.cyan;
      ctx.beginPath();
      ctx.arc(tPos.x, tPos.y, player.radius * (0.6 + i * 0.05), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Glowing neon outline
    ctx.save();
    ctx.shadowColor = isHit ? '#ff2222' : COLORS.cyan;
    ctx.shadowBlur = 28;
    ctx.strokeStyle = isHit ? '#ff4444' : COLORS.cyan;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.radius * 1.55, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Outer pulse glow
    ctx.save();
    ctx.shadowColor = isHit ? '#ff2222' : COLORS.cyan;
    ctx.shadowBlur = 32;
    ctx.fillStyle = isHit 
      ? 'rgba(255, 60, 60, 0.45)' 
      : `rgba(0, 249, 255, ${0.22 + Math.sin(pulseT * 3.8) * 0.08})`;
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.radius * 2.35 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Thruster particles when moving
    const isMoving = state.playerTrail.length > 0;
    if (isMoving) {
      const dirX = state.playerTrail.length > 1 
        ? state.playerTrail[state.playerTrail.length - 2].x - player.x 
        : 0;
      const dirY = state.playerTrail.length > 1 
        ? state.playerTrail[state.playerTrail.length - 2].y - player.y 
        : 0;
      const len = Math.hypot(dirX, dirY) || 1;
      const backX = player.x - (dirX / len) * 14;
      const backY = player.y - (dirY / len) * 14;

      for (let i = 0; i < 3; i++) {
        const spread = (i - 1) * 0.6;
        const vx = - (dirX / len) * (65 + Math.random() * 35) + spread * 25;
        const vy = - (dirY / len) * (65 + Math.random() * 35) + spread * 25;
        state.particles.push(new Particle(backX, backY, vx, vy, COLORS.cyan, { 
          life: 0.18 + Math.random() * 0.12, 
          size: 1.8 + Math.random() * 1.4,
          friction: 0.82,
          glow: true 
        }));
      }
    }

    // Layered glows
    ctx.save();
    ctx.shadowColor = isHit ? '#ff4444' : COLORS.cyan;
    ctx.shadowBlur = 22;
    ctx.fillStyle = isHit ? 'rgba(255, 80, 80, 0.5)' : 'rgba(0, 249, 255, 0.38)';
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.radius * 1.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.shadowColor = isHit ? '#ff2222' : COLORS.cyan;
    ctx.shadowBlur = 13;
    ctx.fillStyle = isHit ? '#ff6666' : COLORS.cyanDark;
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.radius * 1.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Core body (flashes red on hit)
    ctx.fillStyle = isHit ? '#ffaaaa' : '#e6fdff';
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
    ctx.fill();

    // Inner bright core
    ctx.fillStyle = isHit ? '#ff4444' : COLORS.cyan;
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.radius * 0.52, 0, Math.PI * 2);
    ctx.fill();

    // Hot spot
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(player.x - 2.8, player.y - 2.8, 2.4, 0, Math.PI * 2);
    ctx.fill();

    // Invulnerability shield ring (strong visual feedback when i-framed after hit)
    const invUntil = player.invulnerableUntil || 0;
    const drawNowSec = Date.now() / 1000;
    if (drawNowSec < invUntil) {
      const invLeft = invUntil - drawNowSec;
      const shieldPulse = 0.6 + Math.sin(pulseT * 18) * 0.35;
      ctx.save();
      ctx.shadowColor = '#00f9ff';
      ctx.shadowBlur = 18;
      ctx.strokeStyle = `rgba(0, 249, 255, ${0.65 + shieldPulse * 0.3})`;
      ctx.lineWidth = 2.5 + Math.sin(pulseT * 22) * 0.8;
      ctx.beginPath();
      ctx.arc(player.x, player.y, player.radius * (2.1 + Math.sin(pulseT * 14) * 0.15), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Compact health pips above player (shows when not at full HP or stage >= 4 for awareness)
    if (player.health < player.maxHealth || state.currentStage >= 4) {
      const pipCount = player.maxHealth;
      const pipW = 5.5;
      const startX = player.x - (pipCount * (pipW + 1.5)) / 2 + pipW / 2;
      for (let h = 0; h < pipCount; h++) {
        const filled = h < player.health;
        ctx.fillStyle = filled ? (h === 0 && player.health === 1 ? '#ff3366' : '#00f9ff') : 'rgba(60, 60, 80, 0.6)';
        ctx.fillRect(startX + h * (pipW + 1.5) - pipW / 2, player.y - player.radius - 13, pipW, 3.2);
      }
    }

    // Assault Drone companion visual (when purchased) — small bobbling support drone
    if (equipmentLevels.assaultDrone > 0) {
      const dLv = equipmentLevels.assaultDrone;
      const bob = Math.sin(pulseT * 5.5) * 2.5;
      const droneX = player.x - 22;
      const droneY = player.y - 22 + bob;
      ctx.save();
      ctx.shadowColor = dLv >= 6 ? '#c026ff' : COLORS.cyan;
      ctx.shadowBlur = 10 + dLv * 0.6;
      ctx.fillStyle = dLv >= 6 ? '#c026ff' : '#67f6ff';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2;
      // Triangle body
      ctx.beginPath();
      ctx.moveTo(droneX, droneY - 5);
      ctx.lineTo(droneX - 5, droneY + 4);
      ctx.lineTo(droneX + 5, droneY + 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Tiny cannon glow
      ctx.fillStyle = '#fff';
      ctx.fillRect(droneX - 1, droneY + 3, 2, 3);
      ctx.restore();
    }

    ctx.restore(); // end screen shake

    // ==================== ACTIVE SKILL VISUAL EFFECTS ====================

    // 1. ORBITAL DRONES — draw actual rotating drones around player
    const droneLevel = state.skills.active.orbitalDrones || 0;
    if (droneLevel > 0 && state.skills.equippedActive.includes('orbitalDrones')) {
      const droneCount = 2 + Math.floor(droneLevel / 2);
      const t = Date.now() / 260;
      const isDroneFused = !!state.skills.fusedActives['orbitalDrones'];

      for (let i = 0; i < droneCount; i++) {
        const angle = t + (i * (Math.PI * 2 / droneCount));
        const radius = 34 + Math.sin(t * 1.6 + i) * 3.5;
        const dx = Math.cos(angle) * radius;
        const dy = Math.sin(angle) * radius;
        const dx2 = Math.cos(angle) * (radius - 6);
        const dy2 = Math.sin(angle) * (radius - 6);

        if (isDroneFused) {
          // FUSED DRONES (Explosive Drones) - dramatic purple fusion look
          ctx.save();
          ctx.shadowColor = '#c026ff';
          ctx.shadowBlur = 24;

          // Outer explosive purple ring
          ctx.strokeStyle = 'rgba(192, 38, 255, 0.8)';
          ctx.lineWidth = 3.5;
          ctx.beginPath();
          ctx.arc(player.x + dx, player.y + dy, 9, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();

          // Drone body with fusion tint
          ctx.fillStyle = '#d080ff';
          ctx.beginPath();
          ctx.arc(player.x + dx, player.y + dy, 6, 0, Math.PI * 2);
          ctx.fill();

          // Explosive inner core
          ctx.fillStyle = '#ffccff';
          ctx.beginPath();
          ctx.arc(player.x + dx2, player.y + dy2, 3, 0, Math.PI * 2);
          ctx.fill();

          // Fusion energy lines to player
          ctx.strokeStyle = 'rgba(255, 100, 255, 0.5)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(player.x, player.y);
          ctx.lineTo(player.x + dx * 0.65, player.y + dy * 0.65);
          ctx.stroke();
        } else {
          // Normal Drones
          // Outer glow ring
          ctx.save();
          ctx.shadowColor = '#00f9ff';
          ctx.shadowBlur = 16;
          ctx.strokeStyle = 'rgba(0, 249, 255, 0.65)';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(player.x + dx, player.y + dy, 7, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();

          // Drone body
          ctx.fillStyle = '#a0f0ff';
          ctx.beginPath();
          ctx.arc(player.x + dx, player.y + dy, 5, 0, Math.PI * 2);
          ctx.fill();

          // Inner bright core
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(player.x + dx2, player.y + dy2, 2.2, 0, Math.PI * 2);
          ctx.fill();

          // Small connecting energy line to player
          ctx.strokeStyle = 'rgba(0, 249, 255, 0.25)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(player.x, player.y);
          ctx.lineTo(player.x + dx * 0.6, player.y + dy * 0.6);
          ctx.stroke();
        }
      }
    }

    // 2. LASER BEAM visual (thick glowing beam)
    const laser = (state as any).activeLaserBeam;
    if (laser && Date.now() < laser.until) {
      const alpha = Math.max(0.2, (laser.until - Date.now()) / 180);
      const beamWidth = 5 + laser.power * 1.8;
      const isFused = laser.isFused;

      ctx.save();

      if (isFused) {
        // FUSED LASER (Siphon Laser) - dramatic purple/cyan fusion beam
        ctx.shadowColor = '#c026ff';
        ctx.shadowBlur = 42;

        // Outer intense purple fusion glow
        ctx.strokeStyle = `rgba(192, 38, 255, ${alpha * 0.45})`;
        ctx.lineWidth = beamWidth * 2.2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(laser.x, laser.y);
        ctx.lineTo(laser.x + laser.dirX * laser.length, laser.y + laser.dirY * laser.length);
        ctx.stroke();

        // Secondary cyan energy layer
        ctx.shadowColor = '#00f9ff';
        ctx.shadowBlur = 32;
        ctx.strokeStyle = `rgba(0, 249, 255, ${alpha * 0.6})`;
        ctx.lineWidth = beamWidth * 1.4;
        ctx.beginPath();
        ctx.moveTo(laser.x, laser.y);
        ctx.lineTo(laser.x + laser.dirX * laser.length, laser.y + laser.dirY * laser.length);
        ctx.stroke();

        // Core bright fusion beam
        ctx.strokeStyle = `rgba(255, 200, 255, ${alpha * 0.95})`;
        ctx.lineWidth = beamWidth * 0.7;
        ctx.beginPath();
        ctx.moveTo(laser.x, laser.y);
        ctx.lineTo(laser.x + laser.dirX * laser.length, laser.y + laser.dirY * laser.length);
        ctx.stroke();

        // Inner white hot core
        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.9})`;
        ctx.lineWidth = Math.max(2, beamWidth * 0.25);
        ctx.beginPath();
        ctx.moveTo(laser.x, laser.y);
        ctx.lineTo(laser.x + laser.dirX * laser.length, laser.y + laser.dirY * laser.length);
        ctx.stroke();
      } else {
        // Normal Laser Beam
        ctx.shadowColor = '#00f9ff';
        ctx.shadowBlur = 28;

        // Main bright beam
        ctx.strokeStyle = `rgba(180, 255, 255, ${alpha * 0.95})`;
        ctx.lineWidth = beamWidth;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(laser.x, laser.y);
        ctx.lineTo(laser.x + laser.dirX * laser.length, laser.y + laser.dirY * laser.length);
        ctx.stroke();

        // Inner white core
        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.9})`;
        ctx.lineWidth = Math.max(1.5, beamWidth * 0.35);
        ctx.beginPath();
        ctx.moveTo(laser.x, laser.y);
        ctx.lineTo(laser.x + laser.dirX * laser.length, laser.y + laser.dirY * laser.length);
        ctx.stroke();
      }

      ctx.restore();
    }

    // 3. SHOCKWAVE BLAST — expanding rings
    const shock = (state as any).activeShockwave;
    if (shock) {
      const elapsed = Date.now() - shock.startTime;
      if (elapsed < shock.duration) {
        const progress = elapsed / shock.duration;
        const currentR = shock.maxRadius * progress;
        const alpha = (1 - progress) * 0.85;
        const isFused = shock.isFused;

        ctx.save();

        if (isFused) {
          // FUSED SHOCKWAVE (Rapid Shockwaves) - dramatic purple/cyan fusion rings
          ctx.shadowColor = '#c026ff';
          ctx.shadowBlur = 32;

          // Multiple intense fusion rings
          for (let r = 0; r < 5; r++) {
            const ringR = currentR * (0.6 + r * 0.18);
            const ringAlpha = alpha * (0.95 - r * 0.15);

            // Purple outer layer
            ctx.strokeStyle = `rgba(192, 38, 255, ${ringAlpha})`;
            ctx.lineWidth = 5.5 - r * 0.4;
            ctx.beginPath();
            ctx.arc(shock.x, shock.y, ringR, 0, Math.PI * 2);
            ctx.stroke();

            // Cyan inner highlight
            if (r % 2 === 0) {
              ctx.strokeStyle = `rgba(0, 249, 255, ${ringAlpha * 0.7})`;
              ctx.lineWidth = 2.5;
              ctx.beginPath();
              ctx.arc(shock.x, shock.y, ringR * 0.92, 0, Math.PI * 2);
              ctx.stroke();
            }
          }

          // Strong inner fusion flash
          ctx.fillStyle = `rgba(255, 180, 255, ${alpha * 0.5})`;
          ctx.beginPath();
          ctx.arc(shock.x, shock.y, currentR * 0.55, 0, Math.PI * 2);
          ctx.fill();

          // Extra bright core
          ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.35})`;
          ctx.beginPath();
          ctx.arc(shock.x, shock.y, currentR * 0.3, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Normal Shockwave
          ctx.shadowColor = '#ff2a6d';
          ctx.shadowBlur = 22;

          // Multiple layered rings for juice
          for (let r = 0; r < 3; r++) {
            const ringR = currentR * (0.7 + r * 0.15);
            const ringAlpha = alpha * (0.9 - r * 0.22);

            ctx.strokeStyle = `rgba(255, 42, 109, ${ringAlpha})`;
            ctx.lineWidth = 3.5 - r * 0.6;
            ctx.beginPath();
            ctx.arc(shock.x, shock.y, ringR, 0, Math.PI * 2);
            ctx.stroke();
          }

          // Inner bright flash
          ctx.fillStyle = `rgba(255, 200, 220, ${alpha * 0.3})`;
          ctx.beginPath();
          ctx.arc(shock.x, shock.y, currentR * 0.45, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      } else {
        delete (state as any).activeShockwave;
      }
    }

    // 4. ENERGY DASH — extra intense player glow + speed lines
    if (state.isDashing) {
      const isDashFused = !!state.skills.fusedActives['energyDash'];
      ctx.save();

      if (isDashFused) {
        // FUSED ENERGY DASH (Titan Dash) - epic purple/cyan fusion dash effect
        ctx.shadowColor = '#c026ff';
        ctx.shadowBlur = 55;

        // Large outer purple fusion aura
        ctx.fillStyle = 'rgba(192, 38, 255, 0.4)';
        ctx.beginPath();
        ctx.arc(player.x, player.y, player.radius * 3.6, 0, Math.PI * 2);
        ctx.fill();

        // Inner cyan energy layer
        ctx.shadowColor = '#00f9ff';
        ctx.shadowBlur = 35;
        ctx.fillStyle = 'rgba(0, 249, 255, 0.35)';
        ctx.beginPath();
        ctx.arc(player.x, player.y, player.radius * 2.9, 0, Math.PI * 2);
        ctx.fill();

        // Strong white core
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.beginPath();
        ctx.arc(player.x, player.y, player.radius * 2.2, 0, Math.PI * 2);
        ctx.fill();

        // Enhanced afterimage streaks with fusion colors
        ctx.strokeStyle = 'rgba(255, 180, 255, 0.7)';
        ctx.lineWidth = 4.5;
        for (let i = 1; i <= 6; i++) {
          const ox = player.x - (i * 9);
          ctx.beginPath();
          ctx.arc(ox, player.y, player.radius * (1.15 - i * 0.09), 0, Math.PI * 2);
          ctx.stroke();
        }

        // Extra cyan afterimages
        ctx.strokeStyle = 'rgba(0, 249, 255, 0.5)';
        ctx.lineWidth = 2.5;
        for (let i = 1; i <= 4; i++) {
          const ox = player.x - (i * 6);
          ctx.beginPath();
          ctx.arc(ox, player.y, player.radius * (1.05 - i * 0.07), 0, Math.PI * 2);
          ctx.stroke();
        }
      } else {
        // Normal Energy Dash
        ctx.shadowColor = '#00f9ff';
        ctx.shadowBlur = 38;

        // Bright dash aura
        ctx.fillStyle = 'rgba(0, 249, 255, 0.35)';
        ctx.beginPath();
        ctx.arc(player.x, player.y, player.radius * 2.8, 0, Math.PI * 2);
        ctx.fill();

        // Afterimage streaks
        ctx.strokeStyle = 'rgba(0, 249, 255, 0.5)';
        ctx.lineWidth = 3;
        for (let i = 1; i <= 4; i++) {
          const ox = player.x - (i * 7);
          ctx.beginPath();
          ctx.arc(ox, player.y, player.radius * (1.1 - i * 0.08), 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // ===== LEVEL UP FLASH (premium visual) =====
    if (state.levelUpFlashUntil > Date.now()) {
      const alpha = Math.max(0.12, (state.levelUpFlashUntil - Date.now()) / 420);
      ctx.fillStyle = `rgba(0, 249, 255, ${alpha})`;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }
  };

  // ==================== GAME LOOP ====================
  const gameLoop = useCallback((timestamp: number) => {
    // Safety guard: never run game logic while on the menu (use refs to avoid stale closure)
    if (screenRef.current === 'menu' || !gameActiveRef.current) return;

    const state = gameRef.current;
    if (!state || !state.isRunning) return;

    if (!lastTimeRef.current) lastTimeRef.current = timestamp;
    const dt = Math.min((timestamp - lastTimeRef.current) / 1000, 0.1);

    // Still draw when paused (for level-up screen + frozen world)
    if (!state.isPaused) {
      update(dt);
    }
    draw();

    lastTimeRef.current = timestamp;
    animationRef.current = requestAnimationFrame(gameLoop);
  }, []);

  const startGameLoop = useCallback(() => {
    // Extra safety: never start the game loop while on the menu
    if (screenRef.current === 'menu' || !gameActiveRef.current) return;

    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    lastTimeRef.current = 0;
    animationRef.current = requestAnimationFrame(gameLoop);
  }, [gameLoop]);

  // ==================== INPUT ====================
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    keysRef.current.add(key);

    // Prevent arrow key scroll
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
      e.preventDefault();
    }

    // Space or R for quick restart when game over
    if ((key === 'r' || key === ' ') && hud.isGameOver) {
      e.preventDefault();
      resetGame(hud.currentStage);
    }

    // Skill Panel (Tab) - acts as pause
    if (key === 'tab' && screen === 'game') {
      e.preventDefault();
      toggleSkillPanel();
    }
  }, [hud.isGameOver, resetGame, screen]);

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    keysRef.current.delete(e.key.toLowerCase());
  }, []);

  // Toggle Skill Panel (used by Tab and Pause button)
  const toggleSkillPanel = useCallback(() => {
    const st = gameRef.current;
    setShowSkillPanel(prev => {
      const newValue = !prev;

      if (st) {
        if (newValue) {
          // Opening panel → pause the game
          if (!st.isPaused) {
            st.isPaused = true;
            pauseStageTimer(st);
          }
        } else {
          // Closing panel → resume if it was paused
          if (st.isPaused) {
            st.isPaused = false;
            resumeStageTimer(st);
          }
        }
      }
      return newValue;
    });
  }, []);

  // ==================== LIFECYCLE ====================
  useEffect(() => {
    // Only set up keyboard listeners on mount.
    // Game initialization happens only when user starts a stage from the menu.
    window.addEventListener('keydown', handleKeyDown, { passive: false });
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [handleKeyDown, handleKeyUp]);

  // Format timer MM:SS
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // (No-op cleanup retained for future level-up state if needed)

  // Load progress from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Load stage unlocks
      const saved = localStorage.getItem('neonSurgeUnlocked');
      if (saved) {
        const unlocked = parseInt(saved, 10);
        if (!isNaN(unlocked)) {
          const safeUnlocked = Math.max(1, Math.min(5, unlocked));
          setUnlockedUpTo(safeUnlocked);
          setSelectedStage(safeUnlocked);
        }
      }

      // Load Neon Shards
      const savedShards = localStorage.getItem('neonSurgeShards');
      if (savedShards) {
        const shards = parseInt(savedShards, 10);
        if (!isNaN(shards)) setNeonShards(shards);
      }

      // Load Equipment Levels
      const savedEquip = localStorage.getItem('neonSurgeEquipment');
      if (savedEquip) {
        try {
          const parsed = JSON.parse(savedEquip);
          setEquipmentLevels({
            neonRifle: parsed.neonRifle || 0,
            plasmaVest: parsed.plasmaVest || 0,
            quantumBoots: parsed.quantumBoots || 0,
            fusionCore: parsed.fusionCore || 0,
            neuralChip: parsed.neuralChip || 0,
            assaultDrone: parsed.assaultDrone || 0,
          });
        } catch (e) {
          console.warn('Failed to parse equipment data');
        }
      }

      // Load personal NFT collection (local + on-chain mints remembered)
      loadMyNFTs();
    }
  }, []);

  // Check if connected wallet is the owner of the NFT contract (required for minting on real deployments)
  useEffect(() => {
    checkIfNftContractOwner();
  }, [checkIfNftContractOwner]);

  // When the NFT collection modal opens on a real contract, enrich known NFTs with live on-chain tokenData
  // Full discovery (scanning Transfer events) is triggered manually via the "SYNC / DISCOVER" button
  useEffect(() => {
    if (showNFT) {
      refreshMyNFTsFromChain(); // lightweight enrichment of already-known tokenIds
    }
  }, [showNFT, refreshMyNFTsFromChain]);

  // Keep screenRef always up to date (for use inside RAF callbacks)
  useEffect(() => {
    screenRef.current = screen;
  }, [screen]);

  // Pause timer + game when user switches tabs or minimizes the browser
  // Also ensure the RAF game loop reliably resumes when the tab comes back
  useEffect(() => {
    const restartGameLoopIfNeeded = () => {
      const st = gameRef.current;
      if (!st || !st.isRunning) return;
      if (!gameActiveRef.current || screenRef.current !== 'game') return;

      // Always force-restart the RAF when coming back from background.
      // This is the most reliable way to prevent the loop from dying after long tab hide.
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      lastTimeRef.current = 0;
      animationRef.current = requestAnimationFrame(gameLoop);
    };

    const handleVisibilityChange = () => {
      const st = gameRef.current;
      if (!st || !st.isRunning) return;

      if (document.hidden) {
        // Tab hidden → pause only if not already paused for level-up etc.
        if (!st.isPaused) {
          st.isPaused = true;
          pauseStageTimer(st);
          st.pausedByVisibility = true;
        }
      } else {
        // Tab visible → resume only if we were the ones who paused via visibility
        if (st.pausedByVisibility && !st.pendingLevelUp) {
          st.isPaused = false;
          resumeStageTimer(st);
          st.pausedByVisibility = false;

          // Make sure the game loop is actually running again
          restartGameLoopIfNeeded();
        } else {
          // Even if we didn't pause it, ensure the loop is alive after long tab hide
          restartGameLoopIfNeeded();
        }
      }
    };

    const handleFocus = () => {
      // Extra safety net for some browsers / situations
      restartGameLoopIfNeeded();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);  // safe: all closed-over values are refs or stable callbacks

  // ROBUST GAME LOOP STARTER
  // The canvas element only exists in the DOM after React commits the 'game' screen render.
  // Starting the RAF directly from the click handler is racy → first frames see canvasRef.current === null → draw() skips → black screen.
  // This effect waits (retrying each frame) until BOTH the canvas ref and game state are live, then starts the loop once.
  useEffect(() => {
    if (screen !== 'game' || !gameRef.current) return;

    let cancelled = false;

    const tryStart = () => {
      if (cancelled) return;

      if (canvasRef.current && gameRef.current && gameActiveRef.current) {
        // Canvas is mounted and ready. Start the loop cleanly.
        startGameLoop();

        // Force an explicit first draw immediately using the real draw() function.
        // This guarantees the player, grid, enemies etc. appear on the very first visible frame.
        requestAnimationFrame(() => {
          if (!cancelled && canvasRef.current && gameRef.current) {
            try { draw(); } catch {}
          }
        });
      } else {
        // Canvas not attached yet (React commit pending). Retry next frame.
        requestAnimationFrame(tryStart);
      }
    };

    // Kick off the readiness check on the next animation frame
    const kickoff = requestAnimationFrame(tryStart);

    return () => {
      cancelled = true;
      cancelAnimationFrame(kickoff);
    };
  }, [screen, startGameLoop]);

  // Auto advance after Stage Clear has been disabled.
  // The popup now waits for the user to manually click "CONTINUE" or "RETURN TO MENU".
  // useEffect removed to prevent automatic progression.

  // XP progress to next level (proper curve)
  const xpProgress = hud.xpToNextLevel > 0 
    ? Math.min(100, Math.floor((hud.xp / hud.xpToNextLevel) * 100))
    : 100;

  // Stage timer (3 minutes) — respects pauses (level-up + tab hidden)
  const gameState = gameRef.current;
  const stageElapsed = gameState ? getEffectiveStageElapsed(gameState) : 0;
  const stageTimeLeft = Math.max(0, 180 - Math.floor(stageElapsed));
  const stageTimeDisplay = `${Math.floor(stageTimeLeft / 60)}:${(stageTimeLeft % 60).toString().padStart(2, '0')}`;

  // Boss data for UI
  const currentBoss = gameState?.boss;
  const bossHealthPercent = currentBoss ? Math.max(0, Math.floor((currentBoss.health / currentBoss.maxHealth) * 100)) : 0;

  // ==================== MAIN MENU ====================
  if (screen === 'menu') {
    const stageNames = ['NEON DISTRICT', 'DATA CORE', 'VOID SPIRE', 'CYBER ABYSS', 'NEON RUINS', 'QUANTUM LAB', 'SHADOW NETWORK', 'ECLIPSE TOWER', 'VOID PROTOCOL', 'FINAL PROTOCOL'];
    const canSelect = (s: number) => s <= unlockedUpTo;

    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white flex items-center justify-center overflow-hidden relative">
        {/* Subtle moving background grid */}
        <div className="absolute inset-0 opacity-20" style={{
          backgroundImage: 'linear-gradient(#00f9ff 1px, transparent 1px), linear-gradient(90deg, #00f9ff 1px, transparent 1px)',
          backgroundSize: '60px 60px',
          animation: 'gridMove 20s linear infinite'
        }} />

        <div className="relative z-10 text-center w-full max-w-4xl px-6">
          {/* Title + Wallet Connect */}
          <div className="mb-8">
            <h1 className="font-display text-[92px] font-black tracking-[-6px] neon-cyan drop-shadow-[0_0_40px_rgba(0,249,255,0.6)]">
              NEONXURGE
            </h1>
            <p className="text-[#6b7280] tracking-[6px] text-sm -mt-3">CYBERPUNK SURVIVOR</p>

            {/* Wallet Connect (Wagmi + MetaMask) */}
            <div className="mt-4 flex justify-center">
              {!isConnected ? (
                <button
                  onClick={() => {
                    const mm = connectors.find(c => c.id === 'injected') || connectors[0];
                    if (mm) connect({ connector: mm });
                  }}
                  disabled={isConnecting}
                  className="px-6 py-2 rounded-lg border border-[#00f9ff]/70 text-[#00f9ff] hover:bg-[#00f9ff] hover:text-black font-mono tracking-[2px] text-sm transition-all disabled:opacity-50"
                >
                  {isConnecting ? 'CONNECTING...' : 'CONNECT WALLET (SEPOLIA)'}
                </button>
              ) : (
                <div className="flex items-center gap-3">
                  {/* Wallet Address */}
                  <div className="flex items-center gap-3 px-4 py-1.5 rounded-lg bg-[#111117] border border-[#00f9ff]/40">
                    <div className="font-mono text-xs text-[#00f9ff]">{shortAddress}</div>
                    <button
                      onClick={() => disconnect()}
                      className="text-[10px] px-2 py-0.5 rounded bg-[#ff2a6d]/20 text-[#ff2a6d] hover:bg-[#ff2a6d] hover:text-black tracking-widest"
                    >
                      DISCONNECT
                    </button>
                  </div>

                  {/* Beautiful NSH Balance Pill */}
                  <div className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-[#1a0f22] border border-[#c026ff]/50 shadow-[0_0_12px_rgba(192,38,255,0.25)]">
                    <span className="text-[#c026ff] text-lg">✦</span>
                    <div>
                      <div className="font-display text-lg leading-none text-[#c026ff]">
                        {isLoadingNshBalance ? '...' : (Number(nshBalance) / 1e18).toFixed(0)}
                      </div>
                      <div className="text-[9px] text-[#c026ff]/70 tracking-[2px] -mt-0.5">NSH</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            {isConnected && (
              <div className="text-[10px] text-[#6b7280] mt-1 tracking-[1px]">SEPOLIA TESTNET • ON-CHAIN FEATURES ENABLED</div>
            )}
          </div>

          {/* Stage Selector - 10 Stages Slider */}
          <div className="mb-10">
            <div className="text-xs tracking-[4px] text-[#6b7280] mb-3">SELECT STAGE</div>

            <div className="flex items-center justify-center gap-3">
              {/* Left Arrow */}
              <button 
                onClick={() => setSelectedStage(Math.max(1, selectedStage - 1))}
                disabled={selectedStage === 1}
                className="text-3xl px-3 py-1 text-[#00f9ff] hover:text-white disabled:opacity-30 transition-colors"
              >
                ←
              </button>

              {/* Stage Cards - 10 Stages */}
              <div className="flex gap-2 overflow-x-auto pb-2 max-w-[980px] scrollbar-thin">
                {[1,2,3,4,5,6,7,8,9,10].map((s) => {
                  const isSelected = selectedStage === s;
                  const isUnlocked = canSelect(s);
                  return (
                    <button
                      key={s}
                      onClick={() => isUnlocked && setSelectedStage(s)}
                      disabled={!isUnlocked}
                      className={`w-[108px] p-3 rounded-xl border transition-all text-left flex-shrink-0 ${
                        isSelected 
                          ? 'border-[#00f9ff] bg-[#111117] shadow-[0_0_20px_rgba(0,249,255,0.35)] scale-[1.03]' 
                          : 'border-[#2a2a35] bg-[#0f0f14] hover:border-[#555]'
                      } ${!isUnlocked ? 'opacity-60 grayscale' : ''}`}
                    >
                      <div className="font-display text-sm font-bold tracking-tight mb-0.5">
                        STAGE {String(s).padStart(2, '0')}
                      </div>
                      <div className="text-[#9ca3af] text-[10px] leading-tight mb-1 h-7">
                        {STAGE_NAMES[s-1]}
                      </div>
                      <div className="text-[9px] text-[#6b7280] leading-none">
                        {isUnlocked ? STAGE_DESCRIPTIONS[s-1] : 'Locked - Beat previous boss'}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Right Arrow */}
              <button 
                onClick={() => setSelectedStage(Math.min(10, selectedStage + 1))}
                disabled={selectedStage === 10}
                className="text-3xl px-3 py-1 text-[#00f9ff] hover:text-white disabled:opacity-30 transition-colors"
              >
                →
              </button>
            </div>
          </div>

          {/* Neon Shards Display */}
          <div className="mb-6 text-center">
            <div className="text-xs tracking-[3px] text-[#6b7280] mb-1">CURRENCY</div>
            <div className="flex items-center justify-center gap-2 text-3xl font-display text-[#ff2a6d]">
              <span>◆</span>
              <span>{neonShards}</span>
              <span className="text-sm tracking-widest text-[#ff2a6d]/70">NEON SHARDS</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col items-center gap-4">
            <button
              onClick={startSelectedStage}
              className="neon-button text-2xl px-16 py-5 font-display tracking-[4px] rounded"
            >
              START GAME
            </button>

            <button
              onClick={() => setShowEquipment(true)}
              className="px-12 py-3 rounded-xl border-2 border-[#c026ff] text-[#c026ff] hover:bg-[#c026ff] hover:text-black transition-all font-display tracking-[3px] text-lg"
            >
              EQUIPMENT
            </button>

            {/* NEW: Blockchain Features */}
            <div className="flex gap-4">
              <button
                onClick={() => { setShowLeaderboard(true); fetchOnChainLeaderboard(); }}
                className="px-10 py-2.5 rounded-xl border-2 border-[#00f9ff] text-[#00f9ff] hover:bg-[#00f9ff] hover:text-black transition-all font-display tracking-[3px] text-base"
              >
                LEADERBOARD
              </button>
              <button
                onClick={() => setShowNFT(true)}
                className="px-10 py-2.5 rounded-xl border-2 border-[#ff2a6d] text-[#ff2a6d] hover:bg-[#ff2a6d] hover:text-black transition-all font-display tracking-[3px] text-base"
              >
                NFT COLLECTION
              </button>
            </div>

            <div className="flex gap-6 mt-2">
              <button 
                onClick={() => setShowHowToPlay(true)}
                className="text-sm text-[#9ca3af] hover:text-white tracking-wider"
              >
                HOW TO PLAY
              </button>

              <button 
                onClick={() => {
                  const newSound = !soundEnabled;
                  setSoundEnabled(newSound);
                  if (!newSound) stopAmbientHum();
                }}
                className="text-sm text-[#9ca3af] hover:text-white tracking-wider"
              >
                SOUND: {soundEnabled ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>
        </div>

        {/* How to Play Modal */}
        {showHowToPlay && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90" onClick={() => setShowHowToPlay(false)}>
            <div className="hud-panel max-w-md p-8 rounded-2xl text-left" onClick={e => e.stopPropagation()}>
              <h3 className="font-display text-3xl mb-6 tracking-tight">HOW TO PLAY</h3>
              <ul className="space-y-3 text-[#d1d5db] text-sm leading-relaxed">
                <li>• <span className="text-[#00f9ff]">WASD / Arrows</span> — Move</li>
                <li>• Pulse Fire is always active — aim with movement</li>
                <li>• Collect blue orbs to gain XP and level up</li>
                <li>• Survive 3 minutes to face the Stage Boss</li>
                <li>• Beat the boss to unlock the next stage</li>
              </ul>
              <button 
                onClick={() => setShowHowToPlay(false)}
                className="mt-8 w-full neon-button py-3 text-sm tracking-widest"
              >
                CLOSE
              </button>
            </div>
          </div>
        )}

        {/* ==================== LEADERBOARD (On-Chain via Wagmi) ==================== */}
        {showLeaderboard && (
          <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/95 backdrop-blur-md p-4" onClick={() => setShowLeaderboard(false)}>
            <div className="w-full max-w-[820px] hud-panel p-8 rounded-2xl border border-[#00f9ff]/30" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <div className="font-display text-4xl tracking-[-1px] neon-cyan">ON-CHAIN LEADERBOARD</div>
                  <div className="text-xs text-[#6b7280] tracking-[3px] mt-1">SEPOLIA • PERMANENT SCORES</div>
                </div>
                <button onClick={() => setShowLeaderboard(false)} className="text-[#6b7280] hover:text-white text-2xl">×</button>
              </div>

              <div className="mb-4 flex items-center gap-3">
                <button
                  onClick={fetchOnChainLeaderboard}
                  disabled={isLoadingLeaderboard}
                  className="px-5 py-2 text-sm rounded border border-[#00f9ff]/60 text-[#00f9ff] hover:bg-[#00f9ff] hover:text-black tracking-widest disabled:opacity-60"
                >
                  {isLoadingLeaderboard ? 'SYNCING...' : 'REFRESH FROM CHAIN'}
                </button>
                {isConnected && lastRunScore > 0 && (
                  <button
                    onClick={() => submitScoreToLeaderboard(lastRunScore)}
                    disabled={isSubmittingScore}
                    className="px-6 py-2 text-sm rounded bg-[#00f9ff] text-black font-bold tracking-[2px] hover:bg-white disabled:opacity-60"
                  >
                    {isSubmittingScore ? 'SUBMITTING TX...' : `SUBMIT RUN SCORE (${lastRunScore})`}
                  </button>
                )}
                {!isConnected && <div className="text-xs text-[#ff2a6d]">Connect wallet to submit scores on-chain</div>}
              </div>

              <div className="bg-[#0a0a0f] rounded-xl border border-[#2a2a35] overflow-hidden">
                <div className="grid grid-cols-12 px-4 py-2 text-[10px] tracking-[2px] text-[#6b7280] border-b border-[#2a2a35]">
                  <div className="col-span-1">#</div>
                  <div className="col-span-6">WALLET</div>
                  <div className="col-span-3 text-right">SCORE</div>
                  <div className="col-span-2 text-right">TIME</div>
                </div>
                {leaderboardScores.length === 0 && (
                  <div className="p-8 text-center text-[#6b7280] text-sm">No on-chain scores yet. Be the first legend.</div>
                )}
                {leaderboardScores.map((entry, idx) => (
                  <div key={idx} className="grid grid-cols-12 px-4 py-3 text-sm border-b border-[#1f1f28] last:border-0 hover:bg-[#111117]">
                    <div className="col-span-1 text-[#00f9ff] font-mono">{idx + 1}</div>
                    <div className="col-span-6 font-mono text-[#00f9ff]">{entry.player}</div>
                    <div className="col-span-3 text-right font-display text-lg text-white tracking-tighter">{entry.score.toLocaleString()}</div>
                    <div className="col-span-2 text-right text-xs text-[#6b7280]">{new Date(entry.timestamp).toLocaleDateString()}</div>
                  </div>
                ))}
              </div>

              <div className="mt-4 text-[10px] text-center text-[#6b7280]">Scores stored permanently via smart contract events on Sepolia. Top 10 shown (highest per address).</div>
            </div>
          </div>
        )}

        {/* ==================== NFT COLLECTION + MINT (ERC-721) ==================== */}
        {showNFT && (
          <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/95 backdrop-blur-md p-4" onClick={() => { setShowNFT(false); setMintSuccess(null); }}>
            <div className="w-full max-w-[860px] hud-panel p-8 rounded-2xl border border-[#ff2a6d]/30" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-start mb-6">
                <div>
                  <div className="font-display text-4xl tracking-[-1px] neon-pink">NEONXURGE SURVIVOR</div>
                  <div className="text-xs tracking-[4px] text-[#ff2a6d]/80 mt-1">ERC-721 • SEPOLIA</div>
                </div>
                <button onClick={() => { setShowNFT(false); setMintSuccess(null); }} className="text-3xl text-[#6b7280] hover:text-white">×</button>
              </div>

              {/* Mint Success Celebration */}
              {mintSuccess && (
                <div className="mb-8 p-6 rounded-2xl bg-gradient-to-br from-[#ff2a6d]/10 to-black border border-[#ff2a6d]/40 text-center">
                  <div className="text-6xl mb-2">✧</div>
                  <div className="font-display text-3xl neon-pink tracking-widest mb-1">MINTED SUCCESSFULLY</div>
                  <div className="text-[#ff2a6d] text-lg mb-3">
                    {NFT_TIERS[mintSuccess.tier]?.label} TIER
                    {typeof mintSuccess.tokenId === 'number' ? ` #${mintSuccess.tokenId}` : ''}
                    {mintSuccess.stageCleared ? ` • Stage ${mintSuccess.stageCleared}` : ''}
                  </div>
                  <div className="font-mono text-xs text-[#9ca3af] break-all mb-3">TX: {mintSuccess.txHash}</div>
                  <a
                    href={`https://sepolia.etherscan.io/tx/${mintSuccess.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block px-6 py-2 text-sm border border-[#ff2a6d] text-[#ff2a6d] hover:bg-[#ff2a6d] hover:text-black tracking-widest"
                  >
                    VIEW ON ETHERSCAN
                  </a>
                </div>
              )}

              {/* Mint Button / Eligibility */}
              <div className="mb-8">
                {mintEligibility.eligible ? (
                  <>
                    <button
                      onClick={mintSurvivorNFT}
                      disabled={isMinting || !isConnected}
                      className="w-full py-5 text-xl font-display tracking-[4px] rounded-xl bg-[#ff2a6d] text-black hover:bg-white disabled:bg-[#3a1f25] disabled:text-[#ff2a6d]/60 transition-all"
                    >
                      {isMinting ? 'MINTING ON SEPOLIA...' : `MINT ${NFT_TIERS[mintEligibility.tier]?.label} NFT`}
                    </button>

                    {/* Owner-only notice for real deployments */}
                    {!IS_DEMO_MODE && !isNftContractOwner && (
                      <div className="mt-3 text-center text-xs text-[#ff2a6d] border border-[#ff2a6d]/40 rounded-lg p-3">
                        Minting is restricted to the contract owner.<br />
                        Connect the wallet that owns the deployed NFT contract to mint badges.
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-4 text-[#6b7280] border border-[#2a2a35] rounded-xl">
                    Clear Stage 10 or score 5000+ in a run to unlock NFT minting.
                  </div>
                )}
                {isConnected && mintEligibility.eligible && (
                  <div className="text-center text-xs text-[#ff2a6d] mt-2 tracking-widest">{mintEligibility.reason}</div>
                )}
                {!isConnected && <div className="text-center text-xs text-[#ff2a6d] mt-2">Connect wallet to mint</div>}
              </div>

              {/* Your Collection */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs tracking-[3px] text-[#6b7280]">
                    YOUR SURVIVORS ({myNFTs.length})
                  </div>
                  {!IS_DEMO_MODE && isConnected && (
                    <button
                      onClick={syncNFTCollectionWithChain}
                      disabled={isRefreshingNFTs}
                      className="text-[10px] px-3 py-1 rounded border border-[#00f9ff]/60 text-[#00f9ff] hover:bg-[#00f9ff] hover:text-black disabled:opacity-50 tracking-[1px] transition-all"
                    >
                      {isRefreshingNFTs ? 'SYNCING...' : 'SYNC / DISCOVER ON-CHAIN'}
                    </button>
                  )}
                </div>
                {myNFTs.length === 0 ? (
                  <div className="text-sm text-[#6b7280] py-8 text-center border border-[#1f1f28] rounded">
                    No NFTs yet. Survive Stage 10 or use the <span className="text-[#00f9ff]">SYNC / DISCOVER ON-CHAIN</span> button to find badges sent to you.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {myNFTs.map((nft, i) => {
                      const tierInfo = NFT_TIERS[nft.tier];
                      const stageInfo = nft.stageCleared ? ` • Stage ${nft.stageCleared}` : '';
                      const tokenLabel = typeof nft.tokenId === 'number' ? ` #${nft.tokenId}` : '';
                      return (
                        <div key={i} className="p-4 rounded-xl border border-[#2a2a35] bg-[#0a0a0f] flex flex-col">
                          <div className="font-display text-xl" style={{ color: tierInfo?.color }}>
                            {tierInfo?.label || 'SURVIVOR'}{tokenLabel}
                          </div>
                          <div className="text-xs text-[#6b7280] mt-1 mb-3 flex-1">{tierInfo?.desc}{stageInfo}</div>
                          <a href={`https://sepolia.etherscan.io/tx/${nft.txHash}`} target="_blank" className="text-[10px] text-[#00f9ff] hover:underline font-mono">VIEW TX →</a>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ==================== EQUIPMENT SCREEN ==================== */}
        {showEquipment && (
          <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/95 backdrop-blur-md p-4">
            <div className="w-full max-w-[1100px] relative hud-panel p-5 rounded-2xl border border-[#c026ff]/30 max-h-[92vh] flex flex-col">
              {/* Header with close button */}
              <div className="flex items-center justify-between mb-3 flex-shrink-0">
                <div>
                  <div className="font-display text-4xl md:text-5xl font-black tracking-[-2px] text-[#c026ff]">EQUIPMENT</div>
                  <div className="flex items-center gap-4 mt-0.5">
                    <div className="text-lg text-[#ff2a6d]">
                      <span>◆</span> {neonShards} <span className="text-xs tracking-widest">NEON SHARDS</span>
                    </div>
                    {isConnected && (
                      <div className="text-lg text-[#c026ff] font-mono">
                        {isLoadingNshBalance ? '...' : (Number(nshBalance) / 1e18).toFixed(0)} <span className="text-xs tracking-widest">NSH</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Back Button */}
                <button
                  onClick={() => setShowEquipment(false)}
                  className="px-5 py-1.5 rounded-lg bg-[#c026ff] text-black hover:bg-white transition-all text-sm font-medium tracking-[2px]"
                >
                  BACK TO MENU
                </button>
              </div>

              <div className="flex-1 min-h-0 grid grid-cols-2 md:grid-cols-3 gap-3 overflow-hidden">
                {Object.entries(EQUIPMENT).map(([key, data]) => {
                  const level = getEquipLevel(key as keyof typeof equipmentLevels);
                  const cost = getUpgradeCost(level);
                  const stats = getEquipmentStats(key as keyof typeof equipmentLevels);

                  // NSH payment support (when wallet connected)
                  const nshCost = BigInt(cost) * 10n ** 18n;
                  const hasEnoughNsh = isConnected && nshBalance >= nshCost;
                  const canUpgradeWithShards = neonShards >= cost;
                  const canUpgrade = level < 10 && (canUpgradeWithShards || hasEnoughNsh);

                  return (
                    <div key={key} className="hud-panel p-4 rounded-xl border border-[#2a2a35] hover:border-[#c026ff]/50 transition-all flex flex-col">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-3xl">{data.icon}</span>
                          <div>
                            <div className="font-display text-lg tracking-tight leading-tight">{data.name}</div>
                            <div className="text-[10px] text-[#6b7280] tracking-widest">{data.slot}</div>
                          </div>
                        </div>
                        <div className="text-right text-xs text-[#c026ff] tracking-widest">LV {level}/10</div>
                      </div>

                      <div className="text-[#a1a1aa] text-xs mb-2 leading-tight flex-1">{data.description}</div>

                      <div className="text-[#00f9ff] text-xs mb-2 font-mono tracking-wider">{stats}</div>

                      {level < 10 ? (
                        <button
                          onClick={async () => {
                            if (!canUpgrade) return;

                            const newLevels = { ...equipmentLevels };
                            (newLevels as any)[key] = level + 1;

                            if (isConnected && hasEnoughNsh) {
                              // Pay with on-chain NSH (real tx)
                              setIsNshTxPending(true);
                              try {
                                const sink = '0x000000000000000000000000000000000000dEaD'; // demo burn/sink address
                                const hash = await walletClient.writeContract({
                                  address: NSH_ADDRESS,
                                  abi: ERC20_ABI,
                                  functionName: 'transfer',
                                  args: [sink, nshCost],
                                  chain: sepolia,
                                  account: address!,
                                });
                                setLastNshTxHash(hash);
                                // Wait for confirmation (optional for UX)
                                await publicClient?.waitForTransactionReceipt({ hash });
                                saveEquipment(newLevels);
                                // Refresh on-chain balance
                                await refreshNshBalance();
                              } catch (err: any) {
                                alert('NSH payment failed: ' + (err?.shortMessage || err?.message || 'User rejected'));
                              } finally {
                                setIsNshTxPending(false);
                              }
                            } else {
                              // Pay with old Neon Shards
                              saveEquipment(newLevels);
                              saveNeonShards(neonShards - cost);
                            }
                          }}
                          disabled={!canUpgrade || isNshTxPending}
                          className={`w-full py-2 rounded-lg text-xs tracking-[1.5px] font-medium transition-all ${
                            canUpgrade && !isNshTxPending
                              ? 'bg-[#c026ff] text-black hover:bg-white' 
                              : 'bg-[#1f1f28] text-[#555] cursor-not-allowed'
                          }`}
                        >
                          {isNshTxPending 
                            ? 'PROCESSING NSH TX...' 
                            : (hasEnoughNsh ? `UPGRADE FOR ${cost} NSH` : `UPGRADE • ${cost}`)}
                        </button>
                      ) : (
                        <div className="w-full py-2 rounded-lg text-xs tracking-[1.5px] font-medium bg-[#1f1f28] text-[#c026ff] text-center">
                          MAX LEVEL
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==================== GAME SCREEN ====================
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col items-center py-8 px-4 select-none">
      {/* Header */}
      <div className="w-full max-w-[860px] mb-4 flex items-end justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-[#00f9ff] shadow-[0_0_12px_#00f9ff]" />
            <h1 className="font-display text-5xl tracking-[-1.5px] font-black neon-cyan">NEONXURGE</h1>
          </div>
          <p className="text-[10px] tracking-[3px] text-[#6b7280] mt-0.5 ml-6">CYBERPUNK SURVIVOR</p>
        </div>

        <div className="flex items-end gap-4">
          <div className="text-right">
            <div className="text-[10px] tracking-[2px] text-[#6b7280]">WASD / ARROWS TO MOVE</div>
            <div className="text-[10px] tracking-[2px] text-[#6b7280]">PULSE FIRE ENABLED</div>
          </div>

          {/* Pause Button */}
          <button
            onClick={() => toggleSkillPanel()}
            className="px-4 py-1 rounded border border-[#00f9ff]/60 text-[#00f9ff] hover:bg-[#00f9ff] hover:text-black text-xs tracking-[2.5px] transition-all"
          >
            PAUSE
          </button>
        </div>
      </div>

      {/* Game Container */}
      <div className="relative">
        {/* Top HUD Bar */}
        <div className="flex items-center justify-between w-[816px] mb-2 px-1">
          {/* Wallet status (blockchain) */}
          {isConnected && (
            <div className="text-[10px] font-mono px-2 py-1 rounded bg-black/60 border border-[#00f9ff]/30 text-[#00f9ff] self-start">
              {shortAddress} <span className="text-[8px] text-[#6b7280]">SEPOLIA</span>
            </div>
          )}
          {/* Score + Kills */}
          <div className="hud-panel flex items-center gap-8 px-5 py-2 rounded">
            <div>
              <div className="text-[10px] tracking-[2px] text-[#6b7280]">SCORE</div>
              <div className="font-display text-3xl font-semibold tabular-nums tracking-tighter text-[#00f9ff] hud-value">
                {hud.score.toString().padStart(5, '0')}
              </div>
            </div>
            <div className="h-7 w-px bg-white/10" />
            <div>
              <div className="text-[10px] tracking-[2px] text-[#6b7280]">KILLS</div>
              <div className="font-display text-3xl font-semibold tabular-nums tracking-tighter text-[#ff2a6d] hud-value">
                {hud.kills.toString().padStart(3, '0')}
              </div>
            </div>
          </div>

          {/* Timer + Stage */}
          <div className="hud-panel px-5 py-2 rounded text-center min-w-[132px]">
            <div className="text-[10px] tracking-[2px] text-[#6b7280]">STAGE TIME</div>
            <div className="font-display text-4xl font-bold tabular-nums tracking-[-1px] neon-purple mt-[-2px]">
              {stageTimeDisplay}
            </div>
            <div className="text-[10px] tracking-[2px] text-[#00f9ff] mt-0.5">
              STAGE {String(hud.currentStage || 1).padStart(2, '0')} / 10
            </div>
          </div>
        </div>

        {/* Boss Health Bar */}
        {currentBoss && (
          <div className="w-[816px] mb-2">
            <div className="text-center text-[#ff2a6d] text-xs tracking-[3px] mb-1 font-bold">BOSS</div>
            <div className="h-4 bg-[#1a0a0f] border border-[#ff2a6d] rounded overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-[#ff2a6d] to-[#c026ff] transition-all duration-100"
                style={{ width: `${bossHealthPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Canvas with neon frame */}
        <div className="game-frame scanlines">
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            className="block rounded-[1px] bg-black"
          />
        </div>

        {/* Bottom XP Bar + Level */}
        <div className="mt-3 w-[816px]">
          <div className="flex items-center justify-between text-[10px] tracking-[2.5px] mb-1.5 px-1 text-[#9ca3af]">
            <div>LEVEL <span className="font-display text-[#00f9ff] text-lg font-bold align-middle tabular-nums">{hud.level}</span></div>
            <div>XP</div>
          </div>

          <div className="xp-bar-container h-[7px] rounded flex">
            <div
              className="xp-bar-fill h-full rounded"
              style={{ width: `${xpProgress}%` }}
            />
          </div>
        </div>

        {/* Right side kills detail (floating) */}
        <div className="absolute -right-[138px] top-[88px] hud-panel px-4 py-3 rounded text-center">
          <div className="text-[10px] tracking-[2px] text-[#6b7280]">DRONES<br />ELIMINATED</div>
          <div className="font-display text-5xl font-bold text-[#ff2a6d] tabular-nums tracking-[-2px] mt-1">{hud.kills}</div>
          {hud.combo > 1 && (
            <div className="text-[#00f9ff] text-xs tracking-[1px] mt-0.5 font-mono">x{hud.combo} COMBO</div>
          )}
        </div>
      </div>

      {/* Instructions footer */}
      <div className="mt-5 text-center">
        <div className="instructions">
          MOVE WITH <span className="text-[#00f9ff]">WASD</span> OR <span className="text-[#00f9ff]">ARROW KEYS</span> • COLLECT <span className="text-[#00b4ff]">BLUE ORBS</span> FOR XP • SURVIVE AS LONG AS YOU CAN
        </div>
        <div className="text-[10px] text-[#4b5563] mt-2 tracking-widest">ENEMIES GROW STRONGER OVER TIME — EVERY 30 SECONDS SPAWN RATE INCREASES</div>
      </div>

      {/* ========== LEVEL UP: ONLY ACTIVE + PASSIVE SKILLS ========== */}
      {hud.isLevelingUp && levelUpChoices.length > 0 && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 backdrop-blur-lg">
          <div className="w-full max-w-5xl px-6">
            <div className="text-center mb-8">
              <div className="font-display text-7xl font-black tracking-[-4px] neon-cyan">LEVEL UP</div>
              <div className="text-[#9ca3af] mt-2 tracking-[2px] text-sm">CHOOSE A SKILL</div>
            </div>

            {/* 3 random choices — only Active or Passive skills (new or upgrades) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-[1100px] mx-auto">
              {levelUpChoices.map((choice, index) => {
                const isNew = choice.type === 'newActive' || choice.type === 'newPassive';
                const isActive = choice.type === 'newActive' || choice.type === 'upgradeActive';

                const label =
                  choice.type === 'newActive' ? 'NEW ACTIVE SKILL' :
                  choice.type === 'newPassive' ? 'NEW PASSIVE SKILL' :
                  choice.type === 'upgradeActive' ? 'UPGRADE ACTIVE' :
                  choice.type === 'upgradePassive' ? 'UPGRADE PASSIVE' :
                  'FUSION UNLOCKED';

                const keyForReact = choice.type === 'fusion' ? choice.active : choice.key;

                return (
                  <button
                    key={`${keyForReact}-${index}`}
                    onClick={() => {
                      const st = gameRef.current;
                      if (!st) return;

                      const isActiveSkill = choice.type === 'newActive' || choice.type === 'upgradeActive';

                      if (choice.type === 'newActive' || choice.type === 'newPassive') {
                        // New skill → equip + level 1
                        if (isActiveSkill) {
                          equipActive(st, choice.key);
                          st.skills.active[choice.key] = 1;
                        } else {
                          equipPassive(st, choice.key);
                          st.skills.passive[choice.key] = 1;
                        }
                      } else if (choice.type === 'fusion') {
                        // FUSION: Change the Active skill's name (as per spec)
                        const fusionRecipe = FUSION_RECIPES.find(
                          r => r.active === choice.active && r.passive === choice.passive
                        );

                        if (fusionRecipe) {
                          st.skills.fusedActives[choice.active] = fusionRecipe.fusionName;
                          st.skills.fusions.push(fusionRecipe.fusionName);

                          // EPIC FUSION TRANSFORMATION
                          playSound('stageClear');
                          createFusionEffect(st, st.player.x, st.player.y);

                          // Extra power spike on fusion
                          st.skills.passive.damageBoost = Math.max(st.skills.passive.damageBoost || 0, 3);
                          st.skills.passive.attackSpeed = Math.max(st.skills.passive.attackSpeed || 0, 2);
                        }
                      } else {
                        // Upgrade existing slotted skill
                        if (isActiveSkill) {
                          st.skills.active[choice.key] = (st.skills.active[choice.key] || 0) + 1;
                        } else {
                          st.skills.passive[choice.key] = (st.skills.passive[choice.key] || 0) + 1;
                        }
                      }

                      playSound('level');
                      createLevelUpBurst(st, st.player.x, st.player.y);
                      st.level += 1;
                      st.xp -= st.xpToNextLevel;
                      st.xpToNextLevel = Math.floor(10 + (st.level - 1) * 9);
                      st.pendingLevelUp = false;
                      st.isPaused = false;
                      resumeStageTimer(st);
                      setLevelUpChoices([]);
                      setHud(prev => ({
                        ...prev,
                        level: st.level,
                        xp: st.xp,
                        xpToNextLevel: st.xpToNextLevel,
                        isLevelingUp: false,
                      }));
                    }}
                    className={`hud-panel p-8 rounded-3xl text-left border-2 transition-all group relative overflow-hidden ${
                      choice.type === 'fusion'
                        ? 'border-[#c026ff] hover:border-[#ff2a6d] hover:scale-[1.04] shadow-[0_0_35px_rgba(192,38,255,0.6),0_0_70px_rgba(255,42,109,0.25)] bg-[#1a0f22]'
                        : isActive 
                          ? 'border-[#00f9ff] hover:border-[#00f9ff] hover:scale-[1.01]' 
                          : 'border-[#c026ff] hover:border-[#ff2a6d] hover:scale-[1.01]'
                    }`}
                  >
                    <div className={`text-xs tracking-[2.5px] mb-2 ${
                      choice.type === 'fusion' ? 'text-[#c026ff]' : 
                      isActive ? 'text-[#00f9ff]' : 'text-[#c026ff]'
                    }`}>
                      {choice.type === 'fusion' ? (
                        <span className="inline-block px-3 py-0.5 rounded-full border border-[#c026ff]/60 bg-[#c026ff]/10 text-[#ff2a6d] font-bold tracking-[3px]">
                          ★ FUSION UNLOCKED ★
                        </span>
                      ) : (
                        label
                      )}
                    </div>
                    <div className="text-6xl mb-4 transition-transform group-hover:scale-110">
                      {choice.icon}
                    </div>
                    <div className={`font-display text-3xl font-bold tracking-tight mb-3 ${choice.type === 'fusion' ? 'text-[#ff2a6d] drop-shadow-[0_0_8px_rgba(255,42,109,0.5)]' : 'text-white'}`}>
                      {choice.name}
                    </div>
                    <div className="text-[#a1a1aa] text-[15px] leading-snug mb-6">
                      {choice.desc}
                    </div>
                    <div className={`inline-flex items-center text-xs tracking-[2px] font-medium ${choice.type === 'fusion' ? 'text-[#ff2a6d]' : isActive ? 'text-[#00f9ff]' : 'text-[#ff2a6d]'}`}>
                      {choice.type === 'fusion' ? 'EMBRACE THE FUSION' : 'CLICK TO SELECT'} <span className="ml-2">→</span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="text-center mt-8 text-[#4b5563] text-xs tracking-widest">
              BUILD YOUR 5 ACTIVE + 5 PASSIVE SKILL LOADOUT
            </div>
          </div>
        </div>
      )}

      {/* SKILL PANEL (Tab) - 5 Slot Active + 5 Slot Passive Loadout */}
      {showSkillPanel && screen === 'game' && gameRef.current && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/90" onClick={() => toggleSkillPanel()}>
          <div className="hud-panel w-full max-w-[1100px] p-8 rounded-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display text-4xl tracking-tight">SKILL LOADOUT</h2>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => {
                    toggleSkillPanel();   // close panel first
                    returnToMenu();       // then give up and return to main menu
                  }}
                  className="px-4 py-1.5 rounded-lg border border-[#ff2a6d]/60 text-[#ff2a6d] hover:bg-[#ff2a6d] hover:text-black text-xs tracking-[2px] transition-all"
                >
                  GIVE UP
                </button>
                <div className="text-xs text-[#6b7280] tracking-[2px]">PRESS TAB TO CLOSE</div>
              </div>
            </div>

            {/* ACTIVE SKILLS - 5 SLOTS */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <span className="text-[#00f9ff] font-bold tracking-wider">ACTIVE SKILLS</span>
                  <span className="ml-3 text-sm text-[#9ca3af]">
                    {gameRef.current.skills.equippedActive.length}/5 SLOTS
                  </span>
                </div>
                <div className="text-[10px] text-[#6b7280]">Equipped abilities trigger in combat</div>
              </div>

              <div className="grid grid-cols-5 gap-3">
                {Array.from({ length: 5 }).map((_, i) => {
                  const equippedKey = gameRef.current!.skills.equippedActive[i] as ActiveSkillKey | undefined;
                  const def = equippedKey ? ACTIVE_SKILLS.find(s => s.key === equippedKey) : null;
                  const level = equippedKey ? (gameRef.current!.skills.active[equippedKey] || 0) : 0;
                  const fusedName = equippedKey ? gameRef.current!.skills.fusedActives[equippedKey] : undefined;

                  return (
                    <div
                      key={i}
                      className={`aspect-[4/3] rounded-2xl border flex flex-col items-center justify-center p-3 transition-all ${
                        def 
                          ? fusedName 
                            ? 'border-[#c026ff] bg-[#1a0f22] shadow-[0_0_25px_rgba(192,38,255,0.5)]' 
                            : 'border-[#00f9ff] bg-[#111117] shadow-[0_0_15px_rgba(0,249,255,0.15)]'
                          : 'border-[#2a2a35] bg-[#0a0a0f]'
                      }`}
                    >
                      {def ? (
                        <>
                          <div className="text-4xl mb-1.5">{def.icon}</div>
                          <div className="text-center text-sm font-semibold leading-tight mb-1">
                            {fusedName || def.name}
                          </div>
                          <div className="text-[10px] text-[#00f9ff] tracking-widest">LV {level} / 5</div>
                          {fusedName && (
                            <div className="mt-1 px-2.5 py-0.5 rounded-full bg-[#c026ff]/20 border border-[#c026ff]/60 text-[8px] text-[#ff2a6d] tracking-[2.5px] font-bold shadow-[0_0_8px_rgba(192,38,255,0.4)]">FUSED</div>
                          )}
                        </>
                      ) : (
                        <>
                          <div className="text-2xl text-[#3a3a45] mb-1">＋</div>
                          <div className="text-[10px] text-[#4b5563] tracking-widest text-center">EMPTY<br />SLOT</div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* PASSIVE SKILLS - 5 SLOTS */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <span className="text-[#00f9ff] font-bold tracking-wider">PASSIVE SKILLS</span>
                  <span className="ml-3 text-sm text-[#9ca3af]">
                    {gameRef.current.skills.equippedPassive.length}/5 SLOTS
                  </span>
                </div>
                <div className="text-[10px] text-[#6b7280]">Passive bonuses are always active when slotted</div>
              </div>

              <div className="grid grid-cols-5 gap-3">
                {Array.from({ length: 5 }).map((_, i) => {
                  const equippedKey = gameRef.current!.skills.equippedPassive[i] as PassiveSkillKey | undefined;
                  const def = equippedKey ? PASSIVE_SKILLS.find(s => s.key === equippedKey) : null;
                  const level = equippedKey ? (gameRef.current!.skills.passive[equippedKey] || 0) : 0;

                  return (
                    <div
                      key={i}
                      className={`aspect-[4/3] rounded-2xl border flex flex-col items-center justify-center p-3 transition-all ${
                        def 
                          ? 'border-[#c026ff] bg-[#111117] shadow-[0_0_15px_rgba(192,38,255,0.15)]' 
                          : 'border-[#2a2a35] bg-[#0a0a0f]'
                      }`}
                    >
                      {def ? (
                        <>
                          <div className="text-4xl mb-1.5">{def.icon}</div>
                          <div className="text-center text-sm font-semibold leading-tight mb-1">{def.name}</div>
                          <div className="text-[10px] text-[#c026ff] tracking-widest">LV {level} / 5</div>
                        </>
                      ) : (
                        <>
                          <div className="text-2xl text-[#3a3a45] mb-1">＋</div>
                          <div className="text-[10px] text-[#4b5563] tracking-widest text-center">EMPTY<br />SLOT</div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Fusions */}
            {gameRef.current.skills.fusions.length > 0 && (
              <div className="mt-8 pt-6 border-t border-[#2a2a35]">
                <div className="text-[#c026ff] font-bold tracking-wider mb-2">FUSED ABILITIES</div>
                <div className="flex flex-wrap gap-2">
                  {gameRef.current.skills.fusions.map((f, i) => (
                    <div key={i} className="px-4 py-1 rounded-full bg-[#1a0f22] border border-[#c026ff]/40 text-sm text-[#c026ff]">
                      ✨ {f}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-8 text-center text-[10px] text-[#555] tracking-[1.5px]">
              FILL SLOTS BY PICKING NEW SKILLS ON LEVEL UP • MAX 5 ACTIVE + 5 PASSIVE
            </div>
          </div>
        </div>
      )}

      {/* STAGE CLEAR Screen */}
      {showStageClear && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/95 backdrop-blur-md">
          <div className="text-center">
            <div className={`text-7xl font-display font-black tracking-[-4px] mb-4 drop-shadow-[0_0_30px_rgba(0,249,255,0.7)] ${hud.currentStage === 10 ? 'neon-purple' : 'neon-cyan'}`}>
              {hud.currentStage === 10 ? 'VICTORY — PROTOCOL COMPLETE' : 'STAGE CLEAR!'}
            </div>
            <div className="text-2xl mb-6 text-[#9ca3af]">
              {hud.currentStage === 10 
                ? 'NEONXURGE — YOU ARE THE STORM' 
                : `STAGE ${String(hud.currentStage).padStart(2, '0')} / 10 COMPLETE`}
            </div>

            {/* Rewards Section - Enhanced with NSH */}
            <div className="mb-8">
              <div className="text-sm tracking-[3px] text-[#6b7280] mb-3">REWARDS</div>
              <div className="space-y-2">
                <div className="text-4xl font-display text-[#00f9ff] drop-shadow-[0_0_12px_rgba(0,249,255,0.5)]">
                  +{stageClearRewards.xp} XP
                </div>
                <div className="text-3xl font-display text-[#ff2a6d] flex items-center justify-center gap-2 drop-shadow-[0_0_12px_rgba(255,42,109,0.5)]">
                  <span>◆</span> +{stageClearRewards.shards} Neon Shards
                </div>
                {/* NSH Reward Display */}
                {pendingNshRewards > 0n && (
                  <div className="text-3xl font-display text-[#c026ff] flex items-center justify-center gap-2 drop-shadow-[0_0_12px_rgba(192,38,255,0.5)] animate-pulse">
                    <span>✦</span> +{pendingNshRewards.toString()} NSH
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col items-center gap-3">
              <button
                onClick={() => {
                  const st = gameRef.current;
                  if (!st) return;

                  setShowStageClear(false);

                  const nextStage = Math.min(10, st.currentStage + 1);

                  // Proper clean reset so Stage 2 feels exactly like starting it from the main menu
                  resetForNewStage(st, nextStage);

                  // Small reward burst
                  createLevelUpBurst(st, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);

                  setHud(prev => ({
                    ...prev,
                    currentStage: nextStage,
                    xp: st.xp,
                  }));
                }}
                className="neon-button rounded px-12 py-4 text-xl tracking-widest"
              >
                CONTINUE TO STAGE {Math.min(10, (hud.currentStage || 1) + 1)}
              </button>

              <button
                onClick={returnToMenu}
                className="text-sm text-[#9ca3af] hover:text-white underline tracking-wider"
              >
                RETURN TO MENU
              </button>

              {/* Blockchain NFT Mint CTA (shown after epic runs / Stage 10) */}
              {mintEligibility.eligible && (
                <button
                  onClick={() => {
                    setShowStageClear(false);
                    setShowNFT(true);
                  }}
                  className="mt-2 text-sm px-8 py-2 rounded-lg border border-[#ff2a6d] text-[#ff2a6d] hover:bg-[#ff2a6d] hover:text-black tracking-[3px] transition-all"
                >
                  ★ MINT {NFT_TIERS[mintEligibility.tier]?.label} NFT ON SEPOLIA
                </button>
              )}
            </div>

            {/* Auto-advance disabled per user request — popup waits for manual choice */}
          </div>
        </div>
      )}

      {/* Game Over Modal */}
      {hud.isGameOver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm">
          <div className="game-over-modal rounded-lg p-10 w-full max-w-md text-center">
            <div className="uppercase tracking-[4px] text-xs text-[#ff2a6d] mb-1">RUN TERMINATED</div>
            <div className="font-display text-6xl font-black tracking-[-2.5px] mb-8 neon-pink">GAME OVER</div>

            <div className="grid grid-cols-3 gap-4 mb-9">
              <div className="bg-black/40 rounded p-3">
                <div className="text-[10px] tracking-widest text-[#6b7280]">SCORE</div>
                <div className="font-display text-4xl font-semibold tabular-nums tracking-tighter text-[#00f9ff] mt-1">{hud.score}</div>
              </div>
              <div className="bg-black/40 rounded p-3">
                <div className="text-[10px] tracking-widest text-[#6b7280]">KILLS</div>
                <div className="font-display text-4xl font-semibold tabular-nums tracking-tighter text-[#ff2a6d] mt-1">{hud.kills}</div>
              </div>
              <div className="bg-black/40 rounded p-3">
                <div className="text-[10px] tracking-widest text-[#6b7280]">TIME</div>
                <div className="font-display text-4xl font-semibold tabular-nums tracking-tighter neon-purple mt-1">{formatTime(hud.time)}</div>
              </div>
            </div>

            <div className="flex flex-col gap-3 items-center">
              <button
                onClick={() => resetGame(hud.currentStage)}
                className="neon-button rounded font-display tracking-[3px]"
              >
                RESTART RUN
              </button>

              <button
                onClick={returnToMenu}
                className="text-sm text-[#9ca3af] hover:text-white underline tracking-wider"
              >
                RETURN TO MENU
              </button>
            </div>

            <div className="text-[10px] text-[#4b5563] mt-5 tracking-[1px]">PRESS <span className="text-white/70">R</span> OR <span className="text-white/70">SPACE</span> TO RESTART</div>
          </div>
        </div>
      )}
    </div>
  );
}
