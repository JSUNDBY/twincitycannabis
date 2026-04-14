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
    # Things that aren't products at all — donations, services, accessories
    'EXCLUDE_NOT_PRODUCT': re.compile(
        r'\b(donation|fundraiser|gift\s*card|raffle|service\s*fee|delivery\s*fee'
        r'|volcano\s*dosing|dosing\s*capsule|boveda\s*pack|dab\s*rag|dab\s*straw'
        r'|rolling\s*paper|raw\s*cone|grinder|lighter|ashtray|rolling\s*tray'
        r'|stash\s*jar|smell\s*proof|dugout|one\s*hitter|chillum|pipe\s*screen'
        r'|bong|rig\s*mat|torch|hemp\s*wick|filter\s*tip|joint\s*holder'
        r'|doob\s*tube|clipper|blazy\s*susan|bic\s+lighter'
        r'|pulsar\s*scribe|tronian|battery\s*\d|button\s*battery)\b',
        re.IGNORECASE
    ),

    # Pre-rolls — checked first since "joint/blunt/pre-roll" is unambiguous
    'PRE_ROLL': re.compile(
        r'\b(pre[\s\-]?roll|preroll|pre[\s\-]?rolls|prerolls|infused\s*roll|hash\s*hole|spliff|rolled\s*joint|joint\s*pack|blunts?|pre[\s\-]?packed\s*joint)\b',
        re.IGNORECASE
    ),

    # Vape cartridges, disposables, pods, vape pens — CONSUMABLE vape products only.
    # Standalone "vaporizer" / "all-in-one" are excluded because they match
    # hardware devices (Volcano, Puffco, etc.). Those are caught by ACCESSORIES_EARLY.
    # We rely on accessories check running first to filter out hardware.
    'CARTRIDGE': re.compile(
        r'\b(cartridge|cartridges|disposable|disposables|vape\s*cartridge|aio\s*vape|all[\s\-]?in[\s\-]?one\s*vape|all[\s\-]?in[\s\-]?one\s*disposable|live\s*resin\s*cart|live\s*resin\s*vape|live\s*rosin\s*vape|live\s*resin\s*disposable|live\s*rosin\s*disposable|distillate\s*cart|distillate\s*vape|distillate\s*pen|prefilled.*vaporizer|prefilled.*cartridge|prefilled\s*pen|\d+\s*pack\s*pods?|cart\s*pack|wax\s*pen|dab\s*pen|vape[\s\-]?ix|hash\s*vape|stargaze\s*vape|stiiizy\s*pod|ccell\s*cart|vape\s*pen|vape\s*disposable)\b',
        re.IGNORECASE
    ),

    # Edible formats — explicit food formats. Checked EARLY so "Live Rosin
    # Gummies" or "Lemonade Gummies" don't get caught by concentrate or beverage.
    'EDIBLE_FORMAT': re.compile(
        r'\b(gummy|gummies|gummi|chocolate|chocolates|cookie|cookies|brownie|brownies|truffle|truffles|caramel|caramels|hard\s*candy|gumdrop|gumdrops|gummy\s*ring|gummy\s*rings|peach\s*ring|peach\s*rings|sour\s*ring|sour\s*patch|sour\s*watermelon|watermelon\s*ring|chew|chews|fruit\s*chew|fruit\s*snack|lozenge|lozenges|taffy|honey\s*stick|honey\s*sticks|chocolate\s*bar|baked\s*good|cake\s*pop|protein\s*bar|granola\s*bar|fudge|marshmallow|popcorn\s*ball|moon\s*rock\s*candies|smokehouse\s*almonds|roasted.*almonds|trail\s*mix|nut\s*mix|infused\s*almonds|cannabis\s*almond|edible|edibles|candy|candies)\b',
        re.IGNORECASE
    ),

    # Beverages — keywords that signal a drink. Includes "infusion(s)" and
    # "spirits" since cannabis brands like BLNCD use those for liquid products.
    'BEVERAGE': re.compile(
        r'\b(seltzer|soda|sparkling\s*water|sparkling\s*beverage|sparkling\s*tonic|drink|beverage|cocktail|mocktail|elixir|tonic|tonics|kombucha|iced\s*tea|cold\s*brew|lemonade|punch|fruit\s*tonic|infusion|infusions|infusion\s*vial|thc\s*shot|thc\s*shots|cannabis\s*shot|liquid\s*shot|oral\s*shot|fl\s*oz|fluid\s*ounce|fizz|fizzy|spirits|non[\s\-]?alcoholic|16\.9oz|nano\s*shot|microdose\s*shot)\b',
        re.IGNORECASE
    ),
    # Bottle-size beverage indicator. Negative lookbehind avoids matching "1/8oz" etc.
    'BEVERAGE_SIZE': re.compile(
        r'(?<![/\d])(?<!\d\.)(?:8\s*oz|12\s*oz|16\s*oz|20\s*oz|2\s*oz|6\s*oz)\b',
        re.IGNORECASE
    ),

    # Tinctures — sublingual oils, oral sprays/solutions, dropper bottles, capsules
    'TINCTURE': re.compile(
        r'\b(tincture|tinctures|oral\s*spray|oral\s*solution|sublingual|dropper|oil\s*drops|cbd\s*drops|thc\s*drops|capsule|capsules|softgel|softgels|tablet|tablets|pill|pills|spray\s*bottle|cbd\s*oil\s*isolate|thc\s*oil\s*isolate|oil\s*isolate|cbd\s*oil\b|thc\s*oil\b|hemp\s*oil|carpe\s*diem)\b',
        re.IGNORECASE
    ),

    # Edibles — anything you eat that isn't a drink. Checked BEFORE topical so
    # "honey stick" / "chocolate bar" don't accidentally match topical.
    'EDIBLE': re.compile(
        r'\b(gummy|gummies|gummi|cookie|cookies|brownie|brownies|chocolate|chocolates|truffle|truffles|caramel|caramels|mint|mints|hard\s*candy|gumdrop|chew|chews|fruit\s*chew|fruit\s*snack|lozenge|lozenges|taffy|popcorn|cereal|granola|honey|jam|jelly|syrup|trail\s*mix|protein\s*bar|chocolate\s*bar|granola\s*bar|cake\s*pop|baked\s*good|baked\s*goods|cracker|crackers|pretzel|pretzels|peanut\s*butter|edible|edibles)\b',
        re.IGNORECASE
    ),

    # Topicals — applied to skin. Includes skincare, masks, mists.
    'TOPICAL': re.compile(
        r'\b(lotion|balm|salve|ointment|massage\s*oil|body\s*oil|bath\s*bomb|bath\s*salt|cannabis\s*soap|cbd\s*soap|transdermal|transdermal\s*patch|topical\s*patch|cbd\s*patch|thc\s*patch|hand\s*cream|foot\s*cream|muscle\s*rub|topical|topicals|hemp\s*cream|cbd\s*cream|cbd\s*lotion|relief\s*cream|relief\s*gel|warming\s*gel|cooling\s*gel|pain\s*gel|roll[\s\-]?on\s*(?:relief|stick|gel)|skincare|skin\s*care|face\s*mist|face\s*mask|body\s*mist|body\s*mask|cbg\s*face|cbd\s*face|hemp\s*lotion|hemp\s*balm)\b',
        re.IGNORECASE
    ),

    # Concentrates — STRONG signals: explicit extract format words. These are
    # never used for anything other than concentrates.
    'CONCENTRATE_STRONG': re.compile(
        r'\b(shatter|crumble|budder|badder|terp\s*sauce|sugar\s*wax|crystalline|distillate\s*syringe|ho?nyc?omb|moonrock|moon\s*rock|cold\s*cure|temple\s*ball|bubble\s*hash|ice\s*water\s*hash|dry\s*sift|6\s*star|f1\s*hash|kief|hashish|hash\s*split|hash\s*splits|hash\s*rosin|cured\s*resin|hte|fse|full\s*spectrum\s*extract|diamond\s*sauce|diamonds\s*and\s*sauce|live\s*hash|frozen\s*flower\s*hash|dab\b|dabs|wax\s*concentrate|shatter\s*concentrate)\b',
        re.IGNORECASE
    ),

    # Concentrates — WEAK signals: just "live rosin/resin" or "hash" alone.
    # These appear in beverages and edibles too ("live rosin gummies", "fruit
    # tonic - live resin infused"), so we check them AFTER beverage/edible.
    'CONCENTRATE_WEAK': re.compile(
        r'\b(live\s*rosin|live\s*resin|rosin|hash)\b',
        re.IGNORECASE
    ),

    # Flower — explicit "flower"/"bud" keyword OR a flower-style weight
    # without any of the more specific patterns above
    'FLOWER_KEYWORD': re.compile(
        r'\b(flower|flwr|bud|nug|nugs|smalls|mixed\s*bud|popcorn\s*bud|popcorn\s*nug|whole\s*flower)\b',
        re.IGNORECASE
    ),
    # Weights exclusively used for raw flower (4g is half-eighth)
    'FLOWER_ONLY_WEIGHT': re.compile(
        r'(\b(?:3\.5g|3\.5\s*g|4g|4\s*g|7g|7\s*g|14g|14\s*g|28g|28\s*g)\b|1/8\s*oz|1/4\s*oz|1/2\s*oz|eighth|quarter\s*oz|half\s*oz|\bounce\b)',
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
        r'\b('
        # Rolling supplies
        r'grinder|lighter|rolling\s*papers?|rolling\s*kit|rolling\s*kits|hemp\s*rolling\s*kit|hemp\s*wraps?|blunt\s*wraps?|leaf\s*cones?|filter\s*tips?|stash\s*jar|cone\s*pack|empty\s*cones?|tea\s*leaf\s*cones?|pre[\s\-]?roll\s*tubes?|joint\s*tubes?|kief\s*box|debowler|herb\s*grinder|grinder\s*kit|grinder\s*card|rolling\s*trays?|ash\s*trays?|ashtrays?|dab\s*mat'
        # Glassware / pipes
        r'|pipe|bong|water\s*pipe|dab\s*rig|dab\s*nail|dab\s*tool|banger|torch|chillum|one[\s\-]?hitter|dugout|carb\s*cap|terp\s*pearl|silicone\s*container'
        # Vape hardware (devices, batteries, atomizers - NOT consumable vapes)
        r'|510\s*battery|510\s*thread\s*battery|vape\s*battery|battery\s*pack|thread\s*battery|variable\s*voltage.*battery|wax\s*coil|wax\s*coil\s*battery|wax\s*atomizer|atomizer|coil\s*battery|charger|vape\s*kit|cleaning\s*kit|sluggers?\s*battery'
        # Vaporizer DEVICES (not cartridges) — these are hardware
        r'|volcano\s*hybrid|volcano\s*vaporizer|peak\s*pro|peak\s*vaporizer|puffco|puffco\s*proxy|proxy\s*vaporizer|trident\s*vaporizer|hitoki|loov|utillian|yocan|yocan\s*celestial|storz\s*and\s*bickel|storz|crafty\s*vaporizer|mighty\s*vaporizer|pax\s*device|pax\s*era\s*device|davinci|firefly\s*vaporizer|arizer|pulsar'
        r'|standalone\s*vaporizer|herbal\s*vaporizer|dry\s*herb\s*vaporizer|tabletop\s*vaporizer|portable\s*vaporizer|vaporizer\s*device|vape\s*device|7"|8"|laser\s*co\s*vaporizer'
        # Apparel / merch
        r'|t[\s\-]?shirt|tee\s*shirt|hoodie|stickers?|keychain|key\s*chain|magnet|sunglasses|plushies?|plush\s*toy|nug\s*plush'
        # Cleaning products
        r'|isopropyl|alcohol\s*swab|odor\s*spray|smell\s*proof|glass\s*cleaner|bowl\s*cleaner|pipe\s*cleaner|punch\s*card|membership\s*card'
        # Home fragrance (not cannabis)
        r'|wax\s*melt|wax\s*melts|scented\s*wax|fragrance\s*wax|essential\s*oil\s*diffuser|incense'
        r')\b',
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

    # 5) Flower by exclusive flower weight — 3.5g/4g/7g/14g/28g/eighth/quarter/half oz
    if _PATTERNS['FLOWER_ONLY_WEIGHT'].search(text):
        return 'flower'

    # 5.5) Beverage bottle size — 12oz/16oz/20oz/2oz indicates a drink. Concentrates
    # don't come in bottle sizes, so this beats CONCENTRATE_STRONG (avoids
    # "Apple Cinnamon Crumble - 12oz" matching crumble→concentrate).
    if _PATTERNS['BEVERAGE_SIZE'].search(text):
        return 'beverage'

    # 6) Edible formats — gummy, chocolate, cookie, peach rings, almonds, etc.
    # Beats CONCENTRATE_STRONG so "Live Rosin Gummies" → edible.
    if _PATTERNS['EDIBLE_FORMAT'].search(text):
        return 'edible'

    # 7) Concentrate STRONG — explicit extract format (shatter, wax, badder, hash split)
    if _PATTERNS['CONCENTRATE_STRONG'].search(text):
        return 'concentrate'

    # 8) Tinctures — oral sprays, droppers, capsules, tablets
    if _PATTERNS['TINCTURE'].search(text):
        return 'tincture'

    # 9) Topicals — body products including skincare and face mists
    if _PATTERNS['TOPICAL'].search(text):
        return 'topical'

    # 10) Beverages — drinks. Beats CONCENTRATE_WEAK so "Live Rosin Tonic" → beverage.
    if _PATTERNS['BEVERAGE'].search(text):
        return 'beverage'
    # Also catch by bottle-size indicator (12oz, 16oz, etc.)
    if _PATTERNS['BEVERAGE_SIZE'].search(text):
        return 'beverage'

    # 11) Concentrate WEAK — just "live rosin" / "rosin" / "hash" without
    # a beverage/edible context. Probably an actual extract.
    if _PATTERNS['CONCENTRATE_WEAK'].search(text):
        return 'concentrate'

    # 12) Explicit "Flower" / "Bud" keyword
    if _PATTERNS['FLOWER_KEYWORD'].search(text):
        return 'flower'

    # 13) Edible catch-all — broader edible keywords (honey, candy, etc.)
    if _PATTERNS['EDIBLE'].search(text):
        return 'edible'

    # 14) Accessories catch-all
    if _PATTERNS['ACCESSORIES'].search(text):
        return 'EXCLUDE'

    # 15) Trust Weedmaps strain-type buckets — when the source labels a product
    # "Indica" / "Sativa" / "Hybrid", that's flower. Some dispensaries (Sweetleaves)
    # list strain-name flower with no weight/keywords, so this is the only signal.
    orig = (original_category or '').strip().lower()
    if orig in ('indica', 'sativa', 'hybrid'):
        return 'flower'
    if orig == 'flower':
        return 'flower'

    # NO fallback to other original categories — they're unreliable. Drop
    # unrecognized products. Accuracy > completeness.
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
        # Round 2 edge cases — found in production
        ("BLNCD Infusion Spirits - Levitate - 16.9oz", 'flower', 'beverage'),
        ("BLNCD Infusions 10mg - Fuse10 - 1ct", 'flower', 'beverage'),
        ("BLNCD Infusions 5mg - Fuse - 5ct", 'flower', 'beverage'),
        ("BLNCD CBD Skincare - Vital CBG Face Mist - 100ml", 'flower', 'topical'),
        ("Donny Burger - 4g", 'flower', 'flower'),  # 4g flower
        ("Pine Soul - 4g", 'flower', 'flower'),
        ("Granny's - Fruit Tonic - 10mg THC - Live Resin Infused - Kitty Cocktail", 'concentrate', 'beverage'),
        ("Granny's - Fruit Tonic - Blast Off - ROSIN 10mg", 'concentrate', 'beverage'),
        ("Active | Live Rosin | Lemon", 'concentrate', 'concentrate'),  # ambiguous, accept concentrate
        ("Peach Rings", 'concentrate', 'edible'),  # gummy candy
        ("Blue Diamond | Smokehouse Almonds", 'concentrate', 'edible'),
        ("Blue Raspberry Moon Rock Candies", 'concentrate', 'edible'),
        ("Cantaloupe Crush", 'concentrate', 'EXCLUDE'),  # no clear signal, exclude
        ("Vireo | CBG | Tablets | 30pk", 'flower', 'tincture'),
        ("Cornell Blu Ox Peach Rosin Hash Splits (Indica) - Regular", 'concentrate', 'concentrate'),
        # Round 3 — vape pens, beverage sizes
        ("MN Legit | Legit Hit Wax Pen | Silver", 'concentrate', 'cartridge'),
        ("Tanker Live Resin Vape - Royal Butter x High Noon", 'concentrate', 'cartridge'),
        ("Oliphant 10mg - Apple Cinnamon Crumble - 12oz", 'concentrate', 'beverage'),
        ("Grasslandz Disposable Vape Pen - Super Lemon Haze - 1g - 1 ct", 'cartridge', 'cartridge'),
        ("Cartridge Vape-IX | Grasslandz | OG Kush | 1g | 1 ct", 'cartridge', 'cartridge'),
        # 1/8oz must NOT match beverage size
        ("Sample Strain - 1/8oz", 'flower', 'flower'),
        # Round 4 — wax melts (home fragrance), CBD oils
        ("Wax melt - Coffee Shop", 'concentrate', 'EXCLUDE'),
        ("Wax melt - Linen Breeze", 'concentrate', 'EXCLUDE'),
        ("Carpe Diem THC-Free CBD Oil Isolate 5000mg Ginger/Peach", 'concentrate', 'tincture'),
        ("Starship Triple Vape Cart/Wax Coil Battery", 'concentrate', 'EXCLUDE'),
        ("Utillian 5 | Wax Atomizer", 'concentrate', 'EXCLUDE'),
        # Round 5 — vaporizer devices and rolling kits
        ("S.C.S. All In One Hemp Rolling Kits - Black - 1ct", 'cartridge', 'EXCLUDE'),
        ("S.C.S. All In One Hemp Rolling Kits - Pink & Black - 1ct", 'cartridge', 'EXCLUDE'),
        ("Storz and Bickel Volcano Hybrid Vaporizer V612", 'cartridge', 'EXCLUDE'),
        ("UTILLIAN 621 Vaporizer", 'cartridge', 'EXCLUDE'),
        ("Hitoki Laser Co - Trident Vaporizer", 'cartridge', 'EXCLUDE'),
        ("Peak Pro Vaporizer - Onyx 3DXL", 'cartridge', 'EXCLUDE'),
        ("puffco proxy vaporizer", 'cartridge', 'EXCLUDE'),
        ("New Proxy Vaporizer- Onyx", 'cartridge', 'EXCLUDE'),
        ("Yocan Celestial vaporizer", 'cartridge', 'EXCLUDE'),
        ("LOOV Multi-purpose Vaporizer", 'cartridge', 'EXCLUDE'),
        ("Pivot Vaporizer - Onyx", 'cartridge', 'EXCLUDE'),
        ("Ooze | Fusion Extract Vaporizer Kit | Rainbow", 'cartridge', 'EXCLUDE'),
        ("Lookah Seahorse X All In One", 'cartridge', 'EXCLUDE'),
        # Real consumable carts MUST still be detected
        ("Stargaze Vape Disposable 1g - Hawaiian Herer - 1ct", 'cartridge', 'cartridge'),
        ("Nebula | Romulan | Disposable | 1g", 'concentrate', 'cartridge'),
        ("Grasslandz Disposable Vape Pen - Super Lemon Haze - 1g", 'cartridge', 'cartridge'),
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
