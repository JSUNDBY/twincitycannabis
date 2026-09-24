#!/usr/bin/env python3
"""
Regression fixtures: every listing this site ever published wrong, checked
against the code before a cycle scrapes or publishes anything.

Cases live in tests/fixtures/incidents.json, one per real incident. The
Python classifiers are checked here; the site's JS filters and the Market
Intel size key are checked by tests/fixtures_site.js on the code the site
ships. Also runs normalize.py's own 66-case self-test.

  python3 tests/check_fixtures.py                 code only (cycle start)
  python3 tests/check_fixtures.py --data js/data.js   plus invariants on built data

Exit 1 on any failure. auto_scrape.sh stops the cycle on a code failure
(the site keeps its last good data) and alerts on a data invariant.
"""

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scraper"))

FIX = json.loads((ROOT / "tests" / "fixtures" / "incidents.json").read_text())


def main():
    failures = []

    from normalize import categorize_by_name
    for c in FIX["normalize"]:
        got = categorize_by_name(c["name"], "", c["shelf"], "", trust_source=c.get("trust_source", False))
        if got != c["expect"]:
            failures.append(f'normalize "{c["name"]}" (shelf {c["shelf"]}) -> {got}, expected {c["expect"]} ({c["incident"]})')

    from carrot_scrape import JUNK_RE
    for c in FIX["carrot_junk"]:
        got = bool(JUNK_RE.search(c["name"]))
        if got != c["junk"]:
            failures.append(f'carrot JUNK_RE "{c["name"]}" -> {"junk" if got else "kept"}, '
                            f'expected {"junk" if c["junk"] else "kept"} ({c["incident"]})')

    from merge_dispensary_shop_data import shelf_category
    for c in FIX["dshop_shelf"]:
        got = shelf_category(c["shelf"])
        if got != c["expect"]:
            failures.append(f'dispensary.shop shelf "{c["shelf"]}" -> {got}, expected {c["expect"]} ({c["incident"]})')

    # normalize.py's own case table (exits 0 even on failure, so read the tally).
    out = subprocess.run([sys.executable, str(ROOT / "scraper" / "normalize.py")],
                         capture_output=True, text=True, timeout=120)
    tally = [l for l in out.stdout.splitlines() if l.strip().endswith("passed")]
    if out.returncode != 0 or not tally or tally[-1].split("/")[0].strip() != tally[-1].split("/")[1].split()[0]:
        bad = [l.strip() for l in out.stdout.splitlines() if l.strip().startswith("✗")]
        failures.append("normalize.py self-test: " + (tally[-1].strip() if tally else "no tally")
                        + ("; " + " | ".join(bad[:5]) if bad else ""))

    for f in failures:
        print("FAIL " + f)
    print(f"{len(failures)} Python fixture failure(s)" if failures else "Python fixtures: all pass")

    js = subprocess.run(["node", str(ROOT / "tests" / "fixtures_site.js")] + sys.argv[1:],
                        capture_output=True, text=True, timeout=180)
    print(js.stdout.strip() or js.stderr.strip()[:500])
    return 1 if failures or js.returncode != 0 else 0


if __name__ == "__main__":
    sys.exit(main())
