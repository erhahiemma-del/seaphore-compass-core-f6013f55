/**
 * INT-01A.1 — MIC Telemetry Registry
 *
 * Process-wide singleton that owns the global MicTelemetrySink.
 * Ships with ConsoleSink + CapturingSink wired together.
 * The CapturingSink is exported directly so the MIO Observatory
 * can read execution history without going through the sink interface.
 *
 * Swapping to OpenTelemetry: replace or extend globalMicSink.
 */
import { CompositeSink, ConsoleSink, CapturingSink } from "./telemetry/sinks";

/** Rolling window of up to 500 MIC executions for the MIO Observatory. */
export const mioCaptureSink = new CapturingSink(500);

/** Global sink: console output + in-memory capture for the Observatory. */
export const globalMicSink = new CompositeSink(new ConsoleSink(), mioCaptureSink);
