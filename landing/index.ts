const port = Number(process.env.PORT ?? 3001);

Bun.serve({
  port,
  routes: {
    "/": () =>
      new Response("<h1>Landing</h1>", {
        headers: { "Content-Type": "text/html" },
      }),
  },
});

console.log(`landing listening on :${port}`);
