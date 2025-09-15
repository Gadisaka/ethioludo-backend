const http = require("http");
const app = require("./app");
const setupSocketServer = require("./socket");
const connectDB = require("./config/db");

const server = http.createServer(app);
const io = setupSocketServer(server);

// Make io available to the app
app.set('io', io);

connectDB();

server.on("error", (error) => {
  console.error("Server error:", error);
});

const PORT = 4002;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
