import { css } from '@emotion/css';
import { useState } from 'react';

import { GrafanaTheme2, SelectableValue } from '@grafana/data';
import { sceneGraph } from '@grafana/scenes';
import { AsyncSelect, Button, Input, Select, ToolbarButton, useStyles2 } from '@grafana/ui';

import { LEVELS } from '../constants';
import { runSqlOnce, stringColumn } from '../datasource/api';
import { labelValuesQuery } from '../sql/builder';
import { LabelOp } from '../state/types';
import type { LogsExploration } from './LogsExploration';
import { Chip, LevelDot } from './ui';

const OPS: Array<SelectableValue<LabelOp>> = [
  { label: '=', value: '=' },
  { label: '!=', value: '!=' },
  { label: '=~', value: '=~', description: 'matches regex' },
  { label: '!~', value: '!~', description: 'does not match regex' },
];

/** Filters above the tabs: column filters, levels, line search, and pattern / message-field filters. */
export function DetailsHeader({ model }: { model: LogsExploration }) {
  const styles = useStyles2(getStyles);
  const { filters, levels, lineFilters, patternFilters, fieldFilters } = model.useState();
  return (
    <div className={styles.wrapper}>
      <div className={styles.row}>
        <span className={styles.label}>Labels</span>
        {filters.map((f, i) => (
          <Chip key={`${f.key}${f.op}${f.value}`} onRemove={() => model.removeFilter(i)} testId="filter-chip">
            {f.key} {f.op} {f.value}
          </Chip>
        ))}
        <AddFilter model={model} />
      </div>
      <div className={styles.row}>
        <span className={styles.label}>Levels</span>
        {LEVELS.map((l) => (
          <Button
            key={l}
            size="sm"
            variant={levels.includes(l) ? 'primary' : 'secondary'}
            fill={levels.includes(l) ? 'solid' : 'outline'}
            onClick={() => model.toggleLevel(l)}
            data-testid={`level-${l}`}
          >
            <span className={styles.level}>
              <LevelDot level={l} /> {l}
            </span>
          </Button>
        ))}
      </div>
      <LineFilterInput model={model} />
      {(lineFilters.length > 0 || patternFilters.length > 0 || fieldFilters.length > 0) && (
        <div className={styles.row}>
          {lineFilters.map((f, i) => (
            <Chip key={`l${i}`} onRemove={() => model.removeLineFilter(i)} testId="line-chip">
              {f.op === 'include' ? 'line contains' : 'line does not contain'} {f.regex ? 'regex ' : ''}
              {f.caseSensitive ? '' : '(any case) '}&quot;{f.value}&quot;
            </Chip>
          ))}
          {patternFilters.map((f, i) => (
            <Chip key={`p${i}`} onRemove={() => model.removePatternFilter(i)} testId="pattern-chip">
              {f.op === 'include' ? 'pattern' : 'not pattern'} &quot;{f.name}&quot;
            </Chip>
          ))}
          {fieldFilters.map((f, i) => (
            <Chip key={`f${i}`} onRemove={() => model.removeFieldFilter(i)} testId="field-chip">
              {f.key} {f.op} {f.value} (in message)
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
}

function AddFilter({ model }: { model: LogsExploration }) {
  const styles = useStyles2(getStyles);
  const { ctx } = model.useState();
  const [key, setKey] = useState<string | undefined>();
  const [op, setOp] = useState<LabelOp>('=');
  const [value, setValue] = useState<SelectableValue<string> | null>(null);
  if (!ctx) {
    return null;
  }
  const keys = [...ctx.labels, ...ctx.fields].map((k) => ({ label: k, value: k }));
  const loadValues = async (input: string) => {
    if (!key) {
      return [];
    }
    const frames = await runSqlOnce(
      labelValuesQuery(model.getSpec(), ctx, key, 200),
      sceneGraph.getTimeRange(model).state.value,
      'values',
      model.getSpec().datasource
    );
    const values = stringColumn(frames[0], 'v');
    const counts = stringColumn(frames[0], 'c');
    return values
      .map((v, i) => ({ label: v, value: v, description: `${counts[i]} lines` }))
      .filter((o) => input === '' || o.label.toLowerCase().includes(input.toLowerCase()));
  };
  const add = () => {
    if (key && value?.value !== undefined) {
      model.addFilter({ key, op, value: value.value });
      setValue(null);
    }
  };
  return (
    <span className={styles.add} data-testid="add-filter">
      <Select
        width={26}
        placeholder="Add filter: label"
        options={keys}
        value={key ?? null}
        onChange={(o) => {
          setKey(o.value);
          setValue(null);
        }}
        aria-label="Filter label"
      />
      <Select width={8} options={OPS} value={op} onChange={(o) => setOp(o.value!)} aria-label="Filter operator" />
      <AsyncSelect
        key={key ?? 'none'}
        width={32}
        placeholder="value"
        disabled={!key}
        defaultOptions={!!key}
        cacheOptions
        loadOptions={loadValues}
        allowCustomValue
        value={value}
        onChange={(o) => setValue(o)}
        aria-label="Filter value"
      />
      <Button size="sm" icon="plus" onClick={add} disabled={!key || !value} aria-label="Add filter">
        Add
      </Button>
    </span>
  );
}

function LineFilterInput({ model }: { model: LogsExploration }) {
  const styles = useStyles2(getStyles);
  const [text, setText] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [regex, setRegex] = useState(false);
  const add = (op: 'include' | 'exclude') => {
    if (text !== '') {
      model.addLineFilter({ op, value: text, caseSensitive, regex });
      setText('');
    }
  };
  return (
    <div className={styles.row}>
      <span className={styles.label}>Line</span>
      <Input
        width={50}
        placeholder="Search in log lines"
        value={text}
        onChange={(e) => setText(e.currentTarget.value)}
        onKeyDown={(e) => e.key === 'Enter' && add('include')}
        data-testid="line-filter-input"
        suffix={
          <span className={styles.toggles}>
            <ToolbarButton
              variant={caseSensitive ? 'active' : 'default'}
              tooltip="Match case"
              onClick={() => setCaseSensitive(!caseSensitive)}
              aria-label="Match case"
            >
              Aa
            </ToolbarButton>
            <ToolbarButton
              variant={regex ? 'active' : 'default'}
              tooltip="Regular expression"
              onClick={() => setRegex(!regex)}
              aria-label="Regex"
            >
              .*
            </ToolbarButton>
          </span>
        }
      />
      <Button size="sm" variant="secondary" onClick={() => add('include')} data-testid="line-include">
        Include
      </Button>
      <Button size="sm" variant="secondary" onClick={() => add('exclude')} data-testid="line-exclude">
        Exclude
      </Button>
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  wrapper: css({ display: 'flex', flexDirection: 'column', gap: theme.spacing(1) }),
  row: css({ display: 'flex', alignItems: 'center', gap: theme.spacing(1), flexWrap: 'wrap' }),
  label: css({ color: theme.colors.text.secondary, width: 52 }),
  add: css({ display: 'inline-flex', alignItems: 'center', gap: theme.spacing(0.5) }),
  level: css({ display: 'inline-flex', alignItems: 'center', gap: theme.spacing(0.5) }),
  toggles: css({ display: 'inline-flex', gap: 2 }),
});
