#!/usr/bin/env python3
"""
Applies manual dispensary website overrides into js/data.js.

Source of truth: scraper/data/website_overrides.json (id -> official site URL).
These are shops the Google Places merge misses (Places lacks many newly-licensed
MN dispensaries), so this runs AFTER merge_google_data.py and wins.

For each id, replaces that dispensary's `website: '...'` field. Parse-guarded:
reverts data.js if the result no longer loads.

Run: python3 scraper/merge_website_overrides.py
"""

import json
import re
import subprocess
import sys
from pathlib import Path

DATA_JS = Path(__file__).parent.parent / "js" / "data.js"
OVERRIDES = Path(__file__).parent / "data" / "website_overrides.json"


def _esc(s):
    return str(s).replace("\\", "\\\\").replace("'", "\\'").replace("\n", " ").replace("\r", "")


def main():
    if not OVERRIDES.exists():
        print(f"No overrides file at {OVERRIDES}; nothing to do.")
        return
    if not DATA_JS.exists():
        print(f"data.js not found at {DATA_JS}")
        sys.exit(1)

    overrides = {k: v for k, v in json.loads(OVERRIDES.read_text()).items()
                 if not k.startswith("_")}
    original = DATA_JS.read_text()
    content = original
    applied, missing = [], []

    for disp_id, url in overrides.items():
        # Match this dispensary's own website field: id first, then the next
        # website: '...' within the same object literal.
        pat = re.compile(
            r"(id:\s*'" + re.escape(disp_id) + r"',[\s\S]*?website:\s*')[^']*(')"
        )
        new_content, n = pat.subn(lambda m: m.group(1) + _esc(url) + m.group(2), content, count=1)
        if n:
            content = new_content
            applied.append(disp_id)
        else:
            missing.append(disp_id)

    if content == original:
        print("No changes to apply.")
        return

    DATA_JS.write_text(content)

    # Parse guard: data.js must still load in node.
    check = subprocess.run(
        ["node", "-e", "global.window={};require('./js/data.js');"
                       "if(!window.TCC||!window.TCC.dispensaries)throw new Error('no TCC');"],
        cwd=str(DATA_JS.parent.parent), capture_output=True, text=True,
    )
    if check.returncode != 0:
        DATA_JS.write_text(original)
        print("PARSE FAILED after override merge — reverted data.js.")
        print(check.stderr.strip())
        sys.exit(1)

    print(f"Applied {len(applied)} website override(s).")
    if missing:
        print(f"WARNING: {len(missing)} id(s) not found in data.js: {', '.join(missing)}")


if __name__ == "__main__":
    main()
