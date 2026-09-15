#!/usr/bin/env bash
# Weekly Google Places refresh for TCC (ratings, review counts, top reviews,
# hours, websites). Runs from tcc-google.timer on the Pi.
#
# Self-reporting: every outcome posts to the worker /alert, so a lapse shows
# up in hello@ instead of a cache quietly aging (it sat at Jun 15 for three
# months once). auto_scrape.sh also alerts when the cache is >10 days old.
set -u
cd "$(dirname "$0")/.." || exit 1
LOG=scraper/logs/google_refresh.log
mkdir -p scraper/logs
CACHE=scraper/data/google_places.json

alert() {
    [ -n "${TCC_ALERT_URL:-}" ] && [ -n "${TCC_ALERT_TOKEN:-}" ] || return 0
    curl -fsS --max-time 15 -X POST "$TCC_ALERT_URL" \
        -H "Content-Type: application/json" -H "x-alert-token: $TCC_ALERT_TOKEN" \
        -d "{\"source\":\"google_refresh\",\"text\":$(printf '%s' "$1" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))')}" \
        >/dev/null 2>&1 || echo "Alert POST failed (non-fatal)"
}
fail() { echo "$(date -Is) FAIL: $1" | tee -a "$LOG"; alert "Google Places refresh FAILED: $1"; exit 1; }

echo "$(date -Is) start" >> "$LOG"
[ -n "${GOOGLE_PLACES_API_KEY:-}" ] || fail "GOOGLE_PLACES_API_KEY is not set in /etc/tcc-scrape.env"

# Never run on top of a scrape cycle (both commit to the repo).
for _ in $(seq 1 45); do systemctl is-active --quiet tcc-scrape.service || break; sleep 20; done
systemctl is-active --quiet tcc-scrape.service && fail "scrape cycle still running after 15 minutes"

git pull -q --rebase origin main >> "$LOG" 2>&1 || fail "git pull"
python3 scraper/google_places.py --discover >> "$LOG" 2>&1 || fail "discover step"
python3 scraper/google_places.py --fetch    >> "$LOG" 2>&1 || fail "fetch step"

SUMMARY=$(python3 - "$CACHE" <<'PY'
import json, sys, time
d = json.load(open(sys.argv[1]))
with_id = [k for k, v in d.items() if v.get("place_id")]
today = time.strftime("%Y-%m-%d")
fresh = [k for k in with_id if (d[k].get("details") or {}).get("fetched_at") == today]
assert len(d) >= 100, f"cache shrank to {len(d)} entries"
assert len(fresh) >= 0.7 * len(with_id), f"only {len(fresh)} of {len(with_id)} refreshed"
print(f"{len(d)} shops, {len(with_id)} with a Place ID, {len(fresh)} refreshed today")
PY
) || fail "cache validation"

git add "$CACHE"
if git diff --cached --quiet; then
    echo "$(date -Is) no changes" >> "$LOG"
else
    git commit -q -m "Google Places refresh $(date +%F)" || fail "git commit"
    git push -q origin main >> "$LOG" 2>&1 || fail "git push"
fi
echo "$(date -Is) OK: $SUMMARY" >> "$LOG"
alert "Google Places refresh OK: $SUMMARY"
