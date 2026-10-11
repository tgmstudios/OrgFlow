import { buildLanding } from "./build";
import { createLandingHandler } from "./server";

// The existing service invokes index.ts directly. Build at startup so the
// unchanged deployment does not depend on rsync copying a dist directory.
await buildLanding();
const port = Number(process.env.PORT ?? 3001);
Bun.serve({
  port,
  hostname: process.env.HOST ?? "127.0.0.1",
  fetch: createLandingHandler(),
  development: false,
});
console.log(`OrgFlow landing ready at http://localhost:${port}`);
