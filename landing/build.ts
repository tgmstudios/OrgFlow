import { cp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import App from "./App";

export async function buildLanding() {
  const destination = resolve(import.meta.dir, "dist");
  const result = await Bun.build({
    entrypoints: [resolve(import.meta.dir, "index.html")],
    outdir: destination,
    target: "browser",
    publicPath: "/",
    external: ["/fonts/*"],
    define: { "process.env.NODE_ENV": '"production"' },
    minify: true,
    sourcemap: "none",
  });
  if (!result.success)
    throw new AggregateError(result.logs, "Landing build failed");
  await mkdir(destination, { recursive: true });
  await cp(resolve(import.meta.dir, "public"), destination, {
    recursive: true,
  });
  // Bun attempts to bundle preload links. Add stable self-hosted font preloads
  // after bundling, keeping fonts separate from the small stylesheet.
  const html = Bun.file(resolve(destination, "index.html"));
  const markup = renderToString(React.createElement(App));
  await Bun.write(
    html,
    (await html.text())
      .replace('<div id="root"></div>', `<div id="root">${markup}</div>`)
      .replace(
        "</head>",
        '<link rel="preload" href="/fonts/geist-latin.woff2" as="font" type="font/woff2" crossorigin><link rel="preload" href="/fonts/newsreader-latin.woff2" as="font" type="font/woff2" crossorigin></head>',
      ),
  );
  console.log(`Built ${result.outputs.length} landing bundles`);
}
if (import.meta.main) await buildLanding();
