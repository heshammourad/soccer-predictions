const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
if (args.length < 3) {
  console.error("Usage: node import_latest_data.js <ratings_md_path> <fixtures_md_path> <results_md_path>");
  process.exit(1);
}

const steps = {
  team_ratings: args[0],
  fixtures: args[1],
  results: args[2]
};

const targets = {
  team_ratings: path.join(__dirname, "data/team_ratings"),
  fixtures: path.join(__dirname, "data/WC/fixtures"),
  results: path.join(__dirname, "data/WC/results")
};

for (const [key, srcPath] of Object.entries(steps)) {
  if (!fs.existsSync(srcPath)) {
    console.error(`Error: Source file not found at ${srcPath}`);
    process.exit(1);
  }
  const content = fs.readFileSync(srcPath, "utf8");
  const lines = content.split("\n");
  
  // Skip the first 8 lines (metadata headers)
  const dataLines = lines.slice(8);
  
  // Filter out empty lines or page dividers
  const tsvLines = dataLines.filter(line => line.trim().length > 0 && !line.startsWith("---"));
  
  const rawTsv = tsvLines.join("\n") + "\n";
  
  // Write as JSON-stringified string (encoding: latin1)
  const destPath = targets[key];
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, JSON.stringify(rawTsv), "latin1");
  console.log(`Successfully wrote ${key} to ${destPath}`);
}
