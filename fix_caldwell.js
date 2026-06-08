const fs = require('fs');
const path = './data/celestialDatabase.json';
let data = JSON.parse(fs.readFileSync(path, 'utf8'));

// Filter out the hallucinated entries
data = data.filter(d => !d.name.startsWith('Deep Space Object C-'));

const realCaldwell = [
  {
    "id": "c-92",
    "name": "Caldwell 92 (Carina Nebula)",
    "type": "Cluster",
    "mass": 0,
    "radius": 460,
    "color": "#ff3355",
    "description": "The Carina Nebula is a large, complex area of bright and dark nebulosity in the constellation Carina, housing several massive star clusters including Trumpler 14 and Trumpler 16, as well as the famous hypergiant Eta Carinae.",
    "encyclopedia": {
      "overview": "Caldwell 92, also known as the Carina Nebula (NGC 3372), is one of the largest diffuse nebulae in our skies. Although it is some four times as large and even brighter than the famous Orion Nebula, the Carina Nebula is much less well known due to its location in the southern sky.",
      "physicsHighlights": "The nebula is a vast region of star formation containing intense radiation fields from massive O-type stars, which ionize the surrounding hydrogen gas. The resulting stellar winds carve immense hollows into the molecular clouds.",
      "interestingFacts": [
        "Contains Eta Carinae, a highly unstable binary star system that is one of the most massive and luminous in the Milky Way.",
        "Home to the Homunculus Nebula, formed during an eruption of Eta Carinae in the 1840s.",
        "Discovered by Nicolas-Louis de Lacaille in 1752 from the Cape of Good Hope."
      ],
      "classificationData": {
        "Type": "Emission nebula",
        "Constellation": "Carina",
        "Distance from Earth": "8,500 light-years",
        "Radius": "230 light-years",
        "Apparent Magnitude": "1.0",
        "Notable Features": "Keyhole Nebula, Eta Carinae, Trumpler 14"
      }
    },
    "simulationParams": {
      "starCount": 600,
      "clusterRadius": 25,
      "coreConcentration": 0.3,
      "rotationSpeed": 0.05,
      "gravityStrength": 0.2,
      "starColorInner": "#ff7799",
      "starColorOuter": "#aa2244"
    }
  },
  {
    "id": "c-77",
    "name": "Caldwell 77 (Centaurus A)",
    "type": "GalaxyCollision",
    "mass": 1e12,
    "radius": 50000,
    "color": "#ffffff",
    "description": "Centaurus A is a prominent peculiar galaxy in the constellation Centaurus, known for its massive dust lane and extreme radio emissions resulting from a galactic merger and a supermassive black hole.",
    "encyclopedia": {
      "overview": "Caldwell 77 (NGC 5128), widely known as Centaurus A, is one of the closest radio galaxies to Earth. Its unique appearance—an elliptical galaxy split by a thick, dark band of dust—is the result of a past collision with a smaller spiral galaxy.",
      "physicsHighlights": "The center of the galaxy hosts a supermassive black hole with a mass of 55 million suns, which ejects relativistic jets responsible for massive radio lobes spanning over a million light-years across space.",
      "interestingFacts": [
        "It is the fifth-brightest galaxy in the sky, making it an ideal target for amateur astronomers in the southern hemisphere.",
        "The dark dust lane contains immense amounts of molecular gas and is a site of vigorous star formation triggered by the galactic collision.",
        "Its relativistic jets move at about half the speed of light."
      ],
      "classificationData": {
        "Type": "Peculiar Starburst Galaxy",
        "Constellation": "Centaurus",
        "Distance from Earth": "13 million light-years",
        "Mass": "1 trillion M☉",
        "Apparent Magnitude": "6.84",
        "Radio Source": "Centaurus A"
      }
    },
    "simulationParams": {
      "galaxyRadius": 40,
      "particleCount": 15000,
      "coreColor": "#ffffff",
      "armColor": "#4466ff",
      "dustLaneColor": "#110000",
      "spinRate": 0.05,
      "collisionProgress": 0.6
    }
  },
  {
    "id": "c-69",
    "name": "Caldwell 69 (Bug Nebula)",
    "type": "Supernova", 
    "mass": 5,
    "radius": 0.5,
    "color": "#ffff00",
    "description": "The Bug Nebula is a striking bipolar planetary nebula in Scorpius. It boasts one of the hottest known central stars, generating exceptionally high-velocity stellar winds and a complex, highly structured dust torus.",
    "encyclopedia": {
      "overview": "Caldwell 69 (NGC 6302), often called the Bug or Butterfly Nebula, is a bipolar planetary nebula. The structure is one of the most complex ever observed in planetary nebulae, shaped by an incredibly hot central star.",
      "physicsHighlights": "The central star has an estimated surface temperature of over 250,000 degrees Celsius, radiating intensely in ultraviolet light. It is hidden by an equatorial disk of dust, which pinches the outflowing gas into a bipolar butterfly shape.",
      "interestingFacts": [
        "The dust torus contains hydrocarbons, carbonates, and water ice, an unusual mix suggesting complex late-stage stellar chemistry.",
        "The gas in its 'wings' is expanding through space at over 600 kilometers per second.",
        "Despite its heat, the central star has never been directly observed visually because of the dense dust lane."
      ],
      "classificationData": {
        "Type": "Bipolar Planetary Nebula",
        "Constellation": "Scorpius",
        "Distance from Earth": "3,392 light-years",
        "Central Star Temp": ">250,000 K",
        "Apparent Magnitude": "7.1",
        "Expansion Velocity": "600 km/s"
      }
    },
    "simulationParams": {
      "expansionRate": 0.1,
      "maxRadius": 15,
      "particleCount": 8000,
      "coreColor": "#ffffff",
      "ejectaColor": "#eeaa22",
      "shockwaveColor": "#ffffff",
      "remnantType": "white_dwarf"
    }
  },
  {
    "id": "c-104",
    "name": "Caldwell 104 (NGC 362)",
    "type": "Cluster",
    "mass": 300000,
    "radius": 50,
    "color": "#ffddaa",
    "description": "NGC 362 is an extraordinarily dense globular cluster located near the Small Magellanic Cloud in the southern sky. It possesses a highly concentrated core and an unusual age relative to other Milky Way globulars.",
    "encyclopedia": {
      "overview": "Caldwell 104 is a prominent globular cluster. Although often overshadowed by its brilliant neighbor 47 Tucanae, NGC 362 is a magnificent object in its own right, distinguished by an unusually high concentration of stars in its core.",
      "physicsHighlights": "Studies of its stellar population reveal an unusually high abundance of 'blue stragglers'—stars that appear younger and hotter than their neighbors, likely formed through stellar collisions in the dense core environment.",
      "interestingFacts": [
        "NGC 362 is a 'young' globular cluster, estimated to be between 10 and 11 billion years old, significantly younger than the Milky Way's oldest clusters.",
        "It passes extremely close to the center of the Milky Way during its highly eccentric orbit.",
        "It was discovered by James Dunlop in 1826."
      ],
      "classificationData": {
        "Type": "Globular Cluster",
        "Constellation": "Tucana",
        "Distance from Earth": "27,700 light-years",
        "Radius": "25 light-years",
        "Apparent Magnitude": "6.4",
        "Age": "10.4 Billion Years"
      }
    },
    "simulationParams": {
      "starCount": 800,
      "clusterRadius": 6,
      "coreConcentration": 0.95,
      "rotationSpeed": 0.2,
      "gravityStrength": 1.2,
      "starColorInner": "#ffffff",
      "starColorOuter": "#ffccaa"
    }
  }
];

data.push(...realCaldwell);
fs.writeFileSync(path, JSON.stringify(data, null, 2));
