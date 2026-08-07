#!/bin/bash
# IndexNow: tell Bing/Seznam/etc. instantly when key pages change. Called by
# auto_scrape.sh after each successful push. ChatGPT search leans on Bing, so
# fast Bing indexing = fast AI-answer freshness.
KEY="9aa12af04b283f828db8f0a4ca451276"
curl -s -X POST "https://api.indexnow.org/indexnow" -H "Content-Type: application/json" -d '{
  "host": "twincitycannabis.com",
  "key": "'"$KEY"'",
  "keyLocation": "https://twincitycannabis.com/'"$KEY"'.txt",
  "urlList": [
    "https://twincitycannabis.com/",
    "https://twincitycannabis.com/minnesota-cannabis/",
    "https://twincitycannabis.com/minnesota-cannabis-prices/",
    "https://twincitycannabis.com/price-spread-index/",
    "https://twincitycannabis.com/weed-deals-twin-cities/",
    "https://twincitycannabis.com/cheapest-cannabis-twin-cities/",
    "https://twincitycannabis.com/dispensaries/",
    "https://twincitycannabis.com/dispensary-near-me/",
    "https://twincitycannabis.com/minneapolis-cannabis-dispensaries/",
    "https://twincitycannabis.com/saint-paul-cannabis-dispensaries/",
    "https://twincitycannabis.com/blog/"
  ]
}' > /dev/null 2>&1 || true
echo "IndexNow pinged"
