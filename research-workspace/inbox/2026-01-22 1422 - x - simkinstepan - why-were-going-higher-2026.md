---
source: https://x.com/simkinstepan/status/2005026139404993003?s=46
captured_at: 2026-01-22T14:22:00Z
kind: thread
via: bird
---

# Transcript

```
@SimkinStepan (Stepan | squads.xyz):
Article: Why We're Going Higher in 2026 (the Altitude Thesis)

# Intro

In a way this is a Part 2 to [my last post](https://x.com/SimkinStepan/status/2003905629048733933?s=20) where I wrote about the stablecoin market - where it's going and why it matters.

This one is about what we're actually building.

Stablecoins are hitting $300B. Incumbents are moving fast. The opportunity is real. But opportunity doesn't mean anything if you can't execute on it.

We've been building toward this for four years. Protocol infrastructure. Security first mindset. Design and product excellence. $15B+ secured. All of it now goes into one product: [Altitude](https://x.com/altitude).

What follows is our thesis - how we see the market, why we think the old fintech playbook doesn't work here, new moats emerging, what we're building and the hard problems we're still figuring out.

Thanks to Deni and Garrett for the feedback and to the Squads team for the hard work this year.

## This Time It's Different

If you've been in fintech for a decade, you've heard the blockchain pitch before. Distributed ledgers will change everything. Banks are dinosaurs. The future is decentralized.

Most of it was noise. But something shifted in the last two years, and it's worth paying attention to.

Stablecoins [crossed $300 billion in circulation](https://app.rwa.xyz/stablecoins). More interesting than the number is what's underneath it: real businesses using stablecoin rails for real payments. Not speculation. Cross-border merchant settlements, contractor payments, treasury operations.

Let's be precise about what's happening. The theoretical efficiency gain of stablecoins is massive: near-zero fees, instant settlement, no intermediaries. But most flows today still touch fiat on both ends. Ramp providers take a cut. Card networks do their thing. Local currency controls add friction. You only get the full benefit when you settle end-to-end in stablecoins, and we're not there yet for most use cases.

So why are stablecoins finding product-market fit anyway?

Because they're fundamentally better infrastructure to build on.

If you're building financial services, stablecoins give you more control, more flexibility, and less friction than traditional rails. You're not waiting on banking partners to add features. You're not negotiating for access to basic capabilities. You can build what you want, how you want, for customers anywhere.

That's the real unlock. Not that stablecoins are already cheaper for every transaction today. It's that they're better infrastructure for building the next generation of financial services. The cost efficiency comes as more of the economy settles in stablecoins directly. The infrastructure advantage is available now.

## What This Means for Fintech

The fintech playbook of the last decade was straightforward: take legacy banking infrastructure, wrap it in better software, and win on user experience. This worked. It produced Mercury, Brex, Ramp, Wise. Real companies solving real problems.

But that playbook assumed the underlying rails were fixed. You couldn't change ACH. You couldn't change SWIFT. You could only build better interfaces on top of them.

Stablecoins change the rails themselves.

This isn't incremental. When the foundation shifts, the entire stack gets rebuilt. New infrastructure. New economics. New capabilities that weren't possible before.

The question for the next decade of fintech isn't "who builds the best UI on existing rails?" It's "who can leverage this new infrastructure to deliver fundamentally better financial services?"

## Incumbents

The incumbents aren't asleep. Stripe spent over a billion dollars acquiring Bridge. They bought Privy. They're building their own blockchain. PayPal launched a stablecoin, offers yield on balances, provides free onramps. These are serious companies making serious bets.

But they're bolting stablecoins onto a legacy stack.

Stripe still has to maintain ACH, cards, wire transfers, their existing banking relationships, their compliance infrastructure across every jurisdiction they operate in. They're not going to abandon that - it's where their revenue comes from today. So stablecoins become another rail they support, integrated into existing systems, subject to existing constraints.

Same with PayPal. They can offer a stablecoin wallet. But they're still PayPal: custodial, regulated as a money transmitter everywhere, operating within the framework they've built over two decades.

This isn't a criticism. It's just how large organizations work. Twenty years of infrastructure means everything new has to fit into what already exists.

## Inversion and Decoupling

The old fintech playbook said: regulatory moats and banking partnerships are your defensibility. Technical execution is table stakes. Everyone can build software; not everyone can get a bank sponsor or a money transmission license

That's inverting.

Here's why. In traditional fintech, the account is inseparable from the bank. You need a banking partner to give your customer an account. The bank holds the funds. The bank's license is what makes the whole thing possible. That's why banking relationships were the moat - without them, you couldn't exist.

Stablecoins break that coupling. The account becomes a smart account onchain. No bank required. No geographic restrictions. The customer's assets exist at the protocol layer, controlled by keys, governed by code. You can set up an account for anyone, anywhere, instantly. This won't stay unregulated forever - there's no license category that fits self-custodial stablecoin accounts yet. It's a gap, not a loophole. The gap will close. But stablecoins are global infrastructure, so the framework will be global too. Not state-by-state. Not country-by-country. When regulation comes, it might actually make this easier to scale, not harder. Great thread on that [here](https://x.com/maistebuilds/status/2004686786149425596).

Once the account is decoupled, financial services become modular. Cards, fiat ramps, yield, payments - these become integrations you plug in rather than prerequisites to exist. Need corporate cards? Integrate @raincards. Need fiat connectivity? Plug in Bridge (@stablecoin). Need local payment rails? Partner with whoever has that license. A license becomes one capability in the stack rather than the foundation you build on.

Mercury just [announced](https://x.com/immad/status/2002049261241094265?s=20) they're applying for an OCC national bank charter. It makes sense for them - they started as better software on traditional rails, and becoming a bank lets them own more of that stack. But they're still building on the same foundation: custodial accounts, fractional reserve, regulatory infrastructure as the core. A team starting today doesn't have to make that choice. Start at the protocol layer. Self-custodial accounts. Infrastructure that doesn't need a bank to function. The choice isn't "become a bank" or "partner with banks" - you can now build on architecture where that choice doesn't apply. The account exists onchain. Licensed services plug in where they're useful, not where they're required.

## The Moat

So where does the moat live now?

Technical depth and relentless execution. But to understand why, you have to understand what changed about the stack.

Stablecoin infrastructure lets you own a lot more of it. Account structure, permissions, security, money movement, workflows - these are layers you can build and control, not rent from vendors. In traditional fintech, you assembled. Someone gave you the ledger, someone gave you the BaaS API, you glued it together and competed on product.

Some teams building on stablecoins are making the same choice - assembling vendors, gluing pieces together, staying at the surface. That works until it doesn't. You can't move fast when you're waiting on someone else's roadmap. You can't solve hard problems when you don't control the layer where the problem lives. You can't compound advantages when your capabilities are the same as everyone else using the same vendors.

Owning more of the stack means you can move faster. Ship what you need when you need it. Solve problems end to end. Build things that aren't possible when you're just integrating.

But owning this stack isn't the same as owning a typical software stack. Crypto infrastructure sits in a strange middle ground - not regular SaaS, not hard tech. It's code, but it's code that moves real money. Smart contract vulnerabilities drain accounts. Key management failures lose funds permanently. Protocol bugs can't be patched after the fact. You don't get to ship fast and fix later.

That's the delta. Stablecoins let you own more. But the parts you own are the parts where mistakes are irreversible. To actually capture the advantage of owning more, you need the expertise to build it right. Protocol layer: account structure, permissions, security, money movement. API layer: orchestrating vendors, integrations, compliance. Product layer: translating it into the right experience. Licenses live in jurisdictions. This kind of depth travels everywhere. The teams that win the next decade of fintech won't be the ones with the most licenses. They'll be the ones that can consistently [execute](https://x.com/rauchg/status/1928087357510623266?s=20) and solve hard problems.

## Our Background

[Squads](https://squads.xyz) started in 2021 with a narrow problem: how do crypto organizations manage shared assets securely? The answer was multisig - multiple signatures required to move funds, enforced by code rather than policy.

We built [Squads Multisig](https://squads.xyz/multisig) as the product and Squads Protocol as the foundation underneath it - smart accounts, permission systems, the onchain primitives that define how assets are held and moved. Over four years, it became the asset ownership layer for the Solana ecosystem. More than $15 billion in value secured. Thousands of teams running financial operations through smart accounts we designed.

Four years of security audits and formal verifications. Edge cases most users will never encounter, but that we spent months on anyway. The kind of problems where mistakes are irreversible - so you learn to build differently.

[Fuse](https://fusewallet.com) came next - a self-custodial money app for people who'd never used crypto before, built on the same protocol infrastructure. With Fuse, we developed our product discipline: building with craft and care, creating opinionated experiences, finding the right abstractions to make self-custody feel seamless and stablecoins easy to use.

Then we built [Grid](https://squads.xyz/grid) - APIs that connect stablecoin accounts to fiat rails, handle compliance and enable programmatic automation. The layer that lets onchain infrastructure talk to the traditional financial system.

Protocol. Product. Infrastructure. Four years of solving hard problems across each layer.

Everything we've built now converges on one product: [Altitude](https://squads.xyz/altitude).

## Altitude

@altitude is built on stablecoin rails and self-custodial programmable accounts to deliver a fundamentally new way to run financial operations as a business - global, efficient and native to a world where stablecoins and agentic finance exist.

The insight came from watching our Multisig customers. They weren't just securing crypto treasuries. They were trying to run their entire financial operations through the product: paying invoices, tracking expenses, asking about cards. The demand was clear. Businesses want to use stablecoins to run their finances, and they want it to feel as simple as the legacy tools they're used to.

Altitude delivers the features you expect from traditional business banking - invoicing, bill pay, cards, accounting integrations - but it also gives you things legacy systems can't.

For cross-border payments, we use what the industry calls the stablecoin sandwich: fiat in via local rails on one end, settle in stablecoins in the middle, fiat out via local rails on the other end. No correspondent banks. No SWIFT. FX still happens when you convert currencies, but the SWIFT tax disappears. As we connect more local rails, more corridors open up. And as more currencies get tokenized onchain, FX moves onchain too - competitive rates, transparent execution, no hidden spreads. The full cost advantage compounds as the ecosystem matures.

For yield, we give you access to internet capital markets. Traditional sources like US Treasuries and other RWAs, tokenized and accessible without the friction of legacy brokerage. DeFi yield through partners like @kamino - formally verified, battle-tested. And tokenized asset trading: if you want to allocate part of your corporate treasury to Bitcoin, you can. As tokenized stocks mature, that opens up too.

Agentic automations inject intelligence into how you run financial operations - workflows that execute based on rules you define, not manual approvals you have to remember.

You log in. You see your balance. You pay a bill. You issue a card. No transaction signing. No network fees in sight. The user doesn't need to know they're on new rails. But underneath, the foundation is different. Self-custodial accounts. Programmable permissions. Access to internet capital markets. The benefits of architecture without needing to understand it.

## Architectural Choices

When you build financial infrastructure, foundational decisions made early constrain everything downstream. Most teams inherit their architecture from the vendors they integrate. We made deliberate choices about what to own and what to plug in.

Programmable accounts at the protocol layer. In traditional fintech, your account lives in a bank's database. The bank controls it. If you want to change how access works, you ask the bank. With Altitude, the account itself is a smart account onchain - a programmable object on Solana with its own logic for who can access it and under what conditions. This isn't just a technical detail. It means the most fundamental thing - custody of assets and access control - doesn't depend on a centralized service. It depends on our protocol and on Solana. We can swap key management providers. We can change authentication methods. We can add new permission structures. The account persists regardless of what happens to any single provider, including us.

Protocol to product. We built Squads Protocol. We built the APIs on top of it. We built Altitude on top of those. This is the inversion in practice - while others assemble third-party services and wait on vendor roadmaps, we control the core. When we need to change something fundamental - a new permission model, a different signing flow, an updated recovery mechanism - we do it. We're not working around limitations in someone else's infrastructure. This lets us offer security guarantees others can't and iterate faster than teams that assembled their stack from external services.

Stablecoin-first, selectively connected to fiat. We're live globally today because stablecoin accounts are global. Solana is global. A business in Singapore and a business in Germany can both open an Altitude account and transact with each other immediately. Where we selectively add complexity is at the fiat edges: partnering with providers to facilitate card issuance and local payment rails. We choose those partnerships based on where they make sense for our customers, not because we need them to exist at all. The core works everywhere; fiat connectivity is additive.

## On Solana

Altitude is built on @solana.

Everything we describe in Altitude from a functionality perspective - and more - is live today on Solana natively or with our infrastructure. Batch payments, subscriptions, recurring payments, escrow, direct debits, granular permissions, memo fields, cards without double spend risk, gasless transactions, seed phraseless accounts. Live, on mainnet.

@solana has been in production since 2020. Five years of operational history, stress tests, and hardening. A deep bench of teams solving hard problems across every layer of the stack. The trust has been accumulated. And the ecosystem is obsessed with performance - the current focus is trading, the most demanding use case for throughput and latency. Trading is harder than payments. A chain hyper-optimized for trading, combined with a team like us building out payment primitives on top, produces an incredibly powerful foundation.

Solana's core narrative is internet capital markets - having every market trade onchain. That's exactly what we want to tap into. As more assets get tokenized, as more liquidity flows onchain, as more financial primitives get built, we plug in. The ecosystem's ambition expands what's possible at our product layer.

When you use Altitude, you don't know you're on Solana. You don't know you're onchain at all. That's how it should be. Solana has reached the point where it's sufficiently secure, decentralized, and performant to simply be infrastructure - invisible to the end user. We onboard customers who don't care what chain they're using. They care about the outcomes we deliver. Solana is how we deliver them.

## On Craft (Linear for Money)

Early customers have called Altitude "Linear for money." We take that seriously.

Craft for us is a system, not aesthetics. Design, architecture, and tooling compound. Quality accelerates as we move faster, not the opposite. We rebuilt our core stack for the agentic era: clearer boundaries, fewer abstractions, faster iteration. The architecture is agent-native by design.

We treat developer latency like product latency. Build times, review cycles, deployment friction are all first-class metrics. Engineers own features, not bugs. Agentic tooling handles triage and fixes. Engineering scales like an army.

UX is architecture, not polish. Click latency and animation performance ship with the MVP, not after.

We optimize for flexibility over attachment. If stripping a system to fundamentals compounds quality and speed, we do it. The rules of building software are being rewritten every few months. Everyone's a beginner right now. That's not a threat if you're lean and willing to learn. It's an advantage. We're excited to keep figuring out what it means to build great software in this environment.

## On Risk

Any honest discussion of self-custodial stablecoin accounts has to address FDIC insurance. It's a real benefit. For US businesses, it provides genuine peace of mind.

But FDIC has limits worth understanding.

Geographic: FDIC is a US institution. If you're a global business, it doesn't travel with you.

Monetary: $250,000 per depositor per institution. For meaningful treasury balances, that's insufficient. Yes, sweep networks can multiply coverage by spreading deposits across banks. But this introduces middleware complexity: more banking relationships, more reconciliation. Middleware complexity in deposit management is precisely what created conditions for the Synapse collapse.

Structural: FDIC exists because fractional reserve banking creates risks that need insurance. It's a solution to a problem created by the architecture itself.

Stablecoin accounts on self-custodial infrastructure have a different risk profile. No fractional reserve. Your funds sit in a smart account onchain. The risks are different: smart contract risk, issuer risk, key management risk. But these risks are transparent and auditable. You can inspect the code. You can verify reserves through attestations. You can see your assets onchain.

The argument isn't that FDIC is bad. It's that there's a different model with different trade-offs. Transparent trade-offs are easier to evaluate than opaque ones.

## Hard Problems

Being honest about hard problems:

Privacy. For trading and DeFi, public transaction histories weren't a dealbreaker. For businesses running real financial operations, they are. Competitive intelligence leakage is a real problem. The answer is selective disclosure - prove what needs to be proven without revealing everything else. The tech exists but isn't battle-tested yet. Adding privacy without compromising security is the challenge.

Compliance orchestration. Global on stablecoin rails, local at fiat edges. Each partner has different requirements. KYC that satisfies one jurisdiction may not satisfy another. This complexity compounds with every market we enter and every new vendor we onboard.

Self-custody UX. In a custodial system, features like account recovery, access controls, and compliance are easy - they're just trust-me assumptions. You call support, they fix it. In a self-custodial system, these things need to be encoded in math, which naturally creates rigidity. The hard problem is making something encoded in code feel intuitive and flexible to the customer. That means thinking through every edge case, designing policies that handle real-world complexity, and balancing smart accounts, permissions, and key management in ways that don't sacrifice usability.

These aren't unique to us - anyone building seriously on stablecoin rails is dealing with them. Job's far from finished. The point isn't that you need to build every solution in-house. It's that you need to be deep enough in the space to understand these problems, so you can make the call - build it yourself or work with the right partner to integrate. Teams that come in planning to stitch together APIs will keep hitting walls they don't understand. These are just the hard problems we can see today. More will surface as the space matures.

## Customers

We're building for every business that operates globally. The ambition is to be the financial operations platform for the next generation of companies - from startups to enterprises, anywhere in the world. Over 500 businesses are already using Altitude today. We're specific about where we start, but the product we're building serves a much larger market.

We start where we have unique credibility: stablecoin-pilled businesses. Protocols, foundations, trading firms, infrastructure companies. Teams with real stablecoin treasuries running real operations. Thousands of them already run treasury through Squads. They know us. We know them. Many have been asking for exactly what Altitude is. These customers don't need to be convinced that stablecoins work. They need the financial operations layer on top - invoicing, bill pay, cards, accounting integrations - that banks either won't give them or make painful to use.

From there, we expand to global startups. The companies that today's top neobanks would serve if they operated everywhere. Digital and software development agencies, SaaS companies, e-commerce businesses - teams building real products and serving real customers, but located in markets that traditional fintech hasn't reached. In the near term, we expect more traction in the Global South than the Global North - these are markets where the pain is sharpest and alternatives are fewest. But both will happen. Stablecoin rails are global infrastructure, and the product works everywhere.

The end state is serving global enterprises. Fortune 500 companies running treasury operations across dozens of countries. Multinationals that currently stitch together banking relationships in every jurisdiction they operate in and build in house banks to manage FX and intra company liquidity. The same architectural advantages that make Altitude work for a crypto startup - global by default, programmable accounts, access to internet capital markets - become even more powerful at enterprise scale. We understand these are very different customer segments. The product will evolve to serve each of them well. We're ready for that iteration - start with the beachhead, learn what matters, and expand from there. As stablecoins become standard infrastructure, the line between these segments disappears. We're building for where the market is going, starting where we have the clearest advantage today.

## Closing

The stablecoin infrastructure is mature enough to build real products. Incumbents are structurally constrained by their legacy stack. The market is forming.

We've spent four years building for this moment.

We believe in this deeply. Altitude isn't a side bet - it's the convergence of everything we've built and learned. We want to build a generational company. We're in it for the long haul. Altitude is going to have an explosive 2026 which none of you reading this are ready for.

If any of this resonates, reach out. If you're running a business and dealing with the pain points we've described - whether you're ready to switch or just curious - we want to talk. We want to learn what's broken for you. Even if you're cautious today, that's fine. We plan to convince you over time.

If you're working at a traditional fintech or a high growth company and you believe this shift is real - that the next decade of financial services gets built on different infrastructure - [we're hiring](https://jobs.ashbyhq.com/squads). We want people who are high agency, willing to work hard, have taste, don't believe in work/life balance and care about craft and quality.

And if you're a larger enterprise or fintech thinking through your own stablecoin strategy, we're happy to talk. We've spent years going deep on this. We have opinions and expertise.

date: Sat Dec 27 21:20:57 +0000 2025
url: https://x.com/SimkinStepan/status/2005026139404993003
──────────────────────────────────────────────────

@HuevaToi (Zarroc.BTC 🧠):
@SimkinStepan wild moves fam
date: Sat Dec 27 21:46:59 +0000 2025
url: https://x.com/HuevaToi/status/2005032691314598011
──────────────────────────────────────────────────

@crazydnekana (Shadow Holder):
@SimkinStepan And what is the @fusewallet thesis for the individual users?
date: Sat Dec 27 21:57:24 +0000 2025
url: https://x.com/crazydnekana/status/2005035310921777165
──────────────────────────────────────────────────

@Aabbhhz (Abhz 💭):
@SimkinStepan @DancingEddie_ sus the banner
date: Sat Dec 27 22:01:20 +0000 2025
url: https://x.com/Aabbhhz/status/2005036298831360454
──────────────────────────────────────────────────

@LukaQuant (LukaQuant):
@SimkinStepan Stablecoin TVL expansion = precursor to risk-on capital rotation. When USDC/USDT supply grows but doesn't deploy, it's dry powder waiting. 2026 thesis: liquidity abundance meets regulatory clarity. Altitude achieved.
date: Sat Dec 27 22:07:33 +0000 2025
url: https://x.com/LukaQuant/status/2005037865210933423
──────────────────────────────────────────────────

@SimkinStepan (Stepan | squads.xyz):
Also special thanks to @nvs who coined "linear for money" framing for altitude
date: Sat Dec 27 22:15:52 +0000 2025
url: https://x.com/SimkinStepan/status/2005039957430419955
──────────────────────────────────────────────────

@derekedws (Derek Edws):
@SimkinStepan good project
date: Sat Dec 27 22:51:02 +0000 2025
url: https://x.com/derekedws/status/2005048807109918863
──────────────────────────────────────────────────

@0xKyrie_Eleison (BRÆDEN):
In my investment banking internship last summer I asked my boss how he felt about crypto, and it went about exactly how you put it, he rejected the common pitch and prefers regulations and legal protection as anyone rational would. DeFi must adopt the strengths of TradFi that were arrogantly cut off for hasty growth, necessary evolve the ICMs. Stable-coins are exhibit A.

I know you said it needs to happen in house, but do you think it would be wise for squads to adopt an SDK from areas in the big problems section, privacy and compliance that need work?
date: Sat Dec 27 23:27:55 +0000 2025
url: https://x.com/0xKyrie_Eleison/status/2005058089670902058
──────────────────────────────────────────────────

@0xasimm (Asim):
@SimkinStepan Fortune 500 companies running dozens of banking relationships globally is a genuinely broken setup and held together by armies of treasury analysts. Even 20-30% efficiency gains on FX and settlements are a wedge.
date: Sun Dec 28 00:04:33 +0000 2025
url: https://x.com/0xasimm/status/2005067311104098368
──────────────────────────────────────────────────

@iamrebecca_lee (iamrebecca):
@SimkinStepan build hard in silence let the success be your voice!👍
date: Sun Dec 28 01:12:41 +0000 2025
url: https://x.com/iamrebecca_lee/status/2005084456001175786
──────────────────────────────────────────────────

@rayray_1_ (RayRay):
@SimkinStepan Altitude nails the money framing. Linear lens unlocks bigger meme liquidity, faster adoption
date: Sun Dec 28 04:00:07 +0000 2025
url: https://x.com/rayray_1_/status/2005126592432083218
──────────────────────────────────────────────────

@thecryptoskanda (加密韋馱｜Skanda 🔶):
@SimkinStepan The first bull out of many pessimistic English articles on my TL🫡
date: Sun Dec 28 07:44:47 +0000 2025
url: https://x.com/thecryptoskanda/status/2005183130723144026
──────────────────────────────────────────────────

@alphabatcher (Alpha Batcher):
@SimkinStepan Just followed you, would be awesome to get a follow back 🙌
date: Sun Dec 28 08:49:34 +0000 2025
url: https://x.com/alphabatcher/status/2005199432292368795
──────────────────────────────────────────────────

@tunein_dropout (🌌):
@SimkinStepan What happens when solana goes down for hours on end like it has multiple times in the past? Wouldn't this be better off built on an Ethereum L2?
date: Sun Dec 28 13:35:06 +0000 2025
url: https://x.com/tunein_dropout/status/2005271291381854645
──────────────────────────────────────────────────

@CryptoCurb (curb.sol):
@SimkinStepan bullish.
date: Sun Dec 28 16:04:32 +0000 2025
url: https://x.com/CryptoCurb/status/2005308898409099596
──────────────────────────────────────────────────

@aceddeca1 (Himura):
@SimkinStepan Wonder when insurance companies will sign on. They seem most likely to benefit
date: Sun Dec 28 16:13:48 +0000 2025
url: https://x.com/aceddeca1/status/2005311230282805407
──────────────────────────────────────────────────

@GeneralBingus (General Bingus.usduc):
@SimkinStepan Higher
date: Sun Dec 28 18:05:52 +0000 2025
url: https://x.com/GeneralBingus/status/2005339431289622769
──────────────────────────────────────────────────

@LIGHTS_artist (LIGHTS ✨):
@SimkinStepan Excellent article. Exciting times!
date: Sun Dec 28 18:35:20 +0000 2025
url: https://x.com/LIGHTS_artist/status/2005346846504521761
──────────────────────────────────────────────────

@WoofSolana (Woof):
@SimkinStepan 🫡
date: Mon Dec 29 09:44:17 +0000 2025
url: https://x.com/WoofSolana/status/2005575589965742362
──────────────────────────────────────────────────

@inkmatte (Matt.Ink):
@SimkinStepan No ceiling
date: Mon Dec 29 10:42:19 +0000 2025
url: https://x.com/inkmatte/status/2005590194184204553
──────────────────────────────────────────────────

@peterschroederr (Peter Schroeder):
@SimkinStepan https://t.co/qVO8VBDlvD
GIF: https://pbs.twimg.com/tweet_video_thumb/G9WbWTfaIAANwkj.jpg
date: Mon Dec 29 16:39:16 +0000 2025
url: https://x.com/peterschroederr/status/2005680027271410090
──────────────────────────────────────────────────

@aaronmkern (Aaron Kern):
@SimkinStepan Lfg!
date: Mon Dec 29 21:19:56 +0000 2025
url: https://x.com/aaronmkern/status/2005750655877812512
──────────────────────────────────────────────────

@Xingge888668 (COYPTO阿星💎):
@SimkinStepan 说实话，这篇关于稳定币和Altitude Thesis的文章标题就挺吸引人。看着看着就让人好奇2026年的具体规划会是什么样。
date: Tue Dec 30 09:42:57 +0000 2025
url: https://x.com/Xingge888668/status/2005937643511845204
──────────────────────────────────────────────────

@Ember_web3 (Ember):
@SimkinStepan Shoutout to nvs for pioneering "linear for money."
date: Tue Dec 30 16:09:11 +0000 2025
url: https://x.com/Ember_web3/status/2006034844610899980
──────────────────────────────────────────────────

@myonlylover_ (Voss.eth 🥷 〽️):
@SimkinStepan Spot on, stablecoins doing the moat from charters to code. Execution speed wins now. Altitude's $3B proves it. The future's onchain.
date: Thu Jan 01 17:38:31 +0000 2026
url: https://x.com/myonlylover_/status/2006782098116587864
──────────────────────────────────────────────────

@CryptoGrit (Crypto Grit):
@SimkinStepan Was just reading this before I apply, than I noticed you mentioned it in the article as well :) Super bullish and i think as people are getting more educated self custody will matter more and more as well
date: Fri Jan 02 02:44:42 +0000 2026
url: https://x.com/CryptoGrit/status/2006919553360789596
──────────────────────────────────────────────────

@stillinthefield (Kennyatta):
@SimkinStepan @fusewallet “The point isn't that you need to build every solution in-house. It's that you need to be deep enough in the space to understand these problems, so you can make the call - build it yourself or work with the right partner to integrate.” 

Most important piece in the puzzle.
date: Fri Jan 02 19:39:02 +0000 2026
url: https://x.com/stillinthefield/status/2007174815216742448
──────────────────────────────────────────────────

@cyfrosh (/Cyfrosh):
@SimkinStepan @fusewallet How do I earn with fuse wallet?
date: Sun Jan 04 21:11:23 +0000 2026
url: https://x.com/cyfrosh/status/2007922831829684313
──────────────────────────────────────────────────
```
