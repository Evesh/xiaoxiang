
export const SERVICE_UUID = '0000ff00-0000-1000-8000-00805f9b34fb'; // UUID
export const CHARACTERISTIC_RX_UUID = '0000ff01-0000-1000-8000-00805f9b34fb'; // UUID RX
export const CHARACTERISTIC_TX_UUID = '0000ff02-0000-1000-8000-00805f9b34fb'; // UUID  TX

export const bms_mosfet_write = [
  new Uint8Array([0xDD, 0x5A, 0xE1, 0x02, 0x00, 0x00, 0xFF, 0x1D, 0x77]), // All ON
  new Uint8Array([0xDD, 0x5A, 0xE1, 0x02, 0x00, 0x01, 0xFF, 0x1C, 0x77]), // discharge ON
  new Uint8Array([0xDD, 0x5A, 0xE1, 0x02, 0x00, 0x02, 0xFF, 0x1B, 0x77]), // charge ON
  new Uint8Array([0xDD, 0x5A, 0xE1, 0x02, 0x00, 0x03, 0xFF, 0x1A, 0x77]), // All OFF
];

export const EEPROM = [
  new Uint8Array([0xdd, 0x5a, 0x00, 0x02, 0x56, 0x78, 0xff, 0x30, 0x77]), // Enter
  new Uint8Array([0xdd, 0x5a, 0x01, 0x02, 0x00, 0x00, 0xff, 0xfd, 0x77]), // Exit
]

export const BMSMain = {
  totalVoltage: 0, current: 0, residualCapacity: 0, nominalCapacity: 0, cycleLife: 0,
  productDate: 0, balanceStatus: 0, balanceStatusHight: 0, protectionStatus: 0, version: 0,
  RSOC: 0, FET: 0, numberOfCells: 0, numberOfTemperatureSensors: 0, temperature: [], bms_state: 0,
  power: 0,
};

export const protectionStatusBits = {
  0: "Cell Block Over-Vol",
  1: "Cell Block Under-Vol",
  2: "Battery Over-Vol",
  3: "Battery Under-Vol",
  4: "Charging Over-temp",
  5: "Charging Low-temp",
  6: "Discharging Over-temp",
  7: "Discharging Low-temp",
  8: "Charging Over-current",
  9: "Discharging Over-current",
  10: "Short Circuit",
  11: "Fore-end IC Error",
  12: "Software Lock-in",
  13: "Reserve bit 13",
  14: "Reserve bit 14",
  15: "Reserve bit 15"
};

export const registers = {
  0x2D: 'func_config',
  0x2E: 'ntc_config',
  0x12: 'cap_100',
  0x32: 'cap_80',
  0x33: 'cap_60',
  0x34: 'cap_40',
  0x35: 'cap_20',
  0x13: 'cap_0',
  0x14: 'dsg_rate',
  0x10: 'design_cap',
  0x11: 'cycle_cap',
  0x17: 'cycle_cnt',
  0x18: 'chgot',
  0x19: 'chgot_rel',
  0x1A: 'chgut',
  0x1B: 'chgut_rel',
  0x1C: 'dsgot',
  0x1D: 'dsgot_rel',
  0x1E: 'dsgut',
  0x1F: 'dsgut_rel',
};