"use client";

import { useId, type MouseEvent as ReactMouseEvent } from "react";
import { X } from "lucide-react";
import { dueParts, fromLocalInputs, toDateInputValue, toTimeInputValue, todayInputValue } from "@/lib/format";

interface DueDateFieldProps {
  value: string | null;
  onChange: (iso: string | null) => void;
}

function openPicker(event: ReactMouseEvent<HTMLInputElement>) {
  const input = event.currentTarget;
  try {
    if (typeof input.showPicker === "function") input.showPicker();
  } catch {
    // Some browsers only open the picker on their own; that is fine.
  }
}

function Sep({ children }: { children: string }) {
  return <span className="on-note-faint mx-[0.18em] font-medium">{children}</span>;
}

/**
 * Optional date and time, shown large ("29 - 04 - 2026", "02 : 30 PM").
 * Native date and time inputs sit invisibly on top, so tapping opens the system picker.
 */
export function DueDateField({ value, onChange }: DueDateFieldProps) {
  const dateId = useId();
  const timeId = useId();
  const dateValue = toDateInputValue(value);
  const timeValue = toTimeInputValue(value);
  const parts = value ? dueParts(value) : null;

  return (
    <section aria-label="Date and time">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={dateId} className="field-label">
          Date
        </label>
        {value ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="pill on-note-soft hit h-8 gap-1 px-3 text-[12px]"
            aria-label="Clear date and time"
          >
            <X size={14} strokeWidth={2.25} aria-hidden="true" />
            Clear
          </button>
        ) : null}
      </div>
      <div className="big-field mt-1">
        <p aria-hidden="true" className="py-1 text-[34px] font-bold leading-none tracking-tight tabular-nums">
          {parts ? (
            <>
              {parts.day}
              <Sep>-</Sep>
              {parts.month}
              <Sep>-</Sep>
              {parts.year}
            </>
          ) : (
            <span className="on-note-faint">dd - mm - yyyy</span>
          )}
        </p>
        <input
          id={dateId}
          type="date"
          value={dateValue}
          onClick={openPicker}
          onChange={(event) => {
            const nextDate = event.target.value;
            onChange(nextDate ? fromLocalInputs(nextDate, timeValue || "09:00") : null);
          }}
          className="big-field__input"
        />
      </div>

      <label htmlFor={timeId} className="field-label mt-4 block">
        Time
      </label>
      <div className="big-field mt-1">
        <p aria-hidden="true" className="py-1 text-[34px] font-bold leading-none tracking-tight tabular-nums">
          {parts ? (
            <>
              {parts.hour}
              <Sep>:</Sep>
              {parts.minute}
              <span className="ml-[0.3em]">{parts.period}</span>
            </>
          ) : (
            <span className="on-note-faint">-- : --</span>
          )}
        </p>
        <input
          id={timeId}
          type="time"
          value={timeValue}
          onClick={openPicker}
          onChange={(event) => {
            const nextTime = event.target.value;
            const baseDate = dateValue || todayInputValue();
            onChange(fromLocalInputs(baseDate, nextTime || "09:00"));
          }}
          className="big-field__input"
        />
      </div>
    </section>
  );
}
