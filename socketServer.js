const http = require("http");
const { Server } = require("socket.io");

const server = http.createServer();
const io = new Server(server);

var users = [];
var usersRoom = [];

io.on("connection", (socket) => {
  const userON = users.some((el) => el.id === socket.id);
  if (!userON) users.push({ id: socket.id });

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

  socket.on("request_all_servers", () => {
    socket.emit("result_all_servers", usersRoom || []);
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
        hostID: socket.id,
        users: [],
        maxUsers: 4,
        positions: initialPositions,
        startGame: false,
      };
      usersRoom.push(existingRoom);
    }

    existingRoom.users.push({ id: socket.id });

    // Envie posições iniciais para o usuário recém-conectado
    io.to(roomName).emit("initial_positions", {
      positions: existingRoom.positions,
    });
    // socket.broadcast.emit("result_all_servers", usersRoom || []);
    socket.broadcast.emit("new_room", { roomName });
  });

  socket.on("join_room_me", (roomName) => {
    let existingRoom = usersRoom.find((room) => room.roomID === roomName);

    if (!existingRoom) {
      return;
    }

    io.to(roomName).emit("room_users", {
      adapter: io.sockets.adapter.rooms.get(roomName),
      existingRoom,
    });
  });

  socket.on("join_room", (roomName) => {
    let existingRoom = usersRoom.find((room) => room.roomID === roomName);

    if (!existingRoom) {
      socket.broadcast.emit("room_invalid");
      return;
    }

    if (existingRoom.users.find((user) => user.id === socket.id)) return;

    socket.join(roomName);
    socket.room = roomName;
    console.log(`User ${socket.id} joined room: ${roomName}`);

    existingRoom.users.push({ id: socket.id });
    io.to(roomName).emit("room_users", {
      adapter: io.sockets.adapter.rooms.get(roomName),
      existingRoom,
    });

    // Envie posições iniciais para o usuário recém-conectado
    io.to(roomName).emit("initial_positions", {
      positions: existingRoom.positions,
    });
    socket.broadcast.emit("result_all_servers", usersRoom);
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

  socket.on("leave_room", ({ roomName, user }) => {
    socket.leave(roomName);
    console.log(`User ${socket.id} leave room: ${roomName} user: ${user}`);
    // Procurar a sala com base no roomName
    const existingRoom = usersRoom.find((room) => room.roomID === roomName);

    if (existingRoom) {
      // Se a sala já existe, adicione o usuário a essa sala
      existingRoom.users = existingRoom.users.filter((user) => user.id !== socket.id);
      io.to(user).emit("success_leave_room", true);
      if (existingRoom.user <= 0) {
        usersRoom.filter((room) => room.roomID !== existingRoom.roomID);
      }
    } else {
      return;
    }

    io.to(roomName).emit("room_users", {
      adapter: io.sockets.adapter.rooms.get(roomName),
      existingRoom,
    });
  });

  socket.on("teste_sala", (roomName) => {
    io.to(roomName).emit("room_users_teste", {
      message: "Olá, você ainda está na sala!",
    });
  });

  socket.on("start_game", (roomName) => {
    const room = usersRoom.find((r) => r.roomID === roomName);

    if (room) {
      startGame(io, roomName, room);
    }
  });

  socket.on("disconnect", () => {
    console.log("Usuário desconectado:", socket.id);
    users = users.filter((user) => user.id !== socket.id);
    console.log("Lista de usuários após desconexão:", users);
    socket.broadcast.emit("result_users", users);
  });
});

const startGame = (io, roomName, room) => {
  if (room && room.users.length >= 3) {
    room.startGame = true;
    io.to(roomName).emit("game_started");

    let currentPlayerIndex = 0;
    let isDay = true;

    const playTurn = () => {
      if (isDay) {
        io.to(roomName).emit("your_turn");
        // Durante o dia, todos votam ao mesmo tempo
        let turnDurationDay = 20;
        const countdown = () => {
          io.to(roomName).emit("turn_info_day", {
            countdown: turnDurationDay,
            isDay: isDay,
          });

          if (turnDurationDay > 0) {
            turnDurationDay--;
            setTimeout(countdown, 1000);
          }
        };

        // Inicia o countdown para o turno
        countdown();

        // Aguarde 30 segundos para votar
        setTimeout(() => {
          io.to(roomName).emit("turn_over");
          io.to(roomName).emit("day_turn_over", false);
          isDay = false;

          let count = 10;
          const countdown = () => {
            io.to(roomName).emit("transition_day", {
              countdown: count,
            });

            if (count > 0) {
              count--;
              setTimeout(countdown, 1000);
            }
          };

          countdown();

          // Aguarde 10 segundos antes de começar a noite
          setTimeout(() => {
            playTurn(); // Chama a função para o próximo turno
          }, 10000);
        }, 20000);
      } else {
        // Durante a noite, cada usuário tem seu próprio turno
        const currentPlayerId = room.users[currentPlayerIndex].id;
        io.to(currentPlayerId).emit("your_turn");

        let turnDuration = 5;

        const playNextTurn = () => {
          io.to(currentPlayerId).emit("turn_over");

          currentPlayerIndex = (currentPlayerIndex + 1) % room.users.length;

          if (currentPlayerIndex === 0) {
            io.to(roomName).emit("night_over", true);

            let count = 10;
            const countdown = () => {
              io.to(roomName).emit("transition_day", {
                countdown: count,
              });

              if (count > 0) {
                count--;
                setTimeout(countdown, 1000);
              }
            };

            countdown();

            setTimeout(() => {
              isDay = true;
              playTurn(); // Chama a função para o próximo turno
            }, 10000);
          } else {
            playTurn(); // Chama a função para o próximo turno
          }
        };

        const countdown = () => {
          io.to(roomName).emit("turn_info", {
            currentPlayer: currentPlayerId,
            countdown: turnDuration,
            isDay: isDay,
          });

          if (turnDuration > 0) {
            turnDuration--;
            setTimeout(countdown, 1000);
          } else {
            playNextTurn();
          }
        };

        // Inicia o countdown para o turno
        countdown();
      }
    };

    // Inicia o primeiro turno
    playTurn();
  } else {
    io.to(room.hostID).emit("insufficient_players", { size: room.users.length });
  }
};

// const startGame = (io, roomName, existingRoom) => {
//   const room = io.sockets.adapter.rooms.get(roomName);
//   const users = Array.from(room);

//   if (!existingRoom.startGame && users.length >= 3) {
//     existingRoom.startGame = true;
//     let currentPlayerIndex = 0;

//     const playTurn = () => {
//       const currentPlayerId = users[currentPlayerIndex];
//       io.to(currentPlayerId).emit("your_turn");

//       let countdown = 5;
//       const countdownInterval = setInterval(() => {
//         io.to(roomName).emit("turn_info", {
//           currentPlayer: currentPlayerId,
//           countdown: countdown,
//         });

//         if (countdown <= 0) {
//           clearInterval(countdownInterval);
//           io.to(currentPlayerId).emit("turn_over");
//           currentPlayerIndex = (currentPlayerIndex + 1) % users.length;

//           if (currentPlayerIndex < users.length) {
//             setTimeout(playTurn, 1000);
//           } else {
//             io.to(roomName).emit("game_over");
//             gameInProgress = false;
//           }
//         } else {
//           countdown--;
//         }
//       }, 1000);
//     };

//     playTurn();
//   } else {
//     io.to(roomName).emit("insufficient_players");
//   }
// };

const containerWidth = 1100;
const containerHeight = 300;
const minDistance = 200; // Ajuste conforme necessário

function isPositionOutOfBounds(position) {
  const maxX = containerWidth - 200; // Ajuste conforme necessário
  const maxY = containerHeight - 150;

  return position.left < 0 || position.left > maxX || position.top < 0 || position.top > maxY;
}

function getRandomPosition() {
  const randomX = Math.floor(Math.random() * (containerWidth - 200)); // Ajuste o intervalo
  const randomY = Math.floor(Math.random() * (containerHeight - 150));
  const zIndex = Math.floor(Math.random() * 4) + 1; // Z-index de 1 a 4

  return {
    left: `${randomX}px`,
    top: `${randomY}px`,
    zIndex: zIndex,
  };
}

function isPositionOccupied(newPosition, existingPositions) {
  for (const pos of existingPositions) {
    const deltaX = Math.abs(newPosition.left - pos.left);
    const deltaY = Math.abs(newPosition.top - pos.top);

    // Verificar se a nova posição está muito próxima de qualquer posição existente
    if (deltaX < minDistance && deltaY < minDistance) {
      return true;
    }
  }
  return false;
}

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

const initialPositions = generateInitialPositions();

if (initialPositions.some(isPositionOutOfBounds)) {
  console.error("Alguma posição está fora dos limites do contêiner.");
} else {
  console.log("Todas as posições estão dentro dos limites do contêiner.");
}

// Assuming you have a variable to keep track of the game status

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Servidor Socket.IO rodando na porta ${PORT}`);
});
