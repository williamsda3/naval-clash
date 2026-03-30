# Naval Clash

A real-time 1v1 naval combat game. Deploy ships, control lanes, and destroy your opponent's harbor.

## How to Play

### Setup
1. Install dependencies: `npm install`
2. Start the server: `npm start`
3. Open `index.html` in two browser tabs
4. Player 1 creates a game, shares the 4-letter code
5. Player 2 joins with the code

### Deck Selection
Choose 8 of 10 available units for your deck. Both players must confirm before the battle begins.

### Gameplay
- Resources accumulate at 1 per second (start with 5, max 20)
- Click a card in your hand, then click a lane to deploy
- Units auto-march toward the enemy harbor and fight automatically
- Destroy the enemy harbor (20 HP) to win

### Units

| Unit | Cost | HP | DMG | Speed | Behavior |
|---|---|---|---|---|---|
| Patrol Boat | 2 | 2 | 1 | Fast | Rushes enemy base, ignores units |
| Mine Layer | 2 | 1 | 3* | Slow | Drops mine, detonates on first enemy contact |
| Submarine | 4 | 4 | 2 | Medium | Free movement across lanes, hunts units |
| Gunboat | 4 | 3 | 3 | Medium | Ranged (2 cells), shoots adjacent lanes |
| Destroyer | 5 | 5 | 2 | Medium | Switches lanes at gaps, hunts units |
| Repair Ship | 3 | 2 | 0 | Medium | Heals nearby friendly units 1 HP/sec |
| Sea Wall | 3 | 6 | 0 | Static | Blocks enemies, decays over time (max 3) |
| Torpedo Barrage | 6 | - | 5 | Instant | Spell: hits first target in lane |
| Battleship | 8 | 8 | 4 | Slow | Tank, fights everything on the way to base |
| Aircraft Carrier | 7 | 5 | 1 | Slow | Spawns free Patrol Boats every 5 sec |

### Lanes
- 3 ocean lanes separated by island chains
- Island gaps at 3 positions allow Destroyers to switch lanes
- Submarines can switch lanes anywhere

### Defense
- Sea Walls can only be placed in your back 3 rows
- Maximum 3 Sea Walls active at once
- Sea Walls lose 1 HP every 8 seconds (decay)

## Tech Stack

- **Frontend**: React 18 (CDN), Tailwind CSS
- **Backend**: Node.js, Express, Socket.io
- **Real-time**: WebSockets (200ms state broadcasts)

## Development

```bash
npm run dev  # auto-restart with nodemon
```
