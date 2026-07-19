/**
 * Weather / sea state — NOT_IN_SCOPE.
 * Kept only so the matrix compiles.  Any call throws OutOfScopeSourceError.
 */
import { BaseAdapter, type HealthReport } from "../base-adapter";

export class WeatherAdapter extends BaseAdapter {
  constructor() {
    super("weather");
  }
  async observe(): Promise<never> {
    this.assertUsable(); // always throws OutOfScopeSourceError
    throw new Error("unreachable");
  }
  async healthCheck(): Promise<HealthReport> {
    return { state: "NOT_APPLICABLE", checkedAt: new Date().toISOString() };
  }
}
export const weather = new WeatherAdapter();
