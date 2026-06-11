// Random "spice" seed to push the LLM toward high-variance topics when the user
// doesn't supply one. Combines a couple of evocative, unrelated nudges.
const NUDGES = [
  "a lighthouse keeper", "an abandoned subway", "a talking parrot", "a chess tournament",
  "a midnight bakery", "a lost meteorite", "a traveling circus", "a beekeeper",
  "a vending machine", "a retired astronaut", "a flooded village", "a jazz trumpeter",
  "a secret recipe", "a broken clock tower", "a desert mechanic", "a ferry crossing",
  "an underground river", "a glassblower", "a snowed-in cabin", "a street magician",
  "a forgotten library", "a mountain rescue dog", "a radio station at dawn",
  "a stubborn donkey", "a paper boat race", "a switchboard operator", "a meteor shower",
  "a fisherman's superstition", "a runaway hot-air balloon", "a clockmaker's apprentice",
  "a mislabeled map", "a coastal storm", "a night train", "a community garden",
  "a power outage", "a stray cat colony", "a violinmaker", "a tide pool", "a wrong number call",
];
const MOODS = [
  "nostalgic", "suspenseful", "comedic", "bittersweet", "adventurous", "mysterious",
  "heartwarming", "absurd", "tense", "whimsical", "melancholic", "triumphant",
];

export function randomSpice(): string {
  const n = NUDGES[Math.floor(Math.random() * NUDGES.length)];
  const m = MOODS[Math.floor(Math.random() * MOODS.length)];
  return `${m} · ${n} · #${Math.floor(Math.random() * 100000)}`;
}
