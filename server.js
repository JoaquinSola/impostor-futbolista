import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import { customAlphabet } from "nanoid";
import { readFile } from "fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

// Archivos estáticos
app.use(express.static(path.join(__dirname, "public")));

const nanoid = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 6);
const rooms = new Map();

let FOOTBALLERS = [];

async function loadData() {
    try {
        const data = await readFile(path.join(__dirname, "data.json"), "utf8");
        const json = JSON.parse(data);
        FOOTBALLERS = json.footballers;
        console.log("Datos de futbolistas cargados con éxito.");
    } catch (error) {
        console.error("Error al cargar los datos de futbolistas:", error);
    }
}

loadData().then(() => {
    server.listen(PORT, () => console.log(`Servidor activo en http://localhost:${PORT}`));
});

// Rutas
app.get("/api/create-room", (req, res) => {
  let id;
  do { id = nanoid(); } while (rooms.has(id));
  rooms.set(id, { id, status: "lobby", players: {}, footballer: null, votes: {} });
  res.json({ roomId: id });
});

app.get("/api/room-exists/:id", (req, res) => res.json({ exists: rooms.has(req.params.id) }));
app.get("/room/:id", (req, res) => res.sendFile(path.join(__dirname, "public", "room.html")));

io.on("connection", (socket) => {
  console.log("Jugador conectado:", socket.id);

  socket.on("joinRoom", ({ roomId, name }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    socket.join(roomId);
    room.players[socket.id] = { id: socket.id, name: (name||"SinNombre").slice(0,20), ready: false, isImpostor: false, assignment: null, state: "alive" };
    io.to(roomId).emit("roomUpdate", publicRoomState(room));
    io.to(roomId).emit("players", room.players);
  });

  socket.on("toggleReady", ({ roomId, ready }) => {
    const room = rooms.get(roomId);
    if (!room || !room.players[socket.id]) return;
    room.players[socket.id].ready = !!ready;
    io.to(roomId).emit("roomUpdate", publicRoomState(room));

    if (room.status === "lobby" && allPlayersReady(room)) startGame(roomId);
  });

  socket.on("vote", (targetId) => {
    const room = Array.from(rooms.values()).find(r => r.players[socket.id]);
    if (!room || room.status !== "playing") return;
    const roomId = room.id;
    if (room.players[socket.id].state !== "alive") return;

    room.votes[socket.id] = targetId;
    const alivePlayers = Object.values(room.players).filter(p => p.state==="alive");
    if (Object.keys(room.votes).length === alivePlayers.length) {

      const count = {};
      Object.values(room.votes).forEach(v=>count[v]=(count[v]||0)+1);
      const maxVotes = Math.max(...Object.values(count));
      const topVoted = Object.keys(count).filter(id=>count[id]===maxVotes);

      if (topVoted.length===1) {
        const eliminatedId = topVoted[0];
        const eliminated = room.players[eliminatedId];
        if (eliminated) {
          eliminated.state = "out";
          const alive = Object.values(room.players).filter(p=>p.state==="alive");
          const impostorAlive = alive.find(p=>p.isImpostor);

          if (eliminated.isImpostor) {
            io.to(roomId).emit("roundEnded", { winner: "players", reason: "impostorEliminado" });
            // Espera 3 seg antes de reiniciar
            setTimeout(() => restartRound(roomId), 3000);
          } else if (alive.length===2 && impostorAlive) {
            io.to(roomId).emit("roundEnded", { winner: "impostor", reason: "ultimoImpostor" });
            setTimeout(() => restartRound(roomId), 3000);
          } else {
            io.to(roomId).emit("playerEliminated", {
              id: eliminatedId,
              name: eliminated.name,
              isImpostor: eliminated.isImpostor,
              message: eliminated.isImpostor ? "El impostor fue expulsado 🎉" : "El impostor sigue aquí 😱"
            });
          }
        }
        room.votes = {};
      } else {
        room.votes = {};
        io.to(roomId).emit("popupMessage", "Hubo un empate, seguimos otra ronda!");
      }

      io.to(roomId).emit("players", room.players);
      io.to(roomId).emit("roomUpdate", publicRoomState(room));
    }
  });

  socket.on("disconnect", () => {
    for (const [id, room] of rooms) {
      if (room.players[socket.id]) {
        delete room.players[socket.id];
        if (!Object.keys(room.players).length) rooms.delete(id);
        else {
          io.to(id).emit("roomUpdate", publicRoomState(room));
          io.to(id).emit("players", room.players);
        }
      }
    }
  });

});

function startGame(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  const ids = Object.keys(room.players).filter(id=>room.players[id].state==="alive");
  if (ids.length<3) return;

  room.status="playing";
  room.votes={};

  ids.forEach(id => { room.players[id].isImpostor=false; room.players[id].assignment=null; });

  const impostorId = ids[Math.floor(Math.random()*ids.length)];
  const footballer = FOOTBALLERS[Math.floor(Math.random()*FOOTBALLERS.length)];
  room.footballer = footballer;

  ids.forEach(id => {
    const isImpostor = id===impostorId;
    room.players[id].isImpostor = isImpostor;
    room.players[id].assignment = isImpostor ? "Impostor" : footballer;
    room.players[id].state = "alive";
    room.players[id].ready = false;

    io.to(id).emit("roleAssigned", { role: isImpostor?"Impostor":"Futbolista", value: isImpostor?"Impostor":footballer });
  });

  io.to(roomId).emit("gameStarted", { playerCount: ids.length });
  io.to(roomId).emit("roomUpdate", publicRoomState(room));
  io.to(roomId).emit("players", room.players);
}

function restartRound(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  room.status = "lobby";
  room.footballer = null;
  room.votes = {};

  Object.values(room.players).forEach(p=>{
    p.ready=false;
    p.isImpostor=false;
    p.assignment=null;
    p.state="alive";
  });

  io.to(roomId).emit("roomUpdate", publicRoomState(room));
  io.to(roomId).emit("players", room.players);

  // Inicia nueva ronda después de 1 seg para que alcance a mostrarse popup
  setTimeout(()=>startGame(roomId), 1000);
}

function allPlayersReady(room) {
  const ids = Object.keys(room.players).filter(id=>room.players[id].state==="alive");
  return ids.length>=3 && ids.every(id=>room.players[id].ready);
}

function publicRoomState(room) {
  return {
    id: room.id,
    status: room.status,
    players: Object.entries(room.players).map(([id,p])=>({ id, name:p.name, ready:p.ready, state:p.state }))
  };
}
