# The ID Game

## Run

1. Install dependencies via `pnpm install`
2. Add environment variables to `.env.local` (see `.env.example`)
3. Start app with `pnpm start`

## Auth
- [ ] Google
- [ ] Apple

## Gameplay

1. Create a game room
2. Wait for players to join
3. Start Round
    1. Server allocates 10 scenarios to choose from
    2. Round host picks 1 scenario from the list
    3. Round host orders players in most-to-least likely
    4. Non-host players receives the allocated 10 scenarios
    5. Each player picks which scenario round host picked
    6. Once all players have picked, results are shown
4. Play again

## Database Structure

### Player
```
id: uuid pk not null
user_id: uuid fk(auth.users) not null
game_id: uuid fk(game) not null
display_name: text
last_alive: timestamptz default now() not null
```

### Game
```
id: uuid pk not null
join_code: string not null auto-generated
total_rounds: int4 not null default 10
current_round: int4 nullable

unique(join_code)
```

### Scenarios
```
id: uuid pk not null
description: text not null
category: text not null
```

### Game_Round
```
id: uuid pk not null
game_id: uuid fk(game) not null
round_number: int4 not null
host_player_id: uuid fk(player) nullable

unique(game_id, round_number)
```

### Game_Round_Scenarios
```
id: uuid pk not null
game_id: uuid fk(game) not null
round_id: uuid fk(game_round) not null
scenario_id: uuid fk(scenario) not null
selected: boolean default false not null

unique(game_id, scenario_id)
```

### Game_Round_Player_Ranking
```
id: uuid pk not null
game_id: uuid fk(game) not null
round_id: uuid fk(game_round) not null
player_id: uuid fk(game_round) not null
ranking: int4 not null

unique(game_id, round_id, player_id)
```

### Game_Round_Guess
```
id: uuid pk not null
game_id: uuid fk(game) not null
round_id: uuid fk(round) not null
scenario_id: uuid fk(game_round_scenario) not null
player_id: uuid fk(player) not null

unique(game_id, round_id, player_id)
```
