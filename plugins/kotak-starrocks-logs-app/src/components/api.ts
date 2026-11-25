import { AdHocFiltersVariable, SceneObject } from '@grafana/scenes';

import { getAppConfig } from '../config/config';
import { BuildContext } from '../sql/builder';
import { LabelFilter, LineFilter, MessageFieldFilter, PatternFilter, QuerySpec } from '../state/types';

export type Tab = 'logs' | 'labels' | 'fields' | 'patterns';
export type Display = 'logs' | 'table' | 'json';

/** What child scenes may ask of the exploration (the object that owns the URL state). */
export interface ExplorationApi {
  readonly isLogsExploration: true;
  getSpec(): QuerySpec;
  getContext(): BuildContext | undefined;
  getDisplay(): { display: Display; sort: 'desc' | 'asc'; limit: number; wrap: boolean };
  setDisplay(d: Partial<{ display: Display; sort: 'desc' | 'asc'; limit: number; wrap: boolean }>): void;
  addFilter(f: LabelFilter): void;
  removeLabelFilter(key: string, value: string): void;
  hasFilter(key: string, value: string, op?: LabelFilter['op']): boolean;
  /** the "Filter by label values" combobox (source of truth for label filters) */
  getLabelFiltersVariable(): AdHocFiltersVariable;
  /** go from the value grid to the logs with the current filters */
  showLogs(): void;
  setLevels(levels: string[]): void;
  addLineFilter(f: LineFilter): void;
  togglePatternFilter(name: string, op: PatternFilter['op']): void;
  addFieldFilter(f: MessageFieldFilter): void;
  hasFieldFilter(key: string, value: string, op: MessageFieldFilter['op']): boolean;
  setBreakdown(key?: string): void;
  selectValue(label: string, value: string): void;
  setSearch(search: string): void;
  allowLongScan(): void;
  /** service grid of a message-level tenant: split volumes by level (sampled over long ranges) */
  setGridLevels(on: boolean): void;
  shrinkRange(hours: number): void;
}

export function isExplorationApi(o: unknown): o is ExplorationApi {
  return typeof o === 'object' && o !== null && (o as ExplorationApi).isLogsExploration === true;
}

/** Finds the exploration that owns `obj`. */
export function getExploration(obj: SceneObject): ExplorationApi {
  let cur: SceneObject | undefined = obj;
  while (cur) {
    if (isExplorationApi(cur)) {
      return cur;
    }
    cur = cur.parent;
  }
  throw new Error('LogsExploration not found');
}

/** Name shown for a label: the service label is "service", like Logs Drilldown. */
export function displayLabel(label: string): string {
  return label === getAppConfig().serviceLabel ? 'service' : label;
}
