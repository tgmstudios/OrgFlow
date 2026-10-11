# OrgFlow marketing website

The public homepage lives exclusively in `landing/`. It uses React, TypeScript, locally served assets, and Bun. The production application remains at [orgflow.dev/a/](https://orgflow.dev/a/). All application calls to action open that URL, including from the local preview.

## Local review

From the dedicated landing worktree:

```sh
cd /Users/parth/Projects/c0mpiled-orgflow-landing/landing
bun install --frozen-lockfile
bun run typecheck
bun run test
bun run build
bun run start
```

Preview: **http://localhost:3001**. Keep the last command running while reviewing. `PORT=3011 bun run start` selects another port if 3001 is occupied. Restart the server after editing website files to rebuild the preview. The root repository's build and verification scripts target the product, so run these landing commands directly.

Review at viewport widths 1440, 1024, 768, and 375 pixels. Exercise the hero's “Bring it together” control, all three product example tabs, question selection, source dialogs, source selection and consent, draft editing and publishing, onboarding checkboxes, reset, FAQ disclosures, and the mobile menu. Use Tab, Shift+Tab, Enter, Space, and Escape to review keyboard controls. Also review with reduced motion enabled and check the browser console and network panel for errors or missing assets.

## Files and runtime

`App.tsx` contains the page, navigation, pricing, and FAQ. `Demo.tsx` contains the deterministic fictional food pantry walkthrough. `style.css` and `demo.css` provide responsive layout and motion. `index.html` provides page metadata, and `public/` contains the favicon, social preview artwork, crawler files, and licensed local fonts. `main.tsx` hydrates the prerendered React page.

`build.ts` creates minified browser bundles in ignored `dist/` with root asset URLs, copies `public/`, and prerenders the page into static HTML. `index.ts` rebuilds before starting the static server on loopback port 3001. This supports the existing service's direct `bun run index.ts` entrypoint and the deployment pipeline, which excludes `dist/` during synchronization. It does not require a separate landing build step or a `NODE_ENV` override. A failed build stops startup.

`server.ts` serves only existing files from `dist/`, supports GET and HEAD, rejects traversal and unsupported methods, and returns 404 for missing assets and reserved product routes. Hashed JavaScript and CSS receive immutable caching. HTML and other assets require revalidation. `server.test.ts` checks these contracts with temporary synthetic fixtures.

## Honest product scope

The landing example is labeled fictional sample data. It makes no AI or product API requests, stores no organizational data, and resets when the page reloads. Its checklist demonstrates how a documented procedure can guide a new staff member. It is not a claim that the product has a separate automated handoff generator or a persisted workflow checklist system.

The page describes the current application's file links, Google source selection, assistant, editable drafts, source references, and separate publication action. Browser voice support depends on the browser. Microsoft connectors, calendar synchronization, organization isolation, and paid checkout are not presented as available. The $19 monthly founding offer is a proposed price, with no subscription or charge started by opening the app. The current app is a shared demonstration workspace and should be explored with fictional content.

## Deployment review

This work is prepared on `feat/orgflow-premium-landing`, in a separate worktree based on `origin/main`. The original `feat/foundation` checkout and Aiden's production application are outside this change.

```sh
git status --short
git diff origin/main...HEAD --stat
git diff origin/main...HEAD -- landing/
git log -1 --oneline
```

After the finished landing commit is reviewed, an authorized maintainer can push this branch and open a pull request targeting `main`. Review the current base and confirm that the PR contains only the intended landing changes and the required shared memory handoff. Do not push directly to `main`. Merging a PR into `main` triggers the existing production deployment, so merge only after deployment is authorized.

The existing Nginx routing remains authoritative: `/` goes to port 3001, `/a/` to 3002, and `/api/`, `/auth/`, `/docs`, `/swagger`, `/openapi.json`, and `/health` to 3003. The landing does not proxy or implement those product routes. No Nginx, backend, frontend, AWS, or payment configuration changes are required.

The existing workflow synchronizes source, installs each service with `bun install --frozen-lockfile`, builds the application, and restarts services. Landing builds itself at startup. After an authorized deployment, inspect the live homepage and its assets, then verify `/a/`, an application deep link, backend health, Swagger, and OpenAPI. Confirm the application's sign-in flow separately without adding private content to the demonstration workspace.
