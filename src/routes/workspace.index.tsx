/**
 * /workspace — Investigation Workspace index.
 *
 * Sprint UX-005 (IIW). Lists persistent investigations. Presentation only —
 * data lives in the workspace store (localStorage-persisted).
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { FolderOpen, Plus, Trash2 } from "lucide-react";

import { AppShell } from "@/components/layout/IntelligenceCentreShell";
import { Button } from "@/components/ui/button";
import { useWorkspaceStore } from "@/stores/workspace.store";

export const Route = createFileRoute("/workspace/")({
  head: () => ({
    meta: [
      { title: "Investigation Workspace — Seaphore" },
      { name: "description", content: "Persistent maritime investigation workspaces with evidence, hypotheses, tasks, decisions and timeline." },
      { property: "og:title", content: "Seaphore Investigation Workspace" },
      { property: "og:description", content: "Every conversation becomes a persistent investigation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WorkspaceIndex,
});

function WorkspaceIndex() {
  const investigations = useWorkspaceStore((s) => s.investigations);
  const remove = useWorkspaceStore((s) => s.removeInvestigation);
  const create = useWorkspaceStore((s) => s.createInvestigation);
  const list = Object.values(investigations).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));

  return (
    <AppShell title="Investigation Workspace">
      <div className="mx-auto max-w-6xl p-6">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Investigation Workspace</h1>
            <p className="text-sm text-muted-foreground">
              Every investigation persists across sessions. Evidence, hypotheses, tasks and decisions all in one place.
            </p>
          </div>
          <Button
            onClick={() => {
              const title = window.prompt("Investigation title?");
              if (!title) return;
              create({ title, missionType: "GENERIC" });
            }}
          >
            <Plus className="mr-1 h-4 w-4" /> New investigation
          </Button>
        </header>

        {list.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
            No investigations yet. Ask the Copilot a question or start one manually.
          </div>
        ) : (
          <ul className="space-y-2">
            {list.map((w) => (
              <li key={w.id} className="rounded-lg border bg-card">
                <div className="flex items-center justify-between gap-3 p-4">
                  <Link
                    to="/workspace/$id"
                    params={{ id: w.id }}
                    className="flex flex-1 items-center gap-3"
                  >
                    <FolderOpen className="h-5 w-5 text-muted-foreground" />
                    <div className="flex-1">
                      <div className="text-sm font-medium">{w.title}</div>
                      <div className="mt-0.5 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                        <span>{w.missionType.replace(/_/g, " ")}</span>
                        <span>·</span>
                        <span>{w.status}</span>
                        <span>·</span>
                        <span>Confidence {w.confidenceTier} ({w.confidencePct}%)</span>
                        <span>·</span>
                        <span>Evidence {w.evidenceCompleteness}%</span>
                        <span>·</span>
                        <span>Updated {new Date(w.updatedAt).toLocaleString()}</span>
                      </div>
                    </div>
                  </Link>
                  <button
                    onClick={() => {
                      if (confirm(`Delete "${w.title}"?`)) remove(w.id);
                    }}
                    className="rounded p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Delete investigation"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <footer className="mt-10 border-t pt-4 text-center text-xs text-muted-foreground">
          Evidence first. Explainable always. Officer decides.
        </footer>
      </div>
    </AppShell>
  );
}
