#!/usr/bin/env python3
"""Tell Google about new and removed job pages through the Indexing API.

Google allows the Indexing API for pages with JobPosting markup. It gets a
new job crawled in hours instead of waiting for the sitemap.

Reads the live sitemap, compares its /jobs/ URLs with what was sent last
time (scraper/data/indexing_state.json), and sends URL_UPDATED for new
URLs and URL_DELETED for URLs that left the sitemap. Daily quota is 200.

Auth: gcloud application-default credentials signed in as a Search Console
owner, with the indexing scope (see ~/Code/gsc/README.md).

Run: python3 scripts/index_jobs.py [--dry-run] [--resend-all]
"""
import json, os, re, sys, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATE = os.path.join(ROOT, 'scraper/data/indexing_state.json')
SITEMAP = 'https://twincitycannabis.com/sitemap.xml'
ADC = os.path.expanduser('~/.config/gcloud/application_default_credentials.json')
PUBLISH = 'https://indexing.googleapis.com/v3/urlNotifications:publish'
QUOTA = 200
# Only actual postings, not /jobs/, /jobs/post/ or the city pages.
JOB_URL = re.compile(r'^https://twincitycannabis\.com/jobs/(?!post/|cannabis-jobs-)[^/]+/$')


def token():
    with open(ADC) as f:
        c = json.load(f)
    data = urllib.parse.urlencode({
        'client_id': c['client_id'], 'client_secret': c['client_secret'],
        'refresh_token': c['refresh_token'], 'grant_type': 'refresh_token'}).encode()
    r = json.load(urllib.request.urlopen('https://oauth2.googleapis.com/token', data))
    return r['access_token'], c.get('quota_project_id')


def main():
    dry = '--dry-run' in sys.argv
    xml = urllib.request.urlopen(urllib.request.Request(SITEMAP, headers={'User-Agent': 'tcc-index-jobs'})).read().decode()
    live = sorted(u for u in re.findall(r'<loc>([^<]+)</loc>', xml) if JOB_URL.match(u))
    state = json.load(open(STATE)) if os.path.exists(STATE) else {'sent': {}}
    sent = {} if '--resend-all' in sys.argv else state['sent']
    todo = [(u, 'URL_UPDATED') for u in live if u not in sent]
    todo += [(u, 'URL_DELETED') for u in sent if u not in live and sent[u] != 'URL_DELETED']
    print(f'{len(live)} job URLs in sitemap, {len(todo)} to send')
    if dry or not todo:
        for u, t in todo[:QUOTA]:
            print(' ', t, u)
        return
    tok, qp = token()
    ok = 0
    for u, t in todo[:QUOTA]:
        req = urllib.request.Request(PUBLISH, method='POST', data=json.dumps({'url': u, 'type': t}).encode())
        req.add_header('Authorization', 'Bearer ' + tok)
        req.add_header('Content-Type', 'application/json')
        if qp:
            req.add_header('x-goog-user-project', qp)
        try:
            urllib.request.urlopen(req)
        except urllib.error.HTTPError as e:
            print(f'stopped at {u}: HTTP {e.code} {e.read().decode()[:300]}')
            break
        state['sent'][u] = t
        ok += 1
    # Forget deleted URLs Google has been told about, so the file stays small.
    state['sent'] = {u: t for u, t in state['sent'].items() if t != 'URL_DELETED' or u in live}
    with open(STATE, 'w') as f:
        json.dump(state, f, indent=1, sort_keys=True)
    print(f'sent {ok} of {len(todo)}')
    if ok < len(todo):
        sys.exit(1)


if __name__ == '__main__':
    main()
