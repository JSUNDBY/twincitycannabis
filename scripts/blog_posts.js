// Twin City Cannabis — editorial blog posts.
// Hand-written long-form content in Josh's voice: warm, direct, plain-English,
// no em dashes, honest, Minnesota-specific. This is the layer that competitors
// with programmatic-only pages can't match: real guidance, backed by our live
// price data where it counts.
//
// Dates are spread across the site's real lifetime (launched 2026-04-05), so the
// blog reflects a genuine publishing cadence from day one. Never date a post
// before launch, and never reference an event that post-dates its own date.
//
// Each post: { slug, title, dek, date (YYYY-MM-DD), updated, category, read,
//   body (HTML), related:[{href,label}] }. Newest date sorts first on the index.

module.exports = [
  {
    slug: 'first-time-dispensary-guide-minnesota',
    title: 'Your first time at a Minnesota dispensary: what to actually expect',
    dek: 'You walk in, you show your ID, you leave with something good. Here is the whole thing, start to finish, with none of the mystery.',
    date: '2026-04-12',
    updated: '2026-04-12',
    category: 'Getting started',
    read: 6,
    body: `
<p>The first trip to a dispensary trips people up for no good reason. It is a store. You are an adult. You are allowed to be there. But the counter can feel like a lot the first time, so here is exactly how it goes so you walk in already knowing the moves.</p>

<h2>Bring a real ID and be 21</h2>
<p>Minnesota adult-use cannabis is for people 21 and older, and every licensed shop checks a government ID at the door or the counter. A driver's license, state ID, or passport all work. No ID, no sale. That is not the shop being difficult, it is the law they keep their license under.</p>

<h2>Bring cash (or expect a workaround)</h2>
<p>Because cannabis is still federally illegal, most dispensaries can't run a normal credit card. You will usually see cash, debit through a cash-back system, or an ATM in the lobby. Bring cash and you skip the fees. This surprises first-timers more than anything else, so plan for it.</p>

<h2>You do not have to know what you want</h2>
<p>The person behind the counter is called a budtender, and helping a nervous first-timer is the best part of their day. Tell them the truth: "I have never done this, I want to feel relaxed but not wrecked, and I don't want to be up all night." That one sentence gets you better service than any amount of pretending you know the lingo.</p>

<h2>Start low, especially with edibles</h2>
<p>If you take one thing from this page: edibles hit slow and hit hard. A standard dose in Minnesota is often 5mg of THC per piece, and a full gummy can be more than a first-timer needs. Start with 2.5 to 5mg, wait a full two hours, and do not stack a second one because "nothing is happening." We wrote a whole <a href="/blog/edibles-dosing-guide-minnesota/">edibles dosing guide</a> because this is where people have their one bad night.</p>

<h2>Know roughly what you'll pay before you go</h2>
<p>Prices swing a lot between shops for the exact same product. That is the entire reason this site exists. Before you drive anywhere, it is worth a look at <a href="/cheapest-cannabis-twin-cities/">where cannabis is cheapest in the Twin Cities right now</a> and the <a href="/dispensaries/">full dispensary list</a> so you are not overpaying by 30 percent for the same eighth two miles away.</p>

<h2>What you can walk out with</h2>
<p>Adults 21+ can buy and carry up to two ounces of flower in public, plus concentrate and edibles within the state limits. The full breakdown of what is legal lives on our <a href="/minnesota-cannabis-laws/">Minnesota cannabis laws</a> page. For a first visit you will not come close to any limit.</p>

<p>That is it. Walk in, show ID, tell the budtender the truth, start low, and use the price tools so you don't overpay. You have got this.</p>
`,
    related: [
      { href: '/blog/edibles-dosing-guide-minnesota/', label: 'Edibles dosing for beginners' },
      { href: '/cheapest-cannabis-twin-cities/', label: 'Where cannabis is cheapest' },
      { href: '/minnesota-cannabis-laws/', label: 'Minnesota cannabis laws' },
    ],
  },

  {
    slug: 'how-to-save-money-minnesota-dispensaries',
    title: 'How to actually save money at Minnesota dispensaries',
    dek: 'The same product can cost wildly different amounts two miles apart. Here is how to stop overpaying, using the price data most shoppers never check.',
    date: '2026-04-26',
    updated: '2026-04-26',
    category: 'Saving money',
    read: 7,
    body: `
<p>Here is the thing nobody at the counter will tell you: the price you are about to pay is not the price. It is one shop's price, on one day, and the shop down the road might have the same jar for ten dollars less. We track prices across the metro every day, so let me hand you the shortcuts.</p>

<h2>1. Compare before you drive, not after</h2>
<p>Cannabis is not priced like milk. The same category, the same potency, sometimes the same brand, can vary 20 to 40 percent between two shops in the same suburb. The fix is boring and it works: check the price first. Our <a href="/cheapest-cannabis-twin-cities/">cheapest cannabis tracker</a> and the city pages like <a href="/cheapest-flower-minneapolis/">cheapest flower in Minneapolis</a> exist for exactly this. Two minutes of looking can save you a real amount of money.</p>

<h2>2. Buy the bigger size, do the per-gram math</h2>
<p>An eighth (3.5g) feels like the default, but quarters and half-ounces almost always cost less per gram. If you know you will use it, buying up a size is the single easiest discount in cannabis. Do the division: total price divided by grams. The bigger jar usually wins on a per-gram basis, sometimes by a lot.</p>

<h2>3. Chase the deals, they are constant</h2>
<p>Dispensaries run specials the way grocery stores run sales, because they are competing hard for a new market. First-time-customer discounts, daily deals, and price drops are everywhere. We pull live price drops onto our <a href="/weed-deals-twin-cities/">Twin Cities weed deals</a> page so you can see what actually got cheaper today instead of guessing.</p>

<h2>4. Do not pay for the THC number</h2>
<p>Shops price higher-THC flower like it is better, and shoppers pay it. Potency on the label is a lab number, not a promise of a better time, and it is often inconsistent between labs anyway. Mid-range THC flower is frequently the best value in the case. More on why in our piece on <a href="/blog/thc-percentage-myth-minnesota/">reading a dispensary menu</a>.</p>

<h2>5. Bring cash</h2>
<p>Card workarounds at dispensaries usually carry a fee of a few dollars per transaction, and it adds up fast if you go often. Cash skips it entirely. Hit the ATM before you go, not the one in the lobby that charges its own fee.</p>

<h2>6. Watch the tax</h2>
<p>Minnesota adds a cannabis tax on top of regular sales tax, so the shelf price is not the out-the-door price. It is not huge, but it is real, and it is the same everywhere, so it does not change which shop is cheapest. Our <a href="/tax-calculator/">tax calculator</a> shows you the real total before you get to the register.</p>

<p>None of this is complicated. Compare first, size up, ride the deals, ignore the THC ego number, pay cash. Do those and you will quietly spend less than almost everyone else in the shop.</p>
`,
    related: [
      { href: '/cheapest-cannabis-twin-cities/', label: 'Cheapest cannabis, Twin Cities' },
      { href: '/weed-deals-twin-cities/', label: 'Live weed deals' },
      { href: '/blog/thc-percentage-myth-minnesota/', label: 'The THC percentage myth' },
    ],
  },

  {
    slug: 'edibles-dosing-guide-minnesota',
    title: 'Edibles dosing for beginners: how many milligrams is right?',
    dek: 'The number one first-timer mistake is one too many gummies. Here is a calm, honest dosing guide so your first edible is a good story, not a cautionary one.',
    date: '2026-05-17',
    updated: '2026-05-17',
    category: 'Getting started',
    read: 6,
    body: `
<p>Almost everyone who has a rough night with cannabis has the same story: they ate an edible, felt nothing for an hour, ate more, and then the first one arrived with the second one right behind it. Edibles are wonderful and forgiving once you respect the timing. Here is how to get it right.</p>

<h2>Why edibles are different</h2>
<p>When you eat THC, your liver processes it before it reaches you. That does two things: it takes longer to feel (often 45 minutes to 2 hours), and it tends to feel stronger and last longer than inhaling. So the feedback loop that keeps you safe with a joint, take a puff, wait a second, feel it, does not work with a gummy. You have to dose on the clock, not on the feeling.</p>

<h2>The starting numbers</h2>
<ul>
  <li><strong>2.5mg</strong> — a true beginner dose. Light, functional, hard to overdo.</li>
  <li><strong>5mg</strong> — a standard single dose for many people. This is often one piece in Minnesota.</li>
  <li><strong>10mg</strong> — a full dose for someone with some tolerance. Too much for a first time.</li>
  <li><strong>20mg and up</strong> — regular-user territory. Not a beginner number.</li>
</ul>
<p>If it is your first time, start at 2.5 to 5mg. Split a gummy if you have to. There is no prize for starting high.</p>

<h2>The one rule that prevents every bad night</h2>
<p><strong>Wait two full hours before taking any more.</strong> Set a timer. Do not redose because "it is not working." It is working, it is just in your liver. This single habit is the difference between a mellow evening and lying on the couch deciding you are dying (you are not, but it does not feel like it).</p>

<h2>Set yourself up well</h2>
<p>Have a little food in your stomach, but not a huge meal. Have water. Be somewhere you feel safe with nowhere you need to be. Do not mix with alcohol your first time, it sharpens the greenout. And never drive, which is not just good sense, it is the law. See our <a href="/minnesota-cannabis-laws/">Minnesota cannabis laws</a> page on driving.</p>

<h2>If you took too much</h2>
<p>You cannot fatally overdose on cannabis, and it will pass. Find a calm spot, drink water, breathe slow, and let time do the work. Some people swear by black peppercorns (chew a couple, the terpenes may take the edge off). Mostly, it just needs to wear off. It always does.</p>

<h2>Reading the label</h2>
<p>Minnesota edibles list THC per piece and per package. A package might be "100mg, 10 pieces," which means 10mg each, already a strong single dose. Always divide the package total by the number of pieces so you know what one bite actually is. Want to compare products by price and dose? Start with our live <a href="/cheapest-edible-minneapolis/">cheapest edibles</a> pages and use the <a href="/dosage-calculator/">dosage calculator</a>.</p>

<p>Respect the two hours and edibles become the easiest, most pleasant way in. Rush them and you get the story everyone regrets telling. Your call, but now you know.</p>
`,
    related: [
      { href: '/dosage-calculator/', label: 'Dosage calculator' },
      { href: '/cheapest-edible-minneapolis/', label: 'Cheapest edibles, Minneapolis' },
      { href: '/blog/first-time-dispensary-guide-minnesota/', label: 'Your first dispensary visit' },
    ],
  },

  {
    slug: 'cannabis-for-sleep-minnesota',
    title: 'Cannabis for sleep in Minnesota: what actually helps',
    dek: 'People do not want to be high, they want to fall asleep. Here is an honest look at what tends to work, what to buy, and where to find it for less.',
    date: '2026-06-07',
    updated: '2026-06-07',
    category: 'Wellness',
    read: 7,
    body: `
<p>A huge number of people trying cannabis right now are not chasing a party. They are lying awake at 2am and they want out. Cannabis is not a miracle and it is not for everyone, but for a lot of Minnesotans it genuinely helps with sleep. Here is the honest version, without the wellness fluff.</p>

<h2>What tends to help sleep</h2>
<p>The pieces that come up again and again for sleep:</p>
<ul>
  <li><strong>A modest THC dose,</strong> often in an edible so it lasts through the night. Too much THC can actually backfire and leave you wired, which is why dose matters more than potency.</li>
  <li><strong>CBN,</strong> a compound some products add specifically for sleep. The research is early, but many people find CBN-forward "sleep" gummies mellow.</li>
  <li><strong>Some CBD alongside the THC,</strong> which tends to soften the edges and reduce the racing-mind feeling.</li>
  <li><strong>Products labeled indica or "nighttime,"</strong> which is a loose guide more than a law, but shops lean that way for a reason.</li>
</ul>

<h2>Dose it like a sleep aid, not a party</h2>
<p>For sleep you want just enough to feel calm and drowsy, not high. That is usually a low edible dose, 2.5 to 5mg, taken about an hour before bed. Higher is not better here, it is often worse. If you are new to edibles, read our <a href="/blog/edibles-dosing-guide-minnesota/">dosing guide</a> first, the two-hour rule still applies.</p>

<h2>An honest caveat</h2>
<p>Cannabis can help you fall asleep, but heavy nightly THC use is linked to lighter, less restful REM sleep over time, and some people feel groggy the next morning. It is a tool, not a cure. If your sleep problem is serious or ongoing, it is worth talking to a doctor rather than self-medicating forever. Use it as a bridge, not a permanent crutch.</p>

<h2>What to buy and where to save</h2>
<p>Sleep-focused gummies and tinctures are some of the fastest-growing products on Minnesota shelves, and prices vary a lot between shops. Rather than pay whatever the nearest store charges, compare first. Our live <a href="/cheapest-edible-minneapolis/">cheapest edibles</a> pages track gummy prices across the metro, and the full <a href="/products/edible/">edibles category</a> lets you browse what is in stock right now. A CBN sleep gummy at one shop can cost noticeably more than the same style down the road.</p>

<p>Start low, dose an hour before bed, do not lean on it every single night, and do not overpay. That is the whole honest playbook.</p>
`,
    related: [
      { href: '/cheapest-edible-minneapolis/', label: 'Cheapest edibles, Minneapolis' },
      { href: '/blog/edibles-dosing-guide-minnesota/', label: 'Edibles dosing guide' },
      { href: '/products/edible/', label: 'Browse edibles' },
    ],
  },

  {
    slug: 'medical-card-vs-recreational-minnesota',
    title: 'Do you still need a medical card in Minnesota?',
    dek: 'Now that adult-use is legal, a lot of people are asking whether the medical program is still worth it. Here is the straight answer.',
    date: '2026-06-28',
    updated: '2026-06-28',
    category: 'Laws & basics',
    read: 5,
    body: `
<p>Minnesota had a medical cannabis program for years before adult-use arrived. Now that any adult 21+ can walk into a dispensary, people keep asking the same thing: is the medical card still worth keeping, or getting? For most people the honest answer is no, but not for everyone.</p>

<h2>What changed</h2>
<p>Before, a medical card was the only legal way to buy cannabis in Minnesota. Now it is not. Adults 21 and over can buy at any licensed adult-use dispensary with just an ID. That removed the main reason most people had a card in the first place. If you were a card holder purely for access, adult-use covers you now.</p>

<h2>Who still benefits from a medical card</h2>
<ul>
  <li><strong>Patients under 21</strong> with a qualifying condition, since adult-use is 21+ only.</li>
  <li><strong>People who want higher possession or purchase amounts</strong> than the adult-use limits allow.</li>
  <li><strong>Patients who rely on specific medical products or formulations</strong> and a consistent supply.</li>
  <li><strong>Anyone who benefits from the guidance</strong> of the medical program and its pharmacists.</li>
</ul>

<h2>Who does not need one</h2>
<p>If you are 21 or older, buying normal amounts, and using cannabis to relax, sleep, or unwind, you almost certainly do not need a medical card anymore. The adult-use market is simpler, often cheaper, and there is no application, fee, or doctor's visit. You just go.</p>

<h2>The practical move</h2>
<p>For the vast majority of adults, the answer is to skip the card and shop the adult-use market smartly. That means comparing prices instead of defaulting to the nearest shop, which is the whole point of this site. See <a href="/dispensaries/">every licensed dispensary</a> and <a href="/cheapest-cannabis-twin-cities/">where it is cheapest right now</a>. If you have a real medical need, especially if you are under 21 or need specific products, look into the medical program directly through the state. For everyone else, welcome to the easy version.</p>

<p>For the full rundown of what is legal without a card, our <a href="/minnesota-cannabis-laws/">Minnesota cannabis laws</a> page has the limits in plain English.</p>
`,
    related: [
      { href: '/minnesota-cannabis-laws/', label: 'Minnesota cannabis laws' },
      { href: '/dispensaries/', label: 'Every licensed dispensary' },
      { href: '/cheapest-cannabis-twin-cities/', label: 'Where it is cheapest' },
    ],
  },

  {
    slug: 'growing-cannabis-at-home-minnesota',
    title: 'Growing cannabis at home in Minnesota: the legal basics',
    dek: 'Minnesota lets adults grow their own. Here is what the law actually allows, plus an honest take on whether it is worth it.',
    date: '2026-07-19',
    updated: '2026-07-19',
    category: 'Laws & basics',
    read: 6,
    body: `
<p>One of the quietly great things about Minnesota's cannabis law is that you are allowed to grow your own. Not everyone should, but the option is real, and the rules are simpler than people assume. Here is the plain version.</p>

<h2>What the law allows</h2>
<ul>
  <li>Adults <strong>21 and older</strong> can grow cannabis at home.</li>
  <li>Up to <strong>8 plants per household</strong>, with no more than <strong>4 mature (flowering) at once.</strong> That is per household, not per person, so a house of roommates still shares the same 8.</li>
  <li>Plants must be in an <strong>enclosed, locked space</strong> that is <strong>not visible from a public place.</strong> A locked yard, a locked room, a locked tent. Not the front porch.</li>
</ul>
<p>The full set of limits lives on our <a href="/minnesota-cannabis-laws/">Minnesota cannabis laws</a> page.</p>

<h2>Indoor vs outdoor in a Minnesota climate</h2>
<p>Our growing season is short and our winters are not a suggestion. Outdoor plants go in after the frost risk passes in late May and need to finish before the cold returns in the fall, which is a tight window. A lot of Minnesota growers go indoors with a tent and a light for control, or start indoors and move out. Outdoor is cheaper and simpler but weather-dependent. Indoor is more setup and more electricity but far more reliable.</p>

<h2>The honest cost reality</h2>
<p>People imagine home growing is free weed. The plants are cheap, everything around them is not. A basic indoor setup, a tent, a light, fans, soil or a medium, nutrients, runs a few hundred dollars up front, plus electricity. Your first grow will not be your best. If you enjoy growing things, it is a genuinely rewarding hobby and eventually a real saver. If you just want cannabis for less money this month, honestly, comparing shop prices on our <a href="/cheapest-cannabis-twin-cities/">cheapest cannabis</a> pages will save you faster than a grow tent.</p>

<h2>Who home growing is actually for</h2>
<p>It is for the person who likes the process, wants specific strains, and thinks in seasons, not weekends. If that is you, start small, keep it locked and private per the law, and enjoy it. If it is not you, there is no shame in letting the licensed shops do the hard part and just shopping smart.</p>
`,
    related: [
      { href: '/minnesota-cannabis-laws/', label: 'Minnesota cannabis laws' },
      { href: '/cheapest-cannabis-twin-cities/', label: 'Cheapest cannabis' },
      { href: '/blog/first-time-dispensary-guide-minnesota/', label: 'First dispensary visit' },
    ],
  },

  {
    slug: 'thc-percentage-myth-minnesota',
    title: 'THC percentage is not potency: how to actually read a dispensary menu',
    dek: 'The biggest number on the label is the one shoppers trust most and understand least. Here is what actually matters when you read a menu.',
    date: '2026-08-01',
    updated: '2026-08-01',
    category: 'Buying smart',
    read: 6,
    body: `
<p>Walk into any dispensary and watch what people do: they scan for the highest THC number and buy that. Shops know it, so they price by that number. It is the single most expensive habit in cannabis, and it is built on a misunderstanding. Let me save you money.</p>

<h2>THC percentage is not "how high you get"</h2>
<p>A 30 percent flower is not twice as good as a 15 percent flower. The number is a lab measurement of one compound, and the experience of cannabis comes from a whole mix of compounds working together, plus your dose, your tolerance, and your body. Past a certain point, more THC on the label mostly means a higher price, not a better night.</p>

<h2>Lab numbers are inconsistent anyway</h2>
<p>Different testing labs report different numbers for similar flower, and there is real pressure in the industry to test high because shoppers pay for it. So the 28 percent on one jar and the 24 percent on another may not mean what you think. Treat the THC figure as a rough range, not a precise score.</p>

<h2>What actually matters on the menu</h2>
<ul>
  <li><strong>Price per gram.</strong> The honest value number. Divide total price by grams and compare across the case.</li>
  <li><strong>How fresh it is.</strong> Recent harvest or packaging dates beat a slightly higher THC number on old flower.</li>
  <li><strong>The type and how it fits your goal.</strong> Something labeled for daytime vs nighttime tells you more about your evening than the THC figure does. Our <a href="/blog/cannabis-for-sleep-minnesota/">sleep guide</a> gets into this.</li>
  <li><strong>Smell and look, if you can.</strong> Good flower is a sensory thing, not a spreadsheet.</li>
</ul>

<h2>The move that saves real money</h2>
<p>Buy mid-range THC flower from a fresh batch at a shop with a good per-gram price, and you will spend less and, more often than not, enjoy it just as much. That means comparing prices instead of chasing the biggest number at the nearest store. Our <a href="/cheapest-flower-minneapolis/">cheapest flower</a> pages and the <a href="/cheapest-cannabis-twin-cities/">metro-wide tracker</a> do the comparison for you.</p>

<p>Stop paying a premium for a lab number that does not deliver what you think it does. Shop the value, not the ego stat, and your budget will thank you.</p>
`,
    related: [
      { href: '/cheapest-flower-minneapolis/', label: 'Cheapest flower, Minneapolis' },
      { href: '/blog/how-to-save-money-minnesota-dispensaries/', label: 'How to save money' },
      { href: '/blog/cannabis-for-sleep-minnesota/', label: 'Cannabis for sleep' },
    ],
  },
];
