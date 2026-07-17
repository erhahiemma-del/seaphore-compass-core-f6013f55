import { Link, useRouterState } from "@tanstack/react-router";
import { Anchor, PanelLeftClose, Settings } from "lucide-react";

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

/**
 * Seaphore sidebar — 230px fixed.
 *
 * Group order is fixed (encodes the operating model):
 *   MISSION → INTELLIGENCE LIFECYCLE → INTELLIGENCE CENTRES → FOOTER
 *
 * Footer contains Administration + Collapse control only.
 */
export function AppSidebar() {
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";
  const currentPath = useRouterState({
    select: (router) => router.location.pathname,
  });

  const isActive = (url: string) =>
    url === "/" ? currentPath === "/" : currentPath.startsWith(url);

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
              <SidebarGroupLabel className="type-label text-sidebar-foreground/50">
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
                          "h-auto py-2 text-sidebar-foreground/85 motion-fast",
                          "hover:bg-sidebar-accent hover:text-sidebar-foreground",
                          "data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-foreground",
                          "data-[active=true]:border-l-2 data-[active=true]:border-[color:var(--color-teal)]",
                        )}
                      >
                        <Link to={item.url} className="flex items-center gap-2.5">
                          <item.icon className="h-4 w-4 shrink-0" />
                          {!collapsed && (
                            <span className="min-w-0 leading-tight">
                              <span className="block text-[13px] font-semibold">
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

      <SidebarFooter className="border-t border-sidebar-border px-2 py-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={isActive("/administration")}
              tooltip="Administration"
              className={cn(
                "text-sidebar-foreground/85 motion-fast",
                "hover:bg-sidebar-accent hover:text-sidebar-foreground",
                "data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-foreground",
              )}
            >
              <Link to="/administration" className="flex items-center gap-2.5">
                <Settings className="h-4 w-4 shrink-0" />
                {!collapsed && (
                  <span className="text-[13px] font-semibold">Administration</span>
                )}
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={toggleSidebar}
              tooltip={collapsed ? "Expand" : "Collapse"}
              className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground motion-fast"
            >
              <PanelLeftClose
                className={cn(
                  "h-4 w-4 shrink-0 motion-base",
                  collapsed && "rotate-180",
                )}
              />
              {!collapsed && (
                <span className="text-[13px] font-semibold">Collapse</span>
              )}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
