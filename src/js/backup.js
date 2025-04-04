// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import '../scss/styles.scss';
import '../scss/toggle.scss';
import * as bootstrap from 'bootstrap';
import { BatteryDisplay, MainInfoDisplay } from './ui';
import { BMS } from './bms';

const firebaseConfig = {
  apiKey: "AIzaSyD_4xijCwVEVKzoVGgPWb7LS6M1p5nQjCM",
  authDomain: "arduino-39ce8.firebaseapp.com",
  databaseURL: "https://arduino-39ce8-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "arduino-39ce8",
  storageBucket: "arduino-39ce8.firebasestorage.app",
  messagingSenderId: "48362386960",
  appId: "1:48362386960:web:55dc9f8ddba87f2eb93c95"
};

const app = initializeApp(firebaseConfig);

const batteryDisplay = new BatteryDisplay(14, 'battery-container');
const mainInfoDisplay = new MainInfoDisplay('main-info-container', uiCallback);
function uiCallback(data) { console.log('Data from UI:', data); }

const SERVICE_UUID = '0000ff00-0000-1000-8000-00805f9b34fb'; // UUID сервиса
const CHARACTERISTIC_TX_UUID = '0000ff02-0000-1000-8000-00805f9b34fb'; // UUID характеристики TX
const CHARACTERISTIC_RX_UUID = '0000ff01-0000-1000-8000-00805f9b34fb'; // UUID характеристики RX
const BMS_REQUEST_MAIN = new Uint8Array([0xDD, 0xA5, 0x03, 0x00, 0xFF, 0xFD, 0x77]);
const BMS_REQUEST_CELLS = new Uint8Array([0xDD, 0xA5, 0x4, 0x0, 0xFF, 0xFC, 0x77]);

document.addEventListener('myCustomEvent', (e) => {
  console.log('Получены данные:', e.detail);
});


const bms_mosfet_write = [
  new Uint8Array([0xDD, 0x5A, 0xE1, 0x02, 0x00, 0x00, 0xFF, 0x1D, 0x77]), // All ON
  new Uint8Array([0xDD, 0x5A, 0xE1, 0x02, 0x00, 0x01, 0xFF, 0x1C, 0x77]), // discharge ON
  new Uint8Array([0xDD, 0x5A, 0xE1, 0x02, 0x00, 0x02, 0xFF, 0x1B, 0x77]), // charge ON
  new Uint8Array([0xDD, 0x5A, 0xE1, 0x02, 0x00, 0x03, 0xFF, 0x1A, 0x77]), // All OFF
];

const EEPROM = [
  new Uint8Array([0xdd, 0x5a, 0x00, 0x02, 0x56, 0x78, 0xff, 0x30, 0x77]), // Enter
  new Uint8Array([0xdd, 0x5a, 0x01, 0x02, 0x00, 0x00, 0xff, 0xfd, 0x77]), // Exit
]
const EEPROM_commands = new Uint8Array([0x10, 0x11, 0x12, 0x13, 0x14, 0x32, 0x33, 0x34, 0x35]);

const BMSMain = {
  totalVoltage: 0, current: 0, residualCapacity: 0, nominalCapacity: 0, cycleLife: 0,
  productDate: 0, balanceStatus: 0, balanceStatusHight: 0, protectionStatus: 0, version: 0,
  RSOC: 0, FET: 0, numberOfCells: 0, numberOfTemperatureSensors: 0, temperature: [], bms_state: 0, power: 0,
};

const BMSCells = { cell: [], balancing: [] };


const BMS_MAX_DATA_CAPACITY = 1024; // Максимальный размер данных
let bmsDataReceived = new Uint8Array(BMS_MAX_DATA_CAPACITY); // Буфер для хранения данных
let bmsDataLengthReceived = 0; // Количество полученных байт
let bmsDataLengthExpected = 0; // Ожидаемое количество байт
let bmsDataError = false; // Флаг ошибки
let device = null; // Переменная для хранения подключенного устройства
let requestInterval = null;
let isMainRequest = true;
let isEEPROM = false;

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
    protectionStatus: 0, RSOC: parseInt(RSOC),
    FET: 0, numberOfCells: 0, numberOfTemperatureSensors: 0,
    temperature: [0, 0], bms_state: 0, power: 0
  });
});

resetErrorBtn.addEventListener('click', () => {
  bmsDataError = false;
  bmsDataReceived = new Uint8Array(BMS_MAX_DATA_CAPACITY);
  bmsDataLengthReceived = 0;
  bmsDataLengthExpected = 0;

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
    characteristic_rx.addEventListener('characteristicvaluechanged', (event) => {
      const data = new Uint8Array(event.target.value.buffer);
      notifyCallback(data);
    });


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
        const verifiedData = addChecksumToCommand(uint8Array);
        console.log('Sending data:', verifiedData);
        await characteristic_tx.writeValue(verifiedData);
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
          requestBmsData(characteristic_tx, isMainRequest);
          isMainRequest = !isMainRequest;
        }, 2000);
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

async function requestBmsData(characteristic_tx, isMainRequest) {
  try {
    if (isEEPROM) throw new Error('(!) You are in EEPROM mode');
    if (isMainRequest) {
      await characteristic_tx.writeValue(BMS_REQUEST_MAIN);
      output.textContent = 'Main data request sent.';
    } else {
      await characteristic_tx.writeValue(BMS_REQUEST_CELLS);
      output.textContent = 'Cell data request sent.';
    }
  } catch (error) {
    console.error('Error writing data:', error);
    output.textContent = `Error writing data: ${error.message}`;
  }
}


function notifyCallback(data) {
  console.log([...new Uint8Array(data)].map(b => b.toString(16)).join(' 0x'));
  isDataReceived = true;

  if (bmsDataError) {
    resetErrorBtn.classList.remove('invisible');
    output.textContent = `BMS Data Error: ${bmsDataError}`;
    return; // Не обрабатываем данные, если уже есть ошибка
  }

  if (!resetErrorBtn.classList.contains('invisible')) resetErrorBtn.classList.add('invisible');

  if (bmsDataLengthReceived === 0) {
    // Первый пакет
    if (data[0] === 0xDD) {
      // Проверяем, что пакет начинается с 0xDD
      bmsDataError = data[2] !== 0 && data[2] !== 0xe1; // Ошибка, если data[2] не 0x00 или 0xE1
      bmsDataLengthExpected = data[3]; // Длина данных находится в data[3]

      if (!bmsDataError) {
        if (data[2] === 0xe1) {
          console.log("Mosfet Data Received OK");
          return;
        }
        bmsDataError = !appendBmsPacket(data); // Добавляем первый пакет
      }
    }
  } else {
    // Второй и последующие пакеты
    bmsDataError = !appendBmsPacket(data); // Добавляем пакет
  }

  if (!bmsDataError) {
    if (bmsDataLengthReceived === bmsDataLengthExpected + 7) {
      // Проверяем контрольную сумму
      if (getIsChecksumValidForReceivedData(bmsDataReceived)) {
        bmsDataReceive(bmsDataReceived); // Обрабатываем данные
        // Сбрасываем состояние для следующего запроса
        bmsDataLengthReceived = 0;
        bmsDataReceived = new Uint8Array(BMS_MAX_DATA_CAPACITY); // Очищаем буфер
      } else {
        const checksum = getChecksumForReceivedData(bmsDataReceived);
        console.error(
          `Checksum error: received is 0x${checksum.toString(16)}, calculated is 0x${(
            bmsDataReceived[bmsDataLengthExpected + 4] * 256 +
            bmsDataReceived[bmsDataLengthExpected + 5]
          ).toString(16)}`
        );

        // Сбрасываем состояние при ошибке контрольной суммы
        bmsDataLengthReceived = 0;
        bmsDataReceived = new Uint8Array(BMS_MAX_DATA_CAPACITY);
      }
    }
  } else {
    console.error(`Data error: data[2] contains 0x${data[2].toString(16)}, bmsDataLengthReceived is ${bmsDataLengthReceived}`);

    // Сбрасываем состояние при ошибке данных
    bmsDataLengthReceived = 0;
    bmsDataReceived = new Uint8Array(BMS_MAX_DATA_CAPACITY);
  }
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

function bmsDataReceive(data) {

  if (data[1] === 0x00) {
    console.log('Enter EEPROM read');
    isEEPROM = true;
  }

  if (data[1] === 0x01) {
    console.log('Exit EEPROM read');
    isEEPROM = false;
  }

  if (isEEPROM) {
    parseCap(data);
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
    BMSMain.protectionStatus = (data[20] << 8) | data[21];
    BMSMain.version = data[22];
    BMSMain.RSOC = data[23];
    BMSMain.FET = data[24];
    BMSMain.numberOfCells = data[25];
    BMSMain.numberOfTemperatureSensors = data[26];
    const protection = getProtectionStatusText(BMSMain.protectionStatus);
    console.log(`Protection status: ${protection}`);

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

async function sendCommand(characteristic_tx, command) {
  try {
    const verifyedCommand = addChecksumToCommand(command);
    await characteristic_tx.writeValue(verifyedCommand);
  } catch (error) {
    console.error('Error sending command:', error);
  }
}

function addChecksumToCommand(bytes) {
  // Проверяем, что это Uint8Array
  if (!(bytes instanceof Uint8Array)) {
    throw new Error('Input must be a Uint8Array');
  }

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


function parseCap(response) {
  if (!(response instanceof Uint8Array) ||
    response.length < 7 ||
    response[0] !== 0xDD) {
    throw new Error('Invalid response format');
  }

  const status = response[2];
  if (status !== 0x00) throw new Error(`BMS error: 0x${status.toString(16)}`);

  const voltage = (response[4] << 8) | response[5];
  console.log(`Parsed voltage for ${response[1]}: ${voltage} mV`);
  return voltage; // Возвращает напряжение в мВ
}


async function readEEPROM(characteristic_tx) {

  try {
    if (!isEEPROM) throw new Error('(!) You are NOT in EEPROM mode');

    EEPROM_commands.forEach(async (command) => {

      setTimeout(async () => {
        await characteristic_tx.writeValue(addChecksumToCommand([0xDD, 0xA5, command]));
      }, 500);
    });


    if (isMainRequest) {
      await characteristic_tx.writeValue(BMS_REQUEST_MAIN);
      output.textContent = 'Main data request sent.';
    } else {
      await characteristic_tx.writeValue(BMS_REQUEST_CELLS);
      output.textContent = 'Cell data request sent.';
    }
  } catch (error) {
    console.error('Error writing data:', error);
    output.textContent = `Error writing data: ${error.message}`;
  }

}