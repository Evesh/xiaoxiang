import '../scss/styles.scss';
import '../scss/toggle.scss';
import * as bootstrap from 'bootstrap';
// import { BatteryDisplay, MainInfoDisplay } from './ui';
import { BMS, Progress, EEPROMDisplay } from './ui';
import { saveBLEData, importBLEData } from './database';
import { SERVICE_UUID, CHARACTERISTIC_RX_UUID, CHARACTERISTIC_TX_UUID, protectionStatusBits, BMSMain, registers, isEEPROM } from './variables';
import { eepromRead, eepromWrite, getAllEepromData } from './eeprom';

const bmsUI = new BMS('main');
document.addEventListener('myCustomEvent', (e) => { console.log('Получены данные:', e.detail); });
const BMSCells = { cell: [], balancing: [] };
const TIMEOUT_LENGTH = 15000;
let characteristic_tx = null;
let characteristic_rx = null;

let bmsDataError = false;
let device = null;
let requestInterval = null;
let isConnected = false;
let isTimeout = false;
let timeoutId = null;


const connectButton = document.getElementById('connectButton');
const output = document.getElementById('output');
const batteryVoltageTestingRange = document.getElementById('batteryVoltageTestingRange');
// const customRange3 = document.getElementById('customRange3');
const percentsTestingRange = document.getElementById('percentsTestingRange');
const resetErrorBtn = document.getElementById('resetErrorBtn');
const exportStatisticButton = document.getElementById('exportStatisticButton');
const importStatisticButton = document.getElementById('importStatisticButton');
const timeoutBtn = document.getElementById('timeoutBtn');
const openEepromBtn = document.getElementById('open-eeprom');

openEepromBtn.addEventListener('click', async () => {
  if (document.querySelector('#graphics')) {
    
    const eepromData = await getAllEepromData();

    console.log(eepromData);
    
    const graphicsModal = document.querySelector('#graphics');

    if(!graphicsModal) return console.log('Modal not found');

    const EEPROM_UI = new EEPROMDisplay(eepromData);
    graphicsModal.querySelector('.modal-body').innerHTML = '';
    graphicsModal.querySelector('.modal-body').appendChild(EEPROM_UI.getHTML());

    const myModal = new bootstrap.Modal(graphicsModal, {})
    
    myModal.show();

  }
})


exportStatisticButton.addEventListener('click', () => {
  const data = JSON.parse(localStorage.getItem('bleDataCollection')) || [];
  if (!data.length) return console.log('Нет данных для скачивания');
  const textData = data.map(item => JSON.stringify(item)).join(',\n');
  const blob = new Blob(['[\n', textData, '\n]'], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'bms_data.json';
  link.click();
  URL.revokeObjectURL(url);
})

importStatisticButton.addEventListener('click', () => {
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.json';
  fileInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = JSON.parse(e.target.result);
      importBLEData(data);
    };
    reader.readAsText(file);
  });
  fileInput.click();
})


batteryVoltageTestingRange.addEventListener('input', () => {
  const voltage = batteryVoltageTestingRange.value;
  console.log('Voltage:', voltage);
  const cell = generateRandomVoltages(14);
  const balancing = [1, 3, 5, 9, 13]
  console.log('Balancing:', balancing);
  bmsUI.updateCells({ cell, balancing });
});

// customRange3.addEventListener('input', () => {
//   const voltage = customRange3.value;
//   console.log('Voltage:', voltage);
//   const cell = [voltage, voltage, voltage, voltage, voltage, voltage, voltage, voltage, voltage, voltage, voltage, voltage, voltage, voltage];
//   const balancing = [1, 3, 5, 9, 13]
//   console.log('Balancing:', balancing);
//   bmsUI.updateCells({ cell, balancing });
// });

percentsTestingRange.addEventListener('input', () => {
  const RSOC = percentsTestingRange.value;
  bmsUI.updateMain({
    totalVoltage: 0, current: 0, residualCapacity: 0,
    nominalCapacity: 0, cycleLife: 0, balanceStatus: 0,
    protectionStatus: 0, RSOC: parseInt(RSOC),
    FET: 0, numberOfCells: 0, numberOfTemperatureSensors: 0,
    temperature: [0, 0], bms_state: 0, power: 0
  });
});

resetErrorBtn.addEventListener('click', () => {
  bmsDataError = false;
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
        if (isEEPROM.value) return;
        if (mainRequestsCount >= mainRequestsSize) mainRequestsCount = 0;
        requestData(characteristic_tx, characteristic_rx, { commadType: new Uint8Array([0xA5]), register: new Uint8Array([mainRequests[mainRequestsCount]]) }).
          then((data) => { processData(data); });
        mainRequestsCount++;
      }, 2000);

    }

    device.addEventListener('gattserverdisconnected', onDisconnect);

    bmsUI.setCallback((data) => {

      // if (!isEEPROM.value) {
      //   const enterEEPROMCommand = eepromWrite({ eepromMode: true });
      //   console.log('Data to write (EEPROM):', [...new Uint8Array(enterEEPROMCommand)].map(b => b.toString(16)).join(' ').toLocaleUpperCase());
      //   requestData(characteristic_tx, characteristic_rx, { commadType: new Uint8Array([enterEEPROMCommand[0]]), register: new Uint8Array([enterEEPROMCommand[1]]), data: new Uint8Array(enterEEPROMCommand.slice(2)) })
      //     .then((dataToRead) => { processData(dataToRead); })
      //     .catch((error) => { console.error(error); return; });
      // }

      const dataToWrite = eepromWrite(data);
      console.log('Data to write (EEPROM):', [...new Uint8Array(dataToWrite)].map(b => b.toString(16)).join(' ').toLocaleUpperCase());

      requestData(characteristic_tx, characteristic_rx, { commadType: new Uint8Array([dataToWrite[0]]), register: new Uint8Array([dataToWrite[1]]), data: new Uint8Array(dataToWrite.slice(2)) }).
        // requestData(characteristic_tx, characteristic_rx, { commadType: new Uint8Array([dataToWrite[0]]), register: new Uint8Array([dataToWrite[1]]), data: new Uint8Array(EEPROM_ENTER.slice(2)) }).
        then((dataToRead) => { processData(dataToRead); });

      // if (isEEPROM.value) {
      //   const exitEEPROMCommand = eepromWrite({ eepromMode: false });
      //   console.log('Data to write (EEPROM):', [...new Uint8Array(exitEEPROMCommand)].map(b => b.toString(16)).join(' ').toLocaleUpperCase());
      //   requestData(characteristic_tx, characteristic_rx, { commadType: new Uint8Array([exitEEPROMCommand[0]]), register: new Uint8Array([exitEEPROMCommand[1]]), data: new Uint8Array(exitEEPROMCommand.slice(2)) })
      //     .then((dataToRead) => { processData(dataToRead); })
      //     .catch((error) => { console.error(error); return; });
      // }

    });


    function onDisconnect() {
      console.log('Device disconnected');
      isConnected = false;
      connectButton.querySelector('span').textContent = 'Connect';
      bmsUI.reset();
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
    connectButton.querySelector('span').textContent = 'Connect';
  } finally {
    connectButton.disabled = false;
  }
});


async function requestData(characteristic_tx, characteristic_rx, { commadType, register, data = null }) {
  // if (isEEPROM.value) console.warn('EEPROM Mode Enabled');
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
    isEEPROM.value = true;
    const progress = new Progress();
    progress.show();
    const regs = Object.keys(registers);
    const registerLength = regs.length;
    let processedCount = 0;
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

    async function processRegister(index) {
      try {
        const data = await requestData(characteristic_tx, characteristic_rx, { commadType: new Uint8Array([0xA5]), register: new Uint8Array([regs[index]]) });
        processData(data);
        return true;
      } catch (error) {
        console.error(`Error processing register ${regs[index]}:`, error);
        return false;
      } finally {
        await delay(200);
      }
    }

    async function processAllRegisters() {
      try {
        for (let i = 0; i < registerLength; i++) {
          progress.setProgress(Math.round((i / registerLength) * 100), `${i}\/${registerLength}`);
          await processRegister(i);
          processedCount++;
        }
      } catch (error) {
        console.error('Error in processing:', error);
        output.textContent = `Error: ${error.message}`;
        throw error;
      }
    }

    processAllRegisters()
      .then(() => {
        console.log(`Successfully processed ${processedCount} of ${registerLength} registers`);
      })
      .catch(error => {
        console.error('Processing failed:', error);
      })
      .finally(() => {
        progress.setProgress(100);
        setTimeout(() => {
          progress.hide();
          progress.destroy();
        }, 500);
      });


    // let i = 0;
    // const registerLength = EEPROM_REGISTERS.length
    // let intervalId = setInterval(function () {
    //   if (i === registerLength - 1) { clearInterval(intervalId); }
    //   requestData(characteristic_tx, characteristic_rx, { commadType: new Uint8Array([0xA5]), register: new Uint8Array([EEPROM_REGISTERS[i]]) }).then((data) => { processData(data); });
    //   i++;
    // }, 200);

    return;
  }

  if (data[1] === 0x01) {
    console.log('Exit EEPROM read');
    isEEPROM.value = false;
    return;
  }

  if (isEEPROM.value) {
    const result = eepromRead(data);
    if (!result) return;
    bmsUI.updateEEPROM(result);
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

    // console.log('BMSMain:', BMSMain);
    bmsUI.updateMain(BMSMain)

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
    bmsUI.updateCells(BMSCells);
  }

  if (data[1] === 0x05) {
    console.log('Starts with 0x05');
  }
}


function getProtectionStatusText(protectionStatus) {
  let activeProtections = [];

  // Проверяем каждый бит (0-15)
  for (let i = 0; i < 16; i++) {
    if (protectionStatus & (1 << i)) {
      activeProtections.push(protectionStatusBits[i]);
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



