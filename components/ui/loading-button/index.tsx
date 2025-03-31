import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const LoadingButton = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, asChild = false, loading, children, ...props },
    ref,
  ) => {
    if (asChild) {
      return (
        <Slot ref={ref} {...props}>
          {React.Children.map(children, (child) => {
            if (React.isValidElement(child)) {
              return React.cloneElement(child, {
                className: cn(buttonVariants({ variant, size }), className),
                children: (
                  <>
                    {loading && (
                      <Loader2
                        className={cn(
                          "h-4 w-4 animate-spin",
                          child.props.children && "mr-2"
                        )}
                      />
                    )}
                    {child.props.children}
                  </>
                ),
              });
            }
            return child;
          })}
        </Slot>
      );
    }

    return (
      <Button
        className={cn(className, "transition-all")}
        variant={variant}
        disabled={loading}
        ref={ref}
        {...props}
      >
        {loading && (
          <Loader2 className={cn("h-4 w-4 animate-spin", children && "mr-2")} />
        )}
        {children}
      </Button>
    );
  }
);
LoadingButton.displayName = "LoadingButton";

export { LoadingButton, buttonVariants };
