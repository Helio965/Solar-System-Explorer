/*
 * Solar System Explorer: planet data.
 *
 * Bodies are ordered from the Sun outwards; the index is also the body's
 * depth in the 3D scene (Mercury is closest to the camera's origin, Pluto
 * the deepest).
 *
 * Moon layout (purely visual, not to scale):
 *   pos   [x, y] position relative to the planet centre, in planet radii
 *         (y is negative upwards, so -1 is the top of the horizon)
 *   flat  vertical squash of the orbit ellipse (perspective tilt)
 *   tilt  rotation of the orbit ellipse, in degrees
 *   size  display diameter, in planet radii
 *   minor hidden on phones, to keep the scene clean on small screens
 */

const PLANETS = [
  {
    id: "mercury",
    name: "Mercury",
    type: "Planet",
    category: "Terrestrial planet",
    au: "0.39 AU",
    scale: 0.8,
    accent: "#b8b0a6",
    rim: "214, 205, 194",
    glow: "150, 142, 132",
    glowStrength: 0.35,
    description:
      "The smallest planet and the closest to the Sun. A scorched, cratered world with almost no atmosphere to hold its heat.",
    details: [
      "Mercury races around the Sun faster than any other planet, completing a year in just 88 Earth days. Because it has practically no atmosphere, the side facing the Sun bakes at over 400 °C while the night side plunges far below freezing.",
      "Its surface is covered in impact craters, lava plains and long cliffs called lobate scarps, which formed as the planet's iron-rich interior cooled and the whole world slowly shrank.",
    ],
    stats: {
      diameter: "4,879 km",
      distance: "57.9 million km",
      orbit: "88 days",
      day: "176 Earth days",
      temperature: "−173 to 427 °C",
      gravity: "3.7 m/s²",
      moons: "0",
    },
    fact: "A single solar day on Mercury lasts two of its years.",
    moons: [],
  },
  {
    id: "venus",
    name: "Venus",
    type: "Planet",
    category: "Terrestrial planet",
    au: "0.72 AU",
    scale: 0.92,
    accent: "#e2b866",
    rim: "255, 226, 170",
    glow: "232, 186, 110",
    glowStrength: 0.85,
    description:
      "Wrapped in thick clouds of sulfuric acid, Venus is the hottest planet in the Solar System, hotter even than Mercury.",
    details: [
      "Venus is almost Earth's twin in size, but its dense carbon-dioxide atmosphere traps heat in a runaway greenhouse effect. The pressure at the surface is about 92 times that on Earth.",
      "It spins backwards and incredibly slowly: a day on Venus (243 Earth days) is longer than its year (225 Earth days).",
    ],
    stats: {
      diameter: "12,104 km",
      distance: "108.2 million km",
      orbit: "225 days",
      day: "243 Earth days (retrograde)",
      temperature: "464 °C average",
      gravity: "8.87 m/s²",
      moons: "0",
    },
    fact: "On Venus the Sun rises in the west and sets in the east.",
    moons: [],
  },
  {
    id: "earth",
    name: "Earth",
    type: "Planet",
    category: "Terrestrial planet",
    au: "1 AU",
    scale: 0.95,
    accent: "#3fd1a0",
    rim: "160, 205, 250",
    glow: "80, 150, 240",
    glowStrength: 0.88,
    description:
      "Earth, our home. It is the only planet known to have an atmosphere containing free oxygen, oceans of liquid water on its surface and, of course, life.",
    details: [
      "Earth is the largest of the four rocky planets and the only place in the universe known to host life. About 71% of its surface is covered by oceans, and its nitrogen–oxygen atmosphere shields life from harmful radiation.",
      "A molten iron core generates a magnetic field that deflects the solar wind, painting auroras near the poles. Its single large Moon stabilises the tilt of Earth's axis, keeping the climate relatively steady over millions of years.",
    ],
    stats: {
      diameter: "12,742 km",
      distance: "149.6 million km",
      orbit: "365.25 days",
      day: "24 hours",
      temperature: "15 °C average",
      gravity: "9.81 m/s²",
      moons: "1",
    },
    fact: "Earth is the densest planet in the Solar System.",
    moons: [
      { id: "moon", name: "Moon", diameter: "3,474 km", pos: [0.6, -1.13], flat: 0.86, tilt: -3, size: 0.15 },
    ],
  },
  {
    id: "mars",
    name: "Mars",
    type: "Planet",
    category: "Terrestrial planet",
    au: "1.52 AU",
    scale: 0.84,
    accent: "#e2583b",
    rim: "255, 150, 110",
    glow: "220, 90, 50",
    glowStrength: 0.55,
    description:
      "The red planet. A cold desert world of rusty dust, ancient riverbeds and the tallest volcano in the Solar System.",
    details: [
      "Iron oxide in its soil gives Mars its distinctive colour. Its thin atmosphere is mostly carbon dioxide, and seasonal dust storms can grow large enough to cover the entire planet.",
      "Mars is home to Olympus Mons, a volcano nearly three times the height of Everest, and Valles Marineris, a canyon system that would stretch across the United States. Dry channels and minerals show that liquid water once flowed here.",
    ],
    stats: {
      diameter: "6,779 km",
      distance: "227.9 million km",
      orbit: "687 days",
      day: "24 h 37 min",
      temperature: "−63 °C average",
      gravity: "3.71 m/s²",
      moons: "2",
    },
    fact: "Sunsets on Mars are blue.",
    moons: [
      { id: "phobos", name: "Phobos", diameter: "22 km", pos: [-0.62, -1.12], flat: 0.84, tilt: -4, size: 0.075 },
      { id: "deimos", name: "Deimos", diameter: "12 km", pos: [0.82, -1.04], flat: 0.9, tilt: 5, size: 0.06 },
    ],
  },
  {
    id: "jupiter",
    name: "Jupiter",
    type: "Planet",
    category: "Gas giant",
    au: "5.2 AU",
    scale: 1.15,
    accent: "#eba23f",
    rim: "236, 214, 186",
    glow: "205, 162, 120",
    glowStrength: 0.75,
    description:
      "Jupiter is the largest planet in the Solar System. Fittingly, it was named after the king of the gods in Roman mythology.",
    details: [
      "Jupiter is more than twice as massive as all the other planets combined. Its striped clouds of ammonia and water are torn into belts and zones by winds exceeding 500 km/h.",
      "The Great Red Spot is a storm wider than Earth that has been raging for at least 350 years. Jupiter's four large Galilean moons were discovered by Galileo in 1610 and changed how we saw our place in the cosmos.",
    ],
    stats: {
      diameter: "139,820 km",
      distance: "778.5 million km",
      orbit: "11.86 years",
      day: "9 h 56 min",
      temperature: "−108 °C (cloud tops)",
      gravity: "24.79 m/s²",
      moons: "95",
    },
    fact: "Jupiter has the shortest day of all the planets.",
    moons: [
      { id: "io", name: "Io", diameter: "3,643 km", pos: [-0.96, -0.8], flat: 0.8, tilt: -5, size: 0.075 },
      { id: "europa", name: "Europa", diameter: "3,122 km", pos: [-0.66, -1.07], flat: 0.85, tilt: -2, size: 0.065 },
      { id: "ganymede", name: "Ganymede", diameter: "5,268 km", pos: [0.62, -1.14], flat: 0.88, tilt: 3, size: 0.095 },
      { id: "callisto", name: "Callisto", diameter: "4,821 km", pos: [1.04, -0.86], flat: 0.92, tilt: 6, size: 0.085, minor: true },
    ],
  },
  {
    id: "saturn",
    name: "Saturn",
    type: "Planet",
    category: "Gas giant",
    au: "9.54 AU",
    scale: 1.06,
    accent: "#dcc38c",
    rim: "245, 226, 184",
    glow: "214, 185, 127",
    glowStrength: 0.7,
    rings: true,
    description:
      "Adorned with a dazzling system of icy rings, Saturn is the jewel of the Solar System and the least dense of all the planets.",
    details: [
      "Saturn's rings are made of countless chunks of water ice and rock, from grains of dust to boulders the size of houses. They stretch up to 282,000 km from the planet yet are, in most places, only about ten metres thick.",
      "Saturn is mostly hydrogen and helium and is so light it would float in water, if a bathtub large enough existed. Its moon Titan has a thick atmosphere and lakes of liquid methane.",
    ],
    stats: {
      diameter: "116,460 km",
      distance: "1.43 billion km",
      orbit: "29.46 years",
      day: "10 h 33 min",
      temperature: "−139 °C (cloud tops)",
      gravity: "10.44 m/s²",
      moons: "274",
    },
    fact: "A hexagon-shaped jet stream circles Saturn's north pole.",
    moons: [
      { id: "titan", name: "Titan", diameter: "5,150 km", pos: [-0.96, -1.3], flat: 0.8, tilt: -4, size: 0.1 },
      { id: "rhea", name: "Rhea", diameter: "1,527 km", pos: [0.52, -1.37], flat: 0.84, tilt: 2, size: 0.055, minor: true },
      { id: "enceladus", name: "Enceladus", diameter: "504 km", pos: [1.12, -1.22], flat: 0.88, tilt: 5, size: 0.045 },
    ],
  },
  {
    id: "uranus",
    name: "Uranus",
    type: "Planet",
    category: "Ice giant",
    au: "19.19 AU",
    scale: 1,
    accent: "#7fd6d8",
    rim: "190, 240, 236",
    glow: "110, 200, 200",
    glowStrength: 0.62,
    description:
      "A pale, blue-green ice giant that orbits the Sun tipped on its side, rolling along its path like a ball.",
    details: [
      "Uranus has an axial tilt of about 98°, probably the result of a colossal collision long ago. Each pole spends 42 years in continuous sunlight, followed by 42 years of darkness.",
      "Methane in its atmosphere absorbs red light and gives the planet its soft cyan colour. Beneath the clouds lies a hot, dense mantle of water, ammonia and methane ices.",
    ],
    stats: {
      diameter: "50,724 km",
      distance: "2.87 billion km",
      orbit: "84 years",
      day: "17 h 14 min (retrograde)",
      temperature: "−195 °C",
      gravity: "8.69 m/s²",
      moons: "29",
    },
    fact: "Most of Uranus's moons are named after characters from Shakespeare.",
    moons: [
      { id: "miranda", name: "Miranda", diameter: "472 km", pos: [-0.34, -1.2], flat: 0.85, tilt: -2, size: 0.045, minor: true },
      { id: "titania", name: "Titania", diameter: "1,578 km", pos: [-0.94, -0.92], flat: 0.82, tilt: -5, size: 0.075 },
      { id: "oberon", name: "Oberon", diameter: "1,523 km", pos: [0.84, -1.04], flat: 0.9, tilt: 4, size: 0.07 },
    ],
  },
  {
    id: "neptune",
    name: "Neptune",
    type: "Planet",
    category: "Ice giant",
    au: "30.07 AU",
    scale: 1,
    accent: "#4f7bff",
    rim: "184, 174, 250",
    glow: "118, 100, 230",
    glowStrength: 0.85,
    description:
      "Dark, cold and whipped by supersonic winds, Neptune is the most distant planet from the Sun, a deep blue world at the edge of the system.",
    details: [
      "Neptune was the first planet found through mathematics rather than observation: its position was predicted in 1846 from irregularities in the orbit of Uranus.",
      "Its winds are the fastest in the Solar System, reaching 2,100 km/h. Its largest moon, Triton, orbits backwards and is slowly spiralling inward; one day it may be torn apart into a ring.",
    ],
    stats: {
      diameter: "49,244 km",
      distance: "4.5 billion km",
      orbit: "164.8 years",
      day: "16 h 6 min",
      temperature: "−201 °C",
      gravity: "11.15 m/s²",
      moons: "16",
    },
    fact: "Neptune has completed only one orbit since its discovery.",
    moons: [
      { id: "triton", name: "Triton", diameter: "2,707 km", pos: [-0.72, -1.03], flat: 0.8, tilt: -6, size: 0.12 },
      { id: "proteus", name: "Proteus", diameter: "420 km", pos: [-0.16, -1.25], flat: 0.86, tilt: -1, size: 0.095 },
      { id: "nereid", name: "Nereid", diameter: "357 km", pos: [0.74, -1.08], flat: 0.92, tilt: 5, size: 0.05, minor: true },
    ],
  },
  {
    id: "pluto",
    name: "Pluto",
    type: "Dwarf planet",
    category: "Dwarf planet · Kuiper Belt",
    au: "39.5 AU",
    scale: 0.72,
    accent: "#d3a77b",
    rim: "236, 214, 188",
    glow: "184, 154, 122",
    glowStrength: 0.4,
    description:
      "A small, icy dwarf planet in the Kuiper Belt, with a vast heart-shaped glacier of frozen nitrogen on its surface.",
    details: [
      "Pluto was considered the ninth planet from its discovery in 1930 until 2006, when it was reclassified as a dwarf planet. In 2015 NASA's New Horizons revealed mountains of water ice, nitrogen glaciers and a thin blue haze.",
      "Its largest moon, Charon, is half Pluto's size. The two are tidally locked, always showing each other the same face as they orbit a point in space between them.",
    ],
    stats: {
      diameter: "2,377 km",
      distance: "5.9 billion km",
      orbit: "248 years",
      day: "6.4 Earth days",
      temperature: "−229 °C",
      gravity: "0.62 m/s²",
      moons: "5",
    },
    fact: "Pluto is smaller than Earth's Moon.",
    moons: [
      { id: "charon", name: "Charon", diameter: "1,212 km", pos: [-0.95, -1.42], flat: 0.82, tilt: -4, size: 0.3 },
      { id: "nix", name: "Nix", diameter: "≈ 50 km", pos: [0.42, -1.62], flat: 0.88, tilt: 2, size: 0.06 },
      { id: "hydra", name: "Hydra", diameter: "≈ 51 km", pos: [1.18, -1.28], flat: 0.92, tilt: 5, size: 0.065, minor: true },
    ],
  },
];

const STAT_LABELS = {
  diameter: "Diameter",
  distance: "Distance from the Sun",
  orbit: "Orbital period",
  day: "Length of day",
  temperature: "Temperature",
  gravity: "Surface gravity",
  moons: "Known moons",
};
