"use client";

import { ThemeProvider } from "next-themes";
import { useTheme } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect } from "react";

function MigrateLegacyStarMapTheme() {
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    if (theme === "starmap") setTheme("dark");
  }, [theme, setTheme]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem themes={["light", "dark"]}>
      <MigrateLegacyStarMapTheme />
      <TooltipProvider delayDuration={300}>
        {children}
      </TooltipProvider>
    </ThemeProvider>
  );
}
