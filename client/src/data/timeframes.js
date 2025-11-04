export const TIMEFRAME_GROUPS = [
  {
    label: 'Seconds',
    options: ['1s', '5s', '15s', '30s']
  },
  {
    label: 'Minutes',
    options: ['1m', '3m', '5m', '15m', '30m']
  },
  {
    label: 'Hours',
    options: ['1h', '2h', '4h']
  },
  {
    label: 'Daily',
    options: ['1d']
  }
];

export const DEFAULT_TIMEFRAME = '1m';

export function flattenTimeframes(groups = TIMEFRAME_GROUPS) {
  return groups.flatMap((group) => group.options);
}
