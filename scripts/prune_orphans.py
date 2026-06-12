#!/usr/bin/env python3
"""
Prune orphaned generated page directories.

build_seo.js writes sitemap.xml as the authoritative manifest of every page the
current build emits. Over time, when a strain / product / brand drops out of the
build (inventory shifts, a slug changes), its old page directory is left
stranded on disk: still served to users and Google with weeks-old prices, but
absent from the sitemap. clean_orphans.py only scrubs stale data inside
js/data.js, and the commit step uses a selective `git add` allowlist, so nothing
in the pipeline ever removes these stale page directories.

This script deletes any served page directory that is NOT in the current
sitemap, using `git rm` so the deletion is staged and pushed by the normal
commit step. Run it AFTER build_seo.js, before the commit.

Usage:
    python3 scripts/prune_orphans.py            # dry run, lists what it would remove
    python3 scripts/prune_orphans.py --apply    # git rm the orphan directories

Safety guards (both abort without deleting anything):
    - sitemap must have at least MIN_SITEMAP_URLS entries, so a partial or
      failed build can't trick this into nuking the whole site.
    - the prune set must be under MAX_PRUNE_FRACTION of all served pages.
"""
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = "https://twincitycannabis.com"
MIN_SITEMAP_URLS = 300
MAX_PRUNE_FRACTION = 0.5

# Top-level directories that are not generator-emitted content pages. Never pruned.
IGNORE_TOP = {
    "scraper", "scripts", "docs", "cloudflare", "node_modules", ".git",
    ".github", "assets", "YouTube", "img", "js", ".claude",
}

# Hand-authored pages that build_seo.js does NOT generate and therefore never
# lists in the sitemap. They would otherwise look like orphans and get deleted.
# Add any future hand-built page (game, landing page, easter egg) here.
KEEP_PAGES = {
    "munchie-madness",   # interactive "Munchie Madness" game
    "cloud-nine",        # hand-built landing page, linked from the homepage
}


def sitemap_paths():
    sm = (ROOT / "sitemap.xml").read_text()
    paths = set()
    for loc in re.findall(r"<loc>(.*?)</loc>", sm):
        paths.add(loc.replace(SITE, "").strip("/"))  # "" == homepage
    return paths


def served_dirs():
    """Every directory under ROOT that contains an index.html, as a repo-relative
    forward-slash path, excluding utility/non-content top-level directories."""
    out = set()
    for dirpath, dirnames, filenames in os.walk(ROOT):
        rel = os.path.relpath(dirpath, ROOT)
        if rel == ".":
            dirnames[:] = [d for d in dirnames
                           if d not in IGNORE_TOP and not d.startswith(".")]
            continue
        if rel.split(os.sep)[0] in IGNORE_TOP:
            dirnames[:] = []
            continue
        if "index.html" in filenames:
            out.add(rel.replace(os.sep, "/"))
    return out


def main():
    apply = "--apply" in sys.argv

    valid = sitemap_paths()
    if len(valid) < MIN_SITEMAP_URLS:
        print(f"ABORT: sitemap lists only {len(valid)} urls (< {MIN_SITEMAP_URLS}). "
              "Refusing to prune against a possibly-broken build.")
        sys.exit(1)

    served = served_dirs()
    orphans = sorted(p for p in served if p and p not in valid and p not in KEEP_PAGES)

    if not orphans:
        print("No orphan pages. Nothing to prune.")
        return

    frac = len(orphans) / max(1, len(served))
    print(f"Sitemap pages: {len(valid)} | served dirs: {len(served)} | "
          f"orphans: {len(orphans)} ({frac:.0%})")

    if frac > MAX_PRUNE_FRACTION:
        print(f"ABORT: orphan set is {frac:.0%} of served pages "
              f"(> {MAX_PRUNE_FRACTION:.0%}). Too many to be real orphans, "
              "likely a build problem. Not pruning.")
        sys.exit(1)

    for p in orphans:
        print(("DELETE " if apply else "would delete ") + p)

    if not apply:
        print(f"\nDry run. {len(orphans)} directories would be removed. "
              "Re-run with --apply.")
        return

    removed = 0
    for p in orphans:
        # -f: a tracked orphan with unstaged modifications (e.g. a manual build
        # re-dated it) must still be removed — without -f, git rm refuses, the
        # shutil fallback deletes it from disk only, and the deletion is never
        # staged or pushed, leaving the stale page live and outside the sitemap.
        r = subprocess.run(["git", "rm", "-r", "-f", "-q", "--", p],
                           cwd=ROOT, capture_output=True, text=True)
        if r.returncode != 0:
            # Untracked (never committed) — git rm won't touch it, delete directly.
            shutil.rmtree(ROOT / p, ignore_errors=True)
        removed += 1
    print(f"Pruned {removed} orphan page directories.")


if __name__ == "__main__":
    main()
