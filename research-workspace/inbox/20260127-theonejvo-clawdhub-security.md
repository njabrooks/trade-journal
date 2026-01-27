---
source: https://x.com/theonejvo/status/2015892980851474595
captured_at: 2026-01-27T15:15:00Z
kind: article
author: @theonejvo (Jamieson O'Reilly)
tags: [security, clawdhub, supply-chain, vulnerability]
---

# Eating lobster souls Part II: the supply chain (backdooring the #1 downloaded clawdhub skill)

## Summary

Security researcher created a backdoored ClawdHub skill ("What Would Elon Do?"), inflated its download count to 4,000+ using a trivial vulnerability, making it the #1 downloaded skill. Real developers from 7 countries executed arbitrary commands on their machines thinking they were downloading a legitimate skill.

The vulnerability demonstrates that:
- ClawdHub download counts are trivially fakeable
- Skills can contain arbitrary hidden files not shown in the UI
- Developers implicitly trust download counts and visible descriptions
- Supply chain attacks on AI agent package registries are viable

This is a proof of concept - no actual data was exfiltrated, but demonstrates what's possible.

## Key Points

- ClawdHub is like npm for Claude Code skills
- Only SKILL.md content is shown in the UI, but skills can include additional files
- Download counts can be manipulated to create false trust
- Similar to historical npm supply chain attacks (ua-parser-js, event-stream)
- Developers need to speedrun security awareness alongside AI acceleration

---

**Metadata:**
- Date: Mon Jan 26 19:29:48 +0000 2026
