-- M4.5a: Reclassify market-tier assets with critical price gaps
--
-- Problem: 175 assets classified as 'market' tier don't receive daily prices,
-- causing check-price-gaps.ts to fail. These are historical holdings that were
-- sold, matured, went to zero, or are crypto dust.
--
-- Approach: Reclassify to 'zero' everything that is dead/disposed/dust.
-- Keep fiat currencies as 'market' (served by FX rate pipeline).
-- Keep PARAX as 'book_value' (actively held, no price source).
--
-- Safe to re-run (idempotent UPDATE statements).

BEGIN;

-- ============================================================
-- 1. Matured bonds → zero
-- ============================================================
UPDATE assets SET pricing_tier = 'zero', updated_at = NOW()
WHERE ticker IN (
  '912796YN3', '912796ZF9', '912796ZG7', '912796YH6',
  '912796ZD4', '912796YT0', '912796XQ7',
  'COIN 3 3/8 10/01/28 8AA8'
)
AND pricing_tier = 'market';

-- ============================================================
-- 2. Disposed TTC crypto (confirmed sell events exist in events table)
-- ============================================================
UPDATE assets SET pricing_tier = 'zero', updated_at = NOW()
WHERE ticker IN (
  'AI16Z',   -- sold 2025-02-24
  'LOOKS',   -- sold 2024-03-04
  'SLERF',   -- sold 2024-04-05
  'OGV',     -- sold 2024-05-16
  'MET',     -- sold 2024-05-16
  'JOOD',    -- sold 2024-06-16
  'COST',    -- sold 2024-04-05
  'DOOD',    -- sold 2025-11-14
  'AIXBT'    -- sold 2025-02-18
)
AND pricing_tier = 'market';

-- ============================================================
-- 3. Disposed Nick crypto (confirmed sell events exist in events table)
-- ============================================================
UPDATE assets SET pricing_tier = 'zero', updated_at = NOW()
WHERE ticker IN (
  'YAK',     -- sold 2021-11-02
  'TULIP',   -- sold 2021-05-29
  'MEDIA',   -- sold 2021-06-23
  'RLY',     -- sold 2022-03-07
  'IBEUR',   -- sold 2024-02-11
  'PENGU',   -- sold 2025-10-12
  'SLND',    -- sold 2022-01-08
  'COPE'     -- sold (Solana DeFi, dead)
)
AND pricing_tier = 'market';

-- ============================================================
-- 4. Dead/worthless crypto (still held but price is zero)
-- ============================================================
UPDATE assets SET pricing_tier = 'zero', updated_at = NOW()
WHERE ticker IN (
  'UST',     -- Terra collapse May 2022
  'AUST',    -- Anchor UST, dead
  'AVAPAY',  -- airdrop spam, 1.79T tokens, worthless
  'ICE',     -- Popsicle Finance, dead
  'BASIS',   -- price zero since 2025-08-01
  'BLUNA'    -- bonded LUNA, dead
)
AND pricing_tier = 'market';

-- ============================================================
-- 5. Crypto dust (near-zero quantities, < $1 value)
-- ============================================================
UPDATE assets SET pricing_tier = 'zero', updated_at = NOW()
WHERE ticker IN (
  'GEL', 'MAPS', 'MARS', 'JOE', 'MEMO', 'NICE', 'BLZZ',
  'FTT', 'BLINK', 'ST-YCRV', 'STKCVXCRV', 'BCRV', 'BAAVE',
  'CNC', 'FLX', 'SDT', 'SONAR', 'TRIBE', 'LUNC', 'ANGLE',
  'APOLLO', 'ASTROC', 'SDFXS', 'DYP', 'ETHW', 'OXY',
  'MATIC', 'BNB', 'CRVUSD', 'BTUSD', 'BDAI', 'BOME'
)
AND pricing_tier = 'market';

-- ============================================================
-- 6. Disposed stablecoins/bridged tokens
-- ============================================================
UPDATE assets SET pricing_tier = 'zero', updated_at = NOW()
WHERE ticker IN (
  'TUSD', 'USDD', 'FRAX', 'BMIM', 'BUSDC', 'BUSDT',
  'USDT.E', 'USDC.E'
)
AND pricing_tier = 'market';

-- ============================================================
-- 7. Dead/disposed DeFi tokens (no API coverage, $0 value)
-- ============================================================
UPDATE assets SET pricing_tier = 'zero', updated_at = NOW()
WHERE ticker IN (
  'CLEV', 'PRISMA', 'JPEG', 'CRV3CRYPTO', 'GRO', 'VKR',
  'ANC', 'MINE', 'NANA', 'INU', 'OOGI', 'GRAPE', 'MER',
  'SLERF'  -- already listed above but safe to re-include
)
AND pricing_tier = 'market';

-- ============================================================
-- 8. Disposed IBKR equities (no longer in positions snapshots)
-- ============================================================
UPDATE assets SET pricing_tier = 'zero', updated_at = NOW()
WHERE ticker IN (
  -- Nick IBKR holdings (sold, confirmed not in current positions)
  'QQQ', 'GDXJ', 'SMT', 'RIGD', 'TLT', 'SPY', 'AAPL',
  'ROBO', 'BBH', 'SMH', 'IVOL', 'KRBN', 'METV', 'FXY',
  'CCJ', 'ITB', 'EWP', 'EURN', 'GREK', 'EEM', 'NLY',
  'VNQ', 'EWW', 'EWG', 'EWI', 'XLU', 'UUP', 'XLP',
  'VWO', 'DFRG', '2840', 'COW', 'TFI', 'SHY',
  -- Tiff IBKR holdings (sold, confirmed not in current positions)
  'SRUUF', 'TECK', 'NEM', 'MRNA', 'VLO', 'CTRA', 'ARKK',
  -- Nick/Tiff crypto-adjacent ETFs (disposed)
  'GBTC',   -- sold 2020-06-30
  'ETHE',   -- sold 2024-08-28
  'ETH (ETF)',  -- same asset as ETHE, relabeled, disposed
  -- Maisy IBKR holdings (sold, not in current positions)
  'MSTR',   -- sold ~2025-02-24
  'PLTR',   -- sold ~2025-02-03
  'HOOD',   -- sold ~2025-12-17
  'URPTF'   -- sold (OTC)
)
AND pricing_tier = 'market';

-- ============================================================
-- 9. Zero-balance equities with no position history
-- ============================================================
UPDATE assets SET pricing_tier = 'zero', updated_at = NOW()
WHERE ticker IN (
  'CMCSA', 'GOOG', 'HYG', 'IWM', 'JNK', 'LOW', 'LQDH',
  'USO', 'XLF', 'XLI', 'XLK', 'XRT', 'AMZN', 'DE',
  'DIS', 'HFC', 'IBB', 'CVS', 'LQDH'
)
AND pricing_tier = 'market';

-- ============================================================
-- 10. Zero-balance crypto with no position history
-- ============================================================
UPDATE assets SET pricing_tier = 'zero', updated_at = NOW()
WHERE ticker IN (
  '$CWIF', 'JOESHI', 'MANEKI', 'MUMU', 'EURS',
  'ETHRSIAPY', 'YCRV', 'XMARS', 'WAVAX', 'WFTM',
  'LATINA', 'LICKO'
)
AND pricing_tier = 'market';

-- ============================================================
-- 11. PARAX → book_value (actively held, no price source)
-- ============================================================
UPDATE assets SET pricing_tier = 'book_value', updated_at = NOW()
WHERE ticker = 'PARAX'
AND pricing_tier = 'market';

-- ============================================================
-- Verification
-- ============================================================
SELECT pricing_tier, COUNT(*) as cnt
FROM assets
GROUP BY pricing_tier
ORDER BY cnt DESC;

COMMIT;
