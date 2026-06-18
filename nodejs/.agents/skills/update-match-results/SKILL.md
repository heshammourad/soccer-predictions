---
name: update-match-results
description: Updates match results, removes corresponding fixtures, and updates team ratings.
---

# Update Match Results Skill

This skill allows you to quickly record the result of a soccer match, automatically doing the following:
1. Removes the matching match from the fixtures file.
2. Prepends the result entry to the results file.
3. Recalculates and updates the team ELO ratings in the `team_ratings` file.

## How to use this skill

Run the following command inside the workspace directory:

```bash
node /workspaces/soccer-predictions/nodejs/.agents/skills/update-match-results/scripts/update_result.js <date> <team1> <team2> <score1> <score2> <rating_change> [location]
```

### Parameters
*   `<date>`: Match date in `YYYY-MM-DD` format (e.g., `2026-06-18`).
*   `<team1>`: Code for Team 1 (Home/Fixture order team, e.g., `BA`).
*   `<team2>`: Code for Team 2 (Away/Fixture order team, e.g., `CH`).
*   `<score1>`: Score of Team 1.
*   `<score2>`: Score of Team 2.
*   `<rating_change>`: Rating change for Team 1 (e.g., `-20` if Team 1 lost 20 points, or `15` if Team 1 gained 15 points).
*   `[location]`: (Optional) Match location code (e.g., `US`, `MX`, `CA`). Defaults to empty.

### Example
To record a 4-1 win for Switzerland (`CH`) against Bosnia (`BA`) where Bosnia lost 20 points:
```bash
node /workspaces/soccer-predictions/nodejs/.agents/skills/update-match-results/scripts/update_result.js 2026-06-18 BA CH 1 4 -20 US
```

### Post-Update Verification
After updating the results, you should run the simulation to check that predictions update correctly:
```bash
cd /workspaces/soccer-predictions/nodejs && ./run.sh
```
