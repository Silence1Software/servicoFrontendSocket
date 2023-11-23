const http = require("http");
const { Server } = require("socket.io");

const server = http.createServer();
const io = new Server(server);

var users = [];
var usersRoom = [];

const SocketHandler = (req, res) => {
  if (io) {
    console.log("Socket is already running");
  } else {
    console.log("Socket is initializing");

    io.on("connection", (socket) => {
      const userON = users.some((el) => el.id === socket.id);
      if (!userON) users.push({ id: socket.id });
      console.log(users);
      socket.broadcast.emit("result_users", users);

      // Mensagem privada
      socket.on("private message", ({ content, to }) => {
        socket.to(to).emit("private message", {
          content,
          from: socket.id,
        });
      });

      socket.on("request_users", () => {
        socket.emit("result_users", users);
      });

      socket.on("write_message", (data) => {
        io.to(data.roomName).emit("received_message", {
          id: data.id,
          message: data.messageInput,
        });
      });

      socket.on("create_room", (roomName) => {
        socket.join(roomName);
        socket.room = roomName;
        console.log(`User ${socket.id} create room: ${roomName}`);

        let existingRoom = usersRoom.find((room) => room.roomID === roomName);

        if (!existingRoom) {
          // Se a sala não existe, crie uma nova sala com posições iniciais
          const initialPositions = generateInitialPositions();
          existingRoom = {
            roomID: roomName,
            users: [],
            positions: initialPositions,
          };
          usersRoom.push(existingRoom);
        }

        existingRoom.users.push({ id: socket.id });
        io.to(roomName).emit("room_users", {
          adapter: io.sockets.adapter.rooms.get(roomName),
          users: existingRoom.users,
        });

        // Envie posições iniciais para o usuário recém-conectado
        io.to(roomName).emit("initial_positions", {
          positions: existingRoom.positions,
        });

        socket.broadcast.emit("new_room", { roomName });
      });

      socket.on("join_room", (roomName) => {
        let existingRoom = usersRoom.find((room) => room.roomID === roomName);
        console.log(existingRoom);

        if (!existingRoom) {
          // Se a sala não existe, crie uma nova sala com posições iniciais
          const initialPositions = generateInitialPositions();
          existingRoom = {
            roomID: roomName,
            users: [],
            positions: initialPositions,
          };
          usersRoom.push(existingRoom);
        }

        if (existingRoom.users.find((user) => user.id === socket.id)) return;

        socket.join(roomName);
        socket.room = roomName;
        console.log(`User ${socket.id} joined room: ${roomName}`);

        existingRoom.users.push({ id: socket.id });
        io.to(roomName).emit("room_users", {
          adapter: io.sockets.adapter.rooms.get(roomName),
          users: existingRoom.users,
        });

        // Envie posições iniciais para o usuário recém-conectado
        // console.log(existingRoom);
        io.to(roomName).emit("initial_positions", {
          positions: existingRoom.positions,
        });
      });

      socket.on("update_positions", (updatedPositions) => {
        const roomName = socket.room;
        const existingRoom = usersRoom.find((room) => room.roomID === roomName);

        if (existingRoom) {
          // Atualize as posições específicas da sala
          existingRoom.positions = updatedPositions;
          io.to(roomName).emit("updated_positions", updatedPositions);
        }
      });

      socket.on("leave_room", (roomName) => {
        socket.leave(roomName);
        console.log(`User ${socket.id} leave room: ${roomName}`);
        // Procurar a sala com base no roomName
        const existingRoom = usersRoom.find((room) => room.roomID === roomName);

        if (existingRoom) {
          // Se a sala já existe, adicione o usuário a essa sala
          existingRoom.users = existingRoom.users.filter((user) => user.id !== socket.id);
        }

        console.log(usersRoom);
        console.log("roomName: ", roomName);
        console.log(existingRoom);
        io.to(roomName).emit("room_users", {
          adapter: io.sockets.adapter.rooms.get(roomName),
          users: existingRoom ? existingRoom.users : [],
        });
      });

      socket.on("teste_sala", (roomName) => {
        io.to(roomName).emit("room_users_teste", {
          message: "Olá, você ainda está na sala!",
        });
      });

      socket.on("start_game", () => {
        const roomName = socket.room;
        const room = io.sockets.adapter.rooms.get(roomName);
        const existingRoom = usersRoom.find((room) => room.roomID === roomName);
        if (existingRoom) {
          if (!existingRoom.startGame) existingRoom.startGame = false;
        }
        if (room && room.size >= 3) {
          // let gameInProgress = false;
          io.to(roomName).emit("game_started");
          startGame(io, roomName, existingRoom);
        } else {
          io.to(roomName).emit("insufficient_players");
        }
      });

      socket.on("disconnect", () => {
        console.log("Usuário desconectado:", socket.id);
        users = users.filter((user) => user.id !== socket.id);
        console.log("Lista de usuários após desconexão:", users);
        socket.broadcast.emit("result_users", users);
      });
    });
  }
  res.end();
};

// const startGame = (io, roomName) => {
//   const room = io.sockets.adapter.rooms.get(roomName);
//   const users = Array.from(room);

//   if (users.length >= 3) {
//     let currentPlayerIndex = 0;
//     let countdownTimer;

//     countdownTimer = setInterval(() => {
//       const currentPlayerId = users[currentPlayerIndex];
//       io.to(currentPlayerId).emit('your_turn');
//       io.to(roomName).emit('turn_info', {
//         currentPlayer: currentPlayerId,
//         countdown: 15,
//       });

//       setTimeout(() => {
//         io.to(currentPlayerId).emit('turn_over');
//         currentPlayerIndex = (currentPlayerIndex + 1) % users.length;
//       }, 15000);
//     }, 16000); // Delay timer by 1 second to account for network latency
//   } else {
//     io.to(roomName).emit('insufficient_players');
//   }
// };

function generateInitialPositions() {
  const initialPositions = [];
  const numUsers = 4; // Número de usuários na sala

  for (let i = 0; i < numUsers; i++) {
    let newPosition;

    do {
      newPosition = getRandomPosition();
    } while (isPositionOccupied(newPosition, initialPositions));

    initialPositions.push(newPosition);
  }

  return initialPositions;
}

function isPositionOccupied(newPosition, positions) {
  for (const pos of positions) {
    const deltaX = Math.abs(newPosition.left - pos.left);
    const deltaY = Math.abs(newPosition.top - pos.top);
    if (deltaX < 200 && deltaY < 200) {
      // Update the threshold to prevent characters from overlapping
      return true;
    }
  }
  return false;
}

function getRandomPosition() {
  const randomX = Math.floor(Math.random() * 440 - 200); // Adjust the range to stay within the ul container
  const randomY = Math.floor(Math.random() * 200 - 100);
  const zIndex = Math.floor(Math.random() * 4) + 1; // Z-index de 1 a 4

  return {
    left: `${randomX}px`,
    top: `${randomY}px`,
    zIndex: zIndex,
  };
}

// Assuming you have a variable to keep track of the game status

const startGame = (io, roomName, existingRoom) => {
  const room = io.sockets.adapter.rooms.get(roomName);
  const users = Array.from(room);

  if (!existingRoom.startGame && users.length >= 3) {
    existingRoom.startGame = true;
    let currentPlayerIndex = 0;

    const playTurn = () => {
      const currentPlayerId = users[currentPlayerIndex];
      io.to(currentPlayerId).emit("your_turn");

      let countdown = 5;
      const countdownInterval = setInterval(() => {
        io.to(roomName).emit("turn_info", {
          currentPlayer: currentPlayerId,
          countdown: countdown,
        });

        if (countdown <= 0) {
          clearInterval(countdownInterval);
          io.to(currentPlayerId).emit("turn_over");
          currentPlayerIndex = (currentPlayerIndex + 1) % users.length;

          if (currentPlayerIndex < users.length) {
            setTimeout(playTurn, 1000);
          } else {
            io.to(roomName).emit("game_over");
            gameInProgress = false;
          }
        } else {
          countdown--;
        }
      }, 1000);
    };

    playTurn();
  } else {
    io.to(roomName).emit("insufficient_players");
  }
};

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Servidor Socket.IO rodando na porta ${PORT}`);
});

module.exports = SocketHandler;
