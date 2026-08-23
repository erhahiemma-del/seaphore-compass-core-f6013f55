import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { NAV_GROUPS } from "@/lib/nav";

/**
 * Go-to palette — ⌘J / Ctrl+J (⌘K stays reserved for the Copilot).
 *
 * Navigation only. It routes to existing routes from the canonical nav model;
 * it neither queries intelligence nor duplicates the Copilot's command layer.
 */
export function GoToPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onRequest = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("seaphore:open-goto-palette", onRequest);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("seaphore:open-goto-palette", onRequest);
    };
  }, []);

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Go to" description="Jump to a workspace">
      <CommandInput placeholder="Go to a workspace, centre or case…" />
      <CommandList>
        <CommandEmpty>No workspace matches that.</CommandEmpty>
        {NAV_GROUPS.map((group) => (
          <CommandGroup key={group.label} heading={group.label}>
            {group.items.map((item) => (
              <CommandItem
                key={item.url}
                value={`${item.title} ${item.subtitle ?? ""} ${item.url}`}
                onSelect={() => {
                  setOpen(false);
                  void navigate({ to: item.url });
                }}
              >
                <item.icon className="mr-2 h-4 w-4 shrink-0 text-slate" />
                <span className="font-medium">{item.title}</span>
                {item.subtitle && (
                  <span className="ml-2 truncate text-[11px] text-slate">{item.subtitle}</span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
