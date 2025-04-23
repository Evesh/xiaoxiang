
import { BMSMain, registers } from './variables';

let isEEPROMChanged = false;

let db;
const openRequest = indexedDB.open("bms", 1);

openRequest.onupgradeneeded = function (event) {
    const db = event.target.result;
    if (!db.objectStoreNames.contains('eeprom-data')) {
        const store = db.createObjectStore("eeprom-data", { keyPath: "name" });

        store.add({ name: 'func_config', data: [] });
        store.add({ name: 'ntc_config', data: [] });
        store.add({ name: 'cap_100', data: 0 });
        store.add({ name: 'cap_80', data: 0 });
        store.add({ name: 'cap_60', data: 0 });
        store.add({ name: 'cap_40', data: 0 });
        store.add({ name: 'cap_20', data: 0 });
        store.add({ name: 'cap_0', data: 0 });
        store.add({ name: 'design_cap', data: 0 });
        store.add({ name: 'cycle_cap', data: 0 });
        store.add({ name: 'cycle_cnt', data: 0 });
        store.add({ name: 'chgot', data: 0 });
        store.add({ name: 'chgot_rel', data: 0 });
        store.add({ name: 'chgut', data: 0 });
        store.add({ name: 'chgut_rel', data: 0 });
    }
};

openRequest.onerror = function (event) {
    console.error("Database error:", event.target.error);
};

openRequest.onsuccess = function (event) {
    db = event.target.result;
    console.log('Database opened successfully');

    db.onversionchange = function () {
        db.close();
        console.log('Database is outdated, please reload the page');
    };
};

function updateEepromData(register, value) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('eeprom-data', 'readwrite');
        const store = transaction.objectStore('eeprom-data');

        const getRequest = store.get(register);

        getRequest.onsuccess = function () {
            const data = getRequest.result || { name: register, data: 0 };
            data.data = value;

            const putRequest = store.put(data);

            putRequest.onsuccess = () => resolve();
            putRequest.onerror = (event) => reject(event.target.error);
        };

        getRequest.onerror = (event) => reject(event.target.error);
    });
}

export function getEepromData(registerName) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('eeprom-data', 'readonly');
        const store = transaction.objectStore('eeprom-data');

        const request = store.get(registerName);

        request.onsuccess = () => resolve(request.result?.data);
        request.onerror = (event) => reject(event.target.error);
    });
}


export function getAllEepromData() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('eeprom-data', 'readonly');
        const store = transaction.objectStore('eeprom-data');
        const request = store.getAll();

        request.onsuccess = () => {
            const result = {};
            request.result.forEach(item => {
                result[item.name] = item.data;
            });
            resolve(result);
        };

        request.onerror = (event) => reject(event.target.error);
    });
}



export function eepromRead(response) {
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

    const registerName = registers[register];
    let value = null;

    const result = { register: registers[register] };

    switch (register) {
        case 0x2D:
            result.switch = !!(data & 0x01);
            result.scrl = !!((data >> 1) & 0x01);
            result.balance_en = !!((data >> 2) & 0x01);
            result.chg_balance_en = !!((data >> 3) & 0x01);
            result.led_en = !!((data >> 4) & 0x01);
            result.led_num = !!((data >> 5) & 0x01);
            value = {
                switch: !!(data & 0x01) ? true : false,
                scrl: !!((data >> 1) & 0x01) ? true : false,
                balance_en: !!((data >> 2) & 0x01) ? true : false,
                chg_balance_en: !!((data >> 3) & 0x01) ? true : false,
                led_en: !!((data >> 4) & 0x01) ? true : false,
                led_num: !!((data >> 5) & 0x01) ? true : false,
            };
            break;

        case 0x2E:
            for (let i = 0; i < 8; i++) { value[`ntc${i + 1}`] = !!((data >> i) & 0x01) ? true : false; }
            result[registers[register]] = value;
            break;

        case 0x10: // design_cap
        case 0x11: // cycle_cap
            value = data * 0.01;
            result[registers[register]] = data * 0.01;
            break;

        case 0x14: // dsg_rate
            value = data * 0.1;
            result[registers[register]] = data * 0.1;
            break;

        case 0x17: // cycle_cnt
            value = data;
            result[registers[register]] = data;
            break;

        /* Temperature */
        case 0x18:
        case 0x19:
        case 0x1A:
        case 0x1B:
        case 0x1C:
        case 0x1D:
        case 0x1E:
        case 0x1F:
            value = +((data * 0.1) - 273.15).toFixed(2);
            result[registers[register]] = +((data * 0.1) - 273.15).toFixed(2);
            break;


        /* Voltage */
        case 0x12: // cap_100
        case 0x32: // cap_80
        case 0x33: // cap_60
        case 0x34: // cap_40
        case 0x35: // cap_20
        case 0x13: // cap_0
            value = +(data * 0.001).toFixed(3);
            result[registerName] = value;
            break;

        default:
            result.value = data;
            break;
    }

    updateEepromData(registerName, value)
        .then(() => console.log('Data updated successfully'))
        .catch(err => console.error('Update failed:', err));

    // console.log('result', result);
    return result;
}


export function eepromWrite(data) {
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
            const currentDischargeState = !(BMSMain.FET & 0x01) === 1;
            console.log('ChargeMosfet:', dataValue);
            console.log('DischargeMosfet:', currentDischargeState);
            const newChargeState = dataValue ? 0x00 : 0x1;
            const finalState = newChargeState | (currentDischargeState << 1);
            command.push(0xE1, 0x02, 0x00, finalState);
            break;
        }

        case 'dischargeMosfet': {
            const currentChargeState = !(BMSMain.FET & 0x02) === 2;
            console.log('DischargeMosfet:', dataValue);
            console.log('ChargeMosfet:', currentChargeState);
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
