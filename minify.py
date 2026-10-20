#!/usr/bin/env python3
"""minify.py — produce minified, bundled game assets with esbuild.

Turns ~30 module requests into 2, and cuts the transferred bytes by roughly 60%.
Run standalone:  python3 minify.py
Used by build_packages.py; safe to skip (it falls back to the source files).
"""
import os, shutil, subprocess, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
ENGINE = os.path.join(ROOT, "engine")
NODE_BIN = shutil.which("node") or "node"


def _esbuild_js(args):
    """Call the esbuild JS API through node (no global CLI needed)."""
    script = """
const esbuild = require('esbuild');
esbuild.build(%s).then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });
""" % args
    r = subprocess.run([NODE_BIN, "-e", script], cwd=ROOT, capture_output=True, text=True,
                       env={**os.environ, "NODE_PATH": _node_path()})
    return r.returncode == 0, (r.stderr or r.stdout).strip()


def _node_path():
    try:
        out = subprocess.run(["npm", "root", "-g"], capture_output=True, text=True).stdout.strip()
        return out + os.pathsep + os.environ.get("NODE_PATH", "")
    except Exception:
        return os.environ.get("NODE_PATH", "")


def minify_three(dest_dir):
    """Minify the vendored three build on its own (fallback path)."""
    out = os.path.join(dest_dir, "three.module.min.js")
    ok, err = _esbuild_js("{ entryPoints: [%r], outfile: %r, format: 'esm', minify: true, "
                          "legalComments: 'none', target: 'es2020' }"
                          % (os.path.join(ENGINE, "three.module.js"), out))
    return ok, err, out


def bundle_game(game, dest_dir, name):
    """Bundle one game into ONE file: the engine, the game, and three inlined.

    Two things this buys:

    * **IIFE format, not ESM.** Browsers refuse to load ES modules from `file://`
      URLs, so an ESM bundle only works behind a server. A classic script loads
      fine from disk, which means the game can be launched by double-clicking
      index.html with no server at all.
    * **three is inlined**, so esbuild tree-shakes it against what we actually
      import — worth roughly 180 KB.
    """
    out = os.path.join(dest_dir, name)
    ok, err = _esbuild_js("{ entryPoints: [%r], outfile: %r, bundle: true, format: 'iife', "
                          "minify: true, legalComments: 'none', target: 'es2020', "
                          "alias: { three: %r } }"
                          % (os.path.join(ROOT, game, game + ".js"), out,
                             os.path.join(ENGINE, "three.module.js")))
    return ok, err, out


def main():
    stage = os.path.join(ROOT, "_min")
    os.makedirs(stage, exist_ok=True)
    for g in ("survival", "police"):
        ok, err, path = bundle_game(g, stage, g + ".game.js")
        print(("bundled %s -> %.0f KB" % (g, os.path.getsize(path) / 1024)) if ok
              else "%s bundle FAILED: %s" % (g, err))


if __name__ == "__main__":
    main()
