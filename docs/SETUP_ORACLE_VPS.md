# Oracle Cloud Always Free VPS Setup

A free server that runs 24/7 for scraping, APIs, automation, and more.

## What You Get (Free Forever)
- 4 ARM CPU cores (Ampere A1)
- 24GB RAM
- 200GB storage
- 10TB/month bandwidth
- Public IP address

## Step 1: Create Oracle Cloud Account

1. Go to https://cloud.oracle.com/
2. Sign up for a free account
3. You'll need a credit card for verification (temporary $100 auth, never charged)
4. Select a home region (US Midwest - Chicago is closest to TC)

## Step 2: Create the VM

1. Go to **Compute > Instances > Create Instance**
2. Name: `tcc-scraper`
3. Image: **Ubuntu 22.04** (or latest)
4. Shape: **VM.Standard.A1.Flex** (this is the Always Free ARM shape)
   - OCPUs: 4
   - Memory: 24 GB
5. Network: Create new VCN or use default
6. Add your SSH key (generate one if needed: `ssh-keygen -t ed25519`)
7. Click **Create**

**Note:** If you get "Out of capacity", keep trying. Oracle's free tier is popular.
Try different availability domains (AD-1, AD-2, AD-3).

## Step 3: Connect & Set Up

```bash
# SSH into your server
ssh ubuntu@YOUR_SERVER_IP

# Update system
sudo apt update && sudo apt upgrade -y

# Install Python and Git
sudo apt install -y python3 python3-pip git

# Clone the repo
git clone https://github.com/JSUNDBY/twincitycannabis.git
cd twincitycannabis

# Install Python dependencies
pip3 install -r scraper/requirements.txt

# Test the scraper
python3 scraper/direct_menu_scrape.py --test
```

## Step 4: Set Up Git Push (so the VPS can push updates)

```bash
# Configure git
git config user.name "TCC Scraper Bot"
git config user.email "bot@twincitycannabis.com"

# Set up GitHub authentication
# Option A: Personal Access Token (easiest)
# Go to GitHub > Settings > Developer Settings > Personal Access Tokens > Generate
# Give it 'repo' scope
git remote set-url origin https://YOUR_GITHUB_TOKEN@github.com/JSUNDBY/twincitycannabis.git

# Option B: SSH key
# ssh-keygen -t ed25519
# Add the public key to GitHub > Settings > SSH Keys
# git remote set-url origin git@github.com:JSUNDBY/twincitycannabis.git
```

## Step 5: Set Up Cron Job

```bash
# Edit crontab
crontab -e

# Add this line (runs at 7am, 11am, 3pm, 7pm, 11pm Central):
0 12,16,20,0,4 * * * cd /home/ubuntu/twincitycannabis && /home/ubuntu/twincitycannabis/scraper/auto_scrape.sh >> /tmp/tcc-scrape.log 2>&1
```

## Step 6: Verify It's Working

```bash
# Run manually first
cd /home/ubuntu/twincitycannabis
bash scraper/auto_scrape.sh

# Check the log
tail -50 /tmp/tcc-scrape.log

# Verify the git push worked
git log --oneline -3
```

## Monitoring

```bash
# Check if cron is running
grep -i tcc /var/log/syslog | tail -5

# Check scrape log
tail -100 /tmp/tcc-scrape.log

# Check disk usage (200GB free, shouldn't be an issue)
df -h
```

## Other Things to Run on This VPS

Since you have 24GB RAM and 4 cores free, you could also run:

- **N8N** (self-hosted Zapier): `docker run -d n8nio/n8n`
- **Plausible Analytics** (privacy-focused GA alternative)
- **Umami** (simple web analytics)
- **Uptime Kuma** (monitor your sites)
- **Wireguard VPN** (your own VPN server)
- **Any Python scripts** on cron schedules
- **API server** (Flask/FastAPI for TCC data endpoints)

## Troubleshooting

**"Out of capacity" when creating instance:**
- Try different Availability Domains
- Try at off-peak hours (early morning US time)
- Use the automated script: https://github.com/Jaggu762/oracle-vps-script

**Scraper gets blocked (406):**
- Oracle IPs are less commonly blocked than AWS/GitHub
- If blocked, add a residential proxy: `export PROXY_URL=http://user:pass@proxy:port`

**Instance terminated by Oracle:**
- This is rare but happens if Oracle suspects abuse
- Keep CPU usage reasonable (scraping 5x/day is fine)
- Don't mine crypto or run DDoS tools
