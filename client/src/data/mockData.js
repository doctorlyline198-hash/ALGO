export const sampleCandles = [
  { time: 1729982400, open: 4000, high: 4008, low: 3995, close: 4005 },
  { time: 1729982460, open: 4005, high: 4012, low: 4002, close: 4010 },
  { time: 1729982520, open: 4010, high: 4015, low: 4004, close: 4006 },
  { time: 1729982580, open: 4006, high: 4011, low: 4001, close: 4004 },
  { time: 1729982640, open: 4004, high: 4010, low: 3998, close: 4008 },
  { time: 1729982700, open: 4008, high: 4016, low: 4006, close: 4014 },
  { time: 1729982760, open: 4014, high: 4018, low: 4010, close: 4016 },
  { time: 1729982820, open: 4016, high: 4024, low: 4012, close: 4021 },
  { time: 1729982880, open: 4021, high: 4025, low: 4014, close: 4016 },
  { time: 1729982940, open: 4016, high: 4019, low: 4008, close: 4010 },
  { time: 1729983000, open: 4010, high: 4013, low: 4000, close: 4002 },
  { time: 1729983060, open: 4002, high: 4008, low: 3998, close: 4005 },
  { time: 1729983120, open: 4005, high: 4014, low: 4002, close: 4012 },
  { time: 1729983180, open: 4012, high: 4018, low: 4010, close: 4017 },
  { time: 1729983240, open: 4017, high: 4022, low: 4014, close: 4020 },
  { time: 1729983300, open: 4020, high: 4025, low: 4015, close: 4018 },
  { time: 1729983360, open: 4018, high: 4020, low: 4010, close: 4012 },
  { time: 1729983420, open: 4012, high: 4014, low: 4006, close: 4008 },
  { time: 1729983480, open: 4008, high: 4010, low: 4000, close: 4003 },
  { time: 1729983540, open: 4003, high: 4005, low: 3996, close: 3999 },
  { time: 1729983600, open: 3999, high: 4002, low: 3994, close: 3996 },
  { time: 1729983660, open: 3996, high: 4000, low: 3990, close: 3994 },
  { time: 1729983720, open: 3994, high: 3998, low: 3989, close: 3992 },
  { time: 1729983780, open: 3992, high: 3995, low: 3988, close: 3990 }
];

export const strategies = [
  { name: 'chill chill', timeframe: '10m', venue: 'MNQ', status: 'on' },
  { name: 'chill sdfasdchill', timeframe: '10m', venue: 'MNQ', status: 'off' },
  { name: 'exit policy mgc 1 minute', timeframe: '1m', venue: 'MGC', status: 'on' },
  { name: 'mean reversion', timeframe: '10m', venue: 'MES', status: 'on' },
  { name: 'momentum-rsma', timeframe: '30m', venue: 'MNQ', status: 'off' },
  { name: 'n1 scalper', timeframe: '10m', venue: 'ENQ', status: 'on' },
  { name: 'orb-ny-30min', timeframe: '30m', venue: 'MNQ', status: 'off' }
];

export const analytics = {
  realizedPnL: 135,
  avgDailyPnL: 135,
  maxDrawdown: 0,
  bestDaily: 135,
  worstDaily: 0,
  avgWin: 45,
  avgLoss: 0,
  sharpe: null,
  winRate: 100,
  trades: 3
};

export const accounts = [
  {
    id: '50KTC-V2-285j',
    balance: 49052.75,
    buyingPower: 100000,
    trailingMaxDrawdown: 0
  },
  {
    id: '50KTC-V2-285j-aux',
    balance: 135.0,
    buyingPower: 50000,
    trailingMaxDrawdown: 0
  }
];
