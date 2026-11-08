import { createRelayServer } from "./relay";

// Configuration through environment variables:
//   PORT             listening port (default 8787)
//   HOST             listening address (default 127.0.0.1, so only a reverse proxy can reach it)
//   ALLOWED_ORIGINS  comma separated browser origins, e.g. https://www.buening.eu (default: all)
const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "127.0.0.1";
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);

const server = await createRelayServer({ port, host, allowedOrigins });
console.log(
  `Hexagon relay listening on ${host}:${server.port}` +
    (allowedOrigins.length > 0 ? ` for ${allowedOrigins.join(", ")}` : " for all origins")
);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void server.close().then(() => process.exit(0));
  });
}
