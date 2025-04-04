import '../scss/styles.scss';
import '../scss/toggle.scss';
import * as bootstrap from 'bootstrap';
import { BatteryDisplay, MainInfoDisplay } from './ui';
import { BMS } from './bms';

import {
  SERVICE_UUID, CHARACTERISTIC_TX_UUID, CHARACTERISTIC_RX_UUID, BMS_REQUEST_MAIN, BMS_REQUEST_CELLS,
  bms_mosfet_write, EEPROM
} from './variables';

const batteryDisplay = new BatteryDisplay(14, 'battery-container');
const mainInfoDisplay = new MainInfoDisplay('main-info-container', uiCallback);
function uiCallback(data) { console.log('Data from UI:', data); }

const d1 = new Uint8Array([0xDD, 0xA5, 0x2D, 0x00, 0xFF, 0xD3, 0x77]);
const d2 = new Uint8Array([0xdd, 0xa5, 0x2e, 0x00, 0xff, 0xd2, 0x77]);

const EEPROM_commands = new Uint8Array([0x10, 0x11, 0x12, 0x13, 0x14, 0x32, 0x33, 0x34, 0x35]);

const BMSMain = {
  totalVoltage: 0, current: 0, residualCapacity: 0, nominalCapacity: 0, cycleLife: 0,
  productDate: 0, balanceStatus: 0, balanceStatusHight: 0, protection: 0, protectionStatus: "", version: 0,
  RSOC: 0, FET: 0, numberOfCells: 0, numberOfTemperatureSensors: 0, temperature: [], bms_state: 0, power: 0,
};

const BMSCells = { cell: [], balancing: [] };

const RESPONSE_TIMEOUT = 3000;
const BMS_MAX_DATA_CAPACITY = 1024; // Максимальный размер данных
let bmsDataReceived = new Uint8Array(BMS_MAX_DATA_CAPACITY); // Буфер для хранения данных
let bmsDataLengthReceived = 0; // Количество полученных байт
let bmsDataLengthExpected = 0; // Ожидаемое количество байт
let bmsDataError = false; // Флаг ошибки
let device = null; // Переменная для хранения подключенного устройства
let requestInterval = null;
let isMainRequest = true;
let isEEPROM = false;
let isDataReceived = false;
// Глобальные переменные состояния (можно вынести в класс)
let bmsData = { buffer: new Uint8Array(BMS_MAX_DATA_CAPACITY), length: 0, expected: 0, error: false };


const connectButton = document.getElementById('connectButton');
const connectionStatus = document.getElementById('connection-status');
const progressBar = connectionStatus.querySelector('.progress-bar');
const output = connectionStatus.querySelector('span');
const alert = document.getElementById('alert');
const batteryVoltageTestingRange = document.getElementById('batteryVoltageTestingRange');
const percentsTestingRange = document.getElementById('percentsTestingRange');
const autoUpdateBtn = document.getElementById('autoUpdateBtn');
const resetErrorBtn = document.getElementById('resetErrorBtn');

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
    protectionStatus: "", protection: 0, RSOC: parseInt(RSOC),
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
    progressBar.style.width = '0%';
    device = null;
  }
};

window.addEventListener('beforeunload', disconnectDevice);

connectButton.addEventListener('click', async () => {
  connectButton.disabled = true;

  try {
    if (!navigator.bluetooth) {
      output.textContent = 'Web Bluetooth API is not supported in this browser.';
      throw new Error('Web Bluetooth API is not supported in this browser.');
    }

    if (device && device.gatt.connected) {
      console.log('Уже подключено');
      await disconnectDevice();
      return;
    }

    output.textContent = `Requesting Bluetooth device...`;
    progressBar.style.width = '5%';
    device = await navigator.bluetooth.requestDevice({
      optionalServices: [SERVICE_UUID],
      acceptAllDevices: true
    });

    if (!device) {
      output.textContent = 'No device selected.';
      throw new Error('No device selected.');
    }

    output.textContent = `Found device: ${device.name}`;
    progressBar.style.width = '10%';
    const server = await device.gatt.connect();
    output.textContent = `Connected to device: ${device.name}`;

    // Получаем сервис по UUID
    output.textContent = `Getting primary service...`;
    progressBar.style.width = '15%';
    const service = await server.getPrimaryService(SERVICE_UUID);
    output.textContent = `Service found:', ${service.uuid}`;
    progressBar.style.width = '16%';

    // Получаем характеристику TX по UUID
    output.textContent = `Getting characteristic TX...`;
    progressBar.style.width = '17%';
    const characteristic_tx = await service.getCharacteristic(CHARACTERISTIC_TX_UUID);
    output.textContent = `Characteristic TX found:', ${characteristic_tx.uuid}`;
    progressBar.style.width = '18%';

    // Получаем характеристику RX по UUID
    output.textContent = `Getting characteristic RX...`;
    progressBar.style.width = '19%';
    const characteristic_rx = await service.getCharacteristic(CHARACTERISTIC_RX_UUID);
    output.textContent = `Characteristic RX found:', ${characteristic_rx.uuid}`;
    progressBar.style.width = '20%';

    // Подписываемся на уведомления
    output.textContent = `Starting notifications...`;
    progressBar.style.width = '25%';
    await characteristic_rx.startNotifications();

    if (device && device.gatt.connected) {
      output.textContent = `Setup complete.`;
      progressBar.style.width = '100%';
      connectButton.textContent = 'Disconnect';
    }


    device.addEventListener('gattserverdisconnected', () => {
      console.log('Device disconnected!!!.');
      connectButton.textContent = 'Connect';
      mainInfoDisplay.reset();
      clearInterval(requestInterval);
    });

    mainInfoDisplay.setCallback(function (data) {
      let command = null;
      switch (Object.keys(data)[0]) {
        case 'chargeMosfet':
        case 'dischargeMosfet': {
          const mosfetType = Object.keys(data)[0]; // 'chargeMosfet' или 'dischargeMosfet'
          const newState = data[mosfetType]; // true/false - новое состояние

          // Получаем текущие состояния
          let currentCharge = (BMSMain.FET & 0x01) !== 0;
          let currentDischarge = (BMSMain.FET & 0x02) !== 0;

          // Обновляем нужное состояние
          if (mosfetType === 'chargeMosfet') {
            currentCharge = newState;
          } else {
            currentDischarge = newState;
          }

          // Определяем команду на основе комбинации состояний
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
          command = data.eepromMode ? EEPROM[0] : EEPROM[1];
          console.log('Switch EEPROM mode:', command);
          break;
      }

      console.log('Sending command: ', [...new Uint8Array(command)].map(b => b.toString(16)).join(' 0x'));
      characteristic_tx.writeValue(command)
        .then(() => {
          console.log('Command sent successfully:', command);
        })
        .catch(error => {
          console.error('Error sending command:', error);
        });

    });

    document.getElementById('button-addon2').addEventListener('click', async () => {
      if (!device && device.gatt.connected) { output.textContent = 'Not connected to device.'; return; }
      const inputValue = document.getElementById('commandInput').value;
      const uint8Array = hexStringToUint8Array(inputValue);
      try {
        const verifiedData = addChecksumToCommand(uint8Array); // (!) Checksum is not needed now
        console.log('Sending data:', verifiedData);
        // await characteristic_tx.writeValue(verifiedData);
        await requestBmsData(characteristic_tx, characteristic_rx, verifiedData);
      } catch (error) {
        console.error('Error writing data:', error);
        output.textContent = `Error writing data: ${error.message}`;
      }
    });


    autoUpdateBtn.addEventListener('click', async (e) => {
      if (autoUpdateBtn.textContent === 'Stop') {
        clearInterval(requestInterval);
        autoUpdateBtn.textContent = 'Start';
      } else {
        requestInterval = setInterval(async () => {
          requestBmsData(characteristic_tx, characteristic_rx, isMainRequest ? BMS_REQUEST_MAIN : BMS_REQUEST_CELLS).then((response) => { notifyCallback(response); })
          isMainRequest = !isMainRequest;
        }, 1000);
        autoUpdateBtn.textContent = 'Stop';
      }
    });
 
  } catch (error) {
    output.textContent = ``;
    progressBar.style.width = '0%';
    // alert.classList.remove('invisible');
    alert.querySelector('span').textContent = `Error: ${error.message}`;
    alert.classList.add('show');
  } finally {
    connectButton.disabled = false;
  }
});


async function requestBmsData( characteristic_tx, characteristic_rx, command, options = {}) {

  const { maxAttempts = 3, attemptDelay = 100, timeout = 3000, expectedLength = 0} = options;
  let receivedChunks = [];
  let expectedDataLength = expectedLength;
  let isReceiving = false;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {

    if(attempt > 1) { console.log(`Attempt ${attempt}/${maxAttempts}...`);}

    receivedChunks = [];

    try {
      const response = await new Promise(async (resolve, reject) => {
        const timeoutId = setTimeout(() => {
          if (isReceiving) console.warn("Timeout during data reception");
          reject(new Error(`Timeout after ${timeout}ms`));
        }, timeout);

        const handler = (event) => {
          const data = new Uint8Array(event.target.value.buffer);
          // console.log(`Received chunk (${data.length} bytes):`, [...data]);

          // Определяем общую длину из первого пакета
          if (receivedChunks.length === 0 && data.length >= 4 && data[0] === 0xDD) {
            expectedDataLength = data[3] + 7;
            console.log(`Expecting ${expectedDataLength} bytes total`);
          }

          receivedChunks.push(data);
          isReceiving = true;

          // Защита от переполнения буфера
          const totalReceived = receivedChunks.reduce((sum, chunk) => sum + chunk.length, 0);
          if (expectedDataLength > 0 && totalReceived > expectedDataLength) {
            console.warn(`Received extra data (${totalReceived} > ${expectedDataLength}), trimming...`);
            receivedChunks = [mergeChunks(receivedChunks, expectedDataLength)];
          }

          // Проверка завершения
          if (expectedDataLength > 0 && totalReceived >= expectedDataLength) {
            clearTimeout(timeoutId);
            characteristic_rx.removeEventListener('characteristicvaluechanged', handler);
            isReceiving = false;

            const fullResponse = mergeChunks(receivedChunks, expectedDataLength);
            if (fullResponse[0] !== 0xDD) {
              reject(new Error("Invalid packet header"));
              return;
            }
            resolve(fullResponse);
          }
        };

        characteristic_rx.addEventListener('characteristicvaluechanged', handler);

        try {
          await characteristic_tx.writeValue(command);
          await new Promise(res => setTimeout(res, 100));
          await characteristic_tx.writeValue(command);
        } catch (err) {
          reject(err);
        }
      });

      notifyCallback(response);
      return response;

    } catch (error) {
      console.warn(`Attempt ${attempt} failed:`, error.message);
      if (attempt < maxAttempts) await new Promise(res => setTimeout(res, attemptDelay));
    }
  }

  throw new Error("All attempts failed");
}

// Новая вспомогательная функция для безопасной склейки пакетов
function mergeChunks(chunks, maxLength) {
  const result = new Uint8Array(maxLength);
  let offset = 0;

  for (const chunk of chunks) {
    const remaining = maxLength - offset;
    if (remaining <= 0) break;

    const copyLength = Math.min(chunk.length, remaining);
    result.set(chunk.subarray(0, copyLength), offset);
    offset += copyLength;
  }

  return result;
}



// Основная функция обработки входящих данных
function notifyCallback(data) {
  if (data === 0) return handleDataEnd();

  isDataReceived = true;
  if (bmsData.error) return showBmsError();

  const packet = new Uint8Array(data);

  if (bmsData.length === 0) {
    handleFirstPacket(packet);
  } else {
    appendPacket(packet);
  }

  if (!bmsData.error && isPacketComplete()) {
    processCompletePacket();
  }
}

// Вспомогательные функции
function handleFirstPacket(packet) {
  if (packet[0] !== 0xDD) return;

  bmsData.error = ![0x00, 0xE1].includes(packet[2]);
  bmsData.expected = packet[3];

  if (!bmsData.error && packet[2] !== 0xE1) {
    appendPacket(packet);
  }
}

function appendPacket(packet) {
  if (bmsData.length + packet.length > BMS_MAX_DATA_CAPACITY) {
    bmsData.error = true;
    return;
  }

  bmsData.buffer.set(packet, bmsData.length);
  bmsData.length += packet.length;
}

function isPacketComplete() {
  return bmsData.length === bmsData.expected + 7;
}

function processCompletePacket() {
  if (validateChecksum()) {
    bmsDataReceive(bmsData.buffer.subarray(0, bmsData.length));
    resetBmsData();
  } else {
    handleChecksumError();
  }
}

function validateChecksum() {
  const { buffer, expected } = bmsData;
  const checksumPos = expected + 4;
  const received = (buffer[checksumPos] << 8) | buffer[checksumPos + 1];
  return received === calculateChecksum(buffer, expected);
}

function calculateChecksum(data, length) {
  return Array.from({ length: length + 1 })
    .reduce((sum, _, i) => sum - data[i + 3], 0x10000) & 0xFFFF;
}

function handleChecksumError() {
  console.error(`Checksum error: ${getChecksumInfo()}`);
  resetBmsData();
}

function getChecksumInfo() {
  const { buffer, expected } = bmsData;
  const calculated = calculateChecksum(buffer, expected);
  const received = (buffer[expected + 4] << 8) | buffer[expected + 5];
  return `calculated: 0x${calculated.toString(16)}, received: 0x${received.toString(16)}`;
}

function resetBmsData() {
  bmsData.buffer.fill(0);
  bmsData.length = 0;
  bmsData.expected = 0;
  bmsData.error = false;
}

function handleDataEnd() {
  console.log('End of data');
  isDataReceived = false;
}

function showBmsError() {
  resetErrorBtn.classList.remove('invisible');
  output.textContent = `BMS Data Error: ${bmsData.error}`;
}

function bmsDataReceive(data) {

  if (data[1] === 0x00) {
    console.log('Enter EEPROM read');
    isEEPROM = true;
    return;
  }

  if (data[1] === 0x01) {
    console.log('Exit EEPROM read');
    isEEPROM = false;
    return;
  }

  if (isEEPROM) {
    const result = eepromRead(data);
    console.log('EEPROM Read Result:', result);
    mainInfoDisplay.updateEEPROM(result);
    return;
  }


  if (data[1] === 0x03) {
    BMSMain.totalVoltage = ((data[4] << 8) | data[5]) * 0.01;
    const rawValueСurrent = (data[6] << 8) | data[7];
    const current = (rawValueСurrent > 32767 ? rawValueСurrent - 65536 : rawValueСurrent) * 0.01;
    BMSMain.current = parseFloat(current.toFixed(2));
    BMSMain.residualCapacity = ((data[8] << 8) | data[9]) * 0.01;
    BMSMain.nominalCapacity = ((data[10] << 8) | data[11]) * 0.01;
    BMSMain.cycleLife = (data[12] << 8) | data[13];
    BMSMain.productDate = parseBmsDate(); ((data[14] << 8) | data[15]);
    BMSMain.balanceStatus = (data[16] << 8) | data[17];
    BMSMain.balanceStatusHight = (data[18] << 8) | data[19];
    BMSMain.protection = (data[20] << 8) | data[21];
    const protection = getProtectionStatusText(BMSMain.protection);
    BMSMain.protectionStatus = protection;
    BMSMain.version = data[22];
    BMSMain.RSOC = data[23];
    BMSMain.FET = data[24];
    BMSMain.numberOfCells = data[25];
    BMSMain.numberOfTemperatureSensors = data[26];
    // console.log(`Protection status: ${protection}`);

    // Обработка температурных датчиков
    for (let i = 0; i < BMSMain.numberOfTemperatureSensors; i++) {
      const tempValue = (data[27 + i * 2] << 8) | data[28 + i * 2];
      BMSMain.temperature[i] = ((tempValue - 2731) * 0.1).toFixed(1);
    }

    // Определение состояния BMS
    if (BMSMain.current > 0.1) {
      BMSMain.bms_state = 1; // Зарядка
      BMSMain.power = BMSMain.current * BMSMain.totalVoltage;
    } else if (BMSMain.current < 0) {
      BMSMain.bms_state = 2; // Разрядка
      BMSMain.power = Math.abs(BMSMain.current) * BMSMain.totalVoltage;
    } else {
      BMSMain.bms_state = 0; // Бездействие
      BMSMain.power = BMSMain.current * BMSMain.totalVoltage;
    }
    mainInfoDisplay.update(BMSMain)
    const customEvent = new CustomEvent('myCustomEvent', { detail: BMSMain });
    document.dispatchEvent(customEvent);
  }

  if (data[1] === 0x04) {
    const bmsNumberOfCells = data[3] / 2;
    for (let i = 0; i < bmsNumberOfCells; i++) {
      const millivolts = (data[4 + 2 * i] << 8) | data[5 + 2 * i];
      BMSCells.cell[i] = (millivolts / 1000.0).toFixed(3);
    }

    const balancing = BMSMain.balanceStatus;
    // const balancing = reverseBits(parseInt(BMSMain.balanceStatus, 16));
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


function getProtectionStatusText(protection) {
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
    if (protection & (1 << i)) {
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
    // Форматированная строка для удобства
    formatted: `${day.toString().padStart(2, '0')}.${month.toString().padStart(2, '0')}.${year}`
  };
}

const generateRandomVoltages = (nums) => {
  const voltages = [];
  for (let i = 0; i < nums; i++) {
    // Генерируем случайное число от 3.000 до 4.000
    const voltage = 3 + Math.random(); // Math.random() дает значение от 0 до 1
    // Округляем до тысячных
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

  if (!(bytes instanceof Uint8Array)) { throw new Error('Input must be a Uint8Array'); }

  // Минимальная длина команды (старт + команда + регистр)
  if (bytes.length < 3) {
    throw new Error('Command too short');
  }

  const isWriteCommand = bytes[1] === 0x5A; // 0x5A - запись, 0xA5 - чтение
  let sum = 0;

  if (isWriteCommand) {
    // Для команд записи: суммируем все байты после команды (регистр + длина + данные)
    for (let i = 2; i < bytes.length; i++) {
      sum += bytes[i];
    }
  } else {
    // Для команд чтения: суммируем только регистр и длину
    sum = bytes[2] + (bytes[3] || 0);
  }

  // Вычисляем контрольную сумму
  const checksum = 0x10000 - sum;
  const chkHigh = (checksum >> 8) & 0xFF;
  const chkLow = checksum & 0xFF;

  // Создаем новый массив с контрольной суммой и конечным байтом
  const result = new Uint8Array(bytes.length + 3);
  result.set(bytes, 0);
  result[bytes.length] = chkHigh;
  result[bytes.length + 1] = chkLow;
  result[bytes.length + 2] = 0x77; // Конечный байт

  return result;
}

function eepromRead(response) {

  if (!(response instanceof Uint8Array)) throw new Error('Invalid response type');
  if (response.length < 7 || response[0] !== 0xDD) throw new Error('Invalid response format');

  const register = response[1];
  const status = response[2];
  if (status !== 0x00) throw new Error(`BMS error: 0x${status.toString(16).padStart(2, '0')}`);

  // Извлекаем данные (big-endian)
  let data = 0;
  for (let i = 0; i < response[3]; i++) {
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
  // Добавляем флаги в виде простого объекта
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
    case 0x12:
    case 0x32:
    case 0x33:
    case 0x34:
    case 0x35:
    case 0x13:
      result.value = data * 0.01;
      break;

    default:
      result.value = data;
  }

  return result;
}


async function readEEPROM(characteristic_tx, register) {

  if (!isEEPROM) throw new Error('(!) You are NOT in EEPROM mode');

  if (typeof register !== 'number') throw new Error('(!) register must be a number');

  const command = [0xDD, 0xA5, register];
  const commandWithChecksum = addChecksumToCommand(command);

  try {
    await characteristic_tx.writeValue(commandWithChecksum);
  } catch (error) {
    console.error('Error sending command:', error);
  }

}


