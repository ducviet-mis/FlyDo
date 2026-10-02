"use client";

import { Check, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useEffect, useState } from "react";

const options = [
  { id: "light", label: "Sol", description: "Nắng ấm, sáng rõ để học", icon: Sun },
  { id: "dark", label: "Luna", description: "Khám phá Toán dưới ánh trăng", icon: Moon },
] as const;

export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" className="flydo-header-action rounded-full active:translate-y-0" aria-label="Chuyển giao diện" disabled>
        <Sun className="h-5 w-5" />
      </Button>
    );
  }

  const active = theme === "starmap" ? "dark" : theme === "system" ? resolvedTheme : theme;
  const ActiveIcon = options.find((option) => option.id === active)?.icon ?? Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="flydo-header-action rounded-full active:translate-y-0" aria-label={`Giao diện hiện tại: ${options.find((option) => option.id === active)?.label ?? 'Sol'}. Chọn giao diện`} title="Chọn giao diện">
          <ActiveIcon className="h-[19px] w-[19px]" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={10} className="flydo-header-menu w-64 p-2">
        <DropdownMenuLabel className="px-2 py-1 text-xs uppercase tracking-widest text-muted-foreground">Giao diện FlyDo</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map(({ id, label, description, icon: Icon }) => (
          <DropdownMenuItem key={id} aria-label={`${label}${active === id ? ', đang chọn' : ''}`} onSelect={() => setTheme(id)} className="flex min-h-14 w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-primary-soft focus:bg-primary-soft">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary"><Icon className="h-[18px] w-[18px]" aria-hidden="true" /></span>
            <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-foreground">{label}</span><span className="block text-xs text-muted-foreground">{description}</span></span>
            {active === id && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
