import {ComponentProps, useState} from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Minus, Plus } from "lucide-react";
import * as React from "react";

interface NumberFieldProps {
  value?: number;
  min?: number;
  max?: number;
  step?: number;
  onChange?: (value: number) => void;
}

export function NumberField({
  value = 18,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  ...props
                            }: NumberFieldProps & ComponentProps<"input">) {
  const [internalValue, setInternalValue] = useState<number>(value);

  const handleChange = (newValue: number) => {
    if (newValue >= min && newValue <= max) {
      setInternalValue(newValue);
      onChange?.(newValue);
    }
  };

  return (
    <div className="relative flex items-center">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => handleChange(internalValue - step)}
        disabled={internalValue <= min}
        className="absolute left-0 p-3 disabled:opacity-20"
        aria-label="Decrease"
      >
        <Minus className="h-4 w-4" />
      </Button>
      <Input
        {...props}
        role="spinbutton"
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck="false"
        value={internalValue}
        onChange={(e) => {
          const num = parseInt(e.target.value, 10);
          if (!isNaN(num)) handleChange(num);
        }}
        className="h-9 w-full rounded-md border text-center py-1 text-sm"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => handleChange(internalValue + step)}
        disabled={internalValue >= max}
        className="absolute right-0 p-3 disabled:opacity-20"
        aria-label="Increase"
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}