export class BMS {
    constructor() {
        this.SERVICE_UUID = '0000ff00-0000-1000-8000-00805f9b34fb';
        this.CHARACTERISTIC_TX_UUID = '0000ff02-0000-1000-8000-00805f9b34fb';
        this.CHARACTERISTIC_RX_UUID = '0000ff01-0000-1000-8000-00805f9b34fb';

        this.BMS_REQUEST_MAIN = new Uint8Array([0xDD, 0xA5, 0x03, 0x00, 0xFF, 0xFD, 0x77]);
        this.BMS_REQUEST_CELLS = new Uint8Array([0xDD, 0xA5, 0x04, 0x00, 0xFF, 0xFC, 0x77]);

        this.bms_mosfet_write = [
            new Uint8Array([0xDD, 0x5A, 0xE1, 0x02, 0x00, 0x00, 0xFF, 0x1D, 0x77]), // All ON
            new Uint8Array([0xDD, 0x5A, 0xE1, 0x02, 0x00, 0x01, 0xFF, 0x1C, 0x77]), // discharge ON
            new Uint8Array([0xDD, 0x5A, 0xE1, 0x02, 0x00, 0x02, 0xFF, 0x1B, 0x77]), // charge ON
            new Uint8Array([0xDD, 0x5A, 0xE1, 0x02, 0x00, 0x03, 0xFF, 0x1A, 0x77]), // All OFF
        ];

        this.EEPROM = [
            new Uint8Array([0xdd, 0x5a, 0x00, 0x02, 0x56, 0x78, 0xff, 0x30, 0x77]), // Enter
            new Uint8Array([0xdd, 0x5a, 0x01, 0x02, 0x00, 0x00, 0xff, 0xfd, 0x77]), // Exit
        ]
        this.EEPROM_commands = new Uint8Array([0x10, 0x11, 0x12, 0x13, 0x14, 0x32, 0x33, 0x34, 0x35]);

        this.BMSMain = {
            totalVoltage: 0, current: 0, residualCapacity: 0, nominalCapacity: 0, cycleLife: 0,
            productDate: 0, balanceStatus: 0, balanceStatusHight: 0, protectionStatus: 0, version: 0,
            RSOC: 0, FET: 0, numberOfCells: 0, numberOfTemperatureSensors: 0, temperature: [], bms_state: 0, power: 0,
        };

        this.BMSCells = { cell: [], balancing: [] };

        this.device = null;
        this.server = null;
        this.service = null;
        this.characteristic_tx = null;
        this.characteristic_rx = null;
        this.requestInterval = null;

        this.BMS_MAX_DATA_CAPACITY = 1024;
        this.bmsDataReceived = new Uint8Array(this.BMS_MAX_DATA_CAPACITY);
        this.bmsDataLengthReceived = 0;
        this.bmsDataLengthExpected = 0;
        this.bmsDataError = false;
        this.isConnected = false;

        this.callback = this.#empty;
        this.errorsCallback = this.#empty;
        this.mainDataCallback = this.#empty;
        this.cellsDataCallback = this.#empty;

    }

    #empty(data) { console.warn('Callback not defined:', data); }

    async init() {
        try {
            if (!navigator.bluetooth) {
                this.callback('Web Bluetooth API is not supported in this browser.');
                throw new Error('Web Bluetooth API is not supported in this browser.');
            }
        } catch (error) {
            this.errorsCallback(`Init error: ${error.message}`);
        }
    }


    async connect() {
        try {

            this.device = await navigator.bluetooth.requestDevice({
                optionalServices: [this.SERVICE_UUID],
                acceptAllDevices: true
            });

            this.callback(`Requesting Bluetooth device...`);

            if (this.device.gatt.connected) {
                this.callback('Device already connected');
                this.#disconnect();
            };


            this.connectButton.disabled = true;

            this.server = await this.device.gatt.connect();
            this.callback(`Connected to device: ${this.device.name}`);

            this.service = await this.server.getPrimaryService(this.SERVICE_UUID);
            this.callback(`Service found: ${this.service.uuid}`);

            this.characteristic_tx = await this.service.getCharacteristic(this.CHARACTERISTIC_TX_UUID);
            this.callback(`TX characteristic found: ${this.characteristic_tx.uuid}`);

            this.characteristic_rx = await this.service.getCharacteristic(this.CHARACTERISTIC_RX_UUID);
            this.callback(`RX characteristic found: ${this.characteristic_rx.uuid}`);

            await this.characteristic_rx.startNotifications();
            this.characteristic_rx.addEventListener('characteristicvaluechanged',
                this.#handleCharacteristicValueChanged.bind(this));

            this.callback('Setup complete');
            this.connectButton.textContent = 'Disconnect';

            window.addEventListener('beforeunload', this.#disconnect());

            const event = new Event('bmsconnected');
            document.dispatchEvent(event);

        } catch (error) {
            this.errorsCallback(`Connection error: ${error.message}`);
            await this.#disconnect();
            return false;
        } finally {
            this.connectButton.disabled = false;
            this.connectButton.textContent = 'Connect';
        }
    }

    setConnectButtonCb(connectButton) {
        this.connectButton = connectButton;
    }


    setCallback(callback) {
        this.callback = callback || this.#empty;
    }

    setErrorsCallback(callback) {
        this.errorsCallback = callback || this.#empty;
    }

    setMainDataCallback(callback) {
        this.mainDataCallback = callback || this.#empty;
    }

    setCellsDataCallback(callback) {
        this.cellsDataCallback = callback || this.#empty;
    }

    async #disconnect() {
        if (this.requestInterval) {
            clearInterval(this.requestInterval);
            this.requestInterval = null;
        }

        if (this.device?.gatt?.connected) {
            await this.device.gatt.disconnect();
            this.isConnected = false;
            this.callback('Device disconnected');
            const event = new Event('bmsdisconnected');
            document.dispatchEvent(event);
        }
    }


    #handleCharacteristicValueChanged(event) {
        const data = new Uint8Array(event.target.value.buffer);
        this.#processReceivedData(data);
    }

    #processReceivedData(data) {
        if (this.bmsDataError) {
            this.errorsCallback(`BMS Data Error: ${this.bmsDataError}`);
            return;
        }

        if (this.bmsDataLengthReceived === 0) {
            if (data[0] === 0xDD) {
                this.bmsDataError = data[2] !== 0 && data[2] !== 0xE1;
                this.bmsDataLengthExpected = data[3];

                if (!this.bmsDataError) {
                    if (data[2] === 0xE1) {
                        this.callback("Mosfet Data Received OK");
                        return;
                    }
                    this.bmsDataError = !this.#appendBmsPacket(data);
                }
            }
        } else {
            this.bmsDataError = !this.#appendBmsPacket(data);
        }

        if (!this.bmsDataError && this.bmsDataLengthReceived === this.bmsDataLengthExpected + 7) {
            if (this.#verifyChecksum()) {
                this.#parseBmsData();
            } else {
                this.errorsCallback('Checksum verification failed');
            }
            this.#resetDataBuffer();
        } else if (this.bmsDataError) {
            this.errorsCallback(`Data error: data[2] = 0x${data[2]?.toString(16)}, received ${this.bmsDataLengthReceived} bytes`);
            this.#resetDataBuffer();
        }
    }

    #appendBmsPacket(data) {
        if (data.length + this.bmsDataLengthReceived >= this.BMS_MAX_DATA_CAPACITY) {
            return false;
        }
        for (let i = 0; i < data.length; i++) {
            this.bmsDataReceived[this.bmsDataLengthReceived++] = data[i];
        }
        return true;
    }

    #verifyChecksum() {
        const checksumIndex = this.bmsDataReceived[3] + 4;
        const receivedChecksum = (this.bmsDataReceived[checksumIndex] << 8) | this.bmsDataReceived[checksumIndex + 1];
        const calculatedChecksum = this.#calculateChecksum();
        return receivedChecksum === calculatedChecksum;
    }

    #calculateChecksum() {
        let checksum = 0x10000;
        const dataLength = this.bmsDataReceived[3];
        for (let i = 0; i < dataLength + 1; i++) {
            checksum -= this.bmsDataReceived[i + 3];
        }
        return checksum & 0xFFFF;
    }

    #resetDataBuffer() {
        this.bmsDataLengthReceived = 0;
        this.bmsDataReceived = new Uint8Array(this.BMS_MAX_DATA_CAPACITY);
        this.bmsDataError = false;
    }

    #parseBmsData() {

        this.BMSMain.totalVolts = ((this.bmsDataReceived[4] << 8) | this.bmsDataReceived[5]) * 0.01;
        this.BMSMain.current = ((this.bmsDataReceived[6] << 8) | this.bmsDataReceived[7]) * 0.01;
        this.BMSMain.remainCapacity = ((this.bmsDataReceived[8] << 8) | this.bmsDataReceived[9]) * 0.01;
        this.BMSMain.nominalCapacity = ((this.bmsDataReceived[10] << 8) | this.bmsDataReceived[11]) * 0.01;
        this.BMSMain.totalCycles = (this.bmsDataReceived[12] << 8) | this.bmsDataReceived[13];
        this.BMSMain.cellsBalancing = (this.bmsDataReceived[16] << 24) | (this.bmsDataReceived[17] << 16) | (this.bmsDataReceived[18] << 8) | this.bmsDataReceived[19];
        this.BMSMain.protectionStatus = (this.bmsDataReceived[20] << 8) | this.bmsDataReceived[21];
        this.BMSMain.remaininPercent = this.bmsDataReceived[23];
        this.BMSMain.mosfState = this.bmsDataReceived[24];
        this.BMSMain.numberOfCells = this.bmsDataReceived[25];
        this.BMSMain.numberOfTemperatureSensors = this.bmsDataReceived[26];
        this.BMSMain.temperature = [];
        this.BMSMain.bms_state = 0;
        this.BMSMain.power = 0;


        // Parse temperatures
        for (let i = 0; i < this.BMSMain.numberOfTemperatureSensors; i++) {
            const tempValue = (this.bmsDataReceived[27 + i * 2] << 8) | this.bmsDataReceived[28 + i * 2];
            this.BMSMain.temperature.push(((tempValue - 2731) * 0.1).toFixed(1));
        }

        // Determine BMS state
        if (this.BMSMain.current > 0.1) {
            this.BMSMain.bms_state = 1; // Charging
            this.BMSMain.power = this.BMSMain.current * this.BMSMain.totalVolts;
        } else if (this.BMSMain.current < -0.1) {
            this.BMSMain.bms_state = 2; // Discharging
            this.BMSMain.power = Math.abs(this.BMSMain.current) * this.BMSMain.totalVolts;
        } else {
            this.BMSMain.bms_state = 0; // Idle
            this.BMSMain.power = 0;
        }

        if (this.bmsDataReceived[1] === 0x03) {
            this.mainDataCallback(this.BMSMain);
        }

        if (this.bmsDataReceived[1] === 0x04) {
            const BMSCells = {
                cell: [],
                balancing: [],
            };

            const cellCount = this.bmsDataReceived[3] / 2;
            for (let i = 0; i < cellCount; i++) {
                const millivolts = (this.bmsDataReceived[4 + i * 2] << 8) | this.bmsDataReceived[5 + i * 2];
                BMSCells.cell.push((millivolts / 1000.0).toFixed(3));
            }

            if (this.BMSMain.cellsBalancing) {
                const balancing = this.#reverseBits(parseInt(this.BMSMain.cellsBalancing, 16));
                console.log('this.BMSMain.cellsBalancing', this.BMSMain.cellsBalancing);
                console.log('balancing', balancing);
                for (let i = 0; i < cellCount; i++) {
                    if ((balancing >> i) & 1 === 1) {
                        BMSCells.balancing.push(i);
                    }
                }
            }

            this.cellsDataCallback(BMSCells);
        }
    }

    async requestMainData() {
        if (!this.isConnected) return false;
        try {
            await this.characteristic_tx.writeValue(this.BMS_REQUEST_MAIN);
            return true;
        } catch (error) {
            this.errorsCallback(`Error requesting main data: ${error.message}`);
            return false;
        }
    }

    async requestCellsData() {
        if (!this.isConnected) return false;
        try {
            await this.characteristic_tx.writeValue(this.BMS_REQUEST_CELLS);
            return true;
        } catch (error) {
            this.errorsCallback(`Error requesting cells data: ${error.message}`);
            return false;
        }
    }

    async setMosfetState(state) {
        if (!this.isConnected || state < 0 || state > 3) return false;
        try {
            await this.characteristic_tx.writeValue(this.bms_mosfet_write[state]);
            return true;
        } catch (error) {
            this.errorsCallback(`Error setting MOSFET state: ${error.message}`);
            return false;
        }
    }

    #reverseBits(number, bitLength = 32) {
        let reversed = 0;
        for (let i = 0; i < bitLength; i++) {
            reversed = (reversed << 1) | ((number >> i) & 1);
        }
        return reversed;
    }
}