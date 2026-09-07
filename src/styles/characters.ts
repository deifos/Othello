export type CharacterStyle = {
  id: string;
  name: string;
  description: string;
  color: string;
  accent: string;
  accessory: string;
};

/** Add a style here to make it available everywhere in the game. */
export const CHARACTER_STYLES: CharacterStyle[] = [
  {
    id: "classic",
    name: "Original",
    description: "A little pill. A lot of personality.",
    color: "#eee9dd",
    accent: "#f1a48d",
    accessory: "none",
  },
  {
    id: "sprout",
    name: "Sprout",
    description: "Small moves. Big growth.",
    color: "#dfe9bf",
    accent: "#76a147",
    accessory: "leaves",
  },
  {
    id: "cat",
    name: "Mochi Cat",
    description: "Quietly plotting the next move.",
    color: "#efdfc9",
    accent: "#d3b799",
    accessory: "cat",
  },
  {
    id: "bear",
    name: "Honey Bear",
    description: "Sweet face. Strong strategy.",
    color: "#e9d2af",
    accent: "#b58759",
    accessory: "bear",
  },
  {
    id: "panda",
    name: "Pip Panda",
    description: "A master of black and white.",
    color: "#e4e5d8",
    accent: "#45483f",
    accessory: "panda",
  },
  {
    id: "fox",
    name: "Clever Fox",
    description: "Always one flip ahead.",
    color: "#f6d4b6",
    accent: "#dd965c",
    accessory: "fox",
  },
  {
    id: "frog",
    name: "Fern Frog",
    description: "Take a leap of strategy.",
    color: "#d6e7bc",
    accent: "#8fba69",
    accessory: "frog",
  },
  {
    id: "bunny",
    name: "Cloud Bunny",
    description: "Soft ears. Sharp instincts.",
    color: "#f5e3df",
    accent: "#e6afa9",
    accessory: "bunny",
  },
  {
    id: "lavender",
    name: "Luna",
    description: "A little daydream, a clever plan.",
    color: "#e6dff1",
    accent: "#af97cd",
    accessory: "flower",
  },
  {
    id: "sunny",
    name: "Sunny",
    description: "Bringing a brighter kind of play.",
    color: "#f5e6b9",
    accent: "#e7bb4f",
    accessory: "crown",
  },
];

export function getCharacterStyle(id?: string): CharacterStyle {
  return (
    CHARACTER_STYLES.find((style) => style.id === id) ?? CHARACTER_STYLES[0]
  );
}
