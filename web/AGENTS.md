# Web

The site is static: no backend, no LLM. It runs the exported weights in `models/` in the browser and deploys to GitHub Pages from `web/` on every push to `main`.

## Design skills

Building a page that doesn't exist yet: use taste. That means `design-taste-frontend` for the landing page and `minimalist-ui` for the map app.

Changing a page that already exists: use impeccable, not taste. Run `/impeccable critique` or `/impeccable audit` to find problems and `/impeccable polish` to fix them.

Impeccable is not a required step on every web PR.
