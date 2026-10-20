# Contributing

Thanks for wanting to help. This project is free to use and build on — see
[LICENSE.md](LICENSE.md). The one rule is that **derivative works must credit
Dr. Sohil Momin as the original creator**.

## Getting set up

No build step, no dependencies to install. The engine needs only a browser and a
static file server:

```bash
git clone <your-fork>
cd neon-engine
python3 -m http.server 8080
```

Drop the engine next to a game folder and open the game's `index.html` over HTTP.
See [docs/GETTING-STARTED.md](docs/GETTING-STARTED.md).

## Project layout

```
*.js            the engine modules (see docs/ARCHITECTURE.md)
hud.css         all shared HUD / touch / shop / map styling
docs/           architecture, API, getting started, balance
```

## Guidelines

- **No dependencies.** Everything is vanilla ES modules plus a vendored three.js.
- **No binary assets.** Textures, meshes and audio are generated in code. Keep it
  that way — it is what keeps a whole game around 1.5 MB.
- **Keep modules focused.** One system per file; the module table in the README
  should stay accurate.
- **Test in a browser.** Load the game and check the console before opening a PR.
- **Match the style.** Two-space indent, semicolons, `const`/`let`, JSDoc-ish
  section comments. Existing code is the reference.

## Submitting

1. Fork, branch (`feature/my-thing`), commit.
2. Describe what changed and *why* in the PR.
3. Note anything you could not test.

## Reporting bugs

Use the issue template. Include your browser, what you did, what happened, and
what you expected — and the console output if there is any.
