"""
One way to reach Josh from any pipeline script: POST to the worker's /alert
endpoint, which emails hello@ and j.sundby@gmail.com.

Env comes from /etc/tcc-scrape.env on the Pi. Missing env means print-only.
Never raises: a failed notification must not take down a publish, but it
prints loudly, because this is the path that tells anyone anything.
"""

import json
import os
import urllib.request


def post_alert(source, text):
    url = os.environ.get("TCC_ALERT_URL")
    token = os.environ.get("TCC_ALERT_TOKEN")
    if not url or not token:
        print(f"(no alert env, not sent) [{source}]\n{text}")
        return False
    try:
        req = urllib.request.Request(
            url,
            data=json.dumps({"source": source, "text": text}).encode(),
            # Cloudflare 403s the default Python-urllib agent.
            headers={"Content-Type": "application/json", "x-alert-token": token,
                     "User-Agent": f"TCC-{source}/1.0 (+https://twincitycannabis.com)"},
        )
        urllib.request.urlopen(req, timeout=20)
        print(f"Alert sent [{source}]")
        return True
    except Exception as e:
        print(f"!!! ALERT POST FAILED [{source}], nobody was told: {e}")
        return False
