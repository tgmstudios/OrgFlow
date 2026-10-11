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

Review at viewport widths 1440, 1024, 768, and 375 pixels. Exercise the hero’s “Bring it together” control, then follow the guided example from “See the answer” through its citation, source preview, editable procedure, review, publication, and successor checklist. “Explore the full example” reveals the three original workspace modes, question selection, source selection and consent, draft editing and publishing, and onboarding checkboxes. Check both reset controls, the four FAQ disclosures, and the mobile menu. Use Tab, Shift+Tab, Enter, Space, and Escape to review keyboard controls. Also review with reduced motion enabled and check the browser console and network panel for errors or missing assets.

## Files and runtime

`App.tsx` contains the six section page, navigation, pricing, and FAQ. `GuidedDemo.tsx` contains the focused default journey. `Demo.tsx` retains the richer optional workspace, and both use the fictional sources in `sample-data.ts`. `style.css`, `refinement.css`, `demo.css`, and `guided-demo.css` provide responsive layout and motion. `index.html` provides page metadata, and `public/` contains the favicon, social preview artwork, crawler files, and licensed local fonts. `main.tsx` hydrates the prerendered React page.

`build.ts` creates minified browser bundles in ignored `dist/` with root asset URLs, copies `public/`, and prerenders the page into static HTML. `index.ts` rebuilds before starting the static server on loopback port 3001. This supports the existing service's direct `bun run index.ts` entrypoint and the deployment pipeline, which excludes `dist/` during synchronization. It does not require a separate landing build step or a `NODE_ENV` override. A failed build stops startup.

`server.ts` serves only existing files from `dist/`, supports GET and HEAD, rejects traversal and unsupported methods, and returns 404 for missing assets and reserved product routes. Hashed JavaScript and CSS receive immutable caching. HTML and other assets require revalidation. `server.test.ts` checks these contracts with temporary synthetic fixtures.

## Honest product scope

The landing example is labeled fictional sample data. It makes no AI or product API requests, stores no organizational data, and resets when the page reloads. Its checklist demonstrates how a documented procedure can guide a new staff member. It is not a claim that the product has a separate automated handoff generator or a persisted workflow checklist system.

The page describes file links, Google source selection, the assistant, editable drafts, source references, and separate publication. Browser voice support depends on the browser. The $19 monthly founding offer is a proposed price, with no subscription or charge started by opening the app. Choose the shared demonstration workspace and use fictional content there. Current main includes organization scoping and hosted pricing and billing sessions, but live isolation guarantees and payment configuration were not verified during this landing polish. The page makes no guarantees about them.

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

## Simplicity refinement handoff

Confirmed direction: preserve the premium visual identity and existing functionality while reducing repetition and the number of choices shown initially. All refinement changes are confined to `landing/`, on the existing `feat/orgflow-premium-landing` branch. No dependency, production application, backend, deployment, or infrastructure changes are included.

The page now has six main sections: hero, one knowledge handoff story, guided demonstration, compact product overview, pricing with essential FAQ, and the purple closing. The problem and how it works sections are combined. Human control moves into the draft review stage. The separate audience section is removed, and the larger feature presentation becomes one article visual with three concise capabilities. Four FAQ questions sit beside pricing. The proposed founding price and shared demonstration workspace limitation remain explicit.

Measurements compare baseline `06ad974` with the first simplicity refinement at `4df813e` in its default interaction state in Chrome at a 1440 by 900 viewport, after fonts load and sections are revealed. Word counts use rendered `body.innerText` separated by whitespace. Closed disclosures and the hidden full workspace are excluded by the browser. The outside demo count subtracts `#demo.innerText` from the total.

| Measurement | Original | Refined |
| --- | ---: | ---: |
| Main sections | 10 | 6 |
| Initial rendered words | 1,244 | 488 |
| Words outside the demo | 1,014 | 448 |
| Desktop page height | 7,994px | 4,515px |
| Demo position from page top | 2,357px | 1,433px |
| Mobile page height at 375px | 10,677px | 5,313px |

Validation: `bun run typecheck`, seven server tests with 82 assertions, and `bun run build` pass. Actual browser checks at 1440, 1024, 768, and 375 pixels cover navigation, application destinations, hero transformation, all four FAQs, mobile menu dismissal, keyboard focus, fonts and assets, and reduced motion. Both demonstration journeys pass source focus trapping and restoration, consent gating, edit validation, explicit publication, published snapshot preservation, checklists, reset, and optional workspace state preservation. Automated accessibility checks report zero violations on the page at every width and across 28 guided states. Browser checks found no console, page, missing asset, or horizontal overflow errors and no live AI requests. Before and after desktop and mobile screenshots were inspected.

The preview remains `http://localhost:3001`. Review and authorize any later push, merge, or deployment separately.

## Product visual polish

The guided assistant now uses the actual 6 KB knot asset from `frontend/brand-knot.webp` at production source `ef924dc`, copied into `landing/public/`. Its warm paper canvas, serif question, and teal citation details follow the current product while preserving the landing’s purple actions, editorial typography, hero, and six sections. The successor checklist includes an accessible progress indicator. Reset, source preview, and illustration controls have larger touch targets, and the opaque navigation keeps content beneath it from showing through.

The hero now names nonprofits directly. Current main was inspected read only to correct stale broad claims about organization isolation and unavailable checkout. The shared demo warning and proposed founding price remain explicit. No product files or dependency inputs changed, and no paid generation, purchase, deployment, push, or merge occurred.
