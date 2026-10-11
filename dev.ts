/** Start the local OrgFlow frontend and backend together. */
const children = ["backend", "frontend"].map((directory) =>
  Bun.spawn([process.execPath, "run", "start"], {
    cwd: new URL(`./${directory}/`, import.meta.url).pathname,
    env: {
      ...process.env,
      PATH: `${process.execPath.slice(0, process.execPath.lastIndexOf("/"))}:${process.env.PATH || ""}`,
    },
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  }),
);
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
const exitCode = await Promise.race(children.map((child) => child.exited));
stop();
await Promise.all(children.map((child) => child.exited));
process.exit(exitCode);
