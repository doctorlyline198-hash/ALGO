const DEFAULT_PROFILE = {
  symbol: 'DEFAULT',
  headShoulderDiffMin: 0.003,
  headShoulderDiffMax: 0.007,
  headShoulderVolumeMultiplier: 1.1,
  doubleTopTolerance: 0.003,
  doubleBottomTolerance: 0.003,
  triangleFlatTolerance: 0.002,
  triangleRisingThreshold: 0.0005,
  triangleFallingThreshold: 0.0005,
  flagImpulseAtrMultiple: 2,
  flagImpulseWindow: 5,
  flagPullbackDepthMin: 0.3,
  flagPullbackDepthMax: 0.55,
  cupMinBars: 20,
  cupHandleRetraceMax: 0.3,
  volumeSpikeMultiplier: 1.5
};

const NQ_PROFILE = {
  ...DEFAULT_PROFILE,
  symbol: 'NQ',
  headShoulderDiffMin: 0.003,
  headShoulderDiffMax: 0.005,
  doubleTopTolerance: 0.0025,
  doubleBottomTolerance: 0.0025,
  triangleFlatTolerance: 0.0015,
  triangleRisingThreshold: 0.0007,
  triangleFallingThreshold: 0.0007,
  flagImpulseAtrMultiple: 2.1,
  volumeSpikeMultiplier: 1.6
};

const GC_PROFILE = {
  ...DEFAULT_PROFILE,
  symbol: 'GC',
  headShoulderDiffMin: 0.002,
  headShoulderDiffMax: 0.004,
  doubleTopTolerance: 0.0015,
  doubleBottomTolerance: 0.0015,
  triangleFlatTolerance: 0.001,
  triangleRisingThreshold: 0.0005,
  triangleFallingThreshold: 0.0005,
  flagImpulseAtrMultiple: 1.9,
  volumeSpikeMultiplier: 1.5
};

export function resolveSymbolProfile(contractLike) {
  const code = extractCode(contractLike);
  if (code.startsWith('MNQ') || code.startsWith('NQ')) {
    return NQ_PROFILE;
  }
  if (code.startsWith('MGC') || code.startsWith('GC')) {
    return GC_PROFILE;
  }
  return DEFAULT_PROFILE;
}

function extractCode(contractLike) {
  if (!contractLike) {
    return '';
  }
  if (typeof contractLike === 'string') {
    return contractLike.toUpperCase();
  }
  const code = contractLike.code || contractLike.symbol || contractLike.symbolId || contractLike.contractCode;
  if (code) {
    return String(code).toUpperCase();
  }
  return '';
}
