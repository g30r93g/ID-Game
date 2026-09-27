import { CookieSettingsButton } from "@/components/cookie-settings-button";
import { cn } from "@/lib/utils";

const item =
  "rounded-sm underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * The public pages' footer: the policies, and "Cookie settings" to change or
 * withdraw cookie consent at any time. The signed-in screens have the same
 * button in the user tray.
 *
 * Plain links rather than next/link: /sign-in ships no next/link otherwise,
 * and a footer link isn't worth adding it (about 3 KB gz) to that page.
 */
export function SiteFooter({ className }: { className?: string }) {
  return (
    <footer
      className={cn(
        "flex flex-wrap items-center justify-center gap-x-4 gap-y-1 py-4 text-xs text-muted-foreground",
        className,
      )}
    >
      <a href="/privacy" className={item}>
        Privacy
      </a>
      <a href="/tos" className={item}>
        Terms
      </a>
      <CookieSettingsButton className={cn(item, "cursor-pointer")} />
    </footer>
  );
}
