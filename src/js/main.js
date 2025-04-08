import '../scss/styles.scss';
import '../scss/toggle.scss';
import { BatteryDisplay, MainInfoDisplay } from './ui';
import { saveBLEData } from './database';


const batteryDisplay = new BatteryDisplay(14, 'battery-container');
const mainInfoDisplay = new MainInfoDisplay('main-info-container', uiCallback);
function uiCallback(data) { console.log('Data from UI:', data); }

const SERVICE_UUID = '0000ff00-0000-1000-8000-00805f9b34fb'; // UUID сервиса
const CHARACTERISTIC_TX_UUID = '0000ff02-0000-1000-8000-00805f9b34fb'; // UUID характеристики TX
const CHARACTERISTIC_RX_UUID = '0000ff01-0000-1000-8000-00805f9b34fb'; // UUID характеристики RX
const BMS_REQUEST_MAIN = new Uint8Array([0xDD, 0xA5, 0x03, 0x00, 0xFF, 0xFD, 0x77]);
const BMS_REQUEST_CELLS = new Uint8Array([0xDD, 0xA5, 0x4, 0x0, 0xFF, 0xFC, 0x77]);

const d1 = new Uint8Array([0xDD, 0xA5, 0x2D, 0x00, 0xFF, 0xD3, 0x77]);
// dd 0x2d 0x0 0x2 0x0 0x6 0xff 0xf8 0x77

const d2 = new Uint8Array([0xdd, 0xa5, 0x2e, 0x00, 0xff, 0xd2, 0x77]);
// 0xdd 0x2e 0x00 0x02 0x00 0x03 0xff 0xfb 0x77


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
let isConnected = false;
let isDataReceived = false;
let isFirstPacket = false;
let isEEPROMReceived = false;
let mainData = false;
let cellsData = false;
let eepromData = false;

const connectButton = document.getElementById('connectButton');
const output = document.getElementById('output');
const alert = document.getElementById('alert');
const batteryVoltageTestingRange = document.getElementById('batteryVoltageTestingRange');
const percentsTestingRange = document.getElementById('percentsTestingRange');
const resetErrorBtn = document.getElementById('resetErrorBtn');
const downloadButton = document.getElementById('downloadButton');

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
  if(device && device.gatt.connected){
    event.preventDefault();
    event.returnValue = '';
  }
  // disconnectDevice();
  });
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

    // Получаем сервис по UUID
    output.textContent = `Getting primary service...`;
    const service = await server.getPrimaryService(SERVICE_UUID);
    output.textContent = `Service found:', ${service.uuid}`;

    // Получаем характеристику TX по UUID
    output.textContent = `Getting characteristic TX...`;
    const characteristic_tx = await service.getCharacteristic(CHARACTERISTIC_TX_UUID);
    output.textContent = `Characteristic TX found:', ${characteristic_tx.uuid}`;

    // Получаем характеристику RX по UUID
    output.textContent = `Getting characteristic RX...`;

    const characteristic_rx = await service.getCharacteristic(CHARACTERISTIC_RX_UUID);
    output.textContent = `Characteristic RX found:', ${characteristic_rx.uuid}`;

    // Подписываемся на уведомления
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
      connectButton.textContent = 'Disconnect';

      requestInterval = setInterval(async () => {
        requestBmsData(characteristic_tx, isMainRequest);
        isMainRequest = !isMainRequest;
      }, 1500);
    }

    device.addEventListener('gattserverdisconnected', onDisconnect);
    device.addEventListener('gattserverconnect', function () {
      console.log('Device reconnected');
    });

    function onDisconnect() {
      console.log('Device disconnected');
      isConnected = false;
      connectButton.textContent = 'Connect';
      mainInfoDisplay.reset();
      clearInterval(requestInterval);
    }



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
        await characteristic_tx.writeValue(verifiedData);
      } catch (error) {
        console.error('Error writing data:', error);
        output.textContent = `Error writing data: ${error.message}`;
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

async function requestBmsData2(characteristic_tx, characteristic_rx, command) {
  if (isEEPROM) throw new Error('(!) Вы находитесь в режиме EEPROM');
  if (!command instanceof Uint8Array) throw new Error('(!) Команда должна быть непустым массивом');
  if (command[command.length - 1] !== 0x77) throw new Error('(!) Команда должна заканчиваться на 0x77');

  return new Promise((resolve, reject) => {
    characteristic_tx.writeValue(command);

    const timeoutId = setTimeout(() => {
      characteristic_rx.removeEventListener('characteristicvaluechanged');
      reject(new Error('Таймаут ожидания ответа'));
    }, 500);

    characteristic_rx.addEventListener('characteristicvaluechanged', (event) => {
      clearTimeout(timeoutId);
      const data = new Uint8Array(event.target.value.buffer);
      notifyCallback(data);
      resolve(data);
    });
  });
}

function notifyCallback(data) {
  // console.log([...new Uint8Array(data)].map(b => b.toString(16)).join(' 0x'));

  if (data === 0) {
    console.log('End of data');
    isDataReceived = false;
  }

  isDataReceived = true;

  if (bmsDataError) {
    resetErrorBtn.classList.remove('invisible');
    output.textContent = `BMS Data Error: ${bmsDataError}`;
    return;
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
    BMSMain.protectionStatus = (data[20] << 8) | data[21];
    BMSMain.version = data[22];
    BMSMain.RSOC = data[23];
    BMSMain.FET = data[24];
    BMSMain.numberOfCells = data[25];
    BMSMain.numberOfTemperatureSensors = data[26];
    const protection = getProtectionStatusText(BMSMain.protectionStatus);
    console.log(`Protection status: ${protection}`);

    for (let i = 0; i < BMSMain.numberOfTemperatureSensors; i++) {
      const tempValue = (data[27 + i * 2] << 8) | data[28 + i * 2];
      BMSMain.temperature[i] = parseFloat(((tempValue - 2731) * 0.1).toFixed(1));
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


