import { Link, useRouterState } from "@tanstack/react-router";
import { Anchor } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { NAV_GROUPS } from "@/lib/nav";
import { cn } from "@/lib/utils";

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const currentPath = useRouterState({
    select: (router) => router.location.pathname,
  });

  const isActive = (url: string) =>
    url === "/" ? currentPath === "/" : currentPath.startsWith(url);

  return (
    <Sidebar collapsible="icon" className="border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border/60 px-3 py-4">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
            <Anchor className="h-5 w-5" />
          </div>
          {!collapsed && (
            <div className="min-w-0 leading-tight">
              <div className="text-sm font-bold tracking-wide text-sidebar-foreground">
                SEAPHORE
              </div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-sidebar-foreground/60">
                Maritime Intelligence OS
              </div>
            </div>
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-2 py-3">
        {NAV_GROUPS.map((group) => (
          <SidebarGroup key={group.label}>
            {!collapsed && (
              <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/50">
                {group.label}
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const active = isActive(item.url);
                  return (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.title}
                        className={cn(
                          "h-auto py-2 text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                          "data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-foreground",
                          "data-[active=true]:border-l-2 data-[active=true]:border-sidebar-primary",
                        )}
                      >
                        <Link to={item.url} className="flex items-center gap-2.5">
                          <item.icon className="h-4 w-4 shrink-0" />
                          {!collapsed && (
                            <span className="min-w-0 leading-tight">
                              <span className="block text-sm font-medium">
                                {item.title}
                              </span>
                              {item.subtitle && (
                                <span className="block text-[11px] text-sidebar-foreground/55">
                                  {item.subtitle}
                                </span>
                              )}
                            </span>
                          )}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      {!collapsed && (
        <SidebarFooter className="border-t border-sidebar-border/60 px-3 py-3">
          <div className="text-[10px] leading-snug text-sidebar-foreground/55">
            v0.1 · Foundation
            <br />
            OC-001 Confidence Ladder active
          </div>
        </SidebarFooter>
      )}
    </Sidebar>
  );
}
