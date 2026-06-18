const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);

if (args.length < 6) {
  console.error("Usage: node update_result.js <date> <team1> <team2> <score1> <score2> <rating_change> [location]");
  console.error("Example: node update_result.js 2026-06-18 BA CH 1 4 -20 US");
  process.exit(1);
}

const [dateInput, team1, team2, score1, score2, ratingChangeStr, locationInput] = args;
const ratingChange = parseInt(ratingChangeStr, 10);
const location = locationInput || "";

const [year, month, day] = dateInput.split(/[-/]/);
if (!year || !month || !day) {
  console.error("Error: Date must be in YYYY-MM-DD format.");
  process.exit(1);
}

// Resolve paths relative to this script
const dataDir = path.resolve(__dirname, "../../../../src/data");
const teamRatingsPath = path.join(dataDir, "team_ratings");

const configPath = path.resolve(__dirname, "../../../../src/configuration.js");
const config = require(configPath);
const tournament = config.tournament || "WC";

const fixturesPath = path.join(dataDir, tournament, "fixtures");
const resultsPath = path.join(dataDir, tournament, "results");

// Helper to read and parse the JSON-stringified TSV files
function readDataFile(filePath) {
  const raw = fs.readFileSync(filePath, "latin1");
  const clean = raw.replace(/\x12/g, "\\u0012");
  return JSON.parse(clean);
}

// Helper to write back to files as JSON-stringified TSV
function writeDataFile(filePath, contentString) {
  fs.writeFileSync(filePath, JSON.stringify(contentString), "latin1");
}

function run() {
  console.log(`Processing match: ${team1} vs ${team2} on ${dateInput}`);

  // 1. Load current ratings from team_ratings
  if (!fs.existsSync(teamRatingsPath)) {
    console.error(`Error: Team ratings file not found at ${teamRatingsPath}`);
    process.exit(1);
  }
  
  const ratingsContent = readDataFile(teamRatingsPath);
  const ratingLines = ratingsContent.split("\n");
  let team1Rating, team2Rating;
  
  for (const line of ratingLines) {
    if (!line) continue;
    const fields = line.split("\t");
    if (fields[2] === team1) {
      team1Rating = parseInt(fields[3], 10);
    }
    if (fields[2] === team2) {
      team2Rating = parseInt(fields[3], 10);
    }
  }

  if (team1Rating === undefined) {
    console.error(`Error: Team code ${team1} not found in team_ratings.`);
    process.exit(1);
  }
  if (team2Rating === undefined) {
    console.error(`Error: Team code ${team2} not found in team_ratings.`);
    process.exit(1);
  }

  const newRating1 = team1Rating + ratingChange;
  const newRating2 = team2Rating - ratingChange;
  
  console.log(`Current ratings: ${team1} (${team1Rating}), ${team2} (${team2Rating})`);
  console.log(`Calculated new ratings: ${team1} (${newRating1}), ${team2} (${newRating2})`);

  // 2. Remove fixture
  if (fs.existsSync(fixturesPath)) {
    const fixturesContent = readDataFile(fixturesPath);
    const fixtureLines = fixturesContent.split("\n");
    const updatedFixtureLines = fixtureLines.filter(line => {
      if (!line) return false;
      const fields = line.split("\t");
      const isTarget = fields[0] === year &&
                       fields[1] === month &&
                       fields[2] === day &&
                       fields[3] === team1 &&
                       fields[4] === team2;
      if (isTarget) {
        console.log(`Removing matching fixture: ${line}`);
      }
      return !isTarget;
    });
    const updatedFixturesContent = updatedFixtureLines.join("\n") + "\n";
    writeDataFile(fixturesPath, updatedFixturesContent);
    console.log("Fixtures updated.");
  } else {
    console.warn("Warning: Fixtures file not found. Skipping fixture deletion.");
  }

  // 3. Add result
  if (fs.existsSync(resultsPath)) {
    const resultsContent = readDataFile(resultsPath);
    const resultLines = resultsContent.split("\n").filter(Boolean);
    
    // Construct new result line (12 columns)
    const newResultLine = `${year}\t${month}\t${day}\t${team1}\t${team2}\t${score1}\t${score2}\t${tournament}\t${location}\t${ratingChange}\t${newRating1}\t${newRating2}`;
    console.log(`Prepending result line: ${newResultLine}`);
    
    resultLines.unshift(newResultLine);
    const updatedResultsContent = resultLines.join("\n") + "\n";
    writeDataFile(resultsPath, updatedResultsContent);
    console.log("Results updated.");
  } else {
    console.error(`Error: Results file not found at ${resultsPath}`);
    process.exit(1);
  }

  // 4. Update team ratings
  const updatedRatingLines = ratingLines.map(line => {
    if (!line) return line;
    const fields = line.split("\t");
    if (fields[2] === team1) {
      console.log(`Updating ${team1} rating: ${fields[3]} -> ${newRating1}`);
      fields[3] = String(newRating1);
    } else if (fields[2] === team2) {
      console.log(`Updating ${team2} rating: ${fields[3]} -> ${newRating2}`);
      fields[3] = String(newRating2);
    }
    return fields.join("\t");
  });
  
  const updatedRatingsContent = updatedRatingLines.join("\n");
  writeDataFile(teamRatingsPath, updatedRatingsContent);
  console.log("Team ratings updated.");
}

run();
