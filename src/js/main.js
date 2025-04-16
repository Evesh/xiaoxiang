import '../scss/styles.scss';
import '../scss/toggle.scss';
import { BatteryDisplay, MainInfoDisplay } from './ui';
import { saveBLEData } from './database';
import { SERVICE_UUID, CHARACTERISTIC_RX_UUID, CHARACTERISTIC_TX_UUID, EEPROM_REGISTERS, BMSMain } from './variables';

const batteryDisplay = new BatteryDisplay(14, 'battery-container');
const mainInfoDisplay = new MainInfoDisplay('main-info-container', uiCallback);
function uiCallback(data) { console.log('Data from UI:', data); }

document.addEventListener('myCustomEvent', (e) => { console.log('Получены данные:', e.detail); });

// const EEPROM_REGISTERS = new Uint8Array([0x2D, 0x2E]);

const BMSCells = { cell: [], balancing: [] };
const BMS_MAX_DATA_CAPACITY = 1024; // Максимальный размер данных
const TIMEOUT_LENGTH = 15000;
let characteristic_tx = null;
let characteristic_rx = null;
let bmsDataLengthReceived = 0;
let bmsDataLengthExpected = 0;
let bmsDataError = false;
let device = null;
let requestInterval = null;
let isMainRequest = true;
let isEEPROM = false;
let isConnected = false;
let isDataReceived = false;
let isTimeout = false;
let timeoutId = null;
let lastCommand = 0x0;
let bmsBuffer = new Uint8Array(0);
let bytesReceived = 0;
let expectedLength = 0;
let isEEPROMChanged = false;

const connectButton = document.getElementById('connectButton');
const output = document.getElementById('output');
const batteryVoltageTestingRange = document.getElementById('batteryVoltageTestingRange');
const customRange3 = document.getElementById('customRange3');
const percentsTestingRange = document.getElementById('percentsTestingRange');
const resetErrorBtn = document.getElementById('resetErrorBtn');
const downloadButton = document.getElementById('downloadButton');
const timeoutBtn = document.getElementById('timeoutBtn');

downloadButton.addEventListener('click', () => {
  const data = JSON.parse(localStorage.getItem('bleDataCollection')) || [];
  if (!data.length) return console.log('Нет данных для скачивания');
  const textData = data.map(item => JSON.stringify(item)).join('\n');
  const blob = new Blob([textData], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'bms_data.txt';
  link.click();
  URL.revokeObjectURL(url);
})


batteryVoltageTestingRange.addEventListener('input', () => {
  const voltage = batteryVoltageTestingRange.value;
  console.log('Voltage:', voltage);
  const cell = generateRandomVoltages(14);
  const balancing = [1, 3, 5, 9, 13]
  console.log('Balancing:', balancing);
  batteryDisplay.update({ cell, balancing });
});

customRange3.addEventListener('input', () => {
  const voltage = customRange3.value;
  console.log('Voltage:', voltage);
  const cell = [voltage, voltage, voltage, voltage, voltage, voltage, voltage, voltage, voltage, voltage, voltage, voltage, voltage, voltage];
  const balancing = [1, 3, 5, 9, 13]
  console.log('Balancing:', balancing);
  batteryDisplay.update({ cell, balancing });
});

percentsTestingRange.addEventListener('input', () => {
  const RSOC = percentsTestingRange.value;
  mainInfoDisplay.update({
    totalVoltage: 0, current: 0, residualCapacity: 0,
    nominalCapacity: 0, cycleLife: 0, balanceStatus: 0,
    protectionStatus: 0, RSOC: parseInt(RSOC),
    FET: 0, numberOfCells: 0, numberOfTemperatureSensors: 0,
    temperature: [0, 0], bms_state: 0, power: 0
  });
});

resetErrorBtn.addEventListener('click', () => {
  bmsDataError = false;
  bmsDataLengthReceived = 0;
  bmsDataLengthExpected = 0;
  resetErrorBtn.classList.add('invisible');
  alert.classList.remove('show');
});


const disconnectDevice = async () => {
  if (device && device.gatt.connected) {
    await device.gatt.disconnect();
    console.log('Device disconnected:', device.name);
    output.textContent = 'Device disconnected.';
    device = null;
  }
};

window.addEventListener('beforeunload', (event) => {
  if (device && device.gatt.connected) {
    event.preventDefault();
    event.returnValue = '';
  }
  // disconnectDevice();
});
connectButton.addEventListener('click', async () => {
  connectButton.disabled = true;
  connectButton.querySelector('span').textContent = 'Connecting...';

  try {
    if (!navigator.bluetooth) {
      output.textContent = 'Web Bluetooth API is not supported in this browser.';
      throw new Error('Web Bluetooth API is not supported in this browser.');
    }

    if (device && device.gatt.connected) {
      await disconnectDevice();
      return;
    }

    output.textContent = `Requesting Bluetooth device...`;
    device = await navigator.bluetooth.requestDevice({
      optionalServices: [SERVICE_UUID],
      acceptAllDevices: true
    });

    if (!device) {
      output.textContent = 'No device selected.';
      throw new Error('No device selected.');
    }

    output.textContent = `Found device: ${device.name}`;
    const server = await device.gatt.connect();
    output.textContent = `Connected to device: ${device.name}`;

    output.textContent = `Getting primary service...`;
    const service = await server.getPrimaryService(SERVICE_UUID);
    output.textContent = `Service found:', ${service.uuid}`;

    output.textContent = `Getting characteristic TX...`;
    characteristic_tx = await service.getCharacteristic(CHARACTERISTIC_TX_UUID);
    output.textContent = `Characteristic TX found:', ${characteristic_tx.uuid}`;

    output.textContent = `Getting characteristic RX...`;

    characteristic_rx = await service.getCharacteristic(CHARACTERISTIC_RX_UUID);
    output.textContent = `Characteristic RX found:', ${characteristic_rx.uuid}`;

    output.textContent = `Starting notifications...`;
    await characteristic_rx.startNotifications();

    if (device && device.gatt.connected) {
      output.textContent = `Setup complete.`;
      console.log('Device connected');
      isConnected = true;
      connectButton.querySelector('span').textContent = 'Disconnect';

      const mainRequests = new Uint8Array([0x03, 0x04])
      const mainRequestsSize = mainRequests.length;
      let mainRequestsCount = 0;

      // console.log('Получены данные', [...new Uint8Array(data)].map(b => b.toString(16)).join(' ').toLocaleUpperCase());

      requestInterval = setInterval(async () => {
        if (isEEPROM) return;
        if (mainRequestsCount >= mainRequestsSize) mainRequestsCount = 0;
        requestData(characteristic_tx, characteristic_rx, { commadType: new Uint8Array([0xA5]), register: new Uint8Array([mainRequests[mainRequestsCount]]) }).
          then((data) => { processData(data); });
        mainRequestsCount++;
      }, 2000);

    }

    device.addEventListener('gattserverdisconnected', onDisconnect);

    mainInfoDisplay.setCallback((data) => {

      if (!isEEPROM) {
        const enterEEPROMCommand = eepromWrite({ eepromMode: true });
        console.log('Data to write (EEPROM):', [...new Uint8Array(enterEEPROMCommand)].map(b => b.toString(16)).join(' ').toLocaleUpperCase());
        requestData(characteristic_tx, characteristic_rx, { commadType: new Uint8Array([enterEEPROMCommand[0]]), register: new Uint8Array([enterEEPROMCommand[1]]), data: new Uint8Array(enterEEPROMCommand.slice(2)) })
          .then((dataToRead) => { processData(dataToRead); })
          .catch((error) => { console.error(error); return; });
      }

      const dataToWrite = eepromWrite(data);
      console.log('Data to write (EEPROM):', [...new Uint8Array(dataToWrite)].map(b => b.toString(16)).join(' ').toLocaleUpperCase());

      requestData(characteristic_tx, characteristic_rx, { commadType: new Uint8Array([dataToWrite[0]]), register: new Uint8Array([dataToWrite[1]]), data: new Uint8Array(dataToWrite.slice(2)) }).
        // requestData(characteristic_tx, characteristic_rx, { commadType: new Uint8Array([dataToWrite[0]]), register: new Uint8Array([dataToWrite[1]]), data: new Uint8Array(EEPROM_ENTER.slice(2)) }).
        then((dataToRead) => { processData(dataToRead); });

      if (isEEPROM) {
        const exitEEPROMCommand = eepromWrite({ eepromMode: false });
        console.log('Data to write (EEPROM):', [...new Uint8Array(exitEEPROMCommand)].map(b => b.toString(16)).join(' ').toLocaleUpperCase());
        requestData(characteristic_tx, characteristic_rx, { commadType: new Uint8Array([exitEEPROMCommand[0]]), register: new Uint8Array([exitEEPROMCommand[1]]), data: new Uint8Array(exitEEPROMCommand.slice(2)) })
          .then((dataToRead) => { processData(dataToRead); })
          .catch((error) => { console.error(error); return; });
      }
    });


    function onDisconnect() {
      console.log('Device disconnected');
      isConnected = false;
      connectButton.querySelector('span').textContent = 'Connect';
      mainInfoDisplay.reset();
      clearInterval(requestInterval);
    }

    document.getElementById('button-addon2').addEventListener('click', async () => {
      if (!device && device.gatt.connected) { output.textContent = 'Not connected to device.'; return; }
      const inputValue = document.getElementById('commandInput').value;
      const uint8Array = hexStringToUint8Array(inputValue);
      try {

        requestData(characteristic_tx, characteristic_rx, { commadType: new Uint8Array([uint8Array[1]]), register: new Uint8Array([uint8Array[2]]), data: new Uint8Array(uint8Array.slice(3)) }).
          then((data) => { processData(data); });


      } catch (error) {
        console.error('Error writing data:', error);
        output.textContent = `Error writing data: ${error.message}`;
      }
    });


  } catch (error) {
    output.textContent = `Error: ${error.message}`;
    console.error('Error connecting to device:', error, error.message);
  } finally {
    connectButton.disabled = false;
  }
});


async function requestData(characteristic_tx, characteristic_rx, { commadType, register, data = null }) {
  // if (isEEPROM) console.warn('EEPROM Mode Enabled');
  if (!(commadType instanceof Uint8Array)) throw new Error('(!) Command type must be a Uint8Array');
  if (!(register instanceof Uint8Array)) throw new Error('(!) Register must be a Uint8Array');
  if (data !== null && !(data instanceof Uint8Array)) throw new Error('(!) Data must be a Uint8Array');
  if (data === null) data = new Uint8Array([0x0]);
  let start = null;


  return new Promise((resolve, reject) => {
    let receivedData = new Uint8Array(0);
    let timeoutId;

    const handleNotification = (event) => {
      const newData = new Uint8Array(event.target.value.buffer);
      receivedData = concatenateUint8Arrays(receivedData, newData);

      if (receivedData[receivedData.length - 1] === 0x77) {

        const end = new Date().getTime();
        const time = end - start;
        console.log('Время выполнения:' + time);

        cleanup();
        resolve(receivedData);
      }
    };

    const cleanup = () => {
      characteristic_rx.removeEventListener('characteristicvaluechanged', handleNotification);
      clearTimeout(timeoutId);
    };

    timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error('Таймаут ожидания ответа'));
    }, 2000);

    characteristic_rx.addEventListener('characteristicvaluechanged', handleNotification);
    const command = addChecksumToCommand(new Uint8Array([0xDD, ...commadType, ...register, ...data]));
    console.log('Sending command: ', [...new Uint8Array(command)].map(b => b.toString(16)).join(' ').toUpperCase());
    start = new Date().getTime();
    characteristic_tx.writeValue(command)
      .catch(err => {
        cleanup();
        reject(err);
      });
  });
}

function concatenateUint8Arrays(a, b) {
  const result = new Uint8Array(a.length + b.length);
  result.set(a);
  result.set(b, a.length);
  return result;
}

function processData(data) {
  // console.log('Incoming data:',[...new Uint8Array(data)].map(b => b.toString(16)).join(' ').toLocaleUpperCase());
  // if (lastCommand === data[1]) console.log('Command much');

  if (data[1] === 0x00) {
    console.log('Enter EEPROM read');
    isEEPROM = true;

    let i = 0;
    const registerLength = EEPROM_REGISTERS.length
    let intervalId = setInterval(function () {
      if (i === registerLength - 1) { clearInterval(intervalId); }
      requestData(characteristic_tx, characteristic_rx, { commadType: new Uint8Array([0xA5]), register: new Uint8Array([EEPROM_REGISTERS[i]]) }).then((data) => { processData(data); });
      i++;
    }, 200);

    return;
  }

  if (data[1] === 0x01) {
    console.log('Exit EEPROM read');
    isEEPROM = false;
    return;
  }

  if (isEEPROM) {
    const result = eepromRead(data);
    if (!result) return;
    mainInfoDisplay.updateEEPROM(result);
    return;
  }

  if (data[1] === 0x03) {
    BMSMain.totalVoltage = parseFloat((((data[4] << 8) | data[5]) * 0.01).toFixed(3));
    const rawValueСurrent = (data[6] << 8) | data[7];
    const current = (rawValueСurrent > 32767 ? rawValueСurrent - 65536 : rawValueСurrent) * 0.01;
    BMSMain.current = parseFloat(current.toFixed(2));
    BMSMain.residualCapacity = parseFloat((((data[8] << 8) | data[9]) * 0.01).toFixed(3));
    BMSMain.nominalCapacity = ((data[10] << 8) | data[11]) * 0.01;
    BMSMain.cycleLife = (data[12] << 8) | data[13];
    BMSMain.productDate = parseBmsDate(((data[14] << 8) | data[15]));
    BMSMain.balanceStatus = (data[16] << 8) | data[17];
    BMSMain.balanceStatusHight = (data[18] << 8) | data[19];
    BMSMain.protectionStatus = (data[20] << 8) | data[21];
    BMSMain.version = data[22];
    BMSMain.RSOC = data[23];
    BMSMain.FET = data[24];
    BMSMain.numberOfCells = data[25];
    BMSMain.numberOfTemperatureSensors = data[26];
    const protection = getProtectionStatusText(BMSMain.protectionStatus);

    for (let i = 0; i < BMSMain.numberOfTemperatureSensors; i++) {
      const tempValue = (data[27 + i * 2] << 8) | data[28 + i * 2];
      BMSMain.temperature[i] = parseFloat(((tempValue - 2731) * 0.1).toFixed(1));
    }

    let power = 0;
    if (BMSMain.current > 0.1) {
      BMSMain.bms_state = 1; // Зарядка
      power = BMSMain.current * BMSMain.totalVoltage;
    } else if (BMSMain.current < 0) {
      BMSMain.bms_state = 2; // Разрядка
      power = Math.abs(BMSMain.current) * BMSMain.totalVoltage;
    } else {
      BMSMain.bms_state = 0; // Бездействие
      power = BMSMain.current * BMSMain.totalVoltage;
    }

    BMSMain.power = parseFloat(power.toFixed(2));

    console.log('BMSMain:', BMSMain);
    mainInfoDisplay.update(BMSMain)

    saveBLEData({
      totalVoltage: BMSMain.totalVoltage,
      current: BMSMain.current,
      power: BMSMain.power,
      residualCapacity: BMSMain.residualCapacity,
      temperature: BMSMain.temperature,
    });
  }

  if (data[1] === 0x04) {
    const bmsNumberOfCells = data[3] / 2;
    for (let i = 0; i < bmsNumberOfCells; i++) {
      const millivolts = (data[4 + 2 * i] << 8) | data[5 + 2 * i];
      BMSCells.cell[i] = (millivolts / 1000.0).toFixed(3);
    }

    const balancing = BMSMain.balanceStatus;
    BMSCells.balancing = [];

    if (balancing > 0) {
      for (let i = 0; i < bmsNumberOfCells; i++) {
        if ((balancing >> i) & 1 === 1) {
          BMSCells.balancing.push(i);
        }
      }
    }
    batteryDisplay.update(BMSCells);
  }

  if (data[1] === 0x05) {
    console.log('Starts with 0x05');
  }
}


function getProtectionStatusText(protectionStatus) {
  const statusBits = {
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

  let activeProtections = [];

  // Проверяем каждый бит (0-15)
  for (let i = 0; i < 16; i++) {
    if (protectionStatus & (1 << i)) {
      activeProtections.push(statusBits[i]);
    }
  }

  return activeProtections.length > 0
    ? activeProtections.join(", ")
    : "No active protections";
}

function parseBmsDate(dateValue) {
  // Извлекаем день (первые 5 бит)
  const day = dateValue & 0x1F;

  // Извлекаем месяц (биты 5-8)
  const month = (dateValue >>> 5) & 0x0F;

  // Извлекаем год (биты 9-15)
  const year = 2000 + (dateValue >>> 9);

  return {
    year: year,
    month: month,
    day: day,
    formatted: `${day.toString().padStart(2, '0')}.${month.toString().padStart(2, '0')}.${year}`
  };
}

const generateRandomVoltages = (nums) => {
  const voltages = [];
  for (let i = 0; i < nums; i++) {
    const voltage = 3 + Math.random();
    const roundedVoltage = Math.round(voltage * 1000) / 1000;
    voltages.push(roundedVoltage);
  }
  return voltages;
};

function hexStringToUint8Array(str) {
  const hexValues = str.split(',').map(s => s.trim());
  const numbers = hexValues.map(hex => { return parseInt(hex.replace('0x', ''), 16); });
  return new Uint8Array(numbers);
}

function addChecksumToCommand(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    throw new Error('Input must be a Uint8Array');
  }
  if (bytes.length === 0) {
    throw new Error('Command is empty');
  }

  const isWriteCommand = bytes[1] === 0x5A; // 0x5A - запись, 0xA5 - чтение
  const isReadCommand = bytes[1] === 0xA5;

  if (!isWriteCommand && !isReadCommand) {
    throw new Error('Invalid command type (second byte should be 0x5A or 0xA5). Got: ' + bytes[1].toString(16));
  }

  // const minLength = isWriteCommand ? 5 : 4; // Для записи минимум 5 байт, для чтения - 4
  // if (bytes.length < minLength) {
  //   throw new Error(`Command too short, expected at least ${minLength} bytes`);
  // }

  let sum = 0;

  if (isWriteCommand) {
    // Для команд записи: суммируем все байты после заголовка (DD 5A)
    // регистр (1 байт) + длина (1 байт) + данные (N байт)
    for (let i = 2; i < bytes.length; i++) {
      sum += bytes[i];
    }
  } else {
    // Для команд чтения: суммируем только регистр и длину (2 байта)
    sum = bytes[2] + bytes[3];
  }

  // Вычисляем 16-битную контрольную сумму
  sum = sum & 0xFFFF; // Обеспечиваем 16-битное значение
  const checksum = (0x10000 - sum) & 0xFFFF; // Дополнение до 0x10000

  // Разделяем контрольную сумму на старший и младший байты
  const chkHigh = (checksum >> 8) & 0xFF;
  const chkLow = checksum & 0xFF;

  // Создаем новый массив с добавлением контрольной суммы и конечного байта
  const result = new Uint8Array(bytes.length + 3);
  result.set(bytes, 0); // Копируем исходную команду
  result[bytes.length] = chkHigh;
  result[bytes.length + 1] = chkLow;
  result[bytes.length + 2] = 0x77;

  return result;
}


function eepromRead(response) {
  if (!(response instanceof Uint8Array)) throw new Error('Invalid response type');
  if (response.length < 7 || response[0] !== 0xDD) throw new Error('Invalid response format');

  const register = response[1];
  if (register === 0x00 || register === 0x01) return;

  const status = response[2];
  if (status !== 0x00) throw new Error(`BMS error: 0x${status.toString(16).padStart(2, '0')}`);

  const dataLength = response[3];
  if (dataLength === 0) return;

  // big-endian
  let data = 0;
  for (let i = 0; i < dataLength; i++) {
    data = (data << 8) | response[4 + i];
  }

  const registers = {
    0x2D: 'func_config',
    0x2E: 'ntc_config',
    0x12: 'cap_100',
    0x32: 'cap_80',
    0x33: 'cap_60',
    0x34: 'cap_40',
    0x35: 'cap_20',
    0x13: 'cap_0',
    0x10: 'design_cap',
    0x11: 'cycle_cap',
    0x17: 'cycle_cnt',
  };

  const result = { register: registers[register] };

  switch (register) {
    case 0x2D:
      result.switch = !!(data & 0x01);
      result.scrl = !!((data >> 1) & 0x01);
      result.balance_en = !!((data >> 2) & 0x01);
      result.chg_balance_en = !!((data >> 3) & 0x01);
      result.led_en = !!((data >> 4) & 0x01);
      result.led_num = !!((data >> 5) & 0x01);
      break;

    case 0x2E:
      for (let i = 0; i < 8; i++) {
        result[`ntc${i + 1}`] = !!((data >> i) & 0x01);
      }
      break;

    case 0x10: // design_cap
    case 0x11: // cycle_cap
      result[registers[register]] = data * 0.01;  // Записываем по имени регистра
      break;

    case 0x17: // cycle_cnt
      result[registers[register]] = data;
      break;

    case 0x12: // cap_100
    case 0x32: // cap_80
    case 0x33: // cap_60
    case 0x34: // cap_40
    case 0x35: // cap_20
    case 0x13: // cap_0
      result[registers[register]] = data * 0.001;
      break;

    default:
      result.value = data;
  }
  return result;
}


function eepromWrite(data) {
  if (!data) throw new Error('(!) data is empty');

  let command = [0x5A];

  const EEPROM_ENTER = [0x00, 0x02, 0x56, 0x78];
  const EEPROM_EXIT_WITH_SAVE = [0x01, 0x02, 0x28, 0x28];
  const EEPROM_EXIT_WITHOUT_SAVE = [0x01, 0x02, 0x00, 0x00];

  const registers = {
    func_config: 0x2D,
    ntc_config: 0x2E,
    cap_100: 0x12,
    cap_80: 0x32,
    cap_60: 0x33,
    cap_40: 0x34,
    cap_20: 0x35,
    cap_0: 0x13
  };

  const dataKey = Object.keys(data)[0];
  const dataValue = Object.values(data)[0];

  // 0xDD, 0x5A, 0xE1, 0x2, 0x0, 0x3 ALL OFF
  // 0xDD, 0x5A, 0xE1, 0x2, 0x0, 0x2 CHARGE ON
  // 0xDD, 0x5A, 0xE1, 0x2, 0x0, 0x1 DISCARGE ON
  // 0xDD, 0x5A, 0xE1, 0x2, 0x0, 0x0 ALL ON

  switch (dataKey) {

    case 'chargeMosfet': {
      console.log('Switching chargeMosfet:', dataValue);
      const currentDischargeState = (BMSMain.FET & 0x01) === 1;
      const newChargeState = dataValue ? 0x00 : 0x1;
      const finalState = newChargeState | (currentDischargeState << 1);
      command.push(0xE1, 0x02, 0x00, finalState);
      break;
    }

    case 'dischargeMosfet': {
      console.log('Switching dischargeMosfet:', dataValue);
      const currentChargeState = (BMSMain.FET & 0x02) === 2;
      const newDischargeState = dataValue ? 0x0 : 0x1;
      const finalState = currentChargeState | (newDischargeState << 1);
      command.push(0xE1, 0x02, 0x00, finalState);
      break;
    }

    case 'eepromMode': {

      if (typeof data.eepromMode !== 'boolean') {
        throw new Error('eepromMode must be boolean');
      }

      if (data.eepromMode) { command.push(...EEPROM_ENTER); }
      else {
        if (isEEPROMChanged) {
          command.push(...EEPROM_EXIT_WITH_SAVE);
        } else {
          command.push(...EEPROM_EXIT_WITHOUT_SAVE);
        }
      }

      console.log('Switch EEPROM mode:', command);
      break;
    }

    case 'func_config': {
      if (!isEEPROM) throw new Error('(!) You are NOT in EEPROM mode');
      if (!data.func_config || typeof data.func_config !== 'object') {
        throw new Error('func_config data is invalid');
      }

      command.push(registers.func_config);
      const bitOrder = [
        'switch',         // Бит 0 (0x01)
        'scrl',           // Бит 1 (0x02)
        'balance_en',     // Бит 2 (0x04)
        'chg_balance_en', // Бит 3 (0x08)
        'led_en',         // Бит 4 (0x10)
        'led_num'         // Бит 5 (0x20)
      ];

      let outputData = 0;
      bitOrder.forEach((key, index) => {
        if (data.func_config[key]) {
          outputData |= (1 << index);
        }
      });

      command.push(0x02, (outputData >> 8) & 0xFF, outputData & 0xFF);
      break;
    }

    case 'ntc_config': {
      if (!isEEPROM) throw new Error('(!) You are NOT in EEPROM mode');
      if (!data.ntc_config || typeof data.ntc_config !== 'object') {
        throw new Error('ntc_config data is invalid');
      }

      command.push(registers.ntc_config);
      let outputData = 0;

      for (let i = 0; i < 8; i++) {
        const ntcKey = `ntc${i + 1}`;
        if (data.ntc_config[ntcKey]) { outputData |= (1 << i); }
      }

      command.push(0x02, (outputData >> 8) & 0xFF, outputData & 0xFF);
      break;
    }

    default:
      throw new Error(`Unknown command: ${dataKey}`);
  }

  return Uint8Array.from(command);;

}

