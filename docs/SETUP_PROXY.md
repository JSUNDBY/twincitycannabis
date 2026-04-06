# IPRoyal Residential Proxy Setup (Immediate Solution)

Get automatic scraping working today via GitHub Actions + residential proxy.

## Step 1: Get IPRoyal Account

1. Go to https://iproyal.com/residential-proxies/
2. Sign up, buy the smallest package ($1.99 trial or $7 for 1GB)
3. Go to Dashboard > Residential Proxies
4. Note your credentials:
   - Host: `geo.iproyal.com`
   - Port: `12321`
   - Username: `your_username`
   - Password: `your_password`
   - Country: `us` (important for Weedmaps)

## Step 2: Build Your Proxy URL

Format: `http://USERNAME:PASSWORD_country-us@geo.iproyal.com:12321`

Example: `http://josh123:mypass_country-us@geo.iproyal.com:12321`

## Step 3: Add to GitHub Secrets

```bash
# From your terminal:
gh secret set PROXY_URL --repo JSUNDBY/twincitycannabis
# Paste your proxy URL when prompted
```

Or go to: GitHub repo > Settings > Secrets > Actions > New secret
- Name: `PROXY_URL`
- Value: your proxy URL from step 2

## Step 4: Trigger a Run

Go to GitHub Actions > "Scrape Dispensary Data" > "Run workflow"

The scraper will now route through IPRoyal's residential IPs,
bypassing Weedmaps' datacenter blocking.

## Cost Estimate

- Each full scrape uses ~50MB of proxy bandwidth
- 2x daily = 100MB/day = ~3GB/month
- At $3.50/GB = **~$10.50/month**
- 1x daily = **~$5.25/month**

## Test Locally First

```bash
export PROXY_URL="http://USERNAME:PASSWORD_country-us@geo.iproyal.com:12321"
python3 scraper/direct_menu_scrape.py --test
```

If it works, the GitHub Actions version will too.
