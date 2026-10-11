const port = Number(process.env.PORT ?? 3003);

Bun.serve({
  port,
  routes: {
    "/": () => Response.json({ service: "backend", status: "ok" }),
    "/health": () => Response.json({ status: "ok" }),
  },
});

console.log(`backend listening on :${port}`);
