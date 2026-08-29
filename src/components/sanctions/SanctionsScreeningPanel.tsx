/**
 * Sanctions screening — officer surface for one subject.
 *
 * Progressive disclosure, matching the rest of the vessel drawer:
 *
 *   state → candidates → match basis → provider record → decision
 *
 * Three rules are enforced visually, not just in prose:
 *
 *  1. `No match` is always shown with its caveat. It is not a clearance.
 *  2. A provider failure renders as `Screening unavailable`, in warning
 *     tone, never as a clear result.
 *  3. A score never confirms anything. `Confirmed match` appears only
 *     after an officer confirms, and carries their name in the record.
 *
 * Multiple candidates stay individually selectable — the panel never
 * picks one on the officer's behalf.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  DISMISSAL_REASONS,
  SANCTIONS_FAILURE_LABEL,
  SANCTIONS_MATCH_LABEL,
  SANCTIONS_STATE_CAVEAT,
  effectiveState,
  type SanctionsCandidate,
  type SanctionsMatchState,
  type SanctionsScreeningRecord,
} from "@/lib/sanctions/match-state";
import {
  getSanctionsEntityDetail,
  listSanctionsScreenings,
  recordSanctionsMatchDecision,
  screenSubjectForSanctions,
} from "@/lib/sanctions.functions";

export interface SanctionsScreeningPanelProps {
  readonly subjectName: string;
  readonly subjectImo?: string | null;
  /** Owner/operator/manager/agent screening keeps its role distinct. */
  readonly role?: "vessel" | "owner" | "operator" | "manager" | "agent";
  /** Set by the Copilot to run a screening as soon as the panel mounts. */
  readonly autoScreen?: boolean;
}

type Phase = "idle" | "loading" | "screening" | "error";

const TONE: Record<SanctionsMatchState, string> = {
  NOT_SCREENED: "border-border/60 bg-muted/20 text-muted-foreground",
  NO_MATCH: "border-border/60 bg-muted/20 text-foreground",
  POSSIBLE_MATCH: "border-amber-300 bg-amber-50 text-amber-900",
  REVIEW_REQUIRED: "border-amber-400 bg-amber-100 text-amber-900",
  CONFIRMED_MATCH: "border-destructive/40 bg-destructive/10 text-destructive",
  SCREENING_UNAVAILABLE: "border-dashed border-amber-300 bg-amber-50/60 text-amber-900",
};

export function SanctionsScreeningPanel({
  subjectName,
  subjectImo,
  role = "vessel",
  autoScreen = false,
}: SanctionsScreeningPanelProps) {
  const [history, setHistory] = useState<ReadonlyArray<SanctionsScreeningRecord>>([]);
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [openCandidate, setOpenCandidate] = useState<SanctionsCandidate | null>(null);

  const current = history[0] ?? null;
  const state: SanctionsMatchState = current ? effectiveState(current) : "NOT_SCREENED";

  const load = useCallback(async () => {
    try {
      const rows = await listSanctionsScreenings({
        data: subjectImo ? { imo: subjectImo } : { name: subjectName },
      });
      setHistory(rows);
      setPhase("idle");
    } catch (cause) {
      // Not being able to READ history is different from having none.
      setError(cause instanceof Error ? cause.message : String(cause));
      setPhase("error");
    }
  }, [subjectImo, subjectName]);

  useEffect(() => {
    setHistory([]);
    setOpenCandidate(null);
    setError(null);
    setPhase("loading");
    void load();
  }, [load]);

  const screen = useCallback(async () => {
    setPhase("screening");
    setError(null);
    try {
      await screenSubjectForSanctions({
        data: {
          name: subjectName,
          imo: subjectImo ?? undefined,
          role,
        },
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setPhase("error");
    }
  }, [load, role, subjectImo, subjectName]);

  useEffect(() => {
    if (autoScreen && phase === "idle" && history.length === 0) void screen();
  }, [autoScreen, history.length, phase, screen]);

  const confirmedCandidateIds = useMemo(
    () =>
      new Set(
        (current?.decisions ?? [])
          .filter((d) => d.decision === "CONFIRMED")
          .map((d) => d.candidateId),
      ),
    [current],
  );
  const dismissedCandidateIds = useMemo(
    () =>
      new Set(
        (current?.decisions ?? [])
          .filter((d) => d.decision === "DISMISSED")
          .map((d) => d.candidateId),
      ),
    [current],
  );

  return (
    <section
      data-testid="sanctions-screening-panel"
      className="rounded-md border border-border/60 bg-card p-3"
    >
      <header className="flex items-start justify-between gap-2">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Sanctions screening
        </h3>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[11px]"
            disabled={phase === "screening" || phase === "loading"}
            onClick={() => void screen()}
          >
            {phase === "screening" ? "Screening…" : "Screen vessel"}
          </Button>
        </div>
      </header>

      <div
        data-testid="sanctions-state"
        data-state={state}
        className={`mt-2 rounded-md border px-2.5 py-2 ${TONE[state]}`}
      >
        <p className="text-[12px] font-semibold">{SANCTIONS_MATCH_LABEL[state]}</p>
        <p className="mt-0.5 text-[11px] opacity-90">{SANCTIONS_STATE_CAVEAT[state]}</p>
        {current?.failureReason ? (
          <p className="mt-1 text-[11px] opacity-90">
            {SANCTIONS_FAILURE_LABEL[current.failureReason]}
            {current.errorMessage ? ` — ${current.errorMessage}` : ""}
          </p>
        ) : null}
      </div>

      <dl className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
        <Meta label="Last screened">
          {current ? current.screenedAt.slice(0, 16).replace("T", " ") + "Z" : "Never"}
        </Meta>
        <Meta label="Scope">{current ? current.scope : "—"}</Meta>
        <Meta label="Provider">{current ? current.provider : "OpenSanctions"}</Meta>
      </dl>

      {error ? (
        <p className="mt-2 text-[11px] text-amber-700">
          Screening could not be completed: {error}. No conclusion should be drawn from this.
        </p>
      ) : null}

      {current && current.candidates.length > 0 ? (
        <div className="mt-3 space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Candidates ({current.candidates.length}) — officer selects
          </p>
          {current.candidates.map((candidate) => (
            <CandidateRow
              key={candidate.id}
              candidate={candidate}
              screeningId={current.id}
              confirmed={confirmedCandidateIds.has(candidate.id)}
              dismissed={dismissedCandidateIds.has(candidate.id)}
              open={openCandidate?.id === candidate.id}
              onToggle={() =>
                setOpenCandidate((prev) => (prev?.id === candidate.id ? null : candidate))
              }
              onDecided={() => void load()}
            />
          ))}
        </div>
      ) : null}

      {history.length > 1 ? (
        <div className="mt-3 border-t border-border/60 pt-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Screening history
          </p>
          <ul className="mt-1 space-y-0.5">
            {history.slice(1).map((record) => (
              <li key={record.id} className="flex justify-between text-[11px]">
                <span className="text-muted-foreground">
                  {record.screenedAt.slice(0, 10)}
                </span>
                <span className="text-foreground">
                  {SANCTIONS_MATCH_LABEL[effectiveState(record)]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[9.5px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="text-[11px] text-foreground">{children}</dd>
    </div>
  );
}

/**
 * One candidate, its match basis, and the officer's review controls.
 *
 * Dismissal requires a reason: an unexplained dismissal cannot be
 * defended later, and this record is evidentiary.
 */
function CandidateRow({
  candidate,
  screeningId,
  confirmed,
  dismissed,
  open,
  onToggle,
  onDecided,
}: {
  candidate: SanctionsCandidate;
  screeningId: string;
  confirmed: boolean;
  dismissed: boolean;
  open: boolean;
  onToggle: () => void;
  onDecided: () => void;
}) {
  const [reason, setReason] = useState<string>(DISMISSAL_REASONS[0]!);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  async function decide(decision: "CONFIRMED" | "DISMISSED") {
    setBusy(true);
    setFailure(null);
    try {
      await recordSanctionsMatchDecision({
        data: {
          screeningId,
          candidateId: candidate.id,
          candidateCaption: candidate.caption,
          decision,
          reason: decision === "CONFIRMED" ? "Officer confirmed identity match" : reason,
          note: note.trim() ? note.trim() : undefined,
        },
      });
      onDecided();
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function loadDetail() {
    setFailure(null);
    const result = await getSanctionsEntityDetail({ data: { id: candidate.id } });
    if ("error" in result) {
      setFailure(`Provider record unavailable: ${result.error}`);
      return;
    }
    setDetail(
      result.properties
        .slice(0, 12)
        .map((entry) => `${entry.key}: ${entry.values.join(", ")}`)
        .join("\n"),
    );
  }

  return (
    <div className="rounded-md border border-border/60 bg-muted/10 p-2">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-2 text-left"
      >
        <span>
          <span className="block text-[12px] font-medium text-foreground">{candidate.caption}</span>
          <span className="block text-[10.5px] text-muted-foreground">
            {candidate.schema} · score {candidate.score.toFixed(2)} · {candidate.id}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {confirmed ? (
            <Badge variant="destructive" className="h-4 px-1 text-[9.5px]">
              Confirmed
            </Badge>
          ) : null}
          {dismissed ? (
            <Badge variant="outline" className="h-4 px-1 text-[9.5px]">
              Dismissed
            </Badge>
          ) : null}
        </span>
      </button>

      {open ? (
        <div className="mt-2 space-y-2 border-t border-border/60 pt-2">
          <Facts label="Match basis" values={candidate.matchBasis} />
          <Facts label="Datasets" values={candidate.datasets} />
          <Facts label="Topics" values={candidate.topics} />
          <Facts label="Programs" values={candidate.programs} />
          <Facts label="Countries / flag" values={candidate.countries} />
          <Facts
            label="Identifiers"
            values={candidate.imoNumber ? [`IMO ${candidate.imoNumber}`, ...candidate.identifiers] : candidate.identifiers}
          />

          <Button
            size="sm"
            variant="link"
            className="h-5 px-0 text-[11px]"
            onClick={() => void loadDetail()}
          >
            View provider record
          </Button>
          {detail ? (
            <pre className="whitespace-pre-wrap rounded bg-muted/30 p-2 text-[10.5px] text-foreground">
              {detail}
            </pre>
          ) : null}

          {!confirmed && !dismissed ? (
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Dismissal reason
              </Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger className="h-7 text-[11px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DISMISSAL_REASONS.map((option) => (
                    <SelectItem key={option} value={option} className="text-[11px]">
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Optional note for the record"
                className="min-h-[52px] text-[11px]"
              />
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-6 px-2 text-[11px]"
                  disabled={busy}
                  onClick={() => void decide("CONFIRMED")}
                >
                  Confirm match
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-[11px]"
                  disabled={busy}
                  onClick={() => void decide("DISMISSED")}
                >
                  Dismiss match
                </Button>
              </div>
              <p className="text-[10.5px] text-muted-foreground">
                Investigation workflow not connected — a case cannot yet be opened from this
                candidate.
              </p>
            </div>
          ) : null}

          {failure ? <p className="text-[11px] text-amber-700">{failure}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function Facts({ label, values }: { label: string; values: ReadonlyArray<string> }) {
  return (
    <div className="text-[11px]">
      <span className="text-[9.5px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <p className="text-foreground">
        {values.length ? values.join(" · ") : <span className="text-muted-foreground">Not reported by provider</span>}
      </p>
    </div>
  );
}
