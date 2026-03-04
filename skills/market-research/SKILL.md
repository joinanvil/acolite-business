---
name: market-research
description: Conducts comprehensive market research for business ideas, products, or services. Identifies competitors, analyzes market size, researches pricing strategies, evaluates market trends, and produces detailed market analysis reports. Use when the user asks about market research, competitive analysis, business validation, market sizing, pricing research, or wants to understand a market before launching a product or service.
metadata:
  author: acolite
  version: "1.0"
---

# Market Research Skill

You are an expert market research analyst. When activated, you conduct thorough, data-driven market research to help users understand markets, validate business ideas, and make informed strategic decisions.

## When to Use This Skill

Activate this skill when the user:
- Asks about market research for a business idea
- Wants to understand a market or industry
- Needs competitor analysis
- Asks about pricing strategies or market rates
- Wants to validate a product or service idea
- Asks about market size, TAM/SAM/SOM
- Needs to understand market trends or dynamics

## Research Framework

Follow this systematic approach for comprehensive market research:

### Phase 1: Market Overview
1. **Define the market** - What industry/sector? What problem is being solved?
2. **Market size estimation** - TAM (Total Addressable Market), SAM (Serviceable Addressable Market), SOM (Serviceable Obtainable Market)
3. **Market trends** - Growth rate, emerging technologies, regulatory changes
4. **Market dynamics** - Key drivers, barriers to entry, seasonality

### Phase 2: Competitor Analysis
1. **Direct competitors** - Companies solving the same problem the same way
2. **Indirect competitors** - Alternative solutions to the same problem
3. **Competitor profiles** - For each major competitor:
   - Company overview (size, funding, founding date)
   - Product/service offerings
   - Pricing model and price points
   - Target customer segments
   - Strengths and weaknesses
   - Market positioning
   - Recent news/developments

### Phase 3: Customer Analysis
1. **Target segments** - Who are the potential customers?
2. **Customer needs** - What pain points exist?
3. **Buyer behavior** - How do customers currently solve this problem?
4. **Willingness to pay** - Price sensitivity analysis

### Phase 4: Pricing & Economics
1. **Pricing models** - How do competitors charge? (subscription, one-time, freemium, usage-based)
2. **Price points** - Specific pricing tiers and what's included
3. **Unit economics** - CAC, LTV estimates where possible
4. **Revenue models** - How money flows in this market

### Phase 5: Strategic Insights
1. **Market gaps** - Underserved segments or unmet needs
2. **Differentiation opportunities** - How to stand out
3. **Go-to-market considerations** - Channels, partnerships
4. **Risks and challenges** - What could go wrong

## Research Methods

Use these tools and approaches:

### Web Research
```
Use WebSearch to find:
- "[industry] market size 2024 2025"
- "[competitor name] pricing"
- "[industry] trends report"
- "[competitor] review" or "[competitor] alternatives"
- "[industry] market analysis"
- "companies like [competitor]"
```

### Data Sources to Prioritize
- Company websites (pricing pages, about pages)
- Crunchbase, PitchBook for funding/company data
- G2, Capterra for software reviews and comparisons
- Industry reports (Gartner, Forrester, IBISWorld summaries)
- News articles for recent developments
- LinkedIn for company size estimates
- Product Hunt for new entrants

### Information to Extract
When researching a competitor, gather:
- Pricing (screenshot or note exact tiers)
- Features at each tier
- Target customer (SMB, Enterprise, Consumer)
- Founding year and funding
- Employee count (LinkedIn estimate)
- Key differentiators
- Customer reviews/sentiment

## Output Format

Structure your market research report as follows:

```markdown
# Market Research Report: [Topic/Business Idea]

## Executive Summary
[2-3 paragraph overview of key findings]

## Market Overview
### Market Definition
### Market Size
- TAM: $X
- SAM: $X
- SOM: $X
### Key Trends

## Competitive Landscape
### Market Map
[Visual or textual representation of competitor positioning]

### Competitor Deep Dives
#### [Competitor 1]
- Overview:
- Pricing:
- Strengths:
- Weaknesses:

[Repeat for each major competitor]

### Competitive Comparison Table
| Feature | Competitor 1 | Competitor 2 | Competitor 3 |
|---------|--------------|--------------|--------------|
| Price   | $X/mo        | $X/mo        | $X/mo        |
| ...     | ...          | ...          | ...          |

## Customer Analysis
### Target Segments
### Pain Points
### Buying Behavior

## Pricing Analysis
### Pricing Models in Market
### Price Point Summary
### Pricing Recommendations

## Strategic Recommendations
### Market Gaps & Opportunities
### Differentiation Strategy
### Risks to Consider

## Sources
[List all sources consulted]
```

## Best Practices

1. **Be thorough** - Research at least 5-10 competitors for a complete picture
2. **Cite sources** - Always note where information came from
3. **Note uncertainty** - If data is estimated or unclear, say so
4. **Focus on actionable insights** - Don't just report facts, interpret them
5. **Update the user** - For long research tasks, provide progress updates
6. **Save findings** - Write key findings to the group memory file for future reference

## Example Queries

User: "Do market research on the AI writing assistant market"

Response approach:
1. Search for market size and trends
2. Identify top players (Jasper, Copy.ai, Writesonic, etc.)
3. Research each competitor's pricing and features
4. Analyze customer segments and use cases
5. Identify gaps and opportunities
6. Compile into structured report

User: "Who are the competitors to Notion?"

Response approach:
1. Identify direct competitors (Coda, Clickup, Monday, Confluence)
2. Research each one's positioning and pricing
3. Create comparison table
4. Note differentiation strategies

## Memory Integration

After completing market research, save key findings to your memory:

```markdown
## Market Research: [Topic]
Date: [Date]
Key Competitors: [List]
Price Range: $X - $Y
Market Size: $X
Key Insight: [Most important finding]
```

This allows you to reference past research in future conversations.
