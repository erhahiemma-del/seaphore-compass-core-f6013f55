import { useMemo, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Anchor, ChevronRight, PanelLeftClose } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { NAV_GROUPS, type NavGroup } from "@/lib/nav";
import { cn } from "@/lib/utils";

/**
 * Seaphore sidebar — 230px fixed.
 *
 * The canonical navigation model (src/lib/nav.ts) is unchanged: group order
 * still encodes the operating model. What changed is disclosure — reference
 * groups collapse by default so the officer sees the operating path first,
 * and item subtitles moved into tooltips instead of doubling every row.
 */

/** Groups the officer works in every session stay open; reference collapses. */
const DEFAULT_OPEN = new Set(["Mission", "Intelligence Lifecycle"]);

export function AppSidebar() {
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";
  const currentPath = useRouterState({
    select: (router) => router.location.pathname,
  });

  const isActive = (url: string) =>
    url === "/" ? currentPath === "/" : currentPath.startsWith(url);

  const groupsWithActive = useMemo(
    () =>
      new Set(NAV_GROUPS.filter((g) => g.items.some((i) => isActive(i.url))).map((g) => g.label)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentPath],
  );

  const [manual, setManual] = useState<Record<string, boolean>>({});

  const isOpen = (group: NavGroup) =>
    manual[group.label] ?? (DEFAULT_OPEN.has(group.label) || groupsWithActive.has(group.label));

  return (
    <Sidebar collapsible="icon" className="border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border px-3 py-4">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[color:var(--color-teal)] text-white">
            <Anchor className="h-5 w-5" />
          </div>
          {!collapsed && (
            <div className="min-w-0 leading-tight">
              <div className="text-[15px] font-extrabold tracking-wide text-sidebar-foreground">
                SEAPHORE
              </div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-sidebar-foreground/55">
                Maritime Intelligence OS
              </div>
            </div>
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-2 py-3">
        {NAV_GROUPS.map((group) => {
          const open = collapsed || isOpen(group);
          return (
            <SidebarGroup key={group.label}>
              {!collapsed && (
                <button
                  type="button"
                  onClick={() => setManual((m) => ({ ...m, [group.label]: !open }))}
                  aria-expanded={open}
                  className="mb-0.5 flex w-full items-center gap-1.5 px-2 py-1 text-left type-label text-sidebar-foreground/45 hover:text-sidebar-foreground/80 motion-fast"
                >
                  <ChevronRight
                    className={cn("h-3 w-3 shrink-0 motion-base", open && "rotate-90")}
                  />
                  <span className="truncate">{group.label}</span>
                </button>
              )}
              {open && (
                <SidebarGroupContent>
                  <SidebarMenu>
                    {group.items.map((item) => {
                      const active = isActive(item.url);
                      return (
                        <SidebarMenuItem key={item.url}>
                          <SidebarMenuButton
                            asChild
                            isActive={active}
                            tooltip={
                              item.subtitle ? `${item.title} · ${item.subtitle}` : item.title
                            }
                            className={cn(
                              "h-auto py-1.5 text-sidebar-foreground/80 motion-fast",
                              "hover:bg-sidebar-accent hover:text-sidebar-foreground",
                              "data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-foreground",
                              "data-[active=true]:border-l-2 data-[active=true]:border-[color:var(--color-teal)]",
                            )}
                          >
                            <Link to={item.url} className="flex items-center gap-2.5">
                              <item.icon className="h-4 w-4 shrink-0" />
                              {!collapsed && (
                                <span className="min-w-0 truncate text-[13px] font-semibold">
                                  {item.title}
                                </span>
                              )}
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              )}
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border px-2 py-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={toggleSidebar}
              tooltip={collapsed ? "Expand" : "Collapse"}
              className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground motion-fast"
            >
              <PanelLeftClose
                className={cn("h-4 w-4 shrink-0 motion-base", collapsed && "rotate-180")}
              />
              {!collapsed && <span className="text-[13px] font-semibold">Collapse</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
