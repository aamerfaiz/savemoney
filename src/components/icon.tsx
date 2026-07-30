import {
  Utensils,
  ShoppingCart,
  Home,
  Plug,
  Fuel,
  ShoppingBag,
  Clapperboard,
  HeartPulse,
  Plane,
  Shield,
  GraduationCap,
  TrendingUp,
  Landmark,
  Receipt,
  Shapes,
  Wallet,
  Laptop,
  Percent,
  Coins,
  Briefcase,
  Car,
  Target,
  PiggyBank,
  CircleDollarSign,
  type LucideIcon,
} from "lucide-react";

/** Map the string icon names stored on categories/goals to Lucide icons. */
const ICONS: Record<string, LucideIcon> = {
  utensils: Utensils,
  "shopping-cart": ShoppingCart,
  home: Home,
  plug: Plug,
  fuel: Fuel,
  "shopping-bag": ShoppingBag,
  clapperboard: Clapperboard,
  "heart-pulse": HeartPulse,
  plane: Plane,
  shield: Shield,
  "graduation-cap": GraduationCap,
  "trending-up": TrendingUp,
  landmark: Landmark,
  receipt: Receipt,
  shapes: Shapes,
  wallet: Wallet,
  laptop: Laptop,
  percent: Percent,
  coins: Coins,
  briefcase: Briefcase,
  car: Car,
  target: Target,
  "piggy-bank": PiggyBank,
};

export function Icon({
  name,
  className,
}: {
  name?: string | null;
  className?: string;
}) {
  const Cmp = (name && ICONS[name]) || CircleDollarSign;
  return <Cmp className={className} />;
}
