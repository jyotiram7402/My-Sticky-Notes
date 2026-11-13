import { Coffee, Lightbulb, Link as LinkIcon, ListChecks, Phone, Plane, ShoppingCart, Users } from "lucide-react";
import type { NoteIcon } from "@/lib/notes";

export type IconComponent = typeof Coffee;

/** lucide icon for each note icon choice. */
export const NOTE_ICON_COMPONENTS: Record<NoteIcon, IconComponent> = {
  link: LinkIcon,
  idea: Lightbulb,
  task: ListChecks,
  meeting: Users,
  call: Phone,
  coffee: Coffee,
  shopping: ShoppingCart,
  travel: Plane,
};
