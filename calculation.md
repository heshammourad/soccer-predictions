Neither the simulations, nor the presence of fixtures can be used. It has to be a separate calculation. There are a possible solutions I can
  envision:
  1. During the group stages, for each team, run 2 simulations, one with an extremely high ELO of 10000 and another with a 0 ELO. That should
  guarantee that in one simulation they win all of their remaining matches. If in this simulation they fail to progress, they are mathematically
  eliminated. In the 0 ELO simulation, if they still win the group or progress to the knockouts, they are mathematically guaranteed.
  2. While there are still group stage matches remaining, deterministically calculate the standings by setting each of the remaining matches to
  an 8-0 win for team 1 (high-scoring), 1-0 win for team 1 (low-scoring), 4-4 draw (high-scoring), 0-0 (low-scoring), and then 0-8 and 0-1. This
  would cover some extreme shifts of scoring and results. If a team never progresses with all the permutations for the remaining matches or never
  fails to advance, then it is mathematically guaranteed.
  
  Which of the approaches is less computationally expensive?

▸ Thought for 1m 28s
  The user is pointing out a valid bug: a team with 0 in a certain column (like "c...
  You're right — I was wrong to assume simulations with 0/10,000 successes means mathematically eliminated. A weak team in Group A at the    
  start could have 0/10,000 championship simulations but is clearly not eliminated.                                                          
  
  Comparing the two approaches:
  
  Approach 1 — Two extreme ELO simulations per team:
  
  • Requires running ~96 full tournament simulations (48 teams × 2)
  • Still non-deterministic even at ELO=10,000 because the score simulator uses probability curves — you'd need to override it to always     
  win/lose, essentially rewriting it
  • Expensive: full tournament including knockout bracket simulation each time
  • Complex to implement correctly
  
  Approach 2 — Enumerate result permutations for remaining group matches:
  
  • For a group with k remaining matches, that's at most 6^k combinations
  • After Matchday 1: 4 matches remaining → 6^4 = 1,296 combinations per group × 12 groups = ~15,000 checks
  • After Matchday 2: 2 matches remaining → 6^2 = 36 per group = ~432 checks
  • Each check is just sorting standings arithmetic — no simulation, fully deterministic
  • Only applicable during group stage, but knockout elimination is simple: a team that advanced to a knockout round can always win it, so   
  <1% is correct for extremely unlikely but still-alive teams; a team knocked out has 0% for all subsequent rounds
  
  Recommendation: Approach 2, with a slight optimization — rather than 6 result types, you can reduce to just 3 outcomes × extreme goal      
  differences only when there's a tiebreaker scenario. But even 6^4 = 1,296 is trivial arithmetic.
  
  The output would be two sets per milestone: guaranteedProgress: Set<teamId> and mathematicallyEliminated: Set<teamId>. These then drive the
  — vs <1% display, replacing all the fixture/simulation-based heuristics.
  
  Want me to implement this?