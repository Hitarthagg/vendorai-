import "./env.js";
import { createApp } from "./app.js";
import { createDatabase } from "./db/client.js";

const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be a valid TCP port.");
}

const database = createDatabase();
const app = createApp(database);
const server = app.listen(port, () => {
  console.log(`VendorMind API listening on http://localhost:${port}`);
});

const shutdown = () => {
  server.close(() => {
    database.close();
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
