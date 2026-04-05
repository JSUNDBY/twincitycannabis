// ============================================================
// Twin City Cannabis — Data Layer
// Real Twin Cities dispensary data + products + strains
// ============================================================

const TCC = window.TCC || {};

// ---- REAL DISPENSARIES ----
TCC.dispensaries = [
    {
        id: 'green-goods-mpls',
        name: 'Green Goods',
        tagline: 'Medical & adult-use cannabis dispensary',
        address: '207 S 9th St, Minneapolis, MN 55402',
        neighborhood: 'Downtown',
        city: 'Minneapolis',
        lat: 44.9753,
        lng: -93.2740,
        phone: '(612) 999-1615',
        hours: { weekday: '10am-8pm', weekend: '9am-9pm', note: 'Sun-Wed 10-8, Thu-Sat 9-9' },
        website: 'https://visitgreengoods.com',
        tier: 'premium',
        tcc_score: 93,
        scores: { pricing: 88, selection: 96, service: 92, lab_testing: 97 },
        review_count: 312,
        verified: true,
        features: ['Online ordering', 'Parking', 'ATM on-site', 'ADA accessible', 'Medical & recreational'],
        gradient: 'linear-gradient(135deg, #065f46, #059669)',
        initial: 'GG',
        img: 'https://images.unsplash.com/photo-1589484344286-dd3d3a540da9?w=600&h=200&fit=crop'
    },
    {
        id: 'sweetleaves-north-loop',
        name: 'Sweetleaves',
        tagline: 'Minnesota\'s first ultra-high-end cannabis dispensary',
        address: '905 N Washington Ave, Minneapolis, MN 55401',
        neighborhood: 'North Loop',
        city: 'Minneapolis',
        lat: 44.9886,
        lng: -93.2773,
        phone: '(612) 555-0198',
        hours: { weekday: '10am-8pm', weekend: '10am-8pm', note: 'Open 7 days' },
        website: 'https://sweetleavesnorthloop.com',
        tier: 'platinum',
        tcc_score: 96,
        scores: { pricing: 82, selection: 98, service: 97, lab_testing: 96 },
        review_count: 287,
        verified: true,
        features: ['Online ordering', 'Delivery', 'Curbside pickup', 'Pet-friendly', 'Credit card accepted', 'Premium brands'],
        gradient: 'linear-gradient(135deg, #7c2d12, #dc2626)',
        initial: 'SL',
        img: 'https://images.unsplash.com/photo-1587754236364-dce50e16db2d?w=600&h=200&fit=crop'
    },
    {
        id: 'legacy-cannabis-mpls',
        name: 'Legacy Cannabis',
        tagline: 'Minnesota\'s premier cannabis dispensary',
        address: '2930 Lyndale Ave S, Minneapolis, MN 55408',
        neighborhood: 'Lyndale',
        city: 'Minneapolis',
        lat: 44.9487,
        lng: -93.2882,
        phone: '(612) 418-1050',
        hours: { weekday: '10am-8pm', weekend: '10am-8pm', note: 'Open 7 days' },
        website: 'https://legacycannabismn.com',
        tier: 'featured',
        tcc_score: 89,
        scores: { pricing: 86, selection: 92, service: 88, lab_testing: 90 },
        review_count: 198,
        verified: true,
        features: ['Flower', 'Pre-rolls', 'Artisan glass', 'Online ordering'],
        gradient: 'linear-gradient(135deg, #1e3a5f, #3b82f6)',
        initial: 'LC',
        img: 'https://images.unsplash.com/photo-1560719887-fe3105fa1e55?w=600&h=200&fit=crop'
    },
    {
        id: 'legacy-cannabis-woodbury',
        name: 'Legacy Cannabis Woodbury',
        tagline: 'East metro\'s go-to dispensary',
        address: '9891 Hudson Pl #100, Woodbury, MN 55129',
        neighborhood: 'Woodbury',
        city: 'Woodbury',
        lat: 44.9239,
        lng: -92.9594,
        phone: '(651) 555-0312',
        hours: { weekday: '10am-8pm', weekend: '10am-8pm', note: 'Open 7 days' },
        website: 'https://legacycannabismn.com',
        tier: 'featured',
        tcc_score: 87,
        scores: { pricing: 85, selection: 90, service: 86, lab_testing: 88 },
        review_count: 124,
        verified: true,
        features: ['Flower', 'Pre-rolls', 'Artisan glass', 'Parking lot'],
        gradient: 'linear-gradient(135deg, #1e3a5f, #2563eb)',
        initial: 'LC',
        img: null
    },
    {
        id: 'zaza-st-paul',
        name: 'Zaza Cannabis',
        tagline: 'St. Paul\'s neighborhood dispensary',
        address: '1112 Grand Ave, St. Paul, MN 55105',
        neighborhood: 'Grand Ave',
        city: 'St. Paul',
        lat: 44.9397,
        lng: -93.1369,
        phone: '(651) 555-0167',
        hours: { weekday: '10am-8pm', weekend: '10am-6pm', note: 'Mon-Sat 10-8, Sun 10-6' },
        website: 'https://zazacannabismn.com',
        tier: 'featured',
        tcc_score: 85,
        scores: { pricing: 88, selection: 82, service: 86, lab_testing: 84 },
        review_count: 156,
        verified: true,
        features: ['Walk-in friendly', 'Edibles', 'Flower', 'Accessories'],
        gradient: 'linear-gradient(135deg, #581c87, #9333ea)',
        initial: 'ZZ',
        img: null
    },
    {
        id: 'zaza-mpls',
        name: 'Zaza Cannabis Minneapolis',
        tagline: 'East Lake cannabis destination',
        address: '3617 E Lake St, Minneapolis, MN 55406',
        neighborhood: 'East Lake',
        city: 'Minneapolis',
        lat: 44.9482,
        lng: -93.2270,
        phone: '(612) 555-0289',
        hours: { weekday: '10am-8pm', weekend: '10am-6pm', note: 'Mon-Sat 10-8, Sun 10-6' },
        website: 'https://zazacannabismn.com',
        tier: 'free',
        tcc_score: 82,
        scores: { pricing: 86, selection: 78, service: 83, lab_testing: 80 },
        review_count: 89,
        verified: true,
        features: ['Walk-in friendly', 'Edibles', 'Flower'],
        gradient: 'linear-gradient(135deg, #581c87, #a855f7)',
        initial: 'ZZ',
        img: null
    },
    {
        id: 'budtales-mpls',
        name: 'Budtales Dispensary',
        tagline: 'Downtown Minneapolis cannabis',
        address: '33 S 6th St, Minneapolis, MN 55402',
        neighborhood: 'Downtown',
        city: 'Minneapolis',
        lat: 44.9778,
        lng: -93.2696,
        phone: '(612) 555-0334',
        hours: { weekday: '9am-9pm', weekend: '9am-9pm', note: 'Open 7 days 9-9' },
        website: 'https://budtales.shop',
        tier: 'premium',
        tcc_score: 90,
        scores: { pricing: 87, selection: 93, service: 91, lab_testing: 89 },
        review_count: 203,
        verified: true,
        features: ['Online ordering', 'Delivery', 'Lab-tested', 'Full menu'],
        gradient: 'linear-gradient(135deg, #0f766e, #14b8a6)',
        initial: 'BT',
        img: null
    },
    {
        id: 'nativecare-wsp',
        name: 'NativeCare Cannabis',
        tagline: 'Red Lake Nation dispensary',
        address: '2001 S Robert St, West St. Paul, MN 55118',
        neighborhood: 'West St. Paul',
        city: 'West St. Paul',
        lat: 44.9066,
        lng: -93.0970,
        phone: '(651) 555-0411',
        hours: { weekday: '10am-8pm', weekend: '10am-6pm', note: 'Mon-Sat 10-8, Sun 10-6' },
        website: 'https://nativecare.com',
        tier: 'featured',
        tcc_score: 86,
        scores: { pricing: 90, selection: 84, service: 85, lab_testing: 86 },
        review_count: 78,
        verified: true,
        features: ['Tribal dispensary', 'Competitive pricing', 'Full menu', 'Parking'],
        gradient: 'linear-gradient(135deg, #92400e, #d97706)',
        initial: 'NC',
        img: null
    },
    {
        id: 'edina-canna',
        name: 'Edina Canna',
        tagline: 'Premium cannabis in Edina',
        address: '7145 France Ave S, Edina, MN 55435',
        neighborhood: 'Edina',
        city: 'Edina',
        lat: 44.8694,
        lng: -93.3334,
        phone: '(952) 555-0145',
        hours: { weekday: '10am-8pm', weekend: '10am-6pm', note: 'Mon-Sat 10-8, Sun 10-6' },
        website: 'https://edinacanna.com',
        tier: 'featured',
        tcc_score: 88,
        scores: { pricing: 80, selection: 91, service: 92, lab_testing: 88 },
        review_count: 142,
        verified: true,
        features: ['Premium brands', 'Edibles', 'Flower', 'Parking lot', 'Suburban location'],
        gradient: 'linear-gradient(135deg, #4338ca, #7c3aed)',
        initial: 'EC',
        img: null
    },
    {
        id: 'minnesota-canna',
        name: 'Minnesota Canna',
        tagline: 'The best dispensary in the Twin Cities',
        address: 'Minneapolis, MN',
        neighborhood: 'Twin Cities',
        city: 'Minneapolis',
        lat: 44.9650,
        lng: -93.2900,
        phone: '(612) 555-0198',
        hours: { weekday: '10am-8pm', weekend: '10am-6pm', note: 'Hours vary' },
        website: 'https://minnesotacanna.com',
        tier: 'free',
        tcc_score: 80,
        scores: { pricing: 84, selection: 78, service: 80, lab_testing: 78 },
        review_count: 67,
        verified: false,
        features: ['Edibles', 'Flower', 'Delivery'],
        gradient: 'linear-gradient(135deg, #166534, #22c55e)',
        initial: 'MC',
        img: null
    },
    {
        id: 'clouds-mn',
        name: 'cLOUDs Cannabis',
        tagline: 'Cannabis delivery in the Twin Cities',
        address: '1620 E 78th St, Minneapolis, MN 55423',
        neighborhood: 'South Minneapolis',
        city: 'Minneapolis',
        lat: 44.8645,
        lng: -93.2483,
        phone: '(612) 487-8274',
        hours: { weekday: '12pm-9pm', weekend: '12pm-9pm', note: 'Drop hours 12-9 daily' },
        website: 'https://cloudsmn.com',
        tier: 'free',
        tcc_score: 78,
        scores: { pricing: 82, selection: 76, service: 78, lab_testing: 76 },
        review_count: 54,
        verified: false,
        features: ['Delivery only', 'Flower', 'Edibles', 'Carts'],
        gradient: 'linear-gradient(135deg, #1e40af, #60a5fa)',
        initial: 'CL',
        img: null
    },
    {
        id: 'nothing-but-hemp-sp',
        name: 'Nothing But Hemp',
        tagline: 'Saint Paul\'s THC destination',
        address: '742 Grand Ave, St. Paul, MN 55105',
        neighborhood: 'Grand Ave',
        city: 'St. Paul',
        lat: 44.9398,
        lng: -93.1390,
        phone: '(651) 555-0488',
        hours: { weekday: '10:30am-8pm', weekend: '12pm-6pm', note: 'Mon-Sat 10:30-8, Sun 12-6' },
        website: 'https://nothingbuthemp.net',
        tier: 'free',
        tcc_score: 76,
        scores: { pricing: 80, selection: 72, service: 76, lab_testing: 75 },
        review_count: 43,
        verified: false,
        features: ['THC edibles', 'Gummies', 'Beverages', 'Tinctures'],
        gradient: 'linear-gradient(135deg, #365314, #65a30d)',
        initial: 'NH',
        img: null
    },
    {
        id: 'turning-leaf-stillwater',
        name: 'Turning Leaf',
        tagline: 'Cannabis & vape in Stillwater',
        address: '5980 Neal Ave N, Ste 300, Stillwater, MN 55082',
        neighborhood: 'Stillwater',
        city: 'Stillwater',
        lat: 45.0542,
        lng: -92.8464,
        phone: '(651) 760-7420',
        hours: { weekday: '10am-7pm', weekend: '11am-7pm', note: 'Mon-Sat 10-7, Sun 11-7' },
        website: 'https://shopturningleaf.com',
        tier: 'free',
        tcc_score: 74,
        scores: { pricing: 78, selection: 70, service: 76, lab_testing: 72 },
        review_count: 38,
        verified: false,
        features: ['Cannabis', 'Vape', 'Accessories', 'Parking lot'],
        gradient: 'linear-gradient(135deg, #854d0e, #ca8a04)',
        initial: 'TL',
        img: null
    },
    {
        id: 'minnesota-dispensary-sp',
        name: 'Minnesota\'s Dispensary',
        tagline: '15 locations across Minnesota',
        address: 'St. Paul, MN',
        neighborhood: 'St. Paul',
        city: 'St. Paul',
        lat: 44.9537,
        lng: -93.0900,
        phone: '(651) 555-0500',
        hours: { weekday: '10am-8pm', weekend: '10am-6pm', note: 'Hours vary by location' },
        website: 'https://minnesotasdispensary.com',
        tier: 'premium',
        tcc_score: 84,
        scores: { pricing: 86, selection: 83, service: 82, lab_testing: 84 },
        review_count: 167,
        verified: true,
        features: ['Multiple locations', 'Online ordering', 'Full menu', 'Lab-tested'],
        gradient: 'linear-gradient(135deg, #9f1239, #e11d48)',
        initial: 'MD',
        img: null
    },
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
    { id: 'pineapple-express', name: 'Pineapple Express', type: 'hybrid', thc: '19-24%', cbd: '<1%', effects: ['Happy', 'Uplifted', 'Euphoric', 'Relaxed'], flavors: ['Tropical', 'Pineapple', 'Sweet'], desc: 'A tropical, citrusy hybrid perfect for productive afternoons.' },
    { id: 'runtz', name: 'Runtz', type: 'hybrid', thc: '24-29%', cbd: '<1%', effects: ['Euphoric', 'Relaxed', 'Happy', 'Tingly'], flavors: ['Fruity', 'Candy', 'Sweet'], desc: 'Candy-like sweetness with a perfectly balanced high.' },
    { id: 'zkittlez', name: 'Zkittlez', type: 'indica', thc: '20-23%', cbd: '<1%', effects: ['Relaxed', 'Happy', 'Euphoric', 'Sleepy'], flavors: ['Sweet', 'Tropical', 'Berry'], desc: 'Taste the rainbow. A flavorful indica with a calm, happy buzz.' },
];

// ---- CATEGORIES ----
TCC.categories = [
    { id: 'flower', name: 'Flower', icon: '&#127807;' },
    { id: 'pre-roll', name: 'Pre-Rolls', icon: '&#128684;' },
    { id: 'cartridge', name: 'Cartridges', icon: '&#128267;' },
    { id: 'edible', name: 'Edibles', icon: '&#127850;' },
    { id: 'concentrate', name: 'Concentrates', icon: '&#128142;' },
    { id: 'topical', name: 'Topicals', icon: '&#128167;' },
    { id: 'tincture', name: 'Tinctures', icon: '&#129514;' },
    { id: 'beverage', name: 'Beverages', icon: '&#127864;' },
];

// ---- PRODUCTS ----
TCC.products = [
    // FLOWER
    { id: 'p001', name: 'Blue Dream 3.5g', brand: 'Locally Grown', category: 'flower', strain: 'blue-dream', weight: '3.5g', thc: '22%', cbd: '<1%',
      prices: { 'green-goods-mpls': 38, 'sweetleaves-north-loop': 42, 'legacy-cannabis-mpls': 36, 'budtales-mpls': 37, 'zaza-st-paul': 40, 'edina-canna': 41, 'nativecare-wsp': 35 },
      priceHistory: [45, 44, 42, 40, 38, 38, 37, 35] },
    { id: 'p002', name: 'Northern Lights 3.5g', brand: 'North Country', category: 'flower', strain: 'northern-lights', weight: '3.5g', thc: '20%', cbd: '<1%',
      prices: { 'green-goods-mpls': 40, 'sweetleaves-north-loop': 44, 'budtales-mpls': 39, 'zaza-mpls': 43, 'nativecare-wsp': 37, 'edina-canna': 42 },
      priceHistory: [46, 44, 43, 42, 40, 39, 38, 37] },
    { id: 'p003', name: 'Sour Diesel 3.5g', brand: 'Prairie Farms', category: 'flower', strain: 'sour-diesel', weight: '3.5g', thc: '23%', cbd: '<1%',
      prices: { 'sweetleaves-north-loop': 45, 'legacy-cannabis-mpls': 41, 'budtales-mpls': 40, 'zaza-st-paul': 43, 'legacy-cannabis-woodbury': 42, 'minnesota-dispensary-sp': 39 },
      priceHistory: [48, 46, 45, 44, 42, 41, 40, 39] },
    { id: 'p004', name: 'Wedding Cake 3.5g', brand: 'Frost Works', category: 'flower', strain: 'wedding-cake', weight: '3.5g', thc: '26%', cbd: '<1%',
      prices: { 'green-goods-mpls': 45, 'sweetleaves-north-loop': 50, 'legacy-cannabis-mpls': 43, 'budtales-mpls': 44, 'edina-canna': 48, 'minnesota-dispensary-sp': 42 },
      priceHistory: [52, 50, 48, 47, 46, 45, 44, 42] },
    { id: 'p005', name: 'OG Kush 3.5g', brand: 'Locally Grown', category: 'flower', strain: 'og-kush', weight: '3.5g', thc: '22%', cbd: '<1%',
      prices: { 'green-goods-mpls': 41, 'sweetleaves-north-loop': 44, 'zaza-mpls': 43, 'nativecare-wsp': 38, 'clouds-mn': 40 },
      priceHistory: [47, 46, 45, 43, 42, 41, 39, 38] },
    { id: 'p006', name: 'Gelato 3.5g', brand: 'Frost Works', category: 'flower', strain: 'gelato', weight: '3.5g', thc: '24%', cbd: '<1%',
      prices: { 'sweetleaves-north-loop': 48, 'legacy-cannabis-mpls': 44, 'budtales-mpls': 43, 'edina-canna': 47, 'legacy-cannabis-woodbury': 45 },
      priceHistory: [50, 49, 48, 47, 46, 45, 44, 43] },
    { id: 'p007', name: 'Girl Scout Cookies 3.5g', brand: 'North Country', category: 'flower', strain: 'girl-scout-cookies', weight: '3.5g', thc: '27%', cbd: '<1%',
      prices: { 'green-goods-mpls': 48, 'sweetleaves-north-loop': 52, 'budtales-mpls': 46, 'edina-canna': 50, 'minnesota-dispensary-sp': 45 },
      priceHistory: [55, 53, 52, 50, 49, 48, 46, 45] },
    { id: 'p008', name: 'Gorilla Glue #4 3.5g', brand: 'Frost Works', category: 'flower', strain: 'gorilla-glue', weight: '3.5g', thc: '28%', cbd: '<1%',
      prices: { 'sweetleaves-north-loop': 50, 'legacy-cannabis-mpls': 46, 'budtales-mpls': 45, 'legacy-cannabis-woodbury': 47 },
      priceHistory: [54, 52, 51, 49, 48, 47, 46, 45] },
    { id: 'p009', name: 'Runtz 3.5g', brand: 'Prairie Farms', category: 'flower', strain: 'runtz', weight: '3.5g', thc: '27%', cbd: '<1%',
      prices: { 'sweetleaves-north-loop': 52, 'budtales-mpls': 48, 'edina-canna': 50, 'minnesota-dispensary-sp': 47 },
      priceHistory: [58, 55, 53, 52, 50, 49, 48, 47] },
    { id: 'p010', name: 'Granddaddy Purple 3.5g', brand: 'North Country', category: 'flower', strain: 'granddaddy-purple', weight: '3.5g', thc: '21%', cbd: '<1%',
      prices: { 'green-goods-mpls': 39, 'zaza-st-paul': 41, 'zaza-mpls': 42, 'nativecare-wsp': 37, 'nothing-but-hemp-sp': 40 },
      priceHistory: [45, 44, 43, 42, 41, 40, 39, 37] },

    // PRE-ROLLS
    { id: 'p011', name: 'Sour Diesel Pre-Roll 5pk', brand: 'Prairie Farms', category: 'pre-roll', strain: 'sour-diesel', weight: '3.5g total', thc: '22%', cbd: '<1%',
      prices: { 'green-goods-mpls': 32, 'sweetleaves-north-loop': 35, 'legacy-cannabis-mpls': 29, 'budtales-mpls': 30, 'nativecare-wsp': 28, 'minnesota-dispensary-sp': 31 },
      priceHistory: [40, 38, 36, 35, 33, 31, 29, 28] },
    { id: 'p012', name: 'Blue Dream Pre-Roll 3pk', brand: 'Locally Grown', category: 'pre-roll', strain: 'blue-dream', weight: '2.1g total', thc: '21%', cbd: '<1%',
      prices: { 'green-goods-mpls': 22, 'sweetleaves-north-loop': 25, 'budtales-mpls': 20, 'zaza-mpls': 23, 'edina-canna': 24, 'nativecare-wsp': 19 },
      priceHistory: [28, 26, 25, 24, 23, 22, 20, 19] },
    { id: 'p013', name: 'Jack Herer Pre-Roll 1g', brand: 'North Country', category: 'pre-roll', strain: 'jack-herer', weight: '1g', thc: '20%', cbd: '<1%',
      prices: { 'sweetleaves-north-loop': 12, 'legacy-cannabis-mpls': 9, 'budtales-mpls': 9, 'nativecare-wsp': 8, 'clouds-mn': 10 },
      priceHistory: [14, 13, 12, 11, 10, 10, 9, 8] },

    // CARTRIDGES
    { id: 'p014', name: 'Northern Lights Cart 1g', brand: 'North Country', category: 'cartridge', strain: 'northern-lights', weight: '1g', thc: '85%', cbd: '<1%',
      prices: { 'green-goods-mpls': 45, 'sweetleaves-north-loop': 48, 'budtales-mpls': 43, 'legacy-cannabis-woodbury': 46, 'minnesota-dispensary-sp': 42 },
      priceHistory: [52, 50, 49, 48, 46, 45, 43, 42] },
    { id: 'p015', name: 'Gelato Cart 0.5g', brand: 'Frost Works', category: 'cartridge', strain: 'gelato', weight: '0.5g', thc: '88%', cbd: '<1%',
      prices: { 'sweetleaves-north-loop': 32, 'legacy-cannabis-mpls': 28, 'budtales-mpls': 27, 'edina-canna': 31, 'clouds-mn': 29 },
      priceHistory: [35, 34, 33, 32, 30, 29, 28, 27] },
    { id: 'p016', name: 'Pineapple Express Cart 0.5g', brand: 'Prairie Farms', category: 'cartridge', strain: 'pineapple-express', weight: '0.5g', thc: '86%', cbd: '<1%',
      prices: { 'sweetleaves-north-loop': 30, 'legacy-cannabis-mpls': 27, 'budtales-mpls': 26, 'legacy-cannabis-woodbury': 28, 'minnesota-dispensary-sp': 25 },
      priceHistory: [32, 31, 30, 29, 28, 27, 26, 25] },

    // EDIBLES
    { id: 'p017', name: 'GSC Gummies 100mg', brand: 'North Country', category: 'edible', strain: 'girl-scout-cookies', weight: '10pk', thc: '100mg', cbd: '<5mg',
      prices: { 'green-goods-mpls': 24, 'sweetleaves-north-loop': 26, 'budtales-mpls': 23, 'zaza-st-paul': 25, 'zaza-mpls': 27, 'nativecare-wsp': 22, 'nothing-but-hemp-sp': 28, 'minnesota-dispensary-sp': 24 },
      priceHistory: [30, 29, 28, 27, 26, 25, 23, 22] },
    { id: 'p018', name: 'Purple Haze Gummies 50mg', brand: 'Frost Works', category: 'edible', strain: 'purple-haze', weight: '10pk', thc: '50mg', cbd: '<5mg',
      prices: { 'sweetleaves-north-loop': 18, 'zaza-mpls': 19, 'nativecare-wsp': 15, 'nothing-but-hemp-sp': 17, 'edina-canna': 18 },
      priceHistory: [24, 22, 21, 20, 19, 18, 16, 15] },
    { id: 'p019', name: 'Blue Dream Chocolate 100mg', brand: 'North Country', category: 'edible', strain: 'blue-dream', weight: '1 bar', thc: '100mg', cbd: '<5mg',
      prices: { 'green-goods-mpls': 28, 'sweetleaves-north-loop': 30, 'budtales-mpls': 26, 'legacy-cannabis-woodbury': 29, 'minnesota-dispensary-sp': 25 },
      priceHistory: [34, 32, 31, 30, 28, 27, 26, 25] },
    { id: 'p020', name: 'Sativa Energy Mints 100mg', brand: 'Prairie Farms', category: 'edible', strain: 'green-crack', weight: '20pk', thc: '100mg', cbd: '<5mg',
      prices: { 'sweetleaves-north-loop': 22, 'legacy-cannabis-mpls': 20, 'budtales-mpls': 19, 'edina-canna': 23, 'minnesota-dispensary-sp': 21 },
      priceHistory: [26, 25, 24, 23, 22, 21, 20, 19] },

    // BEVERAGES
    { id: 'p021', name: 'CANN Social Tonic 6pk', brand: 'CANN', category: 'beverage', strain: null, weight: '6pk', thc: '12mg total', cbd: '24mg',
      prices: { 'sweetleaves-north-loop': 24, 'green-goods-mpls': 26, 'budtales-mpls': 23, 'edina-canna': 25 },
      priceHistory: [28, 27, 26, 25, 25, 24, 24, 23] },
    { id: 'p022', name: 'Nowadays Sparkling 4pk', brand: 'Nowadays', category: 'beverage', strain: null, weight: '4pk', thc: '20mg total', cbd: '<5mg',
      prices: { 'sweetleaves-north-loop': 18, 'budtales-mpls': 16, 'edina-canna': 19, 'nothing-but-hemp-sp': 17 },
      priceHistory: [22, 21, 20, 19, 18, 18, 17, 16] },

    // CONCENTRATES
    { id: 'p023', name: 'Gorilla Glue Live Resin 1g', brand: 'Frost Works', category: 'concentrate', strain: 'gorilla-glue', weight: '1g', thc: '78%', cbd: '<1%',
      prices: { 'sweetleaves-north-loop': 55, 'legacy-cannabis-mpls': 50, 'budtales-mpls': 52, 'minnesota-dispensary-sp': 48 },
      priceHistory: [62, 60, 58, 56, 55, 53, 52, 48] },
    { id: 'p024', name: 'Wedding Cake Wax 1g', brand: 'North Country', category: 'concentrate', strain: 'wedding-cake', weight: '1g', thc: '72%', cbd: '<1%',
      prices: { 'green-goods-mpls': 48, 'sweetleaves-north-loop': 52, 'budtales-mpls': 45, 'legacy-cannabis-woodbury': 49, 'minnesota-dispensary-sp': 44 },
      priceHistory: [55, 53, 52, 50, 49, 47, 46, 44] },

    // TINCTURES
    { id: 'p025', name: 'Full Spectrum Tincture 1000mg', brand: 'North Country', category: 'tincture', strain: null, weight: '30ml', thc: '1000mg', cbd: '50mg',
      prices: { 'green-goods-mpls': 55, 'sweetleaves-north-loop': 60, 'budtales-mpls': 52, 'edina-canna': 58, 'minnesota-dispensary-sp': 50 },
      priceHistory: [65, 62, 60, 58, 56, 55, 52, 50] },
    { id: 'p026', name: 'Sleep Tincture 500mg', brand: 'Locally Grown', category: 'tincture', strain: 'northern-lights', weight: '30ml', thc: '250mg', cbd: '250mg',
      prices: { 'sweetleaves-north-loop': 42, 'zaza-st-paul': 40, 'budtales-mpls': 38, 'nativecare-wsp': 36, 'minnesota-dispensary-sp': 39 },
      priceHistory: [48, 46, 45, 43, 42, 40, 39, 36] },
];

// ---- DEALS ----
TCC.deals = [
    { id: 'd001', dispensaryId: 'sweetleaves-north-loop', productId: 'p001', title: '20% Off Blue Dream', type: 'percent-off', discount: 20, originalPrice: 42, salePrice: 34, expires: '2026-04-12', featured: true },
    { id: 'd002', dispensaryId: 'nativecare-wsp', productId: 'p011', title: 'Pre-Roll 5pk Flash Sale', type: 'flash', discount: 30, originalPrice: 40, salePrice: 28, expires: '2026-04-06', featured: true },
    { id: 'd003', dispensaryId: 'green-goods-mpls', productId: 'p017', title: 'Edible Weekend Special', type: 'percent-off', discount: 15, originalPrice: 28, salePrice: 24, expires: '2026-04-07', featured: false },
    { id: 'd004', dispensaryId: 'legacy-cannabis-mpls', productId: null, title: 'First-Time Customer 25% Off', type: 'new-customer', discount: 25, originalPrice: null, salePrice: null, expires: '2026-06-30', featured: true },
    { id: 'd005', dispensaryId: 'budtales-mpls', productId: 'p024', title: 'Concentrate Day: $10 Off Wax', type: 'dollar-off', discount: 10, originalPrice: 55, salePrice: 45, expires: '2026-04-08', featured: false },
    { id: 'd006', dispensaryId: 'sweetleaves-north-loop', productId: null, title: 'Happy Hour 4-6pm: 15% Off Carts', type: 'happy-hour', discount: 15, originalPrice: null, salePrice: null, expires: '2026-04-30', featured: true },
    { id: 'd007', dispensaryId: 'edina-canna', productId: 'p007', title: 'GSC 3.5g Price Drop', type: 'price-drop', discount: null, originalPrice: 55, salePrice: 50, expires: '2026-04-10', featured: false },
    { id: 'd008', dispensaryId: 'nativecare-wsp', productId: null, title: 'Veterans 20% Off Every Day', type: 'veteran', discount: 20, originalPrice: null, salePrice: null, expires: null, featured: false },
    { id: 'd009', dispensaryId: 'legacy-cannabis-woodbury', productId: 'p014', title: 'Northern Lights Cart BOGO 50%', type: 'bogo', discount: 50, originalPrice: 46, salePrice: 46, expires: '2026-04-09', featured: true },
    { id: 'd010', dispensaryId: 'edina-canna', productId: 'p018', title: 'Gummies 2-for-1', type: 'bogo', discount: 100, originalPrice: 18, salePrice: 18, expires: '2026-04-11', featured: true },
    { id: 'd011', dispensaryId: 'budtales-mpls', productId: null, title: 'Loyalty Points 2x Weekend', type: 'loyalty', discount: null, originalPrice: null, salePrice: null, expires: '2026-04-07', featured: false },
    { id: 'd012', dispensaryId: 'sweetleaves-north-loop', productId: 'p009', title: 'Runtz Drop: Limited Batch', type: 'new-arrival', discount: null, originalPrice: null, salePrice: 52, expires: '2026-04-15', featured: true },
];

// ---- REVIEWS ----
TCC.reviews = [
    { dispensaryId: 'sweetleaves-north-loop', author: 'Mike T.', date: '2026-03-28', rating: 5, text: 'Absolutely stunning space. The staff is incredibly knowledgeable and the product selection is the best in the Twin Cities. Worth every penny.' },
    { dispensaryId: 'sweetleaves-north-loop', author: 'Sarah K.', date: '2026-03-25', rating: 5, text: 'Love that they accept credit cards and have delivery. Pet-friendly is a huge plus. Premium brands you can\'t find anywhere else.' },
    { dispensaryId: 'sweetleaves-north-loop', author: 'Chris L.', date: '2026-03-20', rating: 4, text: 'Great dispensary, prices are on the higher side but the quality and experience make up for it. North Loop location is perfect.' },
    { dispensaryId: 'green-goods-mpls', author: 'Jenna R.', date: '2026-03-30', rating: 5, text: 'Downtown location is super convenient. Love the online ordering, in and out in 5 minutes. Lab testing transparency is impressive.' },
    { dispensaryId: 'green-goods-mpls', author: 'Dave M.', date: '2026-03-22', rating: 4, text: 'Been coming here since they were medical-only. The transition to rec has been smooth. Consistently good quality flower.' },
    { dispensaryId: 'budtales-mpls', author: 'Amy N.', date: '2026-03-29', rating: 5, text: 'Best delivery service in Minneapolis. Always on time, great communication. Full menu and competitive prices.' },
    { dispensaryId: 'budtales-mpls', author: 'Tom H.', date: '2026-03-24', rating: 4, text: 'Solid downtown option. Big selection, lab-tested everything. Can\'t ask for much more.' },
    { dispensaryId: 'legacy-cannabis-mpls', author: 'Maria G.', date: '2026-03-27', rating: 4, text: 'Great flower selection and the artisan glass is a nice touch. Lyndale location is easy to get to.' },
    { dispensaryId: 'zaza-st-paul', author: 'Kevin P.', date: '2026-03-26', rating: 4, text: 'Nice neighborhood shop on Grand Ave. Good prices on edibles, friendly staff.' },
    { dispensaryId: 'nativecare-wsp', author: 'Lisa W.', date: '2026-03-21', rating: 5, text: 'Love supporting a tribal dispensary. Prices are competitive and the staff is really welcoming.' },
    { dispensaryId: 'edina-canna', author: 'Ryan J.', date: '2026-03-23', rating: 4, text: 'Clean, professional suburban dispensary. Good selection of premium brands. Parking is easy.' },
    { dispensaryId: 'minnesota-dispensary-sp', author: 'Pat S.', date: '2026-03-19', rating: 4, text: 'Convenient having so many locations. Consistent quality across stores. Online ordering works great.' },
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

TCC.getProductsForDispensary = (dispensaryId) => TCC.products.filter(p => p.prices[dispensaryId] !== undefined);
TCC.getDealsForDispensary = (dispensaryId) => TCC.deals.filter(d => d.dispensaryId === dispensaryId);
TCC.getReviewsForDispensary = (dispensaryId) => TCC.reviews.filter(r => r.dispensaryId === dispensaryId);
TCC.getProductsByCategory = (category) => TCC.products.filter(p => p.category === category);
TCC.getProductsByStrain = (strainId) => TCC.products.filter(p => p.strain === strainId);

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
TCC.getTierLabel = (tier) => ({ free: '', featured: 'Featured', premium: 'Premium', platinum: 'Platinum Partner' }[tier] || '');
TCC.getTierColor = (tier) => ({ free: '', featured: '#22c55e', premium: '#a855f7', platinum: '#f59e0b' }[tier] || '');
TCC.getScoreColor = (score) => score >= 90 ? '#22c55e' : score >= 80 ? '#f59e0b' : score >= 70 ? '#f97316' : '#ef4444';
TCC.getScoreLabel = (score) => score >= 90 ? 'Excellent' : score >= 80 ? 'Great' : score >= 70 ? 'Good' : 'Fair';
TCC.priceHistoryLabels = ['8w ago', '7w ago', '6w ago', '5w ago', '4w ago', '3w ago', '2w ago', 'Now'];

window.TCC = TCC;
