export const CONTRACTS = [
  {
    code: 'MGCZ5',
    id: 'CON.F.US.MGC.Z25',
    name: 'Micro Gold: December 2025',
    symbolId: 'F.US.MGC',
    tickSize: 0.1,
    tickValue: 1
  },
  {
    code: 'MNQZ5',
    id: 'CON.F.US.MNQ.Z25',
    name: 'Micro E-mini Nasdaq-100: December 2025',
    symbolId: 'F.US.MNQ',
    tickSize: 0.25,
    tickValue: 0.5
  },
  {
    code: 'NQZ5',
    id: 'CON.F.US.ENQ.Z25',
    name: 'E-mini Nasdaq-100: December 2025',
    symbolId: 'F.US.ENQ',
    tickSize: 0.25,
    tickValue: 5
  },
  {
    code: 'GCZ5',
    id: 'CON.F.US.GCE.Z25',
    name: 'Gold: December 2025',
    symbolId: 'F.US.GCE',
    tickSize: 0.1,
    tickValue: 10
  },
  {
    code: '6BZ5',
    id: 'CON.F.US.BP6.Z25',
    name: 'British Pound (Globex): December 2025',
    symbolId: 'F.US.BP6',
    tickSize: 0.0001,
    tickValue: 6.25
  },
  {
    code: '6CZ5',
    id: 'CON.F.US.CA6.Z25',
    name: 'Canadian Dollar (Globex): December 2025',
    symbolId: 'F.US.CA6',
    tickSize: 0.00005,
    tickValue: 5
  },
  {
    code: 'CLZ5',
    id: 'CON.F.US.CLE.Z25',
    name: 'Crude Light (Globex): December 2025',
    symbolId: 'F.US.CLE',
    tickSize: 0.01,
    tickValue: 10
  },
  {
    code: 'HGZ5',
    id: 'CON.F.US.CPE.Z25',
    name: 'Copper (Globex): December 2025',
    symbolId: 'F.US.CPE',
    tickSize: 0.0005,
    tickValue: 12.5
  }
];

export function resolveContract(value) {
  if (!value) return null;
  const match = CONTRACTS.find((contract) => contract.code === value || contract.id === value || contract.symbolId === value);
  if (match) {
    return { ...match };
  }
  return {
    code: value,
    id: value,
    name: value,
    symbolId: value
  };
}

export function resolveContractId(value) {
  return resolveContract(value)?.id;
}

export function resolveContractCode(value) {
  return resolveContract(value)?.code;
}
