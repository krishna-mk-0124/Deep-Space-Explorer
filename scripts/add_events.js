const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '../data/celestialDatabase.json');
let db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

db.push({
  id: "andromeda-collision",
  name: "Andromeda-Milky Way Collision",
  type: "GalaxyCollision",
  mass: 1000000000,
  radius: 100000,
  color: "#ff5500",
  description: "A simulated collision between the Milky Way and Andromeda galaxies, occurring 4 billion years in the future.",
  encyclopedia: {
    overview: "The Andromeda–Milky Way collision is a galactic collision predicted to occur in about 4.5 billion years between the two largest galaxies in the Local Group. It is a spectacular event that will morph the spiral galaxies into a giant elliptical galaxy.",
    physicsHighlights: "The event involves thousands of gravitational N-body interactions, tearing spiral arms into long tidal tails and triggering intense star formation.",
    interestingFacts: [
      "The sun will likely not collide with any other star.",
      "The night sky will be dominated by a glowing galactic core."
    ],
    classificationData: {
      "Type": "Galactic Merger",
      "Distance": "2.5 Million LY",
      "Timeframe": "+4.5 Billion Years"
    }
  },
  simulationParams: {
    eventProgress: 0.0
  }
});

db.push({
  id: "betelgeuse-supernova",
  name: "Betelgeuse Supernova",
  type: "Supernova",
  mass: 15,
  radius: 800,
  color: "#ff2200",
  description: "The spectacular death of a red supergiant star, leading to core collapse and an expanding shockwave.",
  encyclopedia: {
    overview: "Betelgeuse is nearing the end of its life. When its core runs out of fuel, it will collapse under its own gravity, triggering a massive shockwave that blows the star apart in a Type II supernova.",
    physicsHighlights: "The core collapses at a quarter of the speed of light, bouncing back off the ultra-dense neutron core to form a shockwave powered by an intense neutrino burst.",
    interestingFacts: [
      "It would be bright enough to be seen during the day on Earth.",
      "It will leave behind a dense neutron star."
    ],
    classificationData: {
      "Type": "Type II Supernova",
      "Distance": "642 LY",
      "Progenitor": "Red Supergiant"
    }
  },
  simulationParams: {
    eventProgress: 0.0
  }
});

fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
console.log("Added 2 special events to database.");
