const port = Number(process.env.PORT ?? 3002);

Bun.serve({
  port,
  routes: {
    "/": () =>
      new Response("<h1>Frontend</h1>", {
        headers: { "Content-Type": "text/html" },
      }),
  },
});

console.log(`frontend listening on :${port}`);
