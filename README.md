# The ID Game

## Run

1. Install dependencies via `pnpm install`
2. Add environment variables to `.env.local` (see `.env.example`)
3. Start app with `pnpm start`

## Auth
- [ ] Google
- [ ] Apple
- [ ] Instagram
- [ ] TikTok

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

## Database Functions
1. Generate Room Code: Generate 6 alphanumerics to uniquely identify a game room
2. Pick Scenarios: Pick 10 scenarios at random for each game
3. Initialise Game Rounds: Take the number of rounds to play and create game rounds. generate the scenarios for each round
4. Pick Game Host: Pick a host for the game. Gets players who have been host least and randomly selects from list of least hosted players. Eg: `{ 'player1': 1, 'player2': 2, 'player3': 1, } => ['player1', 'player2']`

## Development Plan
1. Auth
2. Create games
3. Users joining and leaving game
    - Heartbeat (kicked out if heartbeat not received within 60 secs)
4. Game start
    - Initialise Game Rounds
    - Set Game.current_round once rounds initialised
5. Pick host for Game Round
5. (HOST) Scenario selection and player ordering
6. (PLAYERS) Scenario list and player order receive
7. (PLAYERS) Guess scenario
8. (HOST) Wait for guesses from players
9. Display results and Game Round transition
10. End game (teardown)
