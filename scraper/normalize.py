#!/usr/bin/env python3
"""
Product normalization for TCC.

The Weedmaps API often miscategorizes products: vape cartridges get tagged
as "concentrate", THC shots get tagged as "topical", etc. This module
re-categorizes products by analyzing their actual names — what the user
sees on the label — instead of trusting upstream taxonomy.

Priority order matters: we check for the most specific patterns first.
"""

import re

# Categories used by the site browse UI (everything else is filtered out)
CANNABIS_CATEGORIES = {
    'flower', 'pre-roll', 'cartridge', 'edible', 'beverage',
    'tincture', 'topical', 'concentrate'
}

EXCLUDED_CATEGORIES = {
    'accessories', 'apparel', 'headwear', 'seed', 'clone', 'gear'
}

# Compile patterns once
# Order of evaluation matters — see categorize_by_name() for the priority logic.
_PATTERNS = {
    # Things that aren't products at all — donation campaigns, services
    'EXCLUDE_NOT_PRODUCT': re.compile(
        r'\b(donation|fundraiser|gift\s*card|raffle|service\s*fee|delivery\s*fee)\b',
        re.IGNORECASE
    ),

    # Pre-rolls — checked first since "joint/blunt/pre-roll" is unambiguous
    'PRE_ROLL': re.compile(
        r'\b(pre[\s\-]?roll|preroll|pre[\s\-]?rolls|prerolls|infused\s*roll|hash\s*hole|spliff|rolled\s*joint|joint\s*pack|blunts?|pre[\s\-]?packed\s*joint)\b',
        re.IGNORECASE
    ),

    # Vape cartridges, disposables, pods, vape pens
    # Note: must come AFTER accessories check so "vape battery" alone is accessory
    'CARTRIDGE': re.compile(
        r'\b(cartridge|cartridges|vaporizer|vaporizers|disposable|disposables|all[\s\-]?in[\s\-]?one|aio\s*vape|ccell|stiiizy|live\s*resin\s*cart|distillate\s*cart|prefilled.*vaporizer|prefilled.*cartridge|\d+\s*pack\s*pods?|cart\s*pack)\b',
        re.IGNORECASE
    ),

    # Edible formats — explicit food formats. Checked EARLY so "Live Rosin
    # Gummies" or "Lemonade Gummies" don't get caught by concentrate or beverage.
    'EDIBLE_FORMAT': re.compile(
        r'\b(gummy|gummies|gummi|chocolate|chocolates|cookie|cookies|brownie|brownies|truffle|truffles|caramel|caramels|hard\s*candy|gumdrop|chew|chews|fruit\s*chew|fruit\s*snack|lozenge|lozenges|taffy|honey\s*stick|chocolate\s*bar|baked\s*good|cake\s*pop|protein\s*bar|granola\s*bar|fudge|marshmallow|popcorn\s*ball)\b',
        re.IGNORECASE
    ),

    # Beverages — strict keyword match, no size-based detection (avoids 1/8oz collision)
    'BEVERAGE': re.compile(
        r'\b(seltzer|soda|sparkling\s*water|drink|beverage|cocktail|mocktail|elixir|tonic|kombucha|iced\s*tea|cold\s*brew|lemonade|punch|infusion\s*vial|thc\s*shot|thc\s*shots|cannabis\s*shot|liquid\s*shot|fl\s*oz|fluid\s*ounce|sparkling\s*tonic|sparkling\s*beverage|oral\s*shot)\b',
        re.IGNORECASE
    ),

    # Tinctures — sublingual oils, oral sprays/solutions, dropper bottles, capsules
    'TINCTURE': re.compile(
        r'\b(tincture|tinctures|oral\s*spray|oral\s*solution|sublingual|dropper|oil\s*drops|cbd\s*drops|thc\s*drops|capsule|capsules|softgel|softgels|tablet|tablets|pill|pills|spray\s*bottle)\b',
        re.IGNORECASE
    ),

    # Edibles — anything you eat that isn't a drink. Checked BEFORE topical so
    # "honey stick" / "chocolate bar" don't accidentally match topical.
    'EDIBLE': re.compile(
        r'\b(gummy|gummies|gummi|cookie|cookies|brownie|brownies|chocolate|chocolates|truffle|truffles|caramel|caramels|mint|mints|hard\s*candy|gumdrop|chew|chews|fruit\s*chew|fruit\s*snack|lozenge|lozenges|taffy|popcorn|cereal|granola|honey|jam|jelly|syrup|trail\s*mix|protein\s*bar|chocolate\s*bar|granola\s*bar|cake\s*pop|baked\s*good|baked\s*goods|cracker|crackers|pretzel|pretzels|peanut\s*butter|edible|edibles)\b',
        re.IGNORECASE
    ),

    # Topicals — applied to skin. Tightened to specific topical formats.
    # "cream" alone is ambiguous (could be ice cream, cream soda, brownie cream)
    # so we require body-context or specific topical product names.
    'TOPICAL': re.compile(
        r'\b(lotion|balm|salve|ointment|massage\s*oil|body\s*oil|bath\s*bomb|bath\s*salt|cannabis\s*soap|cbd\s*soap|patch|patches|transdermal|hand\s*cream|foot\s*cream|muscle\s*rub|topical|topicals|hemp\s*cream|cbd\s*cream|cbd\s*lotion|relief\s*cream|relief\s*gel|warming\s*gel|cooling\s*gel|pain\s*gel|roll[\s\-]?on\s*(?:relief|stick|gel))\b',
        re.IGNORECASE
    ),

    # Concentrates — extracts, dabs, hash, kief, rosin, etc.
    'CONCENTRATE': re.compile(
        r'\b(wax|shatter|rosin|live\s*rosin|live\s*resin|hash|hashish|kief|crumble|budder|badder|terp\s*sauce|diamond\b|diamonds|sugar\s*wax|crystalline|isolate|distillate|ho?nyc?omb|cured\s*resin|hte|fse|full\s*spectrum\s*extract|moonrock|moon\s*rock|cold\s*cure|temple\s*ball|bubble\s*hash|ice\s*water\s*hash|dry\s*sift|6\s*star|f1\s*hash|live\s*hash|frozen\s*flower\s*hash)\b',
        re.IGNORECASE
    ),

    # Flower — explicit "flower"/"bud" keyword OR a flower-style weight
    # without any of the more specific patterns above
    'FLOWER_KEYWORD': re.compile(
        r'\b(flower|flwr|bud|nug|nugs|smalls|mixed\s*bud|popcorn\s*bud|popcorn\s*nug|whole\s*flower)\b',
        re.IGNORECASE
    ),
    # Weights exclusively used for raw flower (no edible/beverage uses these)
    'FLOWER_ONLY_WEIGHT': re.compile(
        r'(\b(?:3\.5g|3\.5\s*g|7g|7\s*g|14g|14\s*g|28g|28\s*g)\b|1/8\s*oz|1/4\s*oz|1/2\s*oz|eighth|quarter\s*oz|half\s*oz|\bounce\b)',
        re.IGNORECASE
    ),
    # Ambiguous small weights — could be concentrate, cartridge, or small flower
    'SMALL_WEIGHT': re.compile(
        r'\b(?:1g|2g|0\.5g|\.5g|1\s*g|2\s*g)\b',
        re.IGNORECASE
    ),

    # Accessories — explicitly excluded. Checked EARLY for unambiguous accessory
    # words so "Vape Battery" doesn't become a cartridge and "Nug Plushie" doesn't
    # become flower. Includes 510-thread batteries, vape kits, plushies, glassware.
    'ACCESSORIES_EARLY': re.compile(
        r'\b(grinder|lighter|rolling\s*papers?|hemp\s*wraps?|blunt\s*wraps?|leaf\s*cones?|filter\s*tips?|stash\s*jar|pipe|bong|water\s*pipe|dab\s*rig|dab\s*nail|dab\s*tool|banger|torch|510\s*battery|510\s*thread\s*battery|vape\s*battery|battery\s*pack|thread\s*battery|variable\s*voltage.*battery|charger|carrying\s*case|carry\s*case|t[\s\-]?shirt|tee\s*shirt|hoodie|stickers?|keychain|key\s*chain|magnet|sunglasses|isopropyl|alcohol\s*swab|carb\s*cap|terp\s*pearl|chillum|one[\s\-]?hitter|dugout|grinder\s*card|herb\s*grinder|pre[\s\-]?roll\s*tubes?|kief\s*box|joint\s*tubes?|plushies?|plush\s*toy|vape\s*kit|cleaning\s*kit|odor\s*spray|smell\s*proof|silicone\s*container|dab\s*mat|rolling\s*trays?|ash\s*trays?|ashtrays?|debowler|punch\s*card|membership\s*card|cone\s*pack|empty\s*cones?|nug\s*plush|tea\s*leaf\s*cones?|glass\s*cleaner|bowl\s*cleaner|pipe\s*cleaner|grinder\s*kit|sluggers?\s*battery)\b',
        re.IGNORECASE
    ),

    # Accessories catch-all (final pass)
    'ACCESSORIES': re.compile(
        r'\b(grinder|lighter|backpack|case|pouch|cap|beanie|merch|apparel|magazine)\b',
        re.IGNORECASE
    ),
}


def categorize_by_name(name, brand='', original_category=''):
    """
    Determine the true category of a product based on its name.

    Priority logic (most specific physical-format wins first):
      1. EXCLUDE non-products (donations, fees)
      2. Explicit "Flower" keyword wins (a "Brownie Scout 3.5g flower" is flower)
      3. Pre-rolls (joint, blunt, pre-roll)
      4. Cartridges (cartridge, vape pen, disposable)
      5. Concentrates (rosin, hash, wax, etc.)
      6. Tinctures (oral spray, dropper)
      7. Beverages (seltzer, drink, shot)
      8. Topicals (lotion, balm, salve)
      9. Edibles (gummy, chocolate, brownie, etc.)
     10. Flower fallback by weight (3.5g/7g/14g/28g) when none of the above match
     11. Accessories → EXCLUDE
     12. Use original category if valid, else EXCLUDE

    Returns one of CANNABIS_CATEGORIES or 'EXCLUDE' for non-products.
    """
    if not name:
        return original_category or 'flower'

    text = f"{name} {brand}"

    # 1) Reject non-products outright (donations, fees)
    if _PATTERNS['EXCLUDE_NOT_PRODUCT'].search(text):
        return 'EXCLUDE'

    # 2) Accessories early-pass — unambiguous accessory products
    # (batteries, plushies, vape kits, glassware, rolling supplies)
    if _PATTERNS['ACCESSORIES_EARLY'].search(text):
        return 'EXCLUDE'

    # 3) Pre-rolls — explicit pre-roll product format
    if _PATTERNS['PRE_ROLL'].search(text):
        return 'pre-roll'

    # 4) Cartridges — vape cartridges and disposables
    if _PATTERNS['CARTRIDGE'].search(text):
        return 'cartridge'

    # 5) Flower by exclusive flower weight — 3.5g/7g/14g/28g/eighth/quarter/half oz
    # These weights are used by flower ONLY (never edibles, beverages, or concentrates),
    # so they reliably indicate flower even when the strain name sounds like food.
    if _PATTERNS['FLOWER_ONLY_WEIGHT'].search(text):
        return 'flower'

    # 6) Edible formats — gummy, chocolate, cookie etc.
    # Checked BEFORE concentrate/beverage so "Live Rosin Gummies" → edible
    # and "Lemonade Gummies" → edible
    if _PATTERNS['EDIBLE_FORMAT'].search(text):
        return 'edible'

    # 6) Tinctures — oral sprays, droppers, capsules
    if _PATTERNS['TINCTURE'].search(text):
        return 'tincture'

    # 7) Concentrates — extracts (specific keywords only)
    if _PATTERNS['CONCENTRATE'].search(text):
        return 'concentrate'

    # 8) Beverages — drinks (keyword-based, no size matching)
    if _PATTERNS['BEVERAGE'].search(text):
        return 'beverage'

    # 9) Topicals — body products
    if _PATTERNS['TOPICAL'].search(text):
        return 'topical'

    # 11) Explicit "Flower" / "Bud" keyword
    if _PATTERNS['FLOWER_KEYWORD'].search(text):
        return 'flower'

    # 12) Edible catch-all — broader edible keywords (honey, etc.)
    if _PATTERNS['EDIBLE'].search(text):
        return 'edible'

    # 13) Accessories catch-all
    if _PATTERNS['ACCESSORIES'].search(text):
        return 'EXCLUDE'

    # 14) Fallback: use original category if it's a valid cannabis category
    if original_category in CANNABIS_CATEGORIES:
        return original_category

    # Last resort: exclude
    return 'EXCLUDE'


def is_cannabis_product(category):
    """Whether a category should appear in the browse UI."""
    return category in CANNABIS_CATEGORIES


if __name__ == '__main__':
    # Self-test
    cases = [
        ("Nebula | Alaska Thunder Fuck (ATF) | Cartridge | 0.5g", 'concentrate', 'cartridge'),
        ("Nebula | Romulan | Disposable | 1g", 'concentrate', 'cartridge'),
        ("Aura THC Shots 10mg - Blackberry Lavender (Night Time) - 2oz", 'topical', 'beverage'),
        ("Aura Seltzer 10mg - Blackberry Lavender - 12oz", 'beverage', 'beverage'),
        ("Vireo | Red Oral Spray | 12.5ml", 'tincture', 'tincture'),
        ("Loon Lab - Hemp Lotion - 1000mg CBD", 'topical', 'topical'),
        ("$1 Donation - Roll It Up For Justice", 'flower', 'EXCLUDE'),
        ("Banana Cream Flower 3.5g", 'flower', 'flower'),
        ("RYTHM - Brownie Scout 3.5g", 'flower', 'flower'),
        ("Dogwalkers 1.75g Mini Dog Pre-rolls | Bananaconda", 'pre-roll', 'pre-roll'),
        ("&Shine | 10pk Gummies | Cherry - 100mg", 'edible', 'edible'),
        ("4pc. Premium EZ Grinder- 55mm- Black", 'accessories', 'EXCLUDE'),
        ("BLNCD - FUSE 10 Infusion Vial - 10mg THC - Single", 'beverage', 'beverage'),
        ("Boundary Waters Prefilled 90% Vaporizer Cartridge Peaches and Cream", 'concentrate', 'cartridge'),
        ("Live Rosin Badder 1g", 'concentrate', 'concentrate'),
        ("Honey Stick 100mg", 'edible', 'edible'),
        # Edge cases caught in dry-run
        ("Vireo | Sour Strawberry Lemonade | 10mg Gummies | 10pk", 'edible', 'edible'),  # gummies > beverage
        ("Bootlegger's Live Rosin Gummies 5mg - Coconut Rum - 10ct", 'edible', 'edible'),  # gummies > concentrate
        ("Lookah - Cat 750mAh Variable Voltage 510 Thread Battery", 'accessories', 'EXCLUDE'),  # battery is accessory
        ("Pulsar Barb Flower Vape Kit Black", 'concentrate', 'EXCLUDE'),  # vape kit is accessory
        ("Nug Plushies - Large", 'accessories', 'EXCLUDE'),  # plushie is accessory
        ("Blazy Honey Lemon Tea Leaf Cones", 'accessories', 'EXCLUDE'),  # leaf cones is accessory
        ("Campfire Cannabis | Donny Burger | 1/8oz Flower", 'flower', 'flower'),  # 1/8oz must not match 8oz beverage
        ("Campfire Cannabis | GG4 | 1g Rolled Joint", 'pre-roll', 'pre-roll'),  # joint is preroll
    ]

    passed = failed = 0
    for name, original, expected in cases:
        result = categorize_by_name(name, '', original)
        ok = result == expected
        marker = '✓' if ok else '✗'
        print(f"  {marker} {name[:60]:<60} → {result} (expected {expected})")
        if ok:
            passed += 1
        else:
            failed += 1
    print(f"\n{passed}/{passed+failed} passed")
