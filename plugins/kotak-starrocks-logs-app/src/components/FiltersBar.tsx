import { css } from '@emotion/css';
import { useState } from 'react';

import { GrafanaTheme2 } from '@grafana/data';
import { Button, Icon, Input, MultiSelect, ToolbarButton, useStyles2 } from '@grafana/ui';

import { LEVELS } from '../constants';
import type { LogsExploration } from './LogsExploration';
import { Chip } from './ui';

/**
 * Filters under the label filters on the logs page, like Logs Drilldown: "Log levels", line search, and
 * chips for line / pattern / message-field filters.
 */
export function DetailsHeader({ model }: { model: LogsExploration }) {
  const styles = useStyles2(getStyles);
  const { levels, lineFilters, patternFilters, fieldFilters } = model.useState();
  return (
    <div className={styles.wrapper}>
      <div className={styles.row}>
        <div className={styles.levels} data-testid="log-levels">
          <MultiSelect<string>
            aria-label="Log levels"
            placeholder="All levels"
            prefix={<Icon name="filter" />}
            options={LEVELS.map((l) => ({ label: l, value: l }))}
            value={levels}
            onChange={(opts) => model.setLevelsExact(opts.map((o) => o.value!).filter(Boolean))}
            isClearable
            width={36}
          />
        </div>
        <LineFilterInput model={model} />
      </div>
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
    <div className={styles.line}>
      <Input
        width={60}
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
  levels: css({ flex: '0 0 auto' }),
  line: css({ display: 'flex', alignItems: 'center', gap: theme.spacing(1), flex: '1 1 480px', minWidth: 0 }),
  toggles: css({ display: 'inline-flex', gap: 2 }),
});
