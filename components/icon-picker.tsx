"use client";

import { NOTE_ICONS, NOTE_ICON_LABEL, type NoteIcon } from "@/lib/notes";
import { NOTE_ICON_COMPONENTS } from "./note-icons";

interface IconPickerProps {
  value: NoteIcon | null;
  onChange: (icon: NoteIcon | null) => void;
}

/** Icon shown at the bottom-left of the card. Tap the selected icon again to remove it. */
export function IconPicker({ value, onChange }: IconPickerProps) {
  return (
    <section aria-label="Icon">
      <h3 className="field-label">Icon</h3>
      <div role="group" aria-label="Note icon" className="mt-2 flex flex-wrap gap-2">
        {NOTE_ICONS.map((icon) => {
          const Icon = NOTE_ICON_COMPONENTS[icon];
          const active = icon === value;
          return (
            <button
              key={icon}
              type="button"
              className="icon-choice"
              aria-label={NOTE_ICON_LABEL[icon]}
              aria-pressed={active}
              title={NOTE_ICON_LABEL[icon]}
              onClick={() => onChange(active ? null : icon)}
            >
              <Icon size={20} strokeWidth={1.9} aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </section>
  );
}
