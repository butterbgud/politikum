import { Server, Origins } from 'boardgame.io/dist/cjs/server.js';
import { CitadelGame, CitadelLobby } from './Game.js';

const server = Server({
  games: [CitadelGame, CitadelLobby],
  origins: [
    Origins.LOCALHOST_IN_DEVELOPMENT,
    // Current LAN (router reshuffle)
    "http://192.168.8.14:5176",
    "http://192.168.8.14:5174",

    // Old LAN / fallback
    "http://192.168.0.11:5173",
    "http://192.168.0.11:5174",
    "http://192.168.0.11:5175",
    "http://192.168.0.11:5176",

    "http://localhost:5175",
    "http://localhost:5176"
  ],
});

const PORT = 8000;
server.run({ port: PORT, host: '0.0.0.0' }, () => {
    console.log(`READY_ON_${PORT}`);
});
