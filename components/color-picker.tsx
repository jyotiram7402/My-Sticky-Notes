"use client";

import { Check } from "lucide-react";
import {
  NOTE_COLORS,
  NOTE_COLOR_HEX,
  NOTE_COLOR_LABEL,
  TEXT_COLOR_HEX,
  defaultTextColor,
  type NoteColor,
  type TextColor,
} from "@/lib/notes";

interface ColorPickerProps {
  color: NoteColor;
  textColor: TextColor;
  onColor: (color: NoteColor) => void;
  onTextColor: (textColor: TextColor) => void;
}

/** A circle for each note color, plus a "Text color" choice of white or black. */
export function ColorPicker({ color, textColor, onColor, onTextColor }: ColorPickerProps) {
  return (
    <section aria-label="Colors" className="space-y-3">
      <div>
        <h3 className="field-label">Color</h3>
        <div role="group" aria-label="Note color" className="-ml-1.5 mt-1 flex flex-wrap">
          {NOTE_COLORS.map((option) => (
            <button
              key={option}
              type="button"
              className="swatch-btn"
              aria-label={NOTE_COLOR_LABEL[option]}
              aria-pressed={option === color}
              title={NOTE_COLOR_LABEL[option]}
              onClick={() => onColor(option)}
            >
              <span className="swatch" style={{ backgroundColor: NOTE_COLOR_HEX[option] }}>
                {option === color ? (
                  <Check
                    size={16}
                    strokeWidth={3}
                    color={TEXT_COLOR_HEX[defaultTextColor(option)]}
                    aria-hidden="true"
                  />
                ) : null}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="inline-flex items-center gap-1 rounded-2xl bg-white py-1 pl-3.5 pr-1 text-ink shadow-[0_1px_3px_rgb(0_0_0/0.12)] [--note-bg:#ffffff] [--note-fg:#111111]">
        <span className="mr-1 text-[13px] font-medium">Text color</span>
        <div role="group" aria-label="Text color" className="flex">
          {(["light", "dark"] as const).map((option) => (
            <button
              key={option}
              type="button"
              className="swatch-btn"
              aria-label={option === "light" ? "White text" : "Black text"}
              aria-pressed={option === textColor}
              onClick={() => onTextColor(option)}
            >
              <span className="swatch size-6" style={{ backgroundColor: TEXT_COLOR_HEX[option] }} />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
