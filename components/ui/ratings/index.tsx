import * as React from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

const sizeMap = {
  sm: "w-4 h-4",
  md: "w-6 h-6",
  lg: "w-8 h-8",
};

// Define the props type for the Rating component
interface RatingProps {
  className?: string;
  max?: number;
  value?: number;
  onChange?: (value: number) => void;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
}

const Rating = React.forwardRef<HTMLDivElement, RatingProps>(
  (
    {
      className,
      max = 5,
      value = 0,
      onChange,
      disabled = false,
      size = "md",
      ...props
    },
    ref
  ) => {
    const [hoverValue, setHoverValue] = React.useState<number | null>(null);

    return (
      <div
        ref={ref}
        className={cn(
          "flex gap-1",
          disabled && "opacity-50 cursor-not-allowed",
          className
        )}
        {...props}
      >
        {[...Array(max)].map((_, index) => {
          const ratingValue = index + 1;
          return (
            <Star
              key={ratingValue}
              className={cn(
                "transition-colors outline-none",
                sizeMap[size as keyof typeof sizeMap],
                !disabled && "cursor-pointer",
                (
                  hoverValue !== null
                    ? hoverValue >= ratingValue
                    : value >= ratingValue
                )
                  ? "fill-foreground text-foreground"
                  : "fill-none text-muted-foreground"
              )}
              onMouseEnter={() => !disabled && setHoverValue(ratingValue)}
              onMouseLeave={() => !disabled && setHoverValue(null)}
              onClick={() => {
                if (!disabled && onChange) {
                  onChange(ratingValue);
                }
              }}
              role="button"
              aria-label={`Rate ${ratingValue} out of ${max}`}
              tabIndex={disabled ? -1 : 0}
            />
          );
        })}
      </div>
    );
  }
);
Rating.displayName = "Rating";

export { Rating };
