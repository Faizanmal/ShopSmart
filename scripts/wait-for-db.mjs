import net from "node:net";

const url = process.env.DATABASE_URL ?? "postgresql://shopsmart:shopsmart@localhost:5433/shopsmart";
const normalized = url.replace(/^postgresql:/, "http:");
const parsed = new URL(normalized);
const host = process.env.DB_HOST ?? parsed.hostname;
const portFromUrl = parsed.port ? Number(parsed.port) : 5432;
const port = Number(process.env.DB_PORT ?? portFromUrl);

const deadline = Date.now() + 90_000;

function tryConnect() {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port }, () => {
      socket.end();
      resolve(true);
    });
    socket.on("error", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

while (Date.now() < deadline) {
  if (await tryConnect()) {
    console.log(`Database port reachable at ${host}:${port}`);
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, 1000));
}

console.error(`Timed out waiting for database at ${host}:${port}`);
process.exit(1);
