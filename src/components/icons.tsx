// One family of icons for the whole app: thin single-colour line drawings (Lucide), never emoji.
// Glyph draws the icon stored on a row (a name from the shared list, see supabase/functions/_shared/icons.ts);
// IconPicker lets one choose it.
import {
  Apple, Baby, Bath, BedDouble, Beef, Bike, BookOpen, Cake, Calendar, Car, Carrot, Cat, ChefHat, CookingPot, Croissant, CupSoda, Dog, Droplet, Dumbbell, Egg, Fish,
  Flame, Flower2, Gift, Grid2x2, Hammer, Heart, Home, Hourglass, IceCreamCone, Key, Leaf, Lightbulb, ListChecks, Mail, Milk, Monitor, Music, Nut, Package, PaintRoller,
  PartyPopper, Phone, Pill, Plane, Receipt, Recycle, Refrigerator, Salad, Shirt, ShoppingBag, ShoppingBasket, ShoppingCart, ShowerHead, Snowflake, Sofa, Sparkles,
  SprayCan, Sprout, Star, Stethoscope, Store, Sun, Syringe, Tent, Trash2, TreeDeciduous, TreePine, Umbrella, Utensils, Wallet, WashingMachine, Wheat, Wrench,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { ICON_KEYS, iconKey, type IconKey } from "@shared/icons.ts";

const DRAWINGS: Record<IconKey, LucideIcon> = {
  home: Home, sparkles: Sparkles, "spray-can": SprayCan, trash: Trash2, recycle: Recycle, sprout: Sprout, leaf: Leaf, tree: TreeDeciduous, flower: Flower2,
  snowflake: Snowflake, bath: Bath, shower: ShowerHead, "washing-machine": WashingMachine, shirt: Shirt, bed: BedDouble, sofa: Sofa, window: Grid2x2,
  lightbulb: Lightbulb, wrench: Wrench, hammer: Hammer, "paint-roller": PaintRoller, key: Key, car: Car, bike: Bike, mail: Mail, phone: Phone, wallet: Wallet,
  receipt: Receipt, utensils: Utensils, "cooking-pot": CookingPot, "chef-hat": ChefHat, fridge: Refrigerator, "shopping-cart": ShoppingCart,
  "shopping-basket": ShoppingBasket, "shopping-bag": ShoppingBag, store: Store, package: Package, carrot: Carrot, salad: Salad, apple: Apple, croissant: Croissant,
  wheat: Wheat, beef: Beef, fish: Fish, egg: Egg, milk: Milk, droplet: Droplet, cup: CupSoda, "ice-cream": IceCreamCone, nut: Nut, baby: Baby, cat: Cat, dog: Dog,
  pill: Pill, stethoscope: Stethoscope, syringe: Syringe, heart: Heart, book: BookOpen, music: Music, dumbbell: Dumbbell, cake: Cake, gift: Gift, party: PartyPopper,
  flame: Flame, star: Star, calendar: Calendar, hourglass: Hourglass, plane: Plane, tent: Tent, umbrella: Umbrella, sun: Sun, "tree-pine": TreePine, monitor: Monitor,
  "list-checks": ListChecks,
};

// An icon in the flow of the text. Draws nothing for an unknown value.
export function Glyph({ name, className }: { name: string | null | undefined; className?: string }) {
  const key = iconKey(name);
  if (!key) return null;
  const Icon = DRAWINGS[key];
  return <Icon className={`gi ${className || ""}`} aria-hidden />;
}

export function IconPicker({ value, onChange }: { value: string | null | undefined; onChange: (key: string | null) => void }) {
  const current = iconKey(value);
  const grid = useRef<HTMLDivElement>(null);
  // Opens on the icon already chosen
  useEffect(() => {
    const on = grid.current?.querySelector<HTMLElement>(".on");
    if (grid.current && on) grid.current.scrollTop = on.offsetTop - grid.current.offsetTop - 46;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="icon-grid" ref={grid}>
      <button type="button" className={current ? "" : "on"} onClick={() => onChange(null)} aria-label="Aucune icône">–</button>
      {ICON_KEYS.map((k) => { const Icon = DRAWINGS[k]; return <button type="button" key={k} className={current === k ? "on" : ""} onClick={() => onChange(k)} aria-label={k}><Icon /></button>; })}
    </div>
  );
}

// The name, written in joined-up school handwriting: the bar of the H (the house of the icon) runs on into "estia",
// and the ember of the icon dots the i. Drawn in the current text colour.
export function Wordmark({ height = 64 }: { height?: number }) {
  return (
    <svg className="wordmark" viewBox="14 14 204 70" height={height} role="img" aria-label="Hestia">
      <g fill="none" stroke="currentColor" strokeWidth="4.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 43 43.5 23.5Q48 20 52.5 23.5L77 43" /><path d="M34 45V78M62 45V78" />
        <path d="M34 64C43 52 53 52 62 62C66 66.5 68 75 76 75C84.4 73.2 91.6 66 91.6 58.2C91.6 48 79 48 79 63.6C79 75.6 89.2 80.4 98.8 72C109.6 67.2 113.2 58.8 115.6 51C119.2 58.8 124 69.6 117.4 76.2C113.8 79 109 78 107.2 73.8M117.4 76.2C131.8 73.2 136.6 64.8 136.6 55.2V40.8V69.6C136.6 78 142.6 79.2 148.6 72C158.2 68.4 163 62.4 163 51.6V69.6C163 78 169 79.2 175 72C190.6 73.2 199 68.4 200.2 55.8C195.4 48 184.6 50.4 184.6 64.8C184.6 76.8 195.4 76.8 200.2 67.2V52.2V69.6C200.2 78 206.2 79.2 211.6 73.2" />
        <path d="M131.2 52.2H142.6" />
      </g>
      <circle cx="163" cy="42" r="3.3" fill="var(--ember, #e9c58f)" />
    </svg>
  );
}
