# Emberfall Duel

[![make.fun](https://make.fun/badge/best-card-game-20261122-1826.svg)](https://make.fun/c/best-card-game-20261122-1826)
[![rank](https://make.fun/badge/best-card-game-20261122-1826/Wanxt27/best-card-game-entry/rank.svg)](https://make.fun/c/best-card-game-20261122-1826)
[![reward](https://make.fun/badge/best-card-game-20261122-1826/Wanxt27/best-card-game-entry/reward.svg)](https://make.fun/c/best-card-game-20261122-1826)

A complete, original card game that plays offline in a desktop browser from its own
static files. Duel the rival Ember Warden: play ember cards from your hand, spend
energy, break guards, and bring the rival's life to zero before yours falls.

Made for the make.fun bounty "Make the best card game"
(best-card-game-20261122-1826). Referral code: qzc860x6.

## Play

Open `game/index.html` in a desktop browser, or serve the folder with any static
server (`node serve.ts`, then http://localhost:8080).

- Click a card (or press 1-5) to play it, if you can pay its cost.
- Press Space or click End Turn to pass to the rival.
- R restarts, M mutes.

## Layout

- `main.ts` — Node 22 entrypoint: copies `game/` and `screenshots/` to the output
  directory and writes `dossier.json`.
- `game/` — the playable game as static files (no network requests).
- `screenshots/` — real renders of the game.
- `vendor/makefun-game.ts` — vendored make.fun library, unchanged from the kit.
