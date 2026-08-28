-- Arrival intervention alerts — durable state for the approach alert domain.
--
-- The domain (src/services/alerts) already decides everything: eligibility,
-- episode identity, severity, which transitions are legal. This schema stores
-- the result of those decisions and enforces exactly one thing the domain
-- cannot enforce on its own — that two workers racing on the same vessel
-- cannot both create an active episode. Every other rule stays in the domain,
-- because a constraint that duplicated a domain rule would be free to
-- disagree with it.
--
-- ## Why not public.alerts
--
-- public.alerts already exists and is a different concept: signal-linked,
-- entity-referenced, with a free-text severity and status, no episode
-- identity, no approach evidence and a different lifecycle. Writing this
-- domain into it would silently merge two models and make both unreliable.
-- The two are kept apart deliberately.
--
-- ## Why a separate event table rather than audit_log
--
-- audit_log.officer_id is uuid NOT NULL. Reconciliation runs without an
-- officer, so writing system-generated escalations there would require
-- inventing a person who did them — the one thing an audit trail must never
-- contain. Officer actions continue to be audited through audit_log via
-- recordAudit; this table is the alert's own domain event history, which the
-- domain already models as AlertEvent, and it carries actor_type so a system
-- reconciliation can never be mistaken for a human decision.

CREATE TABLE public.arrival_intervention_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Episode identity: the hull, plus which approach this is for that hull.
  -- The IMO is the canonical vessel identifier the whole domain keys on; the
  -- optional vessel_id links to the entity record where one exists, without
  -- making the alert depend on that record existing.
  imo text NOT NULL,
  vessel_name text,
  vessel_id uuid REFERENCES public.vessels(id) ON DELETE SET NULL,
  episode_sequence integer NOT NULL CHECK (episode_sequence >= 1),

  condition text NOT NULL CHECK (condition IN (
    'APPROACHING_72H', 'APPROACHING_48H', 'APPROACHING_24H',
    'ENTERING', 'INSIDE_BOUNDARY'
  )),
  severity text NOT NULL CHECK (severity IN ('WATCH', 'ATTENTION', 'URGENT')),
  state text NOT NULL DEFAULT 'OPEN' CHECK (state IN (
    'OPEN', 'ACKNOWLEDGED', 'UNDER_REVIEW', 'ACTION_REQUIRED', 'RESOLVED', 'CLOSED'
  )),

  -- Why the alert was raised, frozen at creation and never rewritten. Held as
  -- JSON because it is read whole and never filtered on; the dimensions that
  -- are queried are first-class columns above.
  trigger_evidence jsonb NOT NULL,
  -- Where the vessel is now. Replaced as the fleet is reassessed.
  current_assessment jsonb,
  -- True when the latest reassessment could not be made at all. Carried
  -- rather than inferred from a null assessment, because "we could not
  -- assess" and "we have not reassessed" are different states and neither
  -- of them is "resolved".
  current_assessment_unavailable boolean NOT NULL DEFAULT false,

  acknowledged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  acknowledged_at timestamptz,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  resolution_reason text,
  closed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  closed_at timestamptz,
  closure_reason text,

  raised_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Optimistic concurrency. Every write asserts the version it read, so an
  -- officer acting on a stale view is told rather than silently overwriting
  -- someone else's decision.
  version integer NOT NULL DEFAULT 1,

  -- Two hulls cannot share an episode number, so a lost or archived row can
  -- never let a later approach reuse an identity.
  UNIQUE (imo, episode_sequence)
);

-- The concurrency guarantee, and the reason it is an index rather than an
-- application check. Two reconciliation workers can both observe "no active
-- alert" and both attempt to insert; only one insert can succeed here, and
-- the loser converges on the winner's row instead of creating a duplicate
-- episode. An `if (!existing) insert()` cannot make that promise.
CREATE UNIQUE INDEX arrival_alert_one_active_episode
  ON public.arrival_intervention_alerts (imo)
  WHERE state IN ('OPEN', 'ACKNOWLEDGED', 'UNDER_REVIEW', 'ACTION_REQUIRED');

-- The queries the attention surfaces actually run: the active list ordered by
-- urgency, and one hull's history. Neither should scan the table.
CREATE INDEX arrival_alert_active_idx
  ON public.arrival_intervention_alerts (severity, raised_at DESC)
  WHERE state IN ('OPEN', 'ACKNOWLEDGED', 'UNDER_REVIEW', 'ACTION_REQUIRED');
CREATE INDEX arrival_alert_imo_idx ON public.arrival_intervention_alerts (imo, episode_sequence DESC);
CREATE INDEX arrival_alert_assigned_idx
  ON public.arrival_intervention_alerts (assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX arrival_alert_state_idx ON public.arrival_intervention_alerts (state);

-- Append-only. No UPDATE or DELETE policy exists below, so an event cannot be
-- rewritten once written.
CREATE TABLE public.arrival_alert_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id uuid NOT NULL REFERENCES public.arrival_intervention_alerts(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN (
    'RAISED', 'TRANSITIONED', 'ESCALATED', 'ASSIGNED', 'NOTE_ADDED', 'EVIDENCE_STALE'
  )),
  previous_state text,
  next_state text,
  -- SYSTEM for reconciliation, OFFICER for a person. officer_id is null for
  -- SYSTEM precisely so no reconciliation event can borrow a human's name.
  actor_type text NOT NULL CHECK (actor_type IN ('SYSTEM', 'OFFICER')),
  officer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note text,
  at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT arrival_alert_event_officer_attributed
    CHECK ((actor_type = 'OFFICER') = (officer_id IS NOT NULL))
);

CREATE INDEX arrival_alert_events_alert_idx ON public.arrival_alert_events (alert_id, at);

GRANT SELECT, INSERT, UPDATE ON public.arrival_intervention_alerts TO authenticated;
GRANT SELECT, INSERT ON public.arrival_alert_events TO authenticated;
GRANT ALL ON public.arrival_intervention_alerts, public.arrival_alert_events TO service_role;

ALTER TABLE public.arrival_intervention_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arrival_alert_events ENABLE ROW LEVEL SECURITY;

-- Any authenticated officer may see the operational picture and act on it;
-- an approach alert is not restricted to the officer who happened to load the
-- map first. There is deliberately no DELETE policy on either table: a
-- resolved alert is a record, and records are not removed.
CREATE POLICY "Officers read arrival alerts"
  ON public.arrival_intervention_alerts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Officers raise arrival alerts"
  ON public.arrival_intervention_alerts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Officers update arrival alerts"
  ON public.arrival_intervention_alerts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Officers read alert events"
  ON public.arrival_alert_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "Officers append alert events"
  ON public.arrival_alert_events FOR INSERT TO authenticated WITH CHECK (true);
