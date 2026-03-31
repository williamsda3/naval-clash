const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const path = require('path');

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname)));

const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3001;

// ============================================================
// UNIT DEFINITIONS
// ============================================================

const UNIT_DEFINITIONS = {
    patrol_boat: {
        name: 'Patrol Boat',
        cost: 2,
        maxHp: 2,
        damage: 1,
        speed: 2.0, // cells per second (fast)
        behavior: 'base_hunter',
        canSwitchLanes: false,
        isSpell: false,
        isStationary: false,
        attackCooldown: 1500,
        attackRange: 0.8,
        description: 'Cheap & fast, rushes enemy base'
    },
    mine_layer: {
        name: 'Mine Layer',
        cost: 2,
        maxHp: 1,
        damage: 0,
        speed: 0.7, // slow
        behavior: 'mine_layer',
        canSwitchLanes: false,
        isSpell: false,
        isStationary: false,
        attackCooldown: 0,
        attackRange: 0.3,
        mineDamage: 3,
        description: 'Drops a mine, 3 damage to first enemy'
    },
    submarine: {
        name: 'Submarine',
        cost: 4,
        maxHp: 4,
        damage: 2,
        speed: 1.2, // medium
        behavior: 'unit_hunter',
        canSwitchLanes: true,
        canSwitchAnywhere: true, // not limited to gaps
        isSpell: false,
        isStationary: false,
        attackCooldown: 1500,
        attackRange: 0.8,
        description: 'Free movement, hunts enemy units'
    },
    gunboat: {
        name: 'Gunboat',
        cost: 4,
        maxHp: 3,
        damage: 3,
        speed: 1.2,
        behavior: 'flexible',
        canSwitchLanes: false,
        isSpell: false,
        isStationary: false,
        attackCooldown: 1200,
        attackRange: 2.0, // ranged
        canShootAdjacentLane: true,
        description: 'Ranged, shoots 2 cells ahead + adjacent lanes'
    },
    destroyer: {
        name: 'Destroyer',
        cost: 5,
        maxHp: 5,
        damage: 2,
        speed: 1.2,
        behavior: 'unit_hunter',
        canSwitchLanes: true,
        canSwitchAnywhere: false, // only at gaps
        isSpell: false,
        isStationary: false,
        attackCooldown: 1000,
        attackRange: 0.8,
        description: 'Switches lanes at gaps, hunts units'
    },
    repair_ship: {
        name: 'Repair Ship',
        cost: 3,
        maxHp: 2,
        damage: 0,
        speed: 1.2,
        behavior: 'support_heal',
        canSwitchLanes: false,
        isSpell: false,
        isStationary: false,
        attackCooldown: 0,
        attackRange: 0,
        healAmount: 1,
        healRange: 2.0,
        description: 'Heals nearby friendlies 1 HP/sec'
    },
    sea_wall: {
        name: 'Sea Wall',
        cost: 3,
        maxHp: 6,
        damage: 0,
        speed: 0,
        behavior: 'support_wall',
        canSwitchLanes: false,
        isSpell: false,
        isStationary: true,
        attackCooldown: 0,
        attackRange: 0,
        decayInterval: 8000, // lose 1 HP every 8 seconds
        description: 'Blocks enemies, decays over time'
    },
    torpedo_barrage: {
        name: 'Torpedo Barrage',
        cost: 6,
        maxHp: 0,
        damage: 5,
        speed: 0,
        behavior: 'spell',
        canSwitchLanes: false,
        isSpell: true,
        isStationary: false,
        attackCooldown: 0,
        attackRange: 0,
        description: 'Instant! 5 damage to first target in lane'
    },
    battleship: {
        name: 'Battleship',
        cost: 8,
        maxHp: 8,
        damage: 4,
        speed: 0.7, // slow
        behavior: 'base_hunter_fighter',
        canSwitchLanes: false,
        isSpell: false,
        isStationary: false,
        attackCooldown: 2000,
        attackRange: 0.8,
        description: 'Tanky siege unit, fights everything'
    },
    aircraft_carrier: {
        name: 'Aircraft Carrier',
        cost: 7,
        maxHp: 5,
        damage: 1,
        speed: 0.7,
        behavior: 'carrier',
        canSwitchLanes: false,
        isSpell: false,
        isStationary: false,
        attackCooldown: 2000,
        attackRange: 0.8,
        spawnInterval: 5000, // spawn patrol boat every 5 seconds
        description: 'Spawns free Patrol Boats every 5 sec'
    }
};

const ALL_UNIT_TYPES = Object.keys(UNIT_DEFINITIONS);

// ============================================================
// GRID CONFIG
// ============================================================

const GRID_CONFIG = {
    cols: 20,
    lanes: 3,
    islandGapCols: [5, 10, 15],
    p1SpawnCol: 1,
    p2SpawnCol: 18,
    p1HarborCol: 0,
    p2HarborCol: 19,
    p1DefenseMaxCol: 3,  // sea walls in cols 1-3
    p2DefenseMinCol: 16  // sea walls in cols 16-18
};

const MAX_SEA_WALLS = 3;
const MAX_UNITS_PER_PLAYER = 15;
const TICK_INTERVAL = 60; // ms
const BROADCAST_INTERVAL = 200; // ms
const MAX_RESOURCES = 20;

// ============================================================
// LOBBY MANAGEMENT
// ============================================================

const lobbies = new Map();

function generateLobbyCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    // Avoid collisions
    if (lobbies.has(code)) return generateLobbyCode();
    return code;
}

function findLobbyBySocketId(socketId) {
    for (const [, lobby] of lobbies) {
        if (lobby.host.id === socketId || (lobby.guest && lobby.guest.id === socketId)) {
            return lobby;
        }
    }
    return null;
}

function getPlayerRole(lobby, socketId) {
    return lobby.host.id === socketId ? 'player1' : 'player2';
}

function getPlayerData(lobby, role) {
    return lobby.players[role];
}

function getOpponentRole(role) {
    return role === 'player1' ? 'player2' : 'player1';
}

function getSocketId(lobby, role) {
    return role === 'player1' ? lobby.host.id : lobby.guest.id;
}

// ============================================================
// CARD HAND MANAGEMENT
// ============================================================

function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function initializeHand(playerData) {
    const shuffled = shuffleArray(playerData.deck);
    playerData.hand = shuffled.slice(0, 4);
    playerData.drawPile = shuffled.slice(4);
}

function drawCard(playerData) {
    if (playerData.drawPile.length === 0) {
        // Reshuffle: all deck cards except those currently in hand
        const inHand = new Set(playerData.hand);
        const available = playerData.deck.filter(u => !inHand.has(u));
        playerData.drawPile = shuffleArray(available);
    }
    if (playerData.drawPile.length > 0) {
        return playerData.drawPile.shift();
    }
    // Fallback: pick random from deck
    return playerData.deck[Math.floor(Math.random() * playerData.deck.length)];
}

// ============================================================
// UNIT CREATION & MANAGEMENT
// ============================================================

function createUnit(lobby, owner, unitType, lane) {
    const def = UNIT_DEFINITIONS[unitType];
    if (!def || def.isSpell) return null;

    const direction = owner === 'player1' ? 1 : -1;
    const spawnCol = owner === 'player1' ? GRID_CONFIG.p1SpawnCol : GRID_CONFIG.p2SpawnCol;

    const unit = {
        id: lobby.nextUnitId++,
        owner,
        type: unitType,
        lane,
        col: spawnCol,
        hp: def.maxHp,
        maxHp: def.maxHp,
        damage: def.damage,
        speed: def.speed,
        direction,
        behavior: def.behavior,
        canSwitchLanes: def.canSwitchLanes,
        canSwitchAnywhere: def.canSwitchAnywhere || false,
        state: def.isStationary ? 'stationary' : 'marching',
        target: null,
        lastAttackTime: 0,
        attackCooldown: def.attackCooldown,
        attackRange: def.attackRange,
        isStationary: def.isStationary,
        // Special timers
        lastHealTime: 0,
        lastSpawnTime: Date.now(),
        lastDecayTime: Date.now(),
        spawnedThisTick: true // for spawn animation
    };

    lobby.units.push(unit);
    return unit;
}

// ============================================================
// COMBAT & TARGETING
// ============================================================

function getEnemyUnitsInLane(lobby, lane, owner) {
    const enemyOwner = getOpponentRole(owner);
    return lobby.units.filter(u => u.lane === lane && u.owner === enemyOwner && u.state !== 'dead');
}

function getFriendlyUnitsInRange(lobby, unit, range) {
    return lobby.units.filter(u =>
        u.owner === unit.owner &&
        u.id !== unit.id &&
        u.lane === unit.lane &&
        Math.abs(u.col - unit.col) <= range &&
        u.state !== 'dead' &&
        u.hp < u.maxHp
    );
}

function findNearestEnemyInLane(lobby, unit) {
    const enemies = getEnemyUnitsInLane(lobby, unit.lane, unit.owner);
    if (enemies.length === 0) return null;

    let nearest = null;
    let minDist = Infinity;
    for (const enemy of enemies) {
        const dist = Math.abs(enemy.col - unit.col);
        if (dist < minDist) {
            minDist = dist;
            nearest = enemy;
        }
    }
    return nearest;
}

function findNearestEnemyAnyLane(lobby, unit, maxRange) {
    let nearest = null;
    let minDist = Infinity;

    for (let lane = 0; lane < GRID_CONFIG.lanes; lane++) {
        // Gunboat can shoot adjacent lanes
        if (!UNIT_DEFINITIONS[unit.type].canShootAdjacentLane && lane !== unit.lane) continue;
        if (Math.abs(lane - unit.lane) > 1) continue; // only adjacent

        const enemies = getEnemyUnitsInLane(lobby, lane, unit.owner);
        for (const enemy of enemies) {
            const dist = Math.abs(enemy.col - unit.col);
            if (dist <= maxRange && dist < minDist) {
                minDist = dist;
                nearest = enemy;
            }
        }
    }
    return nearest;
}

function isAtHarbor(unit) {
    if (unit.direction === 1 && unit.col >= GRID_CONFIG.p2HarborCol) return true;
    if (unit.direction === -1 && unit.col <= GRID_CONFIG.p1HarborCol) return true;
    return false;
}

function getEnemyHarborHp(lobby, owner) {
    const enemyRole = getOpponentRole(owner);
    return lobby.players[enemyRole].harborHp;
}

function damageHarbor(lobby, owner, damage, events) {
    const enemyRole = getOpponentRole(owner);
    const player = lobby.players[enemyRole];
    player.harborHp = Math.max(0, player.harborHp - damage);
    events.push({
        type: 'harbor_damage',
        target: enemyRole,
        damage,
        remainingHp: player.harborHp
    });
}

function damageUnit(target, damage, source, events) {
    target.hp = Math.max(0, target.hp - damage);
    events.push({
        type: 'unit_damage',
        unitId: target.id,
        damage,
        fromId: source ? source.id : null,
        col: target.col,
        lane: target.lane
    });
    if (target.hp <= 0) {
        target.state = 'dead';
        events.push({
            type: 'unit_death',
            unitId: target.id,
            unitType: target.type,
            owner: target.owner,
            col: target.col,
            lane: target.lane
        });
    }
}

function canAttack(unit, now) {
    return (now - unit.lastAttackTime) >= unit.attackCooldown;
}

// ============================================================
// UNIT BEHAVIOR TICK
// ============================================================

function tickUnit(lobby, unit, deltaTime, now, events) {
    if (unit.state === 'dead') return;

    const def = UNIT_DEFINITIONS[unit.type];

    // ---- Special behaviors ----

    // Sea Wall decay
    if (unit.behavior === 'support_wall') {
        if (now - unit.lastDecayTime >= def.decayInterval) {
            unit.lastDecayTime = now;
            damageUnit(unit, 1, null, events);
        }
        return; // walls don't move or attack
    }

    // Repair Ship healing
    if (unit.behavior === 'support_heal') {
        if (now - unit.lastHealTime >= 1000) {
            unit.lastHealTime = now;
            const friendlies = getFriendlyUnitsInRange(lobby, unit, def.healRange);
            for (const friendly of friendlies) {
                friendly.hp = Math.min(friendly.maxHp, friendly.hp + def.healAmount);
                events.push({
                    type: 'heal',
                    unitId: friendly.id,
                    amount: def.healAmount,
                    col: friendly.col,
                    lane: friendly.lane
                });
            }
        }
        // Repair ships still march forward
        unit.col += unit.speed * unit.direction * (deltaTime / 1000);
        unit.col = Math.max(0, Math.min(GRID_CONFIG.cols - 1, unit.col));
        return;
    }

    // Aircraft Carrier spawning
    if (unit.behavior === 'carrier') {
        if (now - unit.lastSpawnTime >= def.spawnInterval) {
            unit.lastSpawnTime = now;
            const playerData = getPlayerData(lobby, unit.owner);
            const unitCount = lobby.units.filter(u => u.owner === unit.owner && u.state !== 'dead').length;
            if (unitCount < MAX_UNITS_PER_PLAYER) {
                const spawned = createUnit(lobby, unit.owner, 'patrol_boat', unit.lane);
                if (spawned) {
                    spawned.col = unit.col; // spawn at carrier position
                    events.push({
                        type: 'unit_spawned',
                        unitId: spawned.id,
                        unitType: 'patrol_boat',
                        owner: unit.owner,
                        lane: unit.lane,
                        col: unit.col,
                        fromCarrier: true
                    });
                }
            }
        }
        // Carrier also attacks weakly and moves
    }

    // Mine Layer detonation check
    if (unit.behavior === 'mine_layer') {
        const enemies = getEnemyUnitsInLane(lobby, unit.lane, unit.owner);
        for (const enemy of enemies) {
            if (Math.abs(enemy.col - unit.col) <= def.attackRange) {
                // Detonate!
                damageUnit(enemy, def.mineDamage, unit, events);
                unit.state = 'dead';
                events.push({
                    type: 'mine_explode',
                    unitId: unit.id,
                    col: unit.col,
                    lane: unit.lane,
                    targetId: enemy.id
                });
                return;
            }
        }
        // Mine layers just march forward
        unit.col += unit.speed * unit.direction * (deltaTime / 1000);
        unit.col = Math.max(0, Math.min(GRID_CONFIG.cols - 1, unit.col));
        return;
    }

    // ---- Lane switching (Submarine & Destroyer) ----
    if (unit.canSwitchLanes) {
        const atGap = unit.canSwitchAnywhere ||
            GRID_CONFIG.islandGapCols.some(g => Math.abs(unit.col - g) < 0.5);

        if (atGap) {
            const currentEnemy = findNearestEnemyInLane(lobby, unit);
            const currentDist = currentEnemy ? Math.abs(currentEnemy.col - unit.col) : Infinity;

            // Check adjacent lanes
            for (const adjLane of [unit.lane - 1, unit.lane + 1]) {
                if (adjLane < 0 || adjLane >= GRID_CONFIG.lanes) continue;
                const tempUnit = { ...unit, lane: adjLane };
                const adjEnemy = findNearestEnemyInLane(lobby, tempUnit);
                if (adjEnemy) {
                    const adjDist = Math.abs(adjEnemy.col - unit.col);
                    if (adjDist < currentDist - 1) { // meaningful improvement
                        unit.lane = adjLane;
                        events.push({
                            type: 'lane_switch',
                            unitId: unit.id,
                            newLane: adjLane,
                            col: unit.col
                        });
                        break;
                    }
                }
            }
        }
    }

    // ---- Target finding & combat ----

    if (unit.behavior === 'base_hunter') {
        // Pure base hunter: just march, never fight units
        if (isAtHarbor(unit)) {
            if (canAttack(unit, now)) {
                unit.lastAttackTime = now;
                damageHarbor(lobby, unit.owner, unit.damage, events);
                // Unit is consumed after hitting base
                unit.state = 'dead';
                events.push({ type: 'unit_death', unitId: unit.id, unitType: unit.type, owner: unit.owner, col: unit.col, lane: unit.lane });
            }
            return;
        }
        // March forward
        unit.state = 'marching';
        unit.col += unit.speed * unit.direction * (deltaTime / 1000);
        unit.col = Math.max(0, Math.min(GRID_CONFIG.cols - 1, unit.col));
        return;
    }

    if (unit.behavior === 'base_hunter_fighter') {
        // Battleship: fights units in range, but also targets base
        const enemy = findNearestEnemyInLane(lobby, unit);
        if (enemy && Math.abs(enemy.col - unit.col) <= unit.attackRange) {
            unit.state = 'fighting';
            if (canAttack(unit, now)) {
                unit.lastAttackTime = now;
                damageUnit(enemy, unit.damage, unit, events);
            }
            return;
        }
        if (isAtHarbor(unit)) {
            if (canAttack(unit, now)) {
                unit.lastAttackTime = now;
                damageHarbor(lobby, unit.owner, unit.damage, events);
            }
            unit.state = 'fighting';
            return;
        }
        // March forward
        unit.state = 'marching';
        unit.col += unit.speed * unit.direction * (deltaTime / 1000);
        unit.col = Math.max(0, Math.min(GRID_CONFIG.cols - 1, unit.col));
        return;
    }

    if (unit.behavior === 'unit_hunter') {
        const enemy = findNearestEnemyInLane(lobby, unit);
        if (enemy && Math.abs(enemy.col - unit.col) <= unit.attackRange) {
            unit.state = 'fighting';
            if (canAttack(unit, now)) {
                unit.lastAttackTime = now;
                damageUnit(enemy, unit.damage, unit, events);
            }
            return;
        }
        // March toward nearest enemy, or toward base if none
        unit.state = 'marching';
        if (enemy) {
            // Move toward enemy
            const dir = enemy.col > unit.col ? 1 : -1;
            unit.col += unit.speed * dir * (deltaTime / 1000);
        } else {
            unit.col += unit.speed * unit.direction * (deltaTime / 1000);
        }
        unit.col = Math.max(0, Math.min(GRID_CONFIG.cols - 1, unit.col));
        return;
    }

    if (unit.behavior === 'flexible') {
        // Gunboat: ranged, can shoot adjacent lanes
        const enemy = findNearestEnemyAnyLane(lobby, unit, unit.attackRange);
        if (enemy) {
            unit.state = 'fighting';
            if (canAttack(unit, now)) {
                unit.lastAttackTime = now;
                damageUnit(enemy, unit.damage, unit, events);
            }
            return;
        }
        // Check if we can hit harbor from range
        const enemyRole = getOpponentRole(unit.owner);
        const harborCol = enemyRole === 'player1' ? GRID_CONFIG.p1HarborCol : GRID_CONFIG.p2HarborCol;
        if (Math.abs(unit.col - harborCol) <= unit.attackRange) {
            unit.state = 'fighting';
            if (canAttack(unit, now)) {
                unit.lastAttackTime = now;
                damageHarbor(lobby, unit.owner, unit.damage, events);
            }
            return;
        }
        // March
        unit.state = 'marching';
        unit.col += unit.speed * unit.direction * (deltaTime / 1000);
        unit.col = Math.max(0, Math.min(GRID_CONFIG.cols - 1, unit.col));
        return;
    }

    if (unit.behavior === 'carrier') {
        // Carrier also fights weakly at melee range
        const enemy = findNearestEnemyInLane(lobby, unit);
        if (enemy && Math.abs(enemy.col - unit.col) <= unit.attackRange) {
            unit.state = 'fighting';
            if (canAttack(unit, now)) {
                unit.lastAttackTime = now;
                damageUnit(enemy, unit.damage, unit, events);
            }
            return;
        }
        // March slowly
        unit.state = 'marching';
        unit.col += unit.speed * unit.direction * (deltaTime / 1000);
        unit.col = Math.max(0, Math.min(GRID_CONFIG.cols - 1, unit.col));
        return;
    }
}

// ============================================================
// SEA WALL BLOCKING
// ============================================================

function applySeaWallBlocking(lobby) {
    // Enemy units must stop at sea walls
    for (const wall of lobby.units) {
        if (wall.state === 'dead' || wall.behavior !== 'support_wall') continue;

        for (const unit of lobby.units) {
            if (unit.state === 'dead' || unit.owner === wall.owner) continue;
            if (unit.lane !== wall.lane) continue;
            if (unit.isStationary) continue;

            // Check if unit is trying to pass through the wall
            const dist = Math.abs(unit.col - wall.col);
            if (dist < 0.8) {
                // Unit is blocked by wall — push it back
                if (unit.direction === 1 && unit.col > wall.col - 0.8) {
                    unit.col = wall.col - 0.8;
                } else if (unit.direction === -1 && unit.col < wall.col + 0.8) {
                    unit.col = wall.col + 0.8;
                }

                // If unit_hunter or flexible or base_hunter_fighter, attack the wall
                if (['unit_hunter', 'flexible', 'base_hunter_fighter'].includes(unit.behavior)) {
                    unit.state = 'fighting';
                    unit.target = wall.id;
                }
            }
        }
    }
}

// ============================================================
// TORPEDO BARRAGE (SPELL)
// ============================================================

function castTorpedoBarrage(lobby, owner, lane, events) {
    const scanDir = owner === 'player1' ? 1 : -1;
    const enemies = getEnemyUnitsInLane(lobby, lane, owner)
        .sort((a, b) => scanDir === 1 ? a.col - b.col : b.col - a.col);

    if (enemies.length > 0) {
        const target = enemies[0]; // first enemy from caster's side
        damageUnit(target, UNIT_DEFINITIONS.torpedo_barrage.damage, null, events);
        events.push({
            type: 'torpedo_barrage',
            lane,
            owner,
            targetId: target.id,
            col: target.col
        });
    } else {
        // Hit enemy harbor directly
        damageHarbor(lobby, owner, UNIT_DEFINITIONS.torpedo_barrage.damage, events);
        events.push({
            type: 'torpedo_barrage',
            lane,
            owner,
            targetId: 'harbor',
            col: owner === 'player1' ? GRID_CONFIG.p2HarborCol : GRID_CONFIG.p1HarborCol
        });
    }
}

// ============================================================
// HARBOR DEFENSE
// ============================================================

const HARBOR_ATTACK_COOLDOWN = 3000; // ms between shots
const HARBOR_ATTACK_RANGE = 3;       // cols from harbor edge
const HARBOR_DAMAGE = 1;

function harborDefenseTick(lobby, role, now, events) {
    const pd = lobby.players[role];
    if (now - (pd.lastHarborAttack || 0) < HARBOR_ATTACK_COOLDOWN) return;

    const harborCol = role === 'player1' ? GRID_CONFIG.p1HarborCol : GRID_CONFIG.p2HarborCol;
    const enemyRole = getOpponentRole(role);

    // Find nearest enemy unit within range across all lanes
    let nearestEnemy = null;
    let nearestDist = Infinity;

    for (const unit of lobby.units) {
        if (unit.owner !== enemyRole || unit.state === 'dead') continue;
        const dist = Math.abs(unit.col - harborCol);
        if (dist <= HARBOR_ATTACK_RANGE && dist < nearestDist) {
            nearestDist = dist;
            nearestEnemy = unit;
        }
    }

    if (nearestEnemy) {
        pd.lastHarborAttack = now;
        damageUnit(nearestEnemy, HARBOR_DAMAGE, null, events);
        events.push({
            type: 'harbor_attack',
            owner: role,
            targetId: nearestEnemy.id,
            targetLane: nearestEnemy.lane,
            targetCol: nearestEnemy.col
        });
    }
}

// ============================================================
// GAME LOOP
// ============================================================

function gameTick(lobby) {
    const now = Date.now();
    const deltaTime = now - lobby.lastTickTime;
    lobby.lastTickTime = now;
    lobby.tickCount++;

    const events = [];

    // Resource accumulation (1 per second)
    if (now - lobby.lastResourceTick >= 1000) {
        lobby.lastResourceTick = now;
        for (const role of ['player1', 'player2']) {
            const pd = lobby.players[role];
            if (pd.resources < MAX_RESOURCES) {
                pd.resources = Math.min(MAX_RESOURCES, pd.resources + 1);
            }
        }
    }

    // Tick all units
    for (const unit of lobby.units) {
        unit.spawnedThisTick = false;
        tickUnit(lobby, unit, deltaTime, now, events);
    }

    // Harbor defense cannons
    harborDefenseTick(lobby, 'player1', now, events);
    harborDefenseTick(lobby, 'player2', now, events);

    // Apply sea wall blocking
    applySeaWallBlocking(lobby);

    // Remove dead units
    const deadUnits = lobby.units.filter(u => u.state === 'dead');
    for (const dead of deadUnits) {
        if (dead.behavior === 'support_wall') {
            const pd = getPlayerData(lobby, dead.owner);
            pd.seaWallCount = Math.max(0, pd.seaWallCount - 1);
        }
    }
    lobby.units = lobby.units.filter(u => u.state !== 'dead');

    // Check win condition
    const p1Hp = lobby.players.player1.harborHp;
    const p2Hp = lobby.players.player2.harborHp;
    if (p1Hp <= 0 || p2Hp <= 0) {
        let winner = null;
        if (p1Hp <= 0 && p2Hp <= 0) {
            winner = 'draw';
        } else if (p1Hp <= 0) {
            winner = 'player2';
        } else {
            winner = 'player1';
        }

        const winnerName = winner === 'draw' ? 'Draw' :
            winner === 'player1' ? lobby.host.name : lobby.guest.name;

        io.to(lobby.code).emit('gameOver', {
            winner: winnerName,
            winnerRole: winner,
            stats: {
                player1: { harborHp: p1Hp, unitsDeployed: lobby.players.player1.totalDeployed || 0 },
                player2: { harborHp: p2Hp, unitsDeployed: lobby.players.player2.totalDeployed || 0 }
            }
        });

        clearInterval(lobby.gameInterval);
        lobby.phase = 'gameOver';
        // Clean up after a delay
        setTimeout(() => lobbies.delete(lobby.code), 30000);
        return;
    }

    // Broadcast state every BROADCAST_INTERVAL
    if (now - lobby.lastBroadcast >= BROADCAST_INTERVAL) {
        lobby.lastBroadcast = now;
        broadcastGameState(lobby, events);
    }
}

function broadcastGameState(lobby, events) {
    const unitStates = lobby.units.map(u => ({
        id: u.id,
        type: u.type,
        owner: u.owner,
        lane: u.lane,
        col: parseFloat(u.col.toFixed(2)),
        hp: u.hp,
        maxHp: u.maxHp,
        state: u.state
    }));

    for (const role of ['player1', 'player2']) {
        const pd = lobby.players[role];
        const socketId = getSocketId(lobby, role);

        io.to(socketId).emit('gameState', {
            tick: lobby.tickCount,
            timestamp: Date.now(),
            units: unitStates,
            events,
            // Private data
            resources: pd.resources,
            harborHp: pd.harborHp,
            enemyHarborHp: lobby.players[getOpponentRole(role)].harborHp,
            hand: pd.hand.map(unitType => ({
                unitType,
                cost: UNIT_DEFINITIONS[unitType].cost,
                name: UNIT_DEFINITIONS[unitType].name
            }))
        });
    }
}

// ============================================================
// START GAME
// ============================================================

function startGame(lobby) {
    lobby.phase = 'playing';
    lobby.tickCount = 0;
    lobby.lastTickTime = Date.now();
    lobby.lastResourceTick = Date.now();
    lobby.lastBroadcast = 0;
    lobby.units = [];
    lobby.nextUnitId = 1;

    for (const role of ['player1', 'player2']) {
        const pd = lobby.players[role];
        pd.resources = 5;
        pd.harborHp = 20;
        pd.seaWallCount = 0;
        pd.totalDeployed = 0;
        pd.lastHarborAttack = 0;
        initializeHand(pd);
    }

    // Notify both players
    io.to(lobby.host.id).emit('gameStart', {
        playerRole: 'player1',
        unitDefs: UNIT_DEFINITIONS,
        gridConfig: GRID_CONFIG
    });
    io.to(lobby.guest.id).emit('gameStart', {
        playerRole: 'player2',
        unitDefs: UNIT_DEFINITIONS,
        gridConfig: GRID_CONFIG
    });

    // Start game loop
    lobby.gameInterval = setInterval(() => gameTick(lobby), TICK_INTERVAL);
}

// ============================================================
// SOCKET HANDLERS
// ============================================================

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // ---- Lobby ----

    socket.on('createLobby', ({ playerName }) => {
        const code = generateLobbyCode();
        const lobby = {
            code,
            host: { id: socket.id, name: playerName },
            guest: null,
            phase: 'waiting', // waiting | deckSelection | playing | gameOver
            players: {
                player1: { resources: 5, deck: [], hand: [], drawPile: [], seaWallCount: 0, harborHp: 20, deckReady: false, totalDeployed: 0 },
                player2: { resources: 5, deck: [], hand: [], drawPile: [], seaWallCount: 0, harborHp: 20, deckReady: false, totalDeployed: 0 }
            },
            units: [],
            nextUnitId: 1,
            gameInterval: null,
            lastTickTime: 0,
            lastResourceTick: 0,
            lastBroadcast: 0,
            tickCount: 0
        };

        lobbies.set(code, lobby);
        socket.join(code);
        socket.lobbyCode = code;

        console.log(`Lobby created: ${code} by ${playerName}`);
        socket.emit('lobbyCreated', { code });
    });

    socket.on('joinLobby', ({ code, playerName }) => {
        const lobby = lobbies.get(code);

        if (!lobby) {
            socket.emit('error', { message: 'Lobby not found' });
            return;
        }
        if (lobby.guest) {
            socket.emit('error', { message: 'Lobby is full' });
            return;
        }

        lobby.guest = { id: socket.id, name: playerName };
        socket.join(code);
        socket.lobbyCode = code;

        console.log(`${playerName} joined lobby ${code}`);

        // Notify host
        io.to(lobby.host.id).emit('opponentJoined', { opponentName: playerName });
        // Notify guest
        io.to(lobby.guest.id).emit('opponentJoined', { opponentName: lobby.host.name });

        // Move to deck selection
        lobby.phase = 'deckSelection';
        const unitDefs = {};
        for (const [key, def] of Object.entries(UNIT_DEFINITIONS)) {
            unitDefs[key] = {
                name: def.name,
                cost: def.cost,
                maxHp: def.maxHp,
                damage: def.damage,
                speed: def.speed,
                behavior: def.behavior,
                description: def.description,
                isSpell: def.isSpell
            };
        }
        io.to(code).emit('deckSelectionPhase', { availableUnits: unitDefs });
    });

    // ---- Deck Selection ----

    socket.on('selectDeck', ({ units }) => {
        const lobby = findLobbyBySocketId(socket.id);
        if (!lobby || lobby.phase !== 'deckSelection') return;

        // Validate: exactly 8 units from the 10 available
        if (!Array.isArray(units) || units.length !== 8) {
            socket.emit('error', { message: 'Must select exactly 8 units' });
            return;
        }
        const uniqueUnits = new Set(units);
        if (uniqueUnits.size !== 8) {
            socket.emit('error', { message: 'Duplicate units not allowed' });
            return;
        }
        for (const u of units) {
            if (!UNIT_DEFINITIONS[u]) {
                socket.emit('error', { message: `Unknown unit type: ${u}` });
                return;
            }
        }

        const role = getPlayerRole(lobby, socket.id);
        lobby.players[role].deck = units;
        lobby.players[role].deckReady = true;

        socket.emit('deckConfirmed');

        // Notify opponent
        const opponentId = getSocketId(lobby, getOpponentRole(role));
        io.to(opponentId).emit('opponentDeckReady');

        // If both ready, start game
        if (lobby.players.player1.deckReady && lobby.players.player2.deckReady) {
            // Brief countdown
            io.to(lobby.code).emit('countdown', { seconds: 3 });
            setTimeout(() => {
                if (lobby.phase === 'deckSelection') {
                    startGame(lobby);
                }
            }, 3000);
        }
    });

    // ---- Gameplay ----

    socket.on('deployUnit', ({ cardIndex, lane }) => {
        const lobby = findLobbyBySocketId(socket.id);
        if (!lobby || lobby.phase !== 'playing') return;

        const role = getPlayerRole(lobby, socket.id);
        const pd = lobby.players[role];

        // Validate card index
        if (cardIndex < 0 || cardIndex >= pd.hand.length) {
            socket.emit('deployFailed', { reason: 'Invalid card index' });
            return;
        }

        // Validate lane
        if (lane < 0 || lane >= GRID_CONFIG.lanes) {
            socket.emit('deployFailed', { reason: 'Invalid lane' });
            return;
        }

        const unitType = pd.hand[cardIndex];
        const def = UNIT_DEFINITIONS[unitType];

        // Check resources
        if (pd.resources < def.cost) {
            socket.emit('deployFailed', { reason: 'Not enough resources' });
            return;
        }

        // Handle spells
        if (def.isSpell) {
            pd.resources -= def.cost;
            const events = [];
            castTorpedoBarrage(lobby, role, lane, events);

            // Replace card in hand
            pd.hand.splice(cardIndex, 1);
            const newCard = drawCard(pd);
            pd.hand.splice(cardIndex, 0, newCard);
            pd.totalDeployed = (pd.totalDeployed || 0) + 1;

            // Broadcast events immediately
            broadcastGameState(lobby, events);

            socket.emit('deployConfirmed', { cardIndex, unitType, isSpell: true });
            return;
        }

        // Check unit count limit
        const unitCount = lobby.units.filter(u => u.owner === role && u.state !== 'dead').length;
        if (unitCount >= MAX_UNITS_PER_PLAYER) {
            socket.emit('deployFailed', { reason: 'Max units reached (15)' });
            return;
        }

        // Sea Wall restrictions
        if (unitType === 'sea_wall') {
            if (pd.seaWallCount >= MAX_SEA_WALLS) {
                socket.emit('deployFailed', { reason: 'Max 3 Sea Walls' });
                return;
            }
            pd.seaWallCount++;
        }

        // Deploy
        pd.resources -= def.cost;
        const unit = createUnit(lobby, role, unitType, lane);

        // Sea walls spawn further back
        if (unitType === 'sea_wall') {
            unit.col = role === 'player1' ?
                GRID_CONFIG.p1DefenseMaxCol :
                GRID_CONFIG.p2DefenseMinCol;
        }

        // Replace card in hand
        pd.hand.splice(cardIndex, 1);
        const newCard = drawCard(pd);
        pd.hand.splice(cardIndex, 0, newCard);
        pd.totalDeployed = (pd.totalDeployed || 0) + 1;

        socket.emit('deployConfirmed', { cardIndex, unitType, unitId: unit.id });
    });

    // ---- Disconnect ----

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);

        const lobby = findLobbyBySocketId(socket.id);
        if (!lobby) return;

        // Clean up game loop
        if (lobby.gameInterval) {
            clearInterval(lobby.gameInterval);
        }

        // Notify other player
        const isHost = lobby.host.id === socket.id;
        const otherId = isHost ?
            (lobby.guest ? lobby.guest.id : null) :
            lobby.host.id;

        if (otherId) {
            io.to(otherId).emit('opponentDisconnected');
        }

        lobbies.delete(lobby.code);
        console.log(`Lobby ${lobby.code} closed due to disconnect`);
    });
});

// ============================================================
// START SERVER
// ============================================================

server.listen(PORT, () => {
    console.log(`Naval Clash server running on port ${PORT}`);
    console.log(`Game lobbies will be managed in memory`);
});
