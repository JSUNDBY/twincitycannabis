// ============================================================
// Twin City Cannabis — Data Layer
// All mock data for dispensaries, products, strains, deals
// ============================================================

const TCC = window.TCC || {};

// ---- NEIGHBORHOODS ----
TCC.neighborhoods = [
    'Downtown Minneapolis', 'Uptown', 'Northeast Minneapolis', 'North Loop',
    'South Minneapolis', 'St. Paul Downtown', 'Highland Park', 'Midway',
    'Bloomington', 'Eagan', 'Eden Prairie', 'Brooklyn Park',
    'Maple Grove', 'Woodbury', 'Roseville', 'Burnsville'
];

// ---- DISPENSARIES ----
TCC.dispensaries = [
    {
        id: 'green-goods-mpls',
        name: 'Green Goods Minneapolis',
        tagline: 'Premium cannabis, downtown convenience',
        address: '710 Washington Ave N, Minneapolis, MN 55401',
        neighborhood: 'North Loop',
        city: 'Minneapolis',
        lat: 44.9862,
        lng: -93.2790,
        phone: '(612) 555-0142',
        hours: { open: '9:00 AM', close: '9:00 PM', days: 'Mon-Sat', sundayOpen: '10:00 AM', sundayClose: '6:00 PM' },
        website: '#',
        tier: 'premium',
        tcc_score: 92,
        scores: { pricing: 88, selection: 95, service: 90, lab_testing: 96 },
        review_count: 284,
        verified: true,
        features: ['Online ordering', 'Curbside pickup', 'ADA accessible', 'Loyalty program'],
        gradient: 'linear-gradient(135deg, #065f46, #047857)',
        initial: 'GG'
    },
    {
        id: 'north-star-cannabis',
        name: 'North Star Cannabis Co.',
        tagline: 'Minnesota grown, Minnesota owned',
        address: '2401 Hennepin Ave, Minneapolis, MN 55405',
        neighborhood: 'Uptown',
        city: 'Minneapolis',
        lat: 44.9621,
        lng: -93.2983,
        phone: '(612) 555-0198',
        hours: { open: '8:00 AM', close: '10:00 PM', days: 'Mon-Sun' },
        website: '#',
        tier: 'platinum',
        tcc_score: 96,
        scores: { pricing: 94, selection: 97, service: 95, lab_testing: 98 },
        review_count: 412,
        verified: true,
        features: ['Online ordering', 'Delivery', 'Curbside pickup', 'Loyalty program', 'ATM on-site'],
        gradient: 'linear-gradient(135deg, #1e3a5f, #2563eb)',
        initial: 'NS'
    },
    {
        id: 'twin-leaf-st-paul',
        name: 'Twin Leaf Dispensary',
        tagline: 'St. Paul\'s neighborhood dispensary',
        address: '875 Grand Ave, St. Paul, MN 55105',
        neighborhood: 'Highland Park',
        city: 'St. Paul',
        lat: 44.9398,
        lng: -93.1369,
        phone: '(651) 555-0167',
        hours: { open: '9:00 AM', close: '8:00 PM', days: 'Mon-Sat', sundayOpen: '11:00 AM', sundayClose: '5:00 PM' },
        website: '#',
        tier: 'featured',
        tcc_score: 88,
        scores: { pricing: 91, selection: 84, service: 92, lab_testing: 86 },
        review_count: 156,
        verified: true,
        features: ['Curbside pickup', 'ADA accessible', 'Veteran discount'],
        gradient: 'linear-gradient(135deg, #7c2d12, #ea580c)',
        initial: 'TL'
    },
    {
        id: 'lakes-cannabis',
        name: 'Lakes Cannabis',
        tagline: 'Elevated experiences by the lakes',
        address: '3010 Excelsior Blvd, Minneapolis, MN 55416',
        neighborhood: 'Uptown',
        city: 'Minneapolis',
        lat: 44.9486,
        lng: -93.3122,
        phone: '(612) 555-0234',
        hours: { open: '10:00 AM', close: '9:00 PM', days: 'Mon-Sun' },
        website: '#',
        tier: 'featured',
        tcc_score: 85,
        scores: { pricing: 82, selection: 88, service: 86, lab_testing: 84 },
        review_count: 198,
        verified: true,
        features: ['Online ordering', 'Loyalty program', 'Parking lot'],
        gradient: 'linear-gradient(135deg, #4338ca, #7c3aed)',
        initial: 'LC'
    },
    {
        id: 'midway-meds',
        name: 'Midway Green',
        tagline: 'Centrally located, community focused',
        address: '1562 University Ave W, St. Paul, MN 55104',
        neighborhood: 'Midway',
        city: 'St. Paul',
        lat: 44.9553,
        lng: -93.1670,
        phone: '(651) 555-0289',
        hours: { open: '9:00 AM', close: '9:00 PM', days: 'Mon-Sat', sundayOpen: '10:00 AM', sundayClose: '7:00 PM' },
        website: '#',
        tier: 'free',
        tcc_score: 79,
        scores: { pricing: 85, selection: 72, service: 80, lab_testing: 78 },
        review_count: 89,
        verified: true,
        features: ['ADA accessible', 'ATM on-site'],
        gradient: 'linear-gradient(135deg, #166534, #22c55e)',
        initial: 'MG'
    },
    {
        id: 'northeast-remedies',
        name: 'Northeast Remedies',
        tagline: 'Arts district vibes, premium flower',
        address: '2215 Central Ave NE, Minneapolis, MN 55418',
        neighborhood: 'Northeast Minneapolis',
        city: 'Minneapolis',
        lat: 44.9998,
        lng: -93.2471,
        phone: '(612) 555-0312',
        hours: { open: '10:00 AM', close: '8:00 PM', days: 'Mon-Sat', sundayOpen: '12:00 PM', sundayClose: '5:00 PM' },
        website: '#',
        tier: 'featured',
        tcc_score: 87,
        scores: { pricing: 83, selection: 90, service: 89, lab_testing: 85 },
        review_count: 167,
        verified: true,
        features: ['Online ordering', 'Curbside pickup', 'First-time discount'],
        gradient: 'linear-gradient(135deg, #9f1239, #e11d48)',
        initial: 'NR'
    },
    {
        id: 'bloomington-buds',
        name: 'Bloomington Cannabis Co.',
        tagline: 'South metro\'s best selection',
        address: '7845 Lyndale Ave S, Bloomington, MN 55420',
        neighborhood: 'Bloomington',
        city: 'Bloomington',
        lat: 44.8546,
        lng: -93.2883,
        phone: '(952) 555-0145',
        hours: { open: '9:00 AM', close: '9:00 PM', days: 'Mon-Sun' },
        website: '#',
        tier: 'premium',
        tcc_score: 91,
        scores: { pricing: 90, selection: 93, service: 88, lab_testing: 92 },
        review_count: 231,
        verified: true,
        features: ['Online ordering', 'Delivery', 'Parking lot', 'Loyalty program', 'Veteran discount'],
        gradient: 'linear-gradient(135deg, #0f766e, #14b8a6)',
        initial: 'BC'
    },
    {
        id: 'como-cannabis',
        name: 'Como Cannabis',
        tagline: 'Relaxation starts here',
        address: '1380 Como Ave, St. Paul, MN 55108',
        neighborhood: 'St. Paul Downtown',
        city: 'St. Paul',
        lat: 44.9716,
        lng: -93.1430,
        phone: '(651) 555-0198',
        hours: { open: '10:00 AM', close: '8:00 PM', days: 'Mon-Sat' },
        website: '#',
        tier: 'free',
        tcc_score: 76,
        scores: { pricing: 80, selection: 70, service: 78, lab_testing: 75 },
        review_count: 64,
        verified: false,
        features: ['ADA accessible'],
        gradient: 'linear-gradient(135deg, #854d0e, #ca8a04)',
        initial: 'CC'
    },
    {
        id: 'eden-prairie-wellness',
        name: 'Eden Prairie Wellness',
        tagline: 'Suburban serenity, premium quality',
        address: '8032 Eden Prairie Rd, Eden Prairie, MN 55344',
        neighborhood: 'Eden Prairie',
        city: 'Eden Prairie',
        lat: 44.8547,
        lng: -93.4708,
        phone: '(952) 555-0276',
        hours: { open: '9:00 AM', close: '8:00 PM', days: 'Mon-Sat', sundayOpen: '11:00 AM', sundayClose: '5:00 PM' },
        website: '#',
        tier: 'featured',
        tcc_score: 84,
        scores: { pricing: 78, selection: 86, service: 91, lab_testing: 82 },
        review_count: 142,
        verified: true,
        features: ['Online ordering', 'Curbside pickup', 'Parking lot', 'First-time discount'],
        gradient: 'linear-gradient(135deg, #581c87, #a855f7)',
        initial: 'EP'
    },
    {
        id: 'summit-cannabis',
        name: 'Summit Cannabis',
        tagline: 'Peak quality, peak experience',
        address: '425 Summit Ave, St. Paul, MN 55102',
        neighborhood: 'St. Paul Downtown',
        city: 'St. Paul',
        lat: 44.9439,
        lng: -93.1198,
        phone: '(651) 555-0334',
        hours: { open: '9:00 AM', close: '9:00 PM', days: 'Mon-Sun' },
        website: '#',
        tier: 'premium',
        tcc_score: 90,
        scores: { pricing: 86, selection: 92, service: 93, lab_testing: 90 },
        review_count: 203,
        verified: true,
        features: ['Online ordering', 'Delivery', 'Loyalty program', 'Lab results on-site'],
        gradient: 'linear-gradient(135deg, #1e40af, #3b82f6)',
        initial: 'SC'
    },
    {
        id: 'roseville-green',
        name: 'Roseville Green',
        tagline: 'Your friendly neighborhood shop',
        address: '2480 Fairview Ave N, Roseville, MN 55113',
        neighborhood: 'Roseville',
        city: 'Roseville',
        lat: 45.0135,
        lng: -93.1780,
        phone: '(651) 555-0411',
        hours: { open: '10:00 AM', close: '8:00 PM', days: 'Mon-Sat' },
        website: '#',
        tier: 'free',
        tcc_score: 74,
        scores: { pricing: 79, selection: 68, service: 76, lab_testing: 72 },
        review_count: 47,
        verified: false,
        features: ['Parking lot', 'ATM on-site'],
        gradient: 'linear-gradient(135deg, #365314, #65a30d)',
        initial: 'RG'
    },
    {
        id: 'woodbury-wellness',
        name: 'Woodbury Cannabis Wellness',
        tagline: 'East metro excellence',
        address: '1845 Woodlane Dr, Woodbury, MN 55125',
        neighborhood: 'Woodbury',
        city: 'Woodbury',
        lat: 44.9239,
        lng: -92.9594,
        phone: '(651) 555-0488',
        hours: { open: '9:00 AM', close: '9:00 PM', days: 'Mon-Sun' },
        website: '#',
        tier: 'featured',
        tcc_score: 86,
        scores: { pricing: 84, selection: 87, service: 88, lab_testing: 84 },
        review_count: 178,
        verified: true,
        features: ['Online ordering', 'Curbside pickup', 'Parking lot', 'Loyalty program'],
        gradient: 'linear-gradient(135deg, #0e7490, #06b6d4)',
        initial: 'WC'
    }
];

// ---- STRAINS ----
TCC.strains = [
    { id: 'blue-dream', name: 'Blue Dream', type: 'hybrid', thc: '21-24%', cbd: '<1%', effects: ['Relaxed', 'Happy', 'Euphoric', 'Creative'], flavors: ['Berry', 'Sweet', 'Herbal'], desc: 'A balanced hybrid offering full-body relaxation with gentle cerebral invigoration.' },
    { id: 'northern-lights', name: 'Northern Lights', type: 'indica', thc: '18-22%', cbd: '<1%', effects: ['Relaxed', 'Sleepy', 'Happy', 'Euphoric'], flavors: ['Pine', 'Earthy', 'Sweet'], desc: 'One of the most famous indicas, prized for its resinous buds and fast flowering.' },
    { id: 'sour-diesel', name: 'Sour Diesel', type: 'sativa', thc: '20-25%', cbd: '<1%', effects: ['Energetic', 'Happy', 'Uplifted', 'Creative'], flavors: ['Diesel', 'Pungent', 'Earthy'], desc: 'A fast-acting sativa with dreamy, energizing effects and a pungent diesel aroma.' },
    { id: 'girl-scout-cookies', name: 'Girl Scout Cookies', type: 'hybrid', thc: '25-28%', cbd: '<1%', effects: ['Euphoric', 'Relaxed', 'Happy', 'Creative'], flavors: ['Sweet', 'Earthy', 'Pungent'], desc: 'A potent hybrid with a sweet, earthy aroma and powerful full-body effects.' },
    { id: 'wedding-cake', name: 'Wedding Cake', type: 'indica', thc: '24-27%', cbd: '<1%', effects: ['Relaxed', 'Euphoric', 'Happy', 'Sleepy'], flavors: ['Sweet', 'Vanilla', 'Earthy'], desc: 'Rich, tangy flavor with relaxing and euphoric effects. Great for evening use.' },
    { id: 'og-kush', name: 'OG Kush', type: 'hybrid', thc: '20-25%', cbd: '<1%', effects: ['Relaxed', 'Euphoric', 'Happy', 'Uplifted'], flavors: ['Earthy', 'Pine', 'Woody'], desc: 'The backbone of West Coast cannabis, delivering heavy euphoria and relaxation.' },
    { id: 'gelato', name: 'Gelato', type: 'hybrid', thc: '22-26%', cbd: '<1%', effects: ['Relaxed', 'Euphoric', 'Happy', 'Creative'], flavors: ['Sweet', 'Citrus', 'Berry'], desc: 'Dessert-like flavor with a balanced, feel-good high. Beautiful purple buds.' },
    { id: 'purple-haze', name: 'Purple Haze', type: 'sativa', thc: '17-20%', cbd: '<1%', effects: ['Euphoric', 'Happy', 'Creative', 'Energetic'], flavors: ['Berry', 'Earthy', 'Sweet'], desc: 'A legendary sativa delivering creative energy and blissful contentment.' },
    { id: 'jack-herer', name: 'Jack Herer', type: 'sativa', thc: '18-23%', cbd: '<1%', effects: ['Happy', 'Uplifted', 'Energetic', 'Creative'], flavors: ['Pine', 'Earthy', 'Woody'], desc: 'Named after the cannabis activist, this sativa is a blissful, clear-headed staple.' },
    { id: 'granddaddy-purple', name: 'Granddaddy Purple', type: 'indica', thc: '20-24%', cbd: '<1%', effects: ['Relaxed', 'Sleepy', 'Happy', 'Euphoric'], flavors: ['Grape', 'Berry', 'Sweet'], desc: 'A famous indica with a complex grape and berry aroma. Deep physical relaxation.' },
    { id: 'green-crack', name: 'Green Crack', type: 'sativa', thc: '17-21%', cbd: '<1%', effects: ['Energetic', 'Focused', 'Happy', 'Uplifted'], flavors: ['Citrus', 'Sweet', 'Mango'], desc: 'Tangy mango flavor with an invigorating mental buzz. Perfect for daytime.' },
    { id: 'gorilla-glue', name: 'Gorilla Glue #4', type: 'hybrid', thc: '25-30%', cbd: '<1%', effects: ['Relaxed', 'Euphoric', 'Happy', 'Uplifted'], flavors: ['Pine', 'Earthy', 'Pungent'], desc: 'Heavy-handed euphoria that glues you to the couch. Multiple award winner.' },
    { id: 'white-widow', name: 'White Widow', type: 'hybrid', thc: '18-22%', cbd: '<1%', effects: ['Euphoric', 'Energetic', 'Creative', 'Happy'], flavors: ['Earthy', 'Woody', 'Pungent'], desc: 'A balanced hybrid known worldwide for its white crystal resin and burst of energy.' },
    { id: 'pineapple-express', name: 'Pineapple Express', type: 'hybrid', thc: '19-24%', cbd: '<1%', effects: ['Happy', 'Uplifted', 'Euphoric', 'Relaxed'], flavors: ['Tropical', 'Pineapple', 'Sweet'], desc: 'A tropical, citrusy sativa-dominant hybrid perfect for productive afternoons.' },
    { id: 'ak-47', name: 'AK-47', type: 'hybrid', thc: '20-24%', cbd: '1-2%', effects: ['Relaxed', 'Happy', 'Uplifted', 'Euphoric'], flavors: ['Earthy', 'Pungent', 'Sweet'], desc: 'A mellow, steady buzz that keeps you productive. Great for social settings.' },
    { id: 'runtz', name: 'Runtz', type: 'hybrid', thc: '24-29%', cbd: '<1%', effects: ['Euphoric', 'Relaxed', 'Happy', 'Tingly'], flavors: ['Fruity', 'Candy', 'Sweet'], desc: 'Candy-like sweetness with a perfectly balanced high. Instagram\'s favorite strain.' },
];

// ---- PRODUCT CATEGORIES ----
TCC.categories = [
    { id: 'flower', name: 'Flower', icon: 'leaf' },
    { id: 'pre-roll', name: 'Pre-Rolls', icon: 'joint' },
    { id: 'cartridge', name: 'Cartridges', icon: 'cart' },
    { id: 'edible', name: 'Edibles', icon: 'cookie' },
    { id: 'concentrate', name: 'Concentrates', icon: 'diamond' },
    { id: 'topical', name: 'Topicals', icon: 'drop' },
    { id: 'tincture', name: 'Tinctures', icon: 'bottle' },
];

// ---- PRODUCTS (with per-dispensary pricing) ----
TCC.products = [
    // --- FLOWER ---
    { id: 'p001', name: 'Blue Dream 3.5g', brand: 'Minnesota Grown', category: 'flower', strain: 'blue-dream', weight: '3.5g', thc: '22%', cbd: '<1%',
      prices: { 'green-goods-mpls': 38, 'north-star-cannabis': 35, 'twin-leaf-st-paul': 42, 'lakes-cannabis': 40, 'northeast-remedies': 39, 'bloomington-buds': 36, 'summit-cannabis': 37, 'woodbury-wellness': 41 },
      priceHistory: [45, 44, 42, 40, 38, 38, 37, 35] },
    { id: 'p002', name: 'Northern Lights 3.5g', brand: 'Lake Effect', category: 'flower', strain: 'northern-lights', weight: '3.5g', thc: '20%', cbd: '<1%',
      prices: { 'green-goods-mpls': 40, 'north-star-cannabis': 37, 'midway-meds': 43, 'bloomington-buds': 38, 'como-cannabis': 44, 'eden-prairie-wellness': 41, 'summit-cannabis': 39 },
      priceHistory: [46, 44, 43, 42, 40, 39, 38, 37] },
    { id: 'p003', name: 'Sour Diesel 3.5g', brand: 'Twin City Farms', category: 'flower', strain: 'sour-diesel', weight: '3.5g', thc: '23%', cbd: '<1%',
      prices: { 'north-star-cannabis': 40, 'northeast-remedies': 42, 'lakes-cannabis': 44, 'bloomington-buds': 39, 'summit-cannabis': 41, 'roseville-green': 45, 'woodbury-wellness': 43 },
      priceHistory: [48, 46, 45, 44, 42, 41, 40, 40] },
    { id: 'p004', name: 'Wedding Cake 3.5g', brand: 'North Woods', category: 'flower', strain: 'wedding-cake', weight: '3.5g', thc: '26%', cbd: '<1%',
      prices: { 'green-goods-mpls': 45, 'north-star-cannabis': 42, 'twin-leaf-st-paul': 48, 'northeast-remedies': 44, 'bloomington-buds': 43, 'eden-prairie-wellness': 47, 'summit-cannabis': 44 },
      priceHistory: [52, 50, 48, 47, 46, 45, 44, 42] },
    { id: 'p005', name: 'OG Kush 3.5g', brand: 'Minnesota Grown', category: 'flower', strain: 'og-kush', weight: '3.5g', thc: '22%', cbd: '<1%',
      prices: { 'green-goods-mpls': 41, 'north-star-cannabis': 38, 'midway-meds': 44, 'lakes-cannabis': 42, 'como-cannabis': 45, 'roseville-green': 43 },
      priceHistory: [47, 46, 45, 43, 42, 41, 39, 38] },
    { id: 'p006', name: 'Gelato 3.5g', brand: 'Frost Labs', category: 'flower', strain: 'gelato', weight: '3.5g', thc: '24%', cbd: '<1%',
      prices: { 'north-star-cannabis': 44, 'northeast-remedies': 46, 'bloomington-buds': 43, 'summit-cannabis': 45, 'woodbury-wellness': 47 },
      priceHistory: [50, 49, 48, 47, 46, 45, 44, 44] },
    { id: 'p007', name: 'Girl Scout Cookies 3.5g', brand: 'North Woods', category: 'flower', strain: 'girl-scout-cookies', weight: '3.5g', thc: '27%', cbd: '<1%',
      prices: { 'green-goods-mpls': 48, 'north-star-cannabis': 45, 'lakes-cannabis': 50, 'bloomington-buds': 46, 'eden-prairie-wellness': 49 },
      priceHistory: [55, 53, 52, 50, 49, 48, 46, 45] },
    { id: 'p008', name: 'Gorilla Glue #4 3.5g', brand: 'Frost Labs', category: 'flower', strain: 'gorilla-glue', weight: '3.5g', thc: '28%', cbd: '<1%',
      prices: { 'north-star-cannabis': 46, 'northeast-remedies': 48, 'bloomington-buds': 45, 'summit-cannabis': 47, 'woodbury-wellness': 49 },
      priceHistory: [54, 52, 51, 49, 48, 47, 46, 46] },
    { id: 'p009', name: 'Granddaddy Purple 3.5g', brand: 'Lake Effect', category: 'flower', strain: 'granddaddy-purple', weight: '3.5g', thc: '21%', cbd: '<1%',
      prices: { 'green-goods-mpls': 39, 'twin-leaf-st-paul': 41, 'midway-meds': 42, 'como-cannabis': 43, 'roseville-green': 40 },
      priceHistory: [45, 44, 43, 42, 41, 40, 39, 39] },
    { id: 'p010', name: 'Runtz 3.5g', brand: 'Twin City Farms', category: 'flower', strain: 'runtz', weight: '3.5g', thc: '27%', cbd: '<1%',
      prices: { 'north-star-cannabis': 48, 'northeast-remedies': 50, 'bloomington-buds': 47, 'summit-cannabis': 49, 'eden-prairie-wellness': 52 },
      priceHistory: [58, 55, 53, 52, 50, 49, 48, 48] },

    // --- PRE-ROLLS ---
    { id: 'p011', name: 'Sour Diesel Pre-Roll 5pk', brand: 'Twin City Farms', category: 'pre-roll', strain: 'sour-diesel', weight: '3.5g total', thc: '22%', cbd: '<1%',
      prices: { 'green-goods-mpls': 32, 'north-star-cannabis': 29, 'twin-leaf-st-paul': 35, 'northeast-remedies': 31, 'bloomington-buds': 28, 'summit-cannabis': 30, 'woodbury-wellness': 33 },
      priceHistory: [40, 38, 36, 35, 33, 31, 29, 29] },
    { id: 'p012', name: 'Blue Dream Pre-Roll 3pk', brand: 'Minnesota Grown', category: 'pre-roll', strain: 'blue-dream', weight: '2.1g total', thc: '21%', cbd: '<1%',
      prices: { 'green-goods-mpls': 22, 'north-star-cannabis': 19, 'lakes-cannabis': 24, 'midway-meds': 23, 'bloomington-buds': 20, 'eden-prairie-wellness': 25 },
      priceHistory: [28, 26, 25, 24, 23, 22, 20, 19] },
    { id: 'p013', name: 'Jack Herer Pre-Roll 1g', brand: 'North Woods', category: 'pre-roll', strain: 'jack-herer', weight: '1g', thc: '20%', cbd: '<1%',
      prices: { 'north-star-cannabis': 8, 'northeast-remedies': 10, 'bloomington-buds': 9, 'summit-cannabis': 9, 'como-cannabis': 11 },
      priceHistory: [14, 13, 12, 11, 10, 10, 9, 8] },
    { id: 'p014', name: 'Purple Haze Infused Pre-Roll', brand: 'Frost Labs', category: 'pre-roll', strain: 'purple-haze', weight: '1g', thc: '35%', cbd: '<1%',
      prices: { 'north-star-cannabis': 15, 'northeast-remedies': 17, 'bloomington-buds': 16, 'summit-cannabis': 16 },
      priceHistory: [22, 20, 19, 18, 17, 16, 15, 15] },

    // --- CARTRIDGES ---
    { id: 'p015', name: 'Northern Lights Cart 1g', brand: 'Lake Effect', category: 'cartridge', strain: 'northern-lights', weight: '1g', thc: '85%', cbd: '<1%',
      prices: { 'green-goods-mpls': 45, 'north-star-cannabis': 42, 'twin-leaf-st-paul': 48, 'bloomington-buds': 43, 'summit-cannabis': 44, 'woodbury-wellness': 46 },
      priceHistory: [52, 50, 49, 48, 46, 45, 43, 42] },
    { id: 'p016', name: 'Gelato Cart 0.5g', brand: 'Frost Labs', category: 'cartridge', strain: 'gelato', weight: '0.5g', thc: '88%', cbd: '<1%',
      prices: { 'north-star-cannabis': 28, 'northeast-remedies': 30, 'bloomington-buds': 27, 'lakes-cannabis': 32, 'eden-prairie-wellness': 31 },
      priceHistory: [35, 34, 33, 32, 30, 29, 28, 28] },
    { id: 'p017', name: 'OG Kush Cart 1g', brand: 'Minnesota Grown', category: 'cartridge', strain: 'og-kush', weight: '1g', thc: '82%', cbd: '<1%',
      prices: { 'green-goods-mpls': 44, 'north-star-cannabis': 40, 'midway-meds': 47, 'bloomington-buds': 41, 'summit-cannabis': 43 },
      priceHistory: [50, 49, 48, 46, 45, 43, 41, 40] },
    { id: 'p018', name: 'Pineapple Express Cart 0.5g', brand: 'Twin City Farms', category: 'cartridge', strain: 'pineapple-express', weight: '0.5g', thc: '86%', cbd: '<1%',
      prices: { 'north-star-cannabis': 26, 'northeast-remedies': 28, 'bloomington-buds': 25, 'summit-cannabis': 27, 'woodbury-wellness': 29 },
      priceHistory: [32, 31, 30, 29, 28, 27, 26, 26] },

    // --- EDIBLES ---
    { id: 'p019', name: 'GSC Gummies 100mg', brand: 'North Woods', category: 'edible', strain: 'girl-scout-cookies', weight: '10pk', thc: '100mg', cbd: '<5mg',
      prices: { 'green-goods-mpls': 24, 'north-star-cannabis': 22, 'twin-leaf-st-paul': 26, 'lakes-cannabis': 25, 'midway-meds': 27, 'bloomington-buds': 23, 'como-cannabis': 28, 'summit-cannabis': 24 },
      priceHistory: [30, 29, 28, 27, 26, 25, 23, 22] },
    { id: 'p020', name: 'Purple Haze Gummies 50mg', brand: 'Frost Labs', category: 'edible', strain: 'purple-haze', weight: '10pk', thc: '50mg', cbd: '<5mg',
      prices: { 'north-star-cannabis': 15, 'midway-meds': 19, 'como-cannabis': 20, 'roseville-green': 18, 'eden-prairie-wellness': 17 },
      priceHistory: [24, 22, 21, 20, 19, 18, 16, 15] },
    { id: 'p021', name: 'Blue Dream Chocolate Bar 100mg', brand: 'Lake Effect', category: 'edible', strain: 'blue-dream', weight: '1 bar', thc: '100mg', cbd: '<5mg',
      prices: { 'green-goods-mpls': 28, 'north-star-cannabis': 25, 'bloomington-buds': 26, 'summit-cannabis': 27, 'woodbury-wellness': 29 },
      priceHistory: [34, 32, 31, 30, 28, 27, 26, 25] },
    { id: 'p022', name: 'Sativa Energy Mints 100mg', brand: 'Twin City Farms', category: 'edible', strain: 'green-crack', weight: '20pk', thc: '100mg', cbd: '<5mg',
      prices: { 'north-star-cannabis': 20, 'northeast-remedies': 22, 'bloomington-buds': 19, 'eden-prairie-wellness': 23, 'summit-cannabis': 21 },
      priceHistory: [26, 25, 24, 23, 22, 21, 20, 20] },

    // --- CONCENTRATES ---
    { id: 'p023', name: 'Gorilla Glue Live Resin 1g', brand: 'Frost Labs', category: 'concentrate', strain: 'gorilla-glue', weight: '1g', thc: '78%', cbd: '<1%',
      prices: { 'north-star-cannabis': 52, 'northeast-remedies': 55, 'bloomington-buds': 50, 'summit-cannabis': 53 },
      priceHistory: [62, 60, 58, 56, 55, 53, 52, 52] },
    { id: 'p024', name: 'Wedding Cake Wax 1g', brand: 'North Woods', category: 'concentrate', strain: 'wedding-cake', weight: '1g', thc: '72%', cbd: '<1%',
      prices: { 'green-goods-mpls': 48, 'north-star-cannabis': 45, 'bloomington-buds': 44, 'summit-cannabis': 46, 'woodbury-wellness': 50 },
      priceHistory: [55, 53, 52, 50, 49, 47, 46, 45] },
    { id: 'p025', name: 'Runtz Diamonds 0.5g', brand: 'Frost Labs', category: 'concentrate', strain: 'runtz', weight: '0.5g', thc: '92%', cbd: '<1%',
      prices: { 'north-star-cannabis': 38, 'northeast-remedies': 40, 'bloomington-buds': 37, 'summit-cannabis': 39 },
      priceHistory: [45, 44, 42, 41, 40, 39, 38, 38] },

    // --- TOPICALS ---
    { id: 'p026', name: 'CBD Relief Balm 500mg', brand: 'Lake Effect', category: 'topical', strain: null, weight: '2oz', thc: '<5mg', cbd: '500mg',
      prices: { 'green-goods-mpls': 35, 'north-star-cannabis': 32, 'twin-leaf-st-paul': 38, 'bloomington-buds': 33, 'eden-prairie-wellness': 36, 'summit-cannabis': 34 },
      priceHistory: [42, 40, 39, 38, 36, 35, 33, 32] },
    { id: 'p027', name: 'THC Massage Oil 200mg', brand: 'North Woods', category: 'topical', strain: null, weight: '4oz', thc: '200mg', cbd: '100mg',
      prices: { 'north-star-cannabis': 28, 'bloomington-buds': 26, 'summit-cannabis': 29, 'woodbury-wellness': 31 },
      priceHistory: [35, 33, 32, 31, 30, 29, 28, 28] },

    // --- TINCTURES ---
    { id: 'p028', name: 'Full Spectrum Tincture 1000mg', brand: 'Lake Effect', category: 'tincture', strain: null, weight: '30ml', thc: '1000mg', cbd: '50mg',
      prices: { 'green-goods-mpls': 55, 'north-star-cannabis': 50, 'bloomington-buds': 52, 'summit-cannabis': 53, 'eden-prairie-wellness': 58 },
      priceHistory: [65, 62, 60, 58, 56, 55, 52, 50] },
    { id: 'p029', name: 'Sleep Tincture 500mg', brand: 'Minnesota Grown', category: 'tincture', strain: 'northern-lights', weight: '30ml', thc: '250mg', cbd: '250mg',
      prices: { 'north-star-cannabis': 38, 'twin-leaf-st-paul': 42, 'bloomington-buds': 39, 'como-cannabis': 44, 'summit-cannabis': 40 },
      priceHistory: [48, 46, 45, 43, 42, 40, 39, 38] },
    { id: 'p030', name: 'Microdose Tincture 200mg', brand: 'Twin City Farms', category: 'tincture', strain: null, weight: '30ml', thc: '200mg', cbd: '<10mg',
      prices: { 'green-goods-mpls': 30, 'north-star-cannabis': 27, 'midway-meds': 33, 'bloomington-buds': 28, 'roseville-green': 32 },
      priceHistory: [38, 36, 35, 34, 32, 30, 28, 27] },
];

// ---- DEALS ----
TCC.deals = [
    { id: 'd001', dispensaryId: 'north-star-cannabis', productId: 'p001', title: '20% Off Blue Dream', type: 'percent-off', discount: 20, originalPrice: 44, salePrice: 35, expires: '2026-04-12', featured: true },
    { id: 'd002', dispensaryId: 'bloomington-buds', productId: 'p011', title: 'Pre-Roll 5pk Flash Sale', type: 'flash', discount: 30, originalPrice: 40, salePrice: 28, expires: '2026-04-06', featured: true },
    { id: 'd003', dispensaryId: 'green-goods-mpls', productId: 'p019', title: 'Edible Weekend Special', type: 'percent-off', discount: 15, originalPrice: 28, salePrice: 24, expires: '2026-04-07', featured: false },
    { id: 'd004', dispensaryId: 'northeast-remedies', productId: null, title: 'First-Time Customer 25% Off', type: 'new-customer', discount: 25, originalPrice: null, salePrice: null, expires: '2026-06-30', featured: true },
    { id: 'd005', dispensaryId: 'summit-cannabis', productId: 'p024', title: 'Concentrate Day: $10 Off Wax', type: 'dollar-off', discount: 10, originalPrice: 56, salePrice: 46, expires: '2026-04-08', featured: false },
    { id: 'd006', dispensaryId: 'north-star-cannabis', productId: null, title: 'Happy Hour 4-6pm: 15% Off Carts', type: 'happy-hour', discount: 15, originalPrice: null, salePrice: null, expires: '2026-04-30', featured: true },
    { id: 'd007', dispensaryId: 'lakes-cannabis', productId: 'p007', title: 'GSC 3.5g Price Drop', type: 'price-drop', discount: null, originalPrice: 55, salePrice: 50, expires: '2026-04-10', featured: false },
    { id: 'd008', dispensaryId: 'twin-leaf-st-paul', productId: null, title: 'Veterans 20% Off Every Day', type: 'veteran', discount: 20, originalPrice: null, salePrice: null, expires: null, featured: false },
    { id: 'd009', dispensaryId: 'woodbury-wellness', productId: 'p015', title: 'Northern Lights Cart BOGO 50%', type: 'bogo', discount: 50, originalPrice: 46, salePrice: 46, expires: '2026-04-09', featured: true },
    { id: 'd010', dispensaryId: 'eden-prairie-wellness', productId: 'p020', title: 'Gummies 2-for-1', type: 'bogo', discount: 100, originalPrice: 17, salePrice: 17, expires: '2026-04-11', featured: true },
    { id: 'd011', dispensaryId: 'bloomington-buds', productId: null, title: 'Loyalty Points 2x Weekend', type: 'loyalty', discount: null, originalPrice: null, salePrice: null, expires: '2026-04-07', featured: false },
    { id: 'd012', dispensaryId: 'north-star-cannabis', productId: 'p010', title: 'Runtz Drop: Limited Batch', type: 'new-arrival', discount: null, originalPrice: null, salePrice: 48, expires: '2026-04-15', featured: true },
];

// ---- REVIEWS (sample) ----
TCC.reviews = [
    { dispensaryId: 'north-star-cannabis', author: 'Mike T.', date: '2026-03-28', rating: 5, text: 'Best selection in the Twin Cities, hands down. Staff really knows their stuff and the loyalty program is legit.' },
    { dispensaryId: 'north-star-cannabis', author: 'Sarah K.', date: '2026-03-25', rating: 5, text: 'Clean, welcoming space. Great product knowledge. The delivery option is a game changer.' },
    { dispensaryId: 'north-star-cannabis', author: 'Chris L.', date: '2026-03-20', rating: 4, text: 'Solid dispensary. Prices are fair, quality is consistent. Only ding is the parking situation.' },
    { dispensaryId: 'green-goods-mpls', author: 'Jenna R.', date: '2026-03-30', rating: 5, text: 'Downtown location is super convenient. Love the online ordering — in and out in 5 minutes.' },
    { dispensaryId: 'green-goods-mpls', author: 'Dave M.', date: '2026-03-22', rating: 4, text: 'Great quality flower. Prices are slightly above average but the lab testing transparency makes up for it.' },
    { dispensaryId: 'bloomington-buds', author: 'Amy N.', date: '2026-03-29', rating: 5, text: 'The delivery service is amazing. Always on time, great communication. Products are top notch.' },
    { dispensaryId: 'bloomington-buds', author: 'Tom H.', date: '2026-03-24', rating: 4, text: 'Big selection and competitive prices. The veteran discount is much appreciated.' },
    { dispensaryId: 'twin-leaf-st-paul', author: 'Maria G.', date: '2026-03-27', rating: 4, text: 'Friendly neighborhood vibe. Not the biggest selection but what they have is quality.' },
    { dispensaryId: 'summit-cannabis', author: 'Kevin P.', date: '2026-03-26', rating: 5, text: 'Premium experience. The lab results display is really impressive — full transparency.' },
    { dispensaryId: 'northeast-remedies', author: 'Lisa W.', date: '2026-03-21', rating: 4, text: 'Love the NE location. Cool space, knowledgeable staff, good first-time discount.' },
    { dispensaryId: 'lakes-cannabis', author: 'Ryan J.', date: '2026-03-23', rating: 4, text: 'Solid option in Uptown. Loyalty program could be better but product quality is there.' },
    { dispensaryId: 'eden-prairie-wellness', author: 'Pat S.', date: '2026-03-19', rating: 4, text: 'Great suburban option. Clean, professional. A little pricey but the curbside pickup is convenient.' },
];

// ---- HELPER FUNCTIONS ----

TCC.getDispensary = (id) => TCC.dispensaries.find(d => d.id === id);
TCC.getProduct = (id) => TCC.products.find(p => p.id === id);
TCC.getStrain = (id) => TCC.strains.find(s => s.id === id);

TCC.getLowestPrice = (product) => {
    const entries = Object.entries(product.prices);
    if (!entries.length) return null;
    return entries.reduce((min, [id, price]) => price < min.price ? { dispensaryId: id, price } : min, { dispensaryId: entries[0][0], price: entries[0][1] });
};

TCC.getHighestPrice = (product) => {
    const entries = Object.entries(product.prices);
    if (!entries.length) return null;
    return entries.reduce((max, [id, price]) => price > max.price ? { dispensaryId: id, price } : max, { dispensaryId: entries[0][0], price: entries[0][1] });
};

TCC.getPriceRange = (product) => {
    const low = TCC.getLowestPrice(product);
    const high = TCC.getHighestPrice(product);
    return { low: low?.price, high: high?.price };
};

TCC.getProductsForDispensary = (dispensaryId) => {
    return TCC.products.filter(p => p.prices[dispensaryId] !== undefined);
};

TCC.getDealsForDispensary = (dispensaryId) => {
    return TCC.deals.filter(d => d.dispensaryId === dispensaryId);
};

TCC.getReviewsForDispensary = (dispensaryId) => {
    return TCC.reviews.filter(r => r.dispensaryId === dispensaryId);
};

TCC.getProductsByCategory = (category) => {
    return TCC.products.filter(p => p.category === category);
};

TCC.getProductsByStrain = (strainId) => {
    return TCC.products.filter(p => p.strain === strainId);
};

TCC.searchProducts = (query) => {
    const q = query.toLowerCase();
    return TCC.products.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        (p.strain && TCC.getStrain(p.strain)?.name.toLowerCase().includes(q))
    );
};

TCC.searchDispensaries = (query) => {
    const q = query.toLowerCase();
    return TCC.dispensaries.filter(d =>
        d.name.toLowerCase().includes(q) ||
        d.neighborhood.toLowerCase().includes(q) ||
        d.city.toLowerCase().includes(q)
    );
};

TCC.formatPrice = (price) => `$${price}`;

TCC.getTierLabel = (tier) => {
    const labels = { free: '', featured: 'Featured', premium: 'Premium', platinum: 'Platinum Partner' };
    return labels[tier] || '';
};

TCC.getTierColor = (tier) => {
    const colors = { free: '', featured: '#22c55e', premium: '#a855f7', platinum: '#f59e0b' };
    return colors[tier] || '';
};

TCC.getScoreColor = (score) => {
    if (score >= 90) return '#22c55e';
    if (score >= 80) return '#f59e0b';
    if (score >= 70) return '#f97316';
    return '#ef4444';
};

TCC.getScoreLabel = (score) => {
    if (score >= 90) return 'Excellent';
    if (score >= 80) return 'Great';
    if (score >= 70) return 'Good';
    return 'Fair';
};

TCC.priceHistoryLabels = ['8w ago', '7w ago', '6w ago', '5w ago', '4w ago', '3w ago', '2w ago', 'Now'];

window.TCC = TCC;
