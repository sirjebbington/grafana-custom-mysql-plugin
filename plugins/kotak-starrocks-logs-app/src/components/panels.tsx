import { DataFrame, LoadingState, PanelData, TimeRange } from '@grafana/data';
import {
  PanelBuilders,
  SceneDataNode,
  SceneDataProvider,
  SceneObject,
  SceneQueryRunner,
  VizPanel,
} from '@grafana/scenes';
import {
  GraphDrawStyle,
  LegendDisplayMode,
  LogsDedupStrategy,
  LogsSortOrder,
  SortOrder,
  StackingMode,
  TooltipDisplayMode,
} from '@grafana/schema';

import { DETECTED_LEVEL, LEVEL_COLORS, LEVELS, RUNTIME_DS } from '../constants';
import { LogsAppQuery } from '../datasource/StarRocksLogsDataSource';
import { QueryKind, QueryParams, QuerySpec } from '../state/types';
import { ExplorationApi } from './api';

export function queryRunner(kind: QueryKind, spec: QuerySpec, params?: QueryParams, refId = 'A'): SceneQueryRunner {
  // datasource on the query too: the Logs panel resolves it per query for "show context"
  const query: LogsAppQuery = { refId, kind, spec, params, datasource: RUNTIME_DS };
  return new SceneQueryRunner({ datasource: RUNTIME_DS, queries: [query] });
}

/** Static data for a panel that shows part of another query's result. */
export function staticData(frames: DataFrame[], timeRange: TimeRange): SceneDataNode {
  const data: PanelData = { state: LoadingState.Done, series: frames, timeRange };
  return new SceneDataNode({ data });
}

/** Stacked bars, coloured by level when the series are levels. */
export function barsPanel(
  title: string,
  data: SceneDataProvider | undefined,
  opts: { headerActions?: VizPanel['state']['headerActions']; legend?: boolean; description?: string } = {}
): VizPanel {
  const b = PanelBuilders.timeseries()
    .setTitle(title)
    .setCustomFieldConfig('drawStyle', GraphDrawStyle.Bars)
    .setCustomFieldConfig('fillOpacity', 100)
    .setCustomFieldConfig('lineWidth', 0)
    .setCustomFieldConfig('pointSize', 0)
    .setCustomFieldConfig('stacking', { mode: StackingMode.Normal, group: 'A' })
    .setOption('legend', {
      showLegend: opts.legend ?? true,
      displayMode: LegendDisplayMode.List,
      placement: 'bottom',
      calcs: [],
    })
    .setOption('tooltip', { mode: TooltipDisplayMode.Multi, sort: SortOrder.Descending })
    .setMin(0)
    .setOverrides((o) => {
      for (const level of [...LEVELS, 'all' as const]) {
        o.matchFieldsWithName(level).overrideColor({ mode: 'fixed', fixedColor: LEVEL_COLORS[level] });
      }
    });
  if (data) {
    b.setData(data);
  }
  if (opts.headerActions) {
    b.setHeaderActions(opts.headerActions);
  }
  if (opts.description) {
    b.setDescription(opts.description);
  }
  return b.build();
}

/**
 * Grafana's Logs panel with log details, "show context" and filter buttons wired to the exploration.
 * Filter buttons on a label filter by that column; on detected_level they filter by level; selecting text
 * in a line offers "include/exclude" line filters.
 */
export function logsPanel(
  api: ExplorationApi,
  data: SceneQueryRunner,
  opts: { sort: 'desc' | 'asc'; wrap: boolean; title?: string; headerActions?: SceneObject[] }
): VizPanel {
  const onFilter = (op: '=' | '!=') => (key: string, value: string) => {
    if (key === DETECTED_LEVEL) {
      const levels = op === '=' ? [value] : LEVELS.filter((l) => l !== value);
      api.setLevels([...levels]);
      return;
    }
    api.addFilter({ key, op, value });
  };
  const b = PanelBuilders.logs()
    .setTitle(opts.title ?? '')
    .setData(data)
    .setOption('showTime', true)
    .setOption('wrapLogMessage', opts.wrap)
    .setOption('prettifyLogMessage', false)
    .setOption('enableLogDetails', true)
    .setOption('enableInfiniteScrolling', false)
    .setOption('showLabels', false)
    .setOption('showCommonLabels', false)
    .setOption('showLogContextToggle', true)
    .setOption('dedupStrategy', LogsDedupStrategy.none)
    .setOption('sortOrder', opts.sort === 'asc' ? LogsSortOrder.Ascending : LogsSortOrder.Descending)
    .setOption('onClickFilterLabel', onFilter('='))
    .setOption('onClickFilterOutLabel', onFilter('!='))
    .setOption('isFilterLabelActive', (key: string, value: string) =>
      Promise.resolve(
        key === DETECTED_LEVEL
          ? api.getSpec().levels.length === 1 && api.getSpec().levels[0] === value
          : api.hasFilter(key, value, '=')
      )
    )
    .setOption('onClickFilterString', (value: string) =>
      api.addLineFilter({ op: 'include', value, caseSensitive: true, regex: false })
    )
    .setOption('onClickFilterOutString', (value: string) =>
      api.addLineFilter({ op: 'exclude', value, caseSensitive: true, regex: false })
    );
  if (opts.headerActions) {
    b.setHeaderActions(opts.headerActions);
  }
  return b.build();
}

export function tablePanel(data: SceneQueryRunner): VizPanel {
  return PanelBuilders.table()
    .setTitle('')
    .setData(data)
    .setOption('cellHeight', 'sm' as never)
    .build();
}
