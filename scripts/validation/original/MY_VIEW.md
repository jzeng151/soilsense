# My suggestion, written before reading the Codex / subagent answers

1. Stop tuning on the data already examined. Every cut-off we pick after seeing 2015-2025 Kansas is fitted to it.
2. Anchor cut-offs to an outside standard instead of our backtest: the U.S. Drought Monitor's own percentile
   bands (D0 abnormally dry = 21st-30th percentile, D1 moderate drought = 11th-20th). So Watch = rain OR soil
   at/below the 30th percentile; Dry = rain AND soil at/below the 20th. Nobody on the team chose these numbers.
3. Freeze 2-3 candidate rules (rain-only, rain+soil anchored, the tuned 33/25) and the scoring method now,
   then test once on data nobody has looked at: the other demo states (Iowa, Illinois, Nebraska) with
   county USDM + NASA POWER. Whatever wins there is the evidence; Kansas is only a sanity check.
4. Ship the anchored rain+soil rule, labelled a demonstration setting "using Drought Monitor percentile bands",
   and claim only "agreed with the Drought Monitor more often than rain alone in a Kansas 2015-2025 backtest".
