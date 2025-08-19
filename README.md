# **Night Dealer**

*Arcane duel on a 3×3 grid — ATK · HEX · WARD
Tiny board game (JS), black-cat ritual vibe. Lightweight, mobile-friendly.*

## Synopsis

On full-moon midnights, a black-furred card-monger — the Night Dealer — weighs the fate of cats. On a 3×3 board, play your arcana to flip adjacent tiles and steal back time. Win rounds, stack life-points up to 9.

## Rules (V1.1)

Goal. At round end, you score as many points as controlled squares (0–9). The match lasts up to 3 rounds: first to 9 points wins (ties possible). At the end of 3 rounds, the player with the most points is declared the winner.

## Board
3×3 grid. Orthogonal adjacency only (N/E/S/W).

## Wheels
Each player has 5 wheels with faces ATK / HEX / WARD.
ECLIPSE: once per player per round. A wheel may have an ECLIPSE face, once used, future rolls will exclude this face. Only one ECLIPSE tile could be sorted in a round.

## Turns (per round: 3 turns/player)

*Turn 1*: initial spin mandatory (uses 1/3 rerolls), then play 1 tile or 2 adjacent tiles.

*Turn 2*: 0–1 reroll optional, then play 1 or 2 adjacent.

*Turn 3*: 0–1 reroll optional, cap at 1 tile (anti-dump).
Playing a tile consumes its wheel (can’t be spun again).

RPS triangle. ATK > HEX > WARD > ATK (ties do nothing).

### Tiles

ATK (Claw). Beats HEX, loses to WARD.

HEX (Curse/Trap, choose one on place).
Curse: if a WARD enemy is adjacent, immediate flip via RPS; else mark 1 adjacent enemy → at the end of the opponent’s next turn, attempt to flip (blocked by shields).
Trap: place 1 visible token on 1 adjacent empty square. If the foe plays there: cancel on-place effect, then immediate flip attempt (blocked by shield). Cap: 1 active trap per player (new replaces old).

WARD (Talisman). On place: +1 shield on self and +1 shield on 1 adjacent ally (per-tile cap = 1). Beats ATK, loses to HEX.

ECLIPSE (Joker). On place, choose an affinity (ATK/HEX/WARD) → it’s an attribute (a trap does not cancel this choice). 1×/round per player.

Omen (second-player balance). P2 may cancel 1 flip attempt per round (any step).

### Reveal & resolve (on “Validate”).

Trap tag: any tile played onto a trapped cell has its on-place effect canceled (attributes remain).

On-place effects for the other tiles (e.g., WARD shields).

Trap triggers (immediate flip attempt; shield may block) → trap consumed.

Simultaneous RPS conversions (orthogonal).

Delayed effects (curses).

Omen (if triggered).

### Look & feel (TBD)

1-bit visuals (black/white), CSS-tinted accents: Night #0B0E12, Shadow #2A2F36, Moon #E2C044, Arcane #6F5AFF, Hex #D14D4D, Ward #3BA7A9.

Icons: ATK (claw), HEX (rune/eye), WARD (seal), ECLIPSE (crescent), shield, trap (token).

Mobile: ≥ 64 px hit-areas; optional “Apprentice” flip preview.

Audio: 3 WebAudio beeps (place / shield / flip), no audio files.

### Controls

Mouse / touch: pick wheels to reroll (max 1 reroll on T2/T3), pick tiles, tap valid squares (1 or 2 adjacent on T1–T2, 1 on T3), Validate.

### License
MIT (TBD)