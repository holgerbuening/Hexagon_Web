export type AppLink = {
  label: string;
  url: string;
};

export type CreditItem = {
  name: string;
  source: string;
  license: string;
};

export const APP_INFO = {
  name: "Hexagon (Web Edition)",
  tagline: "Turn-based hex strategy in the browser",
  version: "0.3.0",
  build: "2026-11-11",
  shortDescription:
    "Hexagon is a turn-based strategy game running directly in your browser. It features procedural hex map generation, unit-based tactical combat, and an evolving UI designed for quick, readable battlefield decisions.",
  developer: "Developed by Holger Büning",
  copyright: "© 2026",
  links: [
    {
      label: "Project & Source Code",
      url: "https://github.com/holgerbuening/Hexagon_Web",
    },
    {
      label: "Report a bug / Feature requests",
      url: "https://github.com/holgerbuening/Hexagon_Web/issues",
    },
    {
      label: "Changelog / Releases",
      url: "https://github.com/holgerbuening/Hexagon_Web/releases",
    },
  ] as AppLink[],
  soundEffectsCredits: [
    {
      name: "t26_moving_01.wav",
      source: "https://freesound.org/people/greatmganga/sounds/329800/ by https://freesound.org/people/greatmganga/",
      license: "Creative Commons 0",
    },
    {
      name: "Infantry / Cavalry",
      source: "https://freesound.org/",
      license: "Creative Commons 0",
    },
    {
      name: "Blop",
      source: "Project-owned asset",
      license: "Used within this project",
    },
  ] as CreditItem[],
  graphicsCredits: [
    {
      name: "Terrain tiles",
      source: "self-made / Midjourney",
      license: "Project usage",
    },
    {
      name: "Unit sprites",
      source: "self-made / Midjourney",
      license: "Project usage",
    },
    {
      name: "Icons",
      source: "self-made / Midjourney",
      license: "Project usage",
    },
  ] as CreditItem[],
  licenseHeading: "Code: GNU GPL v3",
  licenseNote: "See https://www.gnu.org/licenses/ \nAssets may be licensed separately – see the credits above.",
};
