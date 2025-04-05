

// for (byte i = 0; i < BMSMain->numberOfCells; i++) {
//     if (bitRead(BMSMain->balanceStatus, i)) Serial.printf("Cell %d: %s\n", i + 1, "Balancing");
// }



export class BatteryDisplay {
    constructor(numberOfCells, containerId) {
        this.numberOfCells = numberOfCells;
        this.containerId = containerId;
        this.container = document.getElementById(containerId);
        this.minVoltage = 0;
        this.maxVoltage = 0;
        this.voltageDifference = 0;

        this.batteryMaxVoltage = 4.10;
        this.batteryMinVoltage = 3.10;

        this.init();
    }

    init() {
        this.container.innerHTML = '';

        const options = document.createElement('div');
        options.classList.add('controls-container', 'row', 'row-cols-3', 'justify-content-around', 'pb-5');

        options.innerHTML = `
            <div class="col d-flex flex-column align-items-center justify-content-center shadow rounded" id="max-voltage" style="width: 150px; height: 75px;">
                <div class="title text-muted">Maximal</div>
                    <div class="value fs-5">
                    <i class="bi bi-caret-down-fill opacity-25"></i>
                    <span>0.00 V</span>
                    </div>
                </div>
            </div>

            <div class="col d-flex flex-column align-items-center justify-content-center shadow rounded" id="min-voltage" style="width: 150px; height: 75px;">
                <div class="title text-muted">Minimal</div>
                    <div class="value fs-5">
                    <i class="bi bi-caret-down-fill opacity-25"></i>
                    <span>0.00 V</span>
                    </div>
                </div>
            </div>

            <div class="col d-flex flex-column align-items-center justify-content-center shadow rounded" id="voltage-difference" style="width: 150px; height: 75px;">
                <div class="title text-muted">Difference</div>
                    <div class="value fs-5">
                    <i class="bi bi-caret-down-fill opacity-25"></i>
                    <span>0.00 V</span>
                    </div>
                </div>
            </div>`;
        this.container.appendChild(options);

        options.querySelectorAll('.box').forEach(box => {
            box.addEventListener('click', (e) => {

                e.target.classList.add('flash-text');
                e.target.addEventListener('animationend', () => {
                    e.target.classList.remove('flash-text');
                }, { once: true });

            });
        });
        const batteryRow = document.createElement('div');
        batteryRow.classList.add('row', 'row-cols-3', 'justify-content-between');
        this.container.appendChild(batteryRow);

        // Создаем HTML-код для каждой батареи
        for (let i = 0; i < this.numberOfCells; i++) {
            const batteryHtml = `
          <div class="col p-2 d-flex align-items-center justify-content-center">
            <span class="me-3 rounded-circle border border-1 border-secondary d-flex justify-content-center align-items-center" style="width: 25px; height: 25px; white-space: nowrap;">${i + 1}</span>
            <div class="battery position-relative shadow" id="battery-container-${i}">
              <span class="badge text-bg-light z-1 position-absolute top-50 start-50 translate-middle"
                id="battery-${i}">0.00V</span>
              <span class="bar"></span>
              <span class="bar"></span>
              <span class="bar"></span>
              <span class="bar"></span>
              <span class="bar"></span>
            </div>
            <i class="bi bi-lightning-charge ms-3 blink invisible" style="font-size: 20px; color: rgb(0,128,0);" id="balancing-${i}"></i>
          </div>
        `;
            batteryRow.insertAdjacentHTML('beforeend', batteryHtml);
        }
    }

    update(data) {
        const { cell, balancing } = data;
        const cells = cell.map(Number);

        // Расчет значений
        this.minVoltage = Math.min(...cells);
        this.maxVoltage = Math.max(...cells);
        this.voltageDifference = parseFloat((this.maxVoltage - this.minVoltage).toFixed(3));

        const minVoltageCellNumber = cells.indexOf(this.minVoltage);
        const maxVoltageCellNumber = cells.indexOf(this.maxVoltage);

        // Обновление ячеек
        for (let i = 0; i < this.numberOfCells; i++) {
            const batteryElement = document.getElementById(`battery-${i}`);
            const bars = batteryElement.parentElement.querySelectorAll('.bar');
            const voltage = parseFloat(cells[i]);

            if (!isNaN(voltage)) {
                batteryElement.textContent = `${voltage.toFixed(3)}V`;
                const level = Math.max(0, Math.min((voltage - this.batteryMinVoltage) / (this.batteryMaxVoltage - this.batteryMinVoltage), 1));

                bars.forEach((bar, index) => {
                    bar.classList.forEach(className => {
                        if (className !== 'bar') { bar.classList.remove(className); }
                    })

                    // bar.classList.add(index < Math.floor(level * bars.length) ? level >= 0.5 ? 'high' : level >= 0.2 ? 'medium' : 'low' : 'empty');

                    if(index < Math.floor(level * bars.length)) {
                        bar.classList.add(level >= 0.7 ? 'high' : level >= 0.3 ? 'medium' : 'low');
                    } else {
                        bar.classList.add('empty');
                    }
                });

                document.getElementById(`battery-container-${i}`).style.boxShadow = 'none';
            } else {
                console.error('Invalid cell value:', cells[i]);
                batteryElement.textContent = 'N/A';
                bars.forEach(bar => bar.style.backgroundColor = '#c0c0c0');
            }
        }

        // Подсветка min/max
        document.getElementById(`battery-container-${minVoltageCellNumber}`).style.boxShadow = '0px 0px 5px 5px rgba(255, 0, 0, 0.37)';
        document.getElementById(`battery-container-${maxVoltageCellNumber}`).style.boxShadow = '0px 0px 5px 5px rgba(219, 0, 198, 0.37)';

        // Обновление значений с анимацией
        const updateValueWithFlash = (element, newValue) => {
            const valueDiv = element.querySelector('.value');
            const icon = valueDiv.querySelector('i');
            const span = valueDiv.querySelector('span');
            const spanValue = parseFloat(span.textContent);

            if (spanValue !== newValue) {
                this.#applyFlash(span);
                span.textContent = `${parseFloat(newValue.toFixed(3))}V`;

                if (newValue > spanValue) {
                    icon.classList.add('bi-caret-up-fill');
                    icon.classList.remove('bi-caret-down-fill');
                } else if (newValue < spanValue) {
                    icon.classList.add('bi-caret-down-fill');
                    icon.classList.remove('bi-caret-up-fill');
                } else {

                }
                icon.classList.remove('opacity-25');
                icon.classList.add('opacity-100');

            } else {
                icon.classList.remove('opacity-100');
                icon.classList.add('opacity-25');
            }
        };

        updateValueWithFlash(document.getElementById('max-voltage'), this.maxVoltage);
        updateValueWithFlash(document.getElementById('min-voltage'), this.minVoltage);
        updateValueWithFlash(document.getElementById('voltage-difference'), this.voltageDifference);

        // Особый случай для разницы напряжений
        // const diffElement = document.getElementById('voltage-difference');
        // const diffSpan = diffElement.querySelector('span');
        // const icon = diffElement.querySelector('i');
        // const prevDiff = parseFloat(diffSpan.textContent);

        // if (updateValueWithFlash(diffElement, this.voltageDifference)) {
        //     icon.classList.remove('invisible');
        //     if (this.voltageDifference < prevDiff) {
        //         icon.classList.remove('bi-caret-down-fill');
        //         icon.classList.add('bi-caret-up-fill');
        //     } else if (this.voltageDifference > prevDiff) {
        //         icon.classList.remove('bi-caret-up-fill');
        //         icon.classList.add('bi-caret-down-fill');
        //     } else {
        //         icon.classList.add('invisible');
        //     }
        // }

        this.#updateBalancing(balancing);
    }

    #updateBalancing(balancingCells) {
        if (!this.numberOfCells) { return; }

        for (let i = 0; i < this.numberOfCells; i++) {
            const balancingElement = document.getElementById(`balancing-${i}`);
            if (!balancingElement) continue;

            if (balancingCells.includes(i)) {
                balancingElement.classList.remove('invisible');
                balancingElement.classList.add('blink'); // Добавляем анимацию мигания
            } else {
                balancingElement.classList.add('invisible');
                balancingElement.classList.remove('blink'); // Убираем анимацию
            }
        }
    }

    #applyValueGlow(element) {
        if (!element) {
            console.error('Element is not defined');
            return;
        }

        // Сбрасываем анимацию
        element.classList.remove('value-glow');
        void element.offsetWidth;

        // Запускаем анимацию
        element.classList.add('value-glow');

        // Автоочистка
        element.addEventListener('animationend', () => {
            element.classList.remove('value-glow');
        }, { once: true });
    }

    #applyFlash(element) {
        if (!element) {
            console.error('Element is not defined');
            return;
        }
        element.classList.add('flash-text');
        element.addEventListener('animationend', () => {
            element.classList.remove('flash-text');
        }, { once: true });
    }
}



















export class MainInfoDisplay {
    constructor(containerId) {
        if (!containerId) { throw new Error('containerId is not defined'); }
        this.containerId = containerId;
        this.container = document.getElementById(containerId);
        this.callback = null;
        this.init();
    }

    init() {
        this.container.innerHTML = ''; // Очищаем контейнер
        this.progressContainer = this.#renderProgressBar(); // Создаем контейнер для прогресс-бара
        this.container.appendChild(this.progressContainer); // Добавляем контейнер в DOM
        this.controls = this.#renderControls();
        this.container.appendChild(this.controls);
    }

    setCallback(callback) {
        this.callback = callback;
    }

    update(data) {
        console.log(data);
        this.#updateProgressBar(data);
        this.#updateControls(data);
    }

    updateEEPROM(data) {
        const { register, key, value } = data;
        const block = document.querySelector(`#${register}`);

        if (!block) {
            console.warn(`Element with ID "${register}" not found`);
            console.log(data);
            return;
        }

        for (const [key, value] of Object.entries(data)) {
            if (key === 'register') continue;
            console.log(`${key}: ${value}`);
            const element = document.querySelector(`input[name="${key}"]`);
            if (element) {
                element.checked = Boolean(value);
            } else {
                console.warn(`Element not found: input#${key}`);
            }
        }

    }

    reset() {
        this.progressContainer.querySelector('.progress-bar').style.width = '0%';
        const emptyData = {
            totalVoltage: 0,
            current: 0,
            residualCapacity: 0,
            nominalCapacity: 0,
            cycleLife: 0,
            productDate: 0,
            balanceStatus: 0,
            protection: 0,
            protectionStatus: "",
            version: 0,
            RSOC: 0,
            FET: 0,
            numberOfCells: 0,
            numberOfTemperatureSensors: 4,
            temperature: [0, 0, 0, 0],
            bms_state: 0,
            power: 0,

        };
        this.#updateProgressBar(emptyData);
        this.#updateControls(emptyData);
    }

    #renderProgressBar() {
        const progressContainer = document.createElement('div');
        progressContainer.classList.add('progress-container', 'position-relative', 'mx-auto', 'p-3', 'shadow', 'rounded');

        const progress = document.createElement('div');
        progress.classList.add('progress');
        progress.setAttribute('role', 'progressbar');
        progress.setAttribute('aria-label', 'Animated striped example');
        progress.setAttribute('aria-valuenow', '0');
        progress.setAttribute('aria-valuemin', '0');
        progress.setAttribute('aria-valuemax', '100');
        progress.style.width = '100%'; // Ширина прогресс-контейнера
        progress.style.height = '25px';

        const progressBar = document.createElement('div');
        progressBar.classList.add('percents', 'progress-bar', 'bg-info');
        progressBar.style.width = '0%'; // Начальная ширина прогресс-бара
        progress.appendChild(progressBar); // Добавляем прогресс-бар в контейнер

        const progressBarText = document.createElement('div');
        progressBarText.classList.add('badge', 'position-absolute', 'top-50', 'start-50', 'translate-middle', 'text-bg-info', 'text-light', 'border', 'border-2', 'border-light', 'fs-5');
        progressBarText.textContent = '0%';
        progress.appendChild(progressBarText);

        progressContainer.appendChild(progress); // Добавляем прогресс в контейнер

        return progressContainer; // Возвращаем контейнер
    }

    #updateProgressBar(data) {
        const progressBar = this.progressContainer.querySelector('.percents');
        const percentBadge = this.progressContainer.querySelector('.badge');

        const percents = parseInt(data.RSOC);
        progressBar.style.width = `${percents}%`;
        progressBar.style.setProperty('--progress', percents);
        percentBadge.textContent = `${percents}%`;

        const current = parseFloat(data.current);
        if (current !== 0 && current > 0) {
            progressBar.classList.add('progress-bar-striped', 'progress-bar-animated');
        }
        else if (current !== 0 && current < 0) {
            progressBar.classList.add('progress-bar-striped', 'progress-bar-animated');
        }
        else {
            progressBar.classList.remove('progress-bar-striped', 'progress-bar-animated');
        }
    }

    #renderControls() {
        // <div class="controls-container row row-cols-3 mx-auto p-3">
        const controlsContainer = document.createElement('div');
        controlsContainer.classList.add('controls-container', 'pt-3');
        controlsContainer.innerHTML = `

        <div class="row row-cols-3 justify-content-around py-3">

            <div class="col d-flex flex-column align-items-center justify-content-center align-items-center justify-content-center shadow rounded" id="voltage_" style="width: 180px; height: 90px;">
                    <div class="title text-muted">Voltage</div>
                    <div class="value fs-4">
                        <i class="bi bi-caret-down-fill opacity-25"></i>
                        <span id="voltage" class="fw-medium">0.00 V</span>
                    </div>
            </div>

            <div class="col d-flex flex-column align-items-center justify-content-center align-items-center justify-content-center shadow rounded" id="current_" style="width: 180px; height: 90px;">
                    <div class="title text-muted">Current</div>
                    <div class="value fs-4">
                        <i class="bi bi-caret-down-fill opacity-25"></i>
                        <span id="current" class="fw-medium">0.00 A</span>
                    </div>
            </div>

            <div class="col d-flex flex-column align-items-center justify-content-center align-items-center justify-content-center shadow rounded" id="power_" style="width: 180px; height: 90px;">
                    <div class="title text-muted">Power</div>
                    <div class="value fs-4">
                        <i class="bi bi-caret-down-fill opacity-25"></i>
                        <span id="power" class="fw-medium">0.00 W</span>
                    </div>
            </div>

            <div class="col d-flex flex-column align-items-center justify-content-center align-items-center justify-content-center shadow rounded" id="capacity_" style="width: 180px; height: 90px;">
                    <div class="title text-muted">Capacity</div>
                    <div class="value fs-4">
                        <i class="bi bi-caret-down-fill opacity-25"></i>
                        <span id="capacity" class="fw-medium">0.00 Ah</span>
                    </div>
            </div>

        </div>

        <div class="row row-cols-4 p-3">
            <div class="d-flex align-items-center justify-content-center">
                <div class="value fs-5 shadow p-3 mb-5 bg-body-tertiary rounded opacity-25 text-muted" id="temperature-sensor-0">
                    <i class="bi bi-thermometer-half position-relative fs-3">
                        <i class="bi bi-caret-up-fill position-absolute top-50 start-0 translate-middle" style="font-size: 10px;"></i>
                    </i>
                    <span class="temp-sensor fs-4">0 °C</span>
                </div>
            </div>
            <div class="d-flex align-items-center justify-content-center">
                <div class="value fs-5 shadow p-3 mb-5 bg-body-tertiary rounded opacity-25 text-muted" id="temperature-sensor-1">
                    <i class="bi bi-thermometer-half position-relative fs-3"></i>
                    <span class="temp-sensor fs-4">0 °C</span>
                </div>
            </div>
            <div class="d-flex align-items-center justify-content-center">
                <div class="value fs-5 shadow p-3 mb-5 bg-body-tertiary rounded opacity-25 text-muted" id="temperature-sensor-2">
                    <i class="bi bi-thermometer-half position-relative fs-3"></i>
                    <span class="temp-sensor fs-4">0 °C</span>
                </div>
            </div>
            <div class="d-flex align-items-center justify-content-center">
                <div class="value fs-5 shadow p-3 mb-5 bg-body-tertiary rounded opacity-25 text-muted" id="temperature-sensor-3">
                    <i class="bi bi-thermometer-half position-relative fs-3"></i>
                    <span class="temp-sensor fs-4">0 °C</span>
                </div>
            </div>
        </div>

        <div class="row row-cols-3 mx-auto p-3">

             <div class="col border-start">
                <input type="checkbox" name="toggle" class="sw" id="switchChargeMosfet" disabled>
                <label for="switchChargeMosfet"><span>Charge</span></label>
            </div>
             <div class="col border-start">
                <input type="checkbox" name="toggle" class="sw" id="switchDisChargeMosfet" disabled>
                <label for="switchDisChargeMosfet"><span>Discarge</span></label>
            </div>
             <div class="col border-start">
                <input type="checkbox" name="toggle" class="sw" id="switchEepromMode" disabled>
                <label for="switchEepromMode"><span>EEPROM</span></label>
            </div>

        </div>

        <div class="row row-cols-3 mx-auto p-3">

            <div class="col border-start" id="ntc_config">
                <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" role="switch" name="ntc1">
                    <label class="form-check-label" for="ntc_config_ntc1">ntc1</label>
                </div>
                <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" role="switch" name="ntc2">
                    <label class="form-check-label" for="ntc_config_ntc2">ntc2</label>
                </div>
                <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" role="switch" name="ntc3">
                    <label class="form-check-label" for="ntc_config_ntc3">ntc3</label>
                </div>
                <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" role="switch" name="ntc4">
                    <label class="form-check-label" for="ntc_config_ntc4">ntc4</label>
                </div>
                <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" role="switch" name="ntc5">
                    <label class="form-check-label" for="ntc_config_ntc5">ntc5</label>
                </div>
                <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" role="switch" name="ntc6">
                    <label class="form-check-label" for="ntc_config_ntc6">ntc6</label>
                </div>
                <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" role="switch" name="ntc7">
                    <label class="form-check-label" for="ntc_config_ntc7">ntc7</label>
                </div>
                <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" role="switch" name="ntc8">
                    <label class="form-check-label" for="ntc_config_ntc8">ntc8</label>
                </div>

            </div>

            <div class="col border-start" id="func_config">
                <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" role="switch" name="switch">
                    <label class="form-check-label" for="func_config_switch">switch</label>
                </div>
                <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" role="switch" name="scrl">
                    <label class="form-check-label" for="func_config_scrl">scrl</label>
                </div>
                <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" role="switch" name="balance_en">
                    <label class="form-check-label" for="func_config_balance_en">balance_en</label>
                </div>
                <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" role="switch" name="funcbalance_en">
                    <label class="form-check-label" for="func_config_chg_balance_en">chg_balance_en</label>
                </div>
                <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" role="switch" name="led_en">
                    <label class="form-check-label" for="func_config_led_en">led_en</label>
                </div>
                <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" role="switch" name="led_num">
                    <label class="form-check-label" for="func_config_led_num">led_num</label>
                </div>
            </div>
        
            <div class="col border-start position-relative" id="protection">
                <div class="value d-flex align-items-center border rounded-5 ms-auto p-3">
                <i class="bi bi-check-lg pe-3" style="font-size: 24px;"></i>
                <span>No active protections</span>
                </div>
            </div>

        </div>        
        `;


        controlsContainer.querySelector('#switchChargeMosfet').addEventListener('change', () => {
            this.callback({
                chargeMosfet: controlsContainer.querySelector('#switchChargeMosfet').checked,
            });
        });

        controlsContainer.querySelector('#switchDisChargeMosfet').addEventListener('change', () => {
            this.callback({
                dischargeMosfet: controlsContainer.querySelector('#switchDisChargeMosfet').checked
            });
        });

        controlsContainer.querySelector('#switchEepromMode').addEventListener('change', () => {
            this.callback({
                eepromMode: controlsContainer.querySelector('#switchEepromMode').checked
            });
        });

        return controlsContainer;
    }

    #updateControls(data) {

        let chargeMosfetState = (data.FET & 0x01) !== 0;
        let disChargeMosfetState = (data.FET & 0x02) !== 0;

        const voltage = parseFloat(data.totalVoltage.toFixed(2));
        const current = parseFloat(data.current.toFixed(2));
        const power = parseFloat(data.power.toFixed(2));
        const capacity = parseFloat(data.residualCapacity.toFixed(2));


        const switchChargeMosfet = this.controls.querySelector('#switchChargeMosfet');
        const switchDisChargeMosfet = this.controls.querySelector('#switchDisChargeMosfet');

        if (switchChargeMosfet.disabled === true) switchChargeMosfet.disabled = false;
        if (switchDisChargeMosfet.disabled === true) switchDisChargeMosfet.disabled = false;
        if (switchEepromMode.disabled === true) switchEepromMode.disabled = false;

        switchChargeMosfet.checked = chargeMosfetState;
        switchDisChargeMosfet.checked = disChargeMosfetState;


        const updateValueWithFlash = (element, newValue, query) => {
            const valueDiv = element.querySelector('.value');
            const icon = valueDiv.querySelector('i');
            const span = valueDiv.querySelector('span');
            const spanValue = parseFloat(span.textContent);

            if (spanValue !== newValue) {
                console.log('flash');
                span.textContent = `${parseFloat(newValue.toFixed(3))} ${query}`;
                this.#applyFlash(span);

                if (newValue > spanValue) {
                    icon.classList.add('bi-caret-up-fill');
                    icon.classList.remove('bi-caret-down-fill');
                } else if (newValue < spanValue) {
                    icon.classList.add('bi-caret-down-fill');
                    icon.classList.remove('bi-caret-up-fill');
                } else {

                }
                icon.classList.remove('opacity-25');
                icon.classList.add('opacity-100');

            } else {
                icon.classList.remove('opacity-100');
                icon.classList.add('opacity-25');
            }
        };


        updateValueWithFlash(document.getElementById('voltage_'), voltage, 'V');
        updateValueWithFlash(document.getElementById('current_'), current, 'A');
        updateValueWithFlash(document.getElementById('power_'), power, 'W');
        updateValueWithFlash(document.getElementById('capacity_'), capacity, 'Ah');

        // const voltage = this.controls.querySelector('#voltage');
        // voltage.textContent = `${data.totalVoltage.toFixed(2)} V`;

        // const current = this.controls.querySelector('#current');
        // current.textContent = `${data.current.toFixed(2)} A`;

        // const power = this.controls.querySelector('#power');
        // power.textContent = `${data.power.toFixed(2)} W`;

        // const capacity = this.controls.querySelector('#capacity');
        // capacity.textContent = `${data.residualCapacity.toFixed(2)}/${data.nominalCapacity.toFixed(2)} Ah`;

        for (let i = 0; i < data.numberOfTemperatureSensors; i++) {
            const temperatureSensor = this.controls.querySelector(`#temperature-sensor-${i}`);
            const span = temperatureSensor.querySelector('span');
            span.textContent = `${data.temperature[i]} °C`;
            if (temperatureSensor.classList.contains('opacity-25')) temperatureSensor.classList.remove('opacity-25');
        }

        const protection = this.controls.querySelector('#protection');
        const span = protection.querySelector('span');
        const icon = protection.querySelector('i');
        if (data.protection && data.protectionStatus.length > 0) {
            icon.classList.remove('bi-check-lg');
            icon.classList.add('bi-x-lg');
            icon.style.color = 'red';
            span.textContent = data.protectionStatus;
        } else {
            icon.classList.remove('bi-x-lg');
            icon.classList.add('bi-check-lg');
            icon.style.color = 'green';
            span.textContent = 'No active protections';
        }
        // const temperatureSensors = this.controls.querySelectorAll('.temp-sensor');
        // temperatureSensors[0].textContent = `${data.temperature[0]} °C`;
        // temperatureSensors[1].textContent = `${data.temperature[1]} °C`;

        // const temperatureSensors = this.container.querySelectorAll('.bi-thermometer-half');
        // this.controlsContainer.querySelector('#temperature-0').textContent = `${data.temperature[0]} °C`;
        // this.controlsContainer.querySelector('#temperature-1').textContent = `${data.temperature[1]} °C`;
    }

    #applyFlash(element) {
        if (!element) {
            console.error('Element is not defined');
            return;
        }
        element.classList.add('flash-text');
        element.addEventListener('animationend', () => {
            element.classList.remove('flash-text');
        }, { once: true });
    }
}