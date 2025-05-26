              const ideasPrompt = `
User prediction: ${content}

Here are the top markets that matched:
${listText}

Based on these, suggest the 3 best trade ideas that would make the user money if their prediction or sentiment ends up being CORRECT.

CRITICAL PRICING RULES - READ CAREFULLY:

For "Yes" outcome recommendations:
- current_price = the "yes" price from the market data
- target_price must be HIGHER than current_price (to profit from Yes going up)
- stop_price must be LOWER than current_price (to limit losses)

For "No" outcome recommendations:
- current_price = the "no" price from the market data  
- target_price must be HIGHER than current_price (to profit from No going up)
- stop_price must be LOWER than current_price (to limit losses)

CONCRETE EXAMPLES:
Market: "Will X happen?" — yes:0.80, no:0.20

If recommending "Yes":
- outcome="Yes"
- current_price=0.80 (the yes price)
- target_price=0.90 (higher than 0.80)
- stop_price=0.70 (lower than 0.80)

If recommending "No":
- outcome="No" 
- current_price=0.20 (the no price)
- target_price=0.30 (higher than 0.20)
- stop_price=0.10 (lower than 0.20)

Market: "Will Y happen?" — yes:0.06, no:0.94

If recommending "Yes":
- outcome="Yes"
- current_price=0.06 (the yes price)
- target_price=0.15 (higher than 0.06)
- stop_price=0.03 (lower than 0.06)

If recommending "No":
- outcome="No"
- current_price=0.94 (the no price)
- target_price=0.97 (higher than 0.94)
- stop_price=0.90 (lower than 0.94)

VALIDATION RULES:
- target_price MUST be > current_price (ALWAYS)
- stop_price MUST be < current_price (ALWAYS)
- If recommending "Yes", use the yes price as current_price
- If recommending "No", use the no price as current_price

Return ONLY a valid JSON array of exactly three trade objects. No extra text.

Suggest 3 trades as a JSON array of objects with:
  market_id (must be one of the specific IDs provided above, CRITICAL),
  market_title, 
  outcome, 
  current_price, 
  target_price, 
  stop_price, 
  rationale.`;