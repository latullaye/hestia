// The icons a chore, a shopping list, an aisle or a countdown can carry. The columns named "emoji" in the database hold
// one of these names (they were first meant for emoji; the few emoji written back then are still understood).
// The drawings themselves are in the app (src/components/icons.tsx); this list is shared with the tools so Claude and
// the intercom pick from the same set.
export const ICON_KEYS = [
  // home
  "home", "sparkles", "spray-can", "trash", "recycle", "sprout", "leaf", "tree", "flower", "snowflake", "bath", "shower", "washing-machine", "shirt",
  "bed", "sofa", "window", "lightbulb", "wrench", "hammer", "paint-roller", "key", "car", "bike", "mail", "phone", "wallet", "receipt",
  // kitchen and food
  "utensils", "cooking-pot", "chef-hat", "fridge", "shopping-cart", "shopping-basket", "shopping-bag", "store", "package", "carrot", "salad", "apple", "croissant",
  "wheat", "beef", "fish", "egg", "milk", "droplet", "cup", "ice-cream", "nut",
  // family, animals, health
  "baby", "cat", "dog", "pill", "stethoscope", "syringe", "heart", "book", "music", "dumbbell",
  // moments
  "cake", "gift", "party", "flame", "star", "calendar", "hourglass", "plane", "tent", "umbrella", "sun", "tree-pine", "monitor", "list-checks",
] as const;
export type IconKey = (typeof ICON_KEYS)[number];

const LEGACY_EMOJI: Record<string, IconKey> = {
  "🐈": "cat", "🐱": "cat", "🐕": "dog", "🍽": "utensils", "🗑": "trash", "♻": "recycle", "🌱": "sprout", "🍂": "leaf", "🛁": "bath", "🚿": "shower", "🪟": "window",
  "🧺": "washing-machine", "🧹": "sparkles", "🛒": "shopping-cart", "🏬": "store", "💊": "pill", "🔧": "wrench", "🧾": "receipt", "📦": "package", "🎄": "tree-pine",
  "🏖": "umbrella", "🐣": "baby", "👶": "baby", "📺": "monitor", "🥬": "salad", "🥔": "carrot", "🫓": "croissant", "🥩": "beef", "🧀": "milk", "🥛": "milk", "🍚": "wheat",
  "🥜": "nut", "🫙": "droplet", "🥤": "cup", "🧊": "snowflake", "🍮": "ice-cream", "🎂": "cake", "🎁": "gift", "🎉": "party", "⭐": "star", "✈": "plane",
};

// The icon behind a stored value: one of the names, or an emoji from the early days; null when it is neither
export function iconKey(value: string | null | undefined): IconKey | null {
  if (!value) return null;
  const v = value.trim();
  if ((ICON_KEYS as readonly string[]).includes(v)) return v as IconKey;
  return LEGACY_EMOJI[v.replace(/️/g, "")] ?? null;
}
