import '../scss/styles.scss';
import '../scss/toggle.scss';
import { BatteryDisplay, MainInfoDisplay } from './ui';
import { saveBLEData } from './database';


const batteryDisplay = new BatteryDisplay(14, 'battery-container');
const mainInfoDisplay = new MainInfoDisplay('main-info-container', uiCallback);
function uiCallback(data) { console.log('Data from UI:', data); }

const SERVICE_UUID = '0000ff00-0000-1000-8000-00805f9b34fb'; // UUID сервиса
const CHARACTERISTIC_RX_UUID = '0000ff01-0000-1000-8000-00805f9b34fb'; // UUID характеристики RX
const CHARACTERISTIC_TX_UUID = '0000ff02-0000-1000-8000-00805f9b34fb'; // UUID характеристики TX
const BMS_REQUEST_MAIN = new Uint8Array([0xDD, 0xA5, 0x03, 0x00, 0xFF, 0xFD, 0x77]);
const BMS_REQUEST_CELLS = new Uint8Array([0xDD, 0xA5, 0x4, 0x0, 0xFF, 0xFC, 0x77]);


document.addEventListener('myCustomEvent', (e) => { console.log('Получены данные:', e.detail); });

const bms_mosfet_write = [
  new Uint8Array([0xDD, 0x5A, 0xE1, 0x02, 0x00, 0x00, 0xFF, 0x1D, 0x77]), // All ON
  new Uint8Array([0xDD, 0x5A, 0xE1, 0x02, 0x00, 0x01, 0xFF, 0x1C, 0x77]), // discharge ON
  new Uint8Array([0xDD, 0x5A, 0xE1, 0x02, 0x00, 0x02, 0xFF, 0x1B, 0x77]), // charge ON
  new Uint8Array([0xDD, 0x5A, 0xE1, 0x02, 0x00, 0x03, 0xFF, 0x1A, 0x77]), // All OFF
];

const EEPROM = [
  new Uint8Array([0xdd, 0x5a, 0x00, 0x02, 0x56, 0x78, 0xff, 0x30, 0x77]), // Enter
  new Uint8Array([0xdd, 0x5a, 0x01, 0x02, 0x00, 0x00, 0xff, 0xfd, 0x77]), // Exit
  new Uint8Array([0xdd, 0x5a, 0x01, 0x02, 0x28, 0x28, 0xFF, 0xAD, 0x77]), // Exit with save
]

// const EEPROM_REGISTERS = new Uint8Array([0x2D, 0x2E, 0x10, 0x11, 0x12, 0x13, 0x14, 0x32, 0x33, 0x34, 0x35]);
const EEPROM_REGISTERS = new Uint8Array([0x2D, 0x2E]);

const BMSMain = {
  totalVoltage: 0, current: 0, residualCapacity: 0, nominalCapacity: 0, cycleLife: 0,
  productDate: 0, balanceStatus: 0, balanceStatusHight: 0, protectionStatus: 0, version: 0,
  RSOC: 0, FET: 0, numberOfCells: 0, numberOfTemperatureSensors: 0, temperature: [], bms_state: 0,
  power: 0,
};

const BMSCells = { cell: [], balancing: [] };

const BMS_MAX_DATA_CAPACITY = 1024; // Максимальный размер данных
const TIMEOUT_LENGTH = 15000;
let characteristic_tx = null;
let characteristic_rx = null;
let bmsDataReceived = new Uint8Array(BMS_MAX_DATA_CAPACITY); // Буфер для хранения данных
let bmsDataLengthReceived = 0; // Количество полученных байт
let bmsDataLengthExpected = 0; // Ожидаемое количество байт
let bmsDataError = false; // Флаг ошибки
let device = null; // Переменная для хранения подключенного устройства
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


const connectButton = document.getElementById('connectButton');
const output = document.getElementById('output');
const alert = document.getElementById('alert');
const batteryVoltageTestingRange = document.getElementById('batteryVoltageTestingRange');
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
    console.log(device);
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
    characteristic_rx.addEventListener('characteristicvaluechanged', (event) => {
      const data = new Uint8Array(event.target.value.buffer);
      notifyCallback(data);
    });


    if (device && device.gatt.connected) {
      output.textContent = `Setup complete.`;
      console.log('Device connected');
      isConnected = true;
      connectButton.querySelector('span').textContent = 'Disconnect';

      requestInterval = setInterval(async () => {
        requestBmsData(characteristic_tx, isMainRequest);
        isMainRequest = !isMainRequest;
      }, 2000);

    }

    device.addEventListener('gattserverdisconnected', onDisconnect);

    mainInfoDisplay.setCallback((data) => {
      eepromWrite(data, characteristic_tx);
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
        const verifiedData = addChecksumToCommand(uint8Array); // (!) Checksum is not needed now
        console.log('From Input:', [...verifiedData].map(b => b.toString(16)).join(' ').toLocaleUpperCase());
        await characteristic_tx.writeValue(verifiedData);
        // requestBmsData2(characteristic_tx, characteristic_rx, uint8Array).then((response) => { console.log(response); });
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

async function requestBmsData(characteristic_tx, isMainRequest) {
  try {
    if (isEEPROM) throw new Error('(!) You are in EEPROM mode');
    if (isMainRequest) {
      await characteristic_tx.writeValue(BMS_REQUEST_MAIN);
      lastCommand = BMS_REQUEST_MAIN[2];
      output.textContent = 'Main data request sent.';
    } else {
      await characteristic_tx.writeValue(BMS_REQUEST_CELLS);
      lastCommand = BMS_REQUEST_MAIN[2];
      output.textContent = 'Cell data request sent.';
    }
  } catch (error) {
    console.error('Error writing data:', error);
    output.textContent = `Error writing data: ${error.message}`;
  }
}

async function requestBmsData2(characteristic_tx, characteristic_rx, command) {
  if (isEEPROM) throw new Error('(!) Вы находитесь в режиме EEPROM');
  if (!command instanceof Uint8Array) throw new Error('(!) Команда должна быть непустым массивом');
  if (command[command.length - 1] !== 0x77) throw new Error('(!) Команда должна заканчиваться на 0x77');


  return new Promise((resolve, reject) => {
    characteristic_tx.writeValue(command);

    characteristic_rx.addEventListener('characteristicvaluechanged', (event) => {
      clearTimeout(timeoutId);
      const data = new Uint8Array(event.target.value.buffer);

      // notifyCallback(data, bmsDataReceive);
      // // notifyCallback(data);
      // if (data[0] === 0x77) {
      //   characteristic_rx.removeEventListener('characteristicvaluechanged', (event) => { });
      // }

      resolve(data);
    });

    const timeoutId = setTimeout(() => {
      // characteristic_rx.removeEventListener('characteristicvaluechanged', (event) => { });
      reject(new Error('Таймаут ожидания ответа'));
    }, 1000);

  });
}


function notifyCallback(data) {
  if (data.byteLength === 1 && data[0] === 0) {
    isTimeout = true;
    timeoutBtn.classList.remove('hidden');
    return;
  }

  isTimeout = false;
  timeoutBtn.classList.add('hidden');

  if (bmsDataError) {
    resetErrorBtn.classList.remove('hidden');
    output.textContent = `Error: ${bmsDataError}`;
    return;
  }

  if (bytesReceived === 0) {
    if (data[0] === 0xDD) {
      bmsDataError = [0x00, 0xE1].includes(data[2]) ? null : "Invalid header";
      expectedLength = data[3];

      if (!bmsDataError && data[2] !== 0xE1) {
        appendData(data);
      }
    }
  } else {
    appendData(data);
  }

  if (bmsDataError) {
    console.error(`Data error: 0x${data[2]?.toString(16)}, received ${bytesReceived}`);
    resetBuffer();
    return;
  }

  if (bytesReceived === expectedLength + 7) {
    if (validateChecksum()) {
      processData(bmsBuffer);
    } else {
      console.error(`Checksum mismatch: ${getChecksum()}`);
    }
    resetBuffer();
  }
}

// Helpers
function appendData(data) {
  const newBuffer = new Uint8Array(bytesReceived + data.length);
  newBuffer.set(bmsBuffer);
  newBuffer.set(data, bytesReceived);
  bmsBuffer = newBuffer;
  bytesReceived += data.length;
}

function validateChecksum() {
  const dataLength = bmsBuffer[3];
  let checksum = 0x10000;
  for (let i = 0; i <= dataLength; i++) checksum -= bmsBuffer[i + 3];
  checksum &= 0xFFFF;

  const received = (bmsBuffer[dataLength + 4] << 8) | bmsBuffer[dataLength + 5];
  return checksum === received;
}

function getChecksum() {
  const dataLength = bmsBuffer[3];
  return {
    received: (bmsBuffer[dataLength + 4] << 8) | bmsBuffer[dataLength + 5],
    calculated: (() => {
      let sum = 0x10000;
      for (let i = 0; i <= dataLength; i++) sum -= bmsBuffer[i + 3];
      return sum & 0xFFFF;
    })()
  };
}

function resetBuffer() {
  bmsBuffer = new Uint8Array(0);
  bytesReceived = 0;
}


function appendBmsPacket(data) {
  if (data.length + bmsDataLengthReceived >= BMS_MAX_DATA_CAPACITY) { return false; } // Превышен максимальный размер буфера
  for (let i = 0; i < data.length; i++) { bmsDataReceived[bmsDataLengthReceived++] = data[i]; }  // Добавляем данные в буфер
  return true;
}

function getIsChecksumValidForReceivedData(data) {
  const checksumIndex = data[3] + 4; // Индекс контрольной суммы
  const receivedChecksum = data[checksumIndex] * 256 + data[checksumIndex + 1]; // Полученная контрольная сумма
  const calculatedChecksum = getChecksumForReceivedData(data); // Вычисленная контрольная сумма
  return receivedChecksum === calculatedChecksum;
}

function getChecksumForReceivedData(data) {
  let checksum = 0x10000; // Начальное значение контрольной суммы
  const dataLengthProvided = data[3]; // Длина данных
  for (let i = 0; i < dataLengthProvided + 1; i++) { checksum -= data[i + 3]; } // Вычитаем каждый байт данных
  return checksum & 0xffff; // Возвращаем 16-битную контрольную сумму
}


function processData(data) {
  // console.log('Incoming data:',[...new Uint8Array(data)].map(b => b.toString(16)).join(' ').toLocaleUpperCase());
  // if (lastCommand === data[1]) console.log('Command much');
  console.log('BMS Data Received:', [...data]);

  if (data[1] === 0x00) {
    console.log('Enter EEPROM read');
    isEEPROM = true;

    let i = 0;
    const registerLength = EEPROM_REGISTERS.length
    let intervalId = setInterval(function () {
      if (i === registerLength - 1) {
        clearInterval(intervalId);
      }
      readEEPROM(characteristic_tx, EEPROM_REGISTERS[i]);
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


    mainInfoDisplay.update(BMSMain)

    saveBLEData({
      totalVoltage: BMSMain.totalVoltage,
      current: BMSMain.current,
      power: BMSMain.power,
      residualCapacity: BMSMain.residualCapacity,
      temperature: BMSMain.temperature,
    });
    // const customEvent = new CustomEvent('myCustomEvent', { detail: BMSMain });
    // document.dispatchEvent(customEvent);
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
    throw new Error('Invalid command type (second byte should be 0x5A or 0xA5)');
  }

  const minLength = isWriteCommand ? 5 : 4; // Для записи минимум 5 байт, для чтения - 4
  if (bytes.length < minLength) {
    throw new Error(`Command too short, expected at least ${minLength} bytes`);
  }

  let sum = 0;

  if (isWriteCommand) {
    // Для команд записи: суммируем все байты после заголовка (DD 5A)
    // Обычно это: регистр (1 байт) + длина (1 байт) + данные (N байт)
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
  result[bytes.length + 2] = 0x77; // Конечный байт

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

    case 0x12: // cap_100
    case 0x32: // cap_80
    case 0x33: // cap_60
    case 0x34: // cap_40
    case 0x35: // cap_20
    case 0x13: // cap_0
      result[registers[register]] = data * 0.01;  // Записываем по имени регистра
      break;

    default:
      result.value = data;
  }

  console.log('eepromRead result:', result);
  return result;
}


// function eepromWrite(data, characteristic_tx) {
//   if (!data) throw new Error('(!) data is empty');
//   if (!characteristic_tx) throw new Error('(!) characteristic_tx is empty');

//   let command = [0xDD, 0x5A];

//   const registers = {
//     func_config: 0x2D,
//     ntc_config: 0x2E,
//     cap_100: 0x12,
//     cap_80: 0x32,
//     cap_60: 0x33,
//     cap_40: 0x34,
//     cap_20: 0x35,
//     cap_0: 0x13
//   }

//   switch (Object.keys(data)[0]) {
//     case 'chargeMosfet':
//     case 'dischargeMosfet': {
//       const mosfetType = Object.keys(data)[0]; // 'chargeMosfet' или 'dischargeMosfet'
//       const newState = data[mosfetType]; // true/false - новое состояние

//       // Получаем текущие состояния
//       let currentCharge = (BMSMain.FET & 0x01) !== 0;
//       let currentDischarge = (BMSMain.FET & 0x02) !== 0;

//       // Обновляем нужное состояние
//       if (mosfetType === 'chargeMosfet') {
//         currentCharge = newState;
//       } else {
//         currentDischarge = newState;
//       }

//       // Определяем команду на основе комбинации состояний
//       let commandIndex;
//       if (currentCharge && currentDischarge) {
//         console.log('Both MOSFETs are ON');
//         commandIndex = 0;
//       } else if (!currentCharge && currentDischarge) {
//         console.log('Only Discharge MOSFET is ON');
//         commandIndex = 1;
//       } else if (currentCharge && !currentDischarge) {
//         console.log('Only Charge MOSFET is ON');
//         commandIndex = 2;
//       } else {
//         console.log('Both MOSFETs are OFF');
//         commandIndex = 3;
//       }

//       command = bms_mosfet_write[commandIndex];
//       break;
//     }

//     case 'eepromMode':
//       command = data.eepromMode ? EEPROM[0] : EEPROM[2];
//       console.log('Switch EEPROM mode:', command);
//       break;

//     case 'func_config': {
//       if (!isEEPROM) throw new Error('(!) You are NOT in EEPROM mode');
//       command.push(registers.func_config);
//       const bitOrder = [
//         'switch',         // Бит 0 (0x01)
//         'scrl',           // Бит 1 (0x02)
//         'balance_en',     // Бит 2 (0x04)
//         'chg_balance_en', // Бит 3 (0x08)
//         'led_en',         // Бит 4 (0x10)
//         'led_num'         // Бит 5 (0x20)
//       ];

//       let outputData = 0;
//       bitOrder.forEach((key, index) => {
//         if (data.func_config[key]) {
//           outputData |= (1 << index); // Устанавливаем бит в 1, если значение true
//         }
//       });

//       command.push(0x02, outputData, 0x0);
//       break;
//     }

//     case 'ntc_config': {
//       if (!isEEPROM) throw new Error('(!) You are NOT in EEPROM mode');
//       command.push(registers.ntc_config);

//       let outputData = 0;
//       for (let i = 0; i < 8; i++) {
//         const ntcKey = `ntc${i + 1}`;
//         if (data.ntc_config[ntcKey]) {
//           outputData |= (1 << i); // Устанавливаем бит, если NTC включен
//         }
//       }
//       command.push(0x02, outputData, 0x0);
//       break;
//     }

//     default:
//       console.log('Unknown command:', data);
//       return;
//   }


//   const array = Uint8Array.from(command);
//   console.log('Uint8Array.from(command): ', [...array].map(b => b.toString(16)).join(' ').toLocaleUpperCase());
//   const verifiedData = addChecksumToCommand(Uint8Array.from(command));
//   console.log('[WRITE] To EEPROM: ', [...new Uint8Array(verifiedData)].map(b => b.toString(16)).join(' ').toLocaleUpperCase());

//   try {
//     characteristic_tx.writeValue(verifiedData);
//     console.log('Successfully');
//   } catch (error) {
//     console.error('Error sending command:', error);
//   }
// }

async function eepromWrite(data, characteristic_tx) {
  if (!data) throw new Error('(!) data is empty');
  if (!characteristic_tx) throw new Error('(!) characteristic_tx is empty');

  let command = [0xDD, 0x5A];

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

  switch (dataKey) {
    case 'chargeMosfet':
    case 'dischargeMosfet': {
      const mosfetType = dataKey;
      const newState = data[mosfetType];

      // Получаем текущие состояния
      let currentCharge = (BMSMain.FET & 0x01) !== 0;
      let currentDischarge = (BMSMain.FET & 0x02) !== 0;

      // Обновляем нужное состояние
      if (mosfetType === 'chargeMosfet') {
        currentCharge = newState;
      } else {
        currentDischarge = newState;
      }

      // Определяем команду
      let commandIndex;
      if (currentCharge && currentDischarge) {
        console.log('Both MOSFETs are ON');
        commandIndex = 0;
      } else if (!currentCharge && currentDischarge) {
        console.log('Only Discharge MOSFET is ON');
        commandIndex = 1;
      } else if (currentCharge && !currentDischarge) {
        console.log('Only Charge MOSFET is ON');
        commandIndex = 2;
      } else {
        console.log('Both MOSFETs are OFF');
        commandIndex = 3;
      }

      command = bms_mosfet_write[commandIndex];
      break;
    }

    case 'eepromMode':
      if (typeof data.eepromMode !== 'boolean') {
        throw new Error('eepromMode must be boolean');
      }
      command = data.eepromMode ? EEPROM[0] : EEPROM[2];
      console.log('Switch EEPROM mode:', command);
      break;

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

      const writeCmd = addChecksumToCommand(new Uint8Array([0xDD, 0x5A, 0x2D, 0x02, (outputData >> 8) & 0xFF, outputData & 0xFF]));

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
        if (data.ntc_config[ntcKey]) {
          outputData |= (1 << i);
        }
      }

      command.push(0x02, (outputData >> 8) & 0xFF, outputData & 0xFF);
      break;
    }

    default:
      throw new Error(`Unknown command: ${dataKey}`);
  }

  const array = Uint8Array.from(command);
  console.log('Command bytes:', [...array].map(b => b.toString(16).padStart(2, '0')).join(' ').toUpperCase());

  try {
    const verifiedData = addChecksumToCommand(array);
    console.log('Verified data:', [...new Uint8Array(verifiedData)].map(b => b.toString(16).padStart(2, '0')).join(' ').toUpperCase());

    await characteristic_tx.writeValue(verifiedData);
    console.log('Command sent successfully');
  } catch (error) {
    console.error('Error sending command:', error);
    throw error;
  }
}


async function readEEPROM(characteristic_tx, register) {
  if (!isEEPROM) throw new Error('(!) You are NOT in EEPROM mode');
  if (typeof register !== 'number') throw new Error('(!) register must be a number');

  const command = new Uint8Array([0xDD, 0xA5, register, 0x00]);
  const commandWithChecksum = addChecksumToCommand(command);

  try {
    console.log('[Read] To EEPROM: ', [...commandWithChecksum].map(b => b.toString(16)).join(' ').toLocaleUpperCase());
    await characteristic_tx.writeValue(commandWithChecksum);

  } catch (error) {
    console.error('Error sending command:', error);
  }
}


