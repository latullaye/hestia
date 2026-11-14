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
