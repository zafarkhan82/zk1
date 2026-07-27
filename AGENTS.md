# AGENTS.md

## Cursor Cloud specific instructions

### Overview
This repository is a **static multi-page website** ("zafar.de") built with plain HTML5, CSS3 and
vanilla JavaScript. There is **no build step, no bundler, no package manager and no dependencies**
to install. Pages live at the repo root (`index.html`, `politik-offenbach.html`,
`smart-solutions.html`, `fussball-jugend.html`, `ahmadiyya-projekte.html`) with shared assets in
`css/` and `js/`.

Note: the actual site files may live on feature branches rather than on `main` (which can be
effectively empty apart from `README.md`). Check the branch you are working on for the HTML/CSS/JS
files.

### Running the site (dev)
Serve the repo root with any static file server, from the directory that contains `index.html`:

- `npx serve . -l 3000` (documented in `README.md`; opens on `http://localhost:3000`). Note that
  `serve` uses "clean URLs": requesting `/politik-offenbach.html` returns a `301` redirect to
  `/politik-offenbach` — this is expected, both resolve to `200`.
- Alternative with zero downloads: `python3 -m http.server 8000` (serves `.html` paths as-is).

There is no lint, test or build tooling in this repo. Verification = open the pages in a browser and
confirm the landing page renders (animated background + four theme cards) and each card navigates to
its topic one-pager.
