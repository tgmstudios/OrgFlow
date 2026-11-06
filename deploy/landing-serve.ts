// Serves the landing bundle prebuilt in the image (index.ts rebuilds at startup, which needs more memory).
import { createLandingHandler } from "./server";
Bun.serve({
  port: Number(process.env.PORT ?? 3001),
  hostname: process.env.HOST ?? "127.0.0.1",
  fetch: createLandingHandler(),
  development: false,
});
console.log("OrgFlow landing (prebuilt) listening");
