const { Server } = require("socket.io");
const authenticateSocket = require("./auth");
const registerSocketHandlers = require("./handlers");

function setupSocketServer(server) {
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });
  io.use(authenticateSocket);
  registerSocketHandlers(io);
  return io;
}

module.exports = setupSocketServer;
