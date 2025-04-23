import * as bootstrap from 'bootstrap';
import ApexCharts from 'apexcharts'


export class Progress {
    constructor() {
        this.#render();
    }

    #render() {
        this.modal = document.createElement('div');
        this.modal.classList.add('modal', 'fade');
        this.modal.setAttribute('id', 'modal-progress');
        this.modal.setAttribute('data-bs-backdrop', 'static');
        this.modal.setAttribute('data-bs-keyboard', 'false');
        this.modal.setAttribute('tabindex', '-1');
        this.modal.setAttribute('aria-labelledby', 'staticBackdropLabel');
        this.modal.setAttribute('aria-hidden', 'true');
        document.body.appendChild(this.modal);

        this.dialog = document.createElement('div');
        this.dialog.classList.add('modal-dialog', 'modal-dialog-centered');
        this.modal.appendChild(this.dialog);

        this.content = document.createElement('div');
        this.content.classList.add('modal-content');
        this.dialog.appendChild(this.content);

        this.body = document.createElement('div');
        this.body.classList.add('modal-body', 'text-center');
        this.content.appendChild(this.body);

        this.progressValue = document.createElement('div');
        this.progressValue.classList.add('progress-value');
        this.body.appendChild(this.progressValue);

        this.progress = document.createElement('div');
        this.progress.classList.add('progress');
        this.progress.setAttribute('role', 'progressbar');
        this.progress.setAttribute('aria-label', 'Info example');
        this.progress.setAttribute('aria-valuenow', '0');
        this.progress.setAttribute('aria-valuemin', '0');
        this.progress.setAttribute('aria-valuemax', '100');
        this.body.appendChild(this.progress);

        this.bar = document.createElement('div');
        this.bar.classList.add('progress-bar', 'bg-info');
        this.bar.setAttribute('style', 'width: 0%');
        this.progress.appendChild(this.bar);

        this.bootstrapModal = new bootstrap.Modal(this.modal, {})
    }

    show() {
        this.bootstrapModal.show();
    }

    setProgress(value, text = '') {
        this.bar.setAttribute('style', `width: ${value}%`);
        // this.progressValue.textContent = `${value}%`;
        this.bar.textContent = text;
    }

    hide() {
        this.bootstrapModal.hide();
    }

    destroy() {
        this.modal.remove();
    }
}

export class BMS {
    constructor(containerId) {

        if (!containerId) { throw new Error('containerId is not defined'); }
        this.containerId = containerId;
        this.container = document.getElementById(containerId);
        if (!this.container) { throw new Error('Container not found'); }

        this.mainContainer = document.createElement('div');
        this.mainContainer.classList.add('main-info', 'shadow', 'p-3', 'mb-3', 'rounded');

        this.batteryContainer = document.createElement('div');
        this.batteryContainer.classList.add('battery-info', 'shadow', 'p-3', 'mb-3', 'rounded');

        this.callback = null;
        this.chart = null;
        this.modalElement = document.getElementById('graphics');

        this.numberOfCells = 0;
        this.minVoltage = 0;
        this.maxVoltage = 0;
        this.voltageDifference = 0;
        this.batteryMaxVoltage = 4.10;
        this.batteryMinVoltage = 3.10;

        this.max_cell_voltage = 4.2;
        this.medium_cell_voltage = 3.8;
        this.min_cell_voltage = 3.3;

        if (this.modalElement) {
            this.modal = new bootstrap.Modal(this.modalElement, { keyboard: false })
            this.modalElement.addEventListener('hidden.bs.modal', event => {
                if (this.chart) {
                    this.chart.destroy();
                }
            })
        }

        this.initMain();
        this.initCells();
    }


    initMain() {
        this.progressContainer = this.#renderProgressBar();
        this.mainContainer.appendChild(this.progressContainer);
        this.controls = this.#renderControls();
        this.mainContainer.appendChild(this.controls);
        this.container.appendChild(this.mainContainer);
    }

    initCells() {
        if (!this.numberOfCells) { return; }

        this.batteryControls = this.#renderBatteryControls();
        this.batteryContainer.appendChild(this.batteryControls);

        this.cells = this.#renderCells();
        this.batteryContainer.appendChild(this.cells);

        this.container.appendChild(this.batteryContainer);
    }

    #renderBatteryControls() {
        const batteryControlsContainer = document.createElement('div');
        batteryControlsContainer.classList.add('battery-controls-container', 'row', 'row-cols-3', 'justify-content-around', 'pb-5');

        batteryControlsContainer.innerHTML = `
            <div class="col d-flex flex-column align-items-center justify-content-center bg-body-tertiary shadow rounded" id="max-voltage" style="width: 150px; height: 75px;">
                <div class="title text-muted">Maximal</div>
                    <div class="value fs-5">
                    <i class="bi bi-caret-down-fill opacity-25"></i>
                    <span>0.00</span><span>V</span>
                    </div>
                </div>
            </div>

            <div class="col d-flex flex-column align-items-center justify-content-center bg-body-tertiary shadow rounded" id="min-voltage" style="width: 150px; height: 75px;">
                <div class="title text-muted">Minimal</div>
                    <div class="value fs-5">
                    <i class="bi bi-caret-down-fill opacity-25"></i>
                    <span>0.00</span><span>V</span>
                    </div>
                </div>
            </div>

            <div class="col d-flex flex-column align-items-center justify-content-center bg-body-tertiary shadow rounded" id="voltage-difference" style="width: 150px; height: 75px;">
                <div class="title text-muted">Difference</div>
                    <div class="value fs-5">
                    <i class="bi bi-caret-down-fill opacity-25"></i>
                    <span>0.00</span><span>V</span>
                    </div>
                </div>
            </div>`;

        batteryControlsContainer.querySelectorAll('.box').forEach(box => {
            box.addEventListener('click', (e) => {

                e.target.classList.add('flash-text');
                e.target.addEventListener('animationend', () => {
                    e.target.classList.remove('flash-text');
                }, { once: true });

            });
        });

        return batteryControlsContainer;
    }

    #renderCells() {
        const batteryRow = document.createElement('div');
        batteryRow.classList.add('row', 'row-cols-3', 'justify-content-between');
        this.container.appendChild(batteryRow);

        for (let i = 0; i < this.numberOfCells; i++) {
            const batteryHtml = `
          <div class="col p-2 d-flex align-items-center justify-content-center">
            <span class="me-3 rounded-circle border border-1 border-secondary d-flex justify-content-center align-items-center" style="width: 25px; height: 25px; white-space: nowrap;">${i + 1}</span>
            <div class="battery position-relative shadow" id="battery-container-${i}">
              <span class="badge text-bg-light z-1 position-absolute top-50 start-50 translate-middle"id="battery-${i}">0.00V</span>
              <span class="bar"></span>
              <span class="bar"></span>
              <span class="bar"></span>
              <span class="bar"></span>
              <span class="bar"></span>
            </div>
            <i class="bi bi-lightning-charge ms-3 blink invisible" style="font-size: 16px; color: rgb(0,128,0);" id="balancing-${i}"></i>
          </div>
        `;
            batteryRow.insertAdjacentHTML('beforeend', batteryHtml);
        }
        return batteryRow;
    }


    setCallback(callback) {
        this.callback = callback;
    }

    updateMain(data) {
        // console.log(data);
        this.#updateProgressBar(data);
        this.#updateControls(data);
        this.#updateChart(data);
    }

    updateCells(data) {
        const { cell, balancing } = data;
        const cells = cell.map(Number);

        if (!this.numberOfCells && cells.length) {
            this.numberOfCells = cells.length;
            this.initCells();
        }

        this.minVoltage = Math.min(...cells);
        this.maxVoltage = Math.max(...cells);
        this.voltageDifference = parseFloat((this.maxVoltage - this.minVoltage).toFixed(3));

        const minVoltageCellNumber = cells.indexOf(this.minVoltage);
        const maxVoltageCellNumber = cells.indexOf(this.maxVoltage);

        for (let i = 0; i < this.numberOfCells; i++) {
            const batteryElement = document.getElementById(`battery-${i}`);
            const bars = batteryElement.parentElement.querySelectorAll('.bar');
            const voltage = parseFloat(cells[i]);

            if (!isNaN(voltage)) {
                batteryElement.textContent = voltage.toFixed(3);
                const level = Math.max(0, Math.min((voltage - 2.8) / (4.2 - 2.8), 1));

                bars.forEach((bar, index) => {
                    bar.classList.forEach(className => { if (className !== 'bar') { bar.classList.remove(className); } })

                    if (index < Math.floor(level * bars.length)) {
                        // bar.classList.add(voltage >= this.medium_cell_voltage ? 'high' : voltage >= this.min_cell_voltage ? 'medium' : 'low');
                        bar.classList.add(voltage >= this.medium_cell_voltage ? 'high' : voltage >= this.min_cell_voltage ? 'medium' : voltage >= this.min_cell_voltage ? 'low' : 'danger');
                    } else {
                        bar.classList.add('empty');
                    }
                });;
            } else {
                console.error('Invalid cell value:', cells[i]);
                batteryElement.textContent = 'N/A';
                bars.forEach(bar => bar.style.backgroundColor = '#c0c0c0');
            }
        }

        // Подсветка min/max
        // document.getElementById(`battery-container-${minVoltageCellNumber}`).style.backgroundColor = 'coral';
        // document.getElementById(`battery-container-${maxVoltageCellNumber}`).style.boxShadow = 'red';

        const updateValueWithFlash = (element, newValue) => {
            const valueDiv = element.querySelector('.value');
            const icon = valueDiv.querySelector('i');
            const span = valueDiv.querySelector('span');
            const spanValue = parseFloat(span.textContent);

            if (spanValue !== newValue) {
                this.#applyFlash(span);
                span.textContent = newValue.toFixed(3);

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
                setTimeout(() => {
                    icon.classList.remove('opacity-100');
                    icon.classList.add('opacity-25');
                }, 1000);

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
                balancingElement.classList.add('blink');
            } else {
                balancingElement.classList.add('invisible');
                balancingElement.classList.remove('blink');
            }
        }
    }

    #applyValueGlow(element) {
        if (!element) {
            console.error('Element is not defined');
            return;
        }

        element.classList.remove('value-glow');
        void element.offsetWidth;

        element.classList.add('value-glow');

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

    #updateChart(data) {
        if (this.chart) {

            this.chart.updateSeries([{
                name: 'totalVoltage',
                data: data.voltage
            }]);

        }
    }

    updateEEPROM(data) {
        console.log('Data from updateEEPROM:', data);

        const { register, key, value } = data;
        const block = document.querySelector(`#${register}`);

        if (!block) {
            console.error(`Element with ID "${register}" not found`);
            console.log(data);
            return;
        }

        for (const [key, value] of Object.entries(data)) {
            if (key === 'register') continue;
            const element = document.querySelector(`input[name="${key}"]`);
            if (element) {
                element.removeAttribute('disabled');
                element.checked = Boolean(value);
            } else {
                console.error(`Element not found: input#${key}`);
            }
        }

    }

    clearEEPROMswitches() {
        const ntcConfigContainer = document.querySelector('#ntc_config');
        ntcConfigContainer.querySelectorAll('input').forEach(input => input.checked = false);
        const funcConfigContainer = document.querySelector('#func_config');
        funcConfigContainer.querySelectorAll('input').forEach(input => input.checked = false);
    }

    reset() {
        this.progressContainer.querySelector('.progress-bar').style.width = '0%';
        const emptyDataMain = {
            totalVoltage: 0.0,
            current: 0.0,
            residualCapacity: 0.0,
            nominalCapacity: 0.0,
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

        this.#updateProgressBar(emptyDataMain);
        this.#updateControls(emptyDataMain);
        this.clearEEPROMswitches();
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
        progress.style.width = '100%';
        progress.style.height = '25px';

        const progressBar = document.createElement('div');
        progressBar.classList.add('percents', 'progress-bar', 'bg-info');
        progressBar.style.width = '0%';
        progress.appendChild(progressBar);

        const progressBarText = document.createElement('div');
        progressBarText.classList.add('badge', 'position-absolute', 'top-50', 'start-50', 'translate-middle', 'text-bg-info', 'text-light', 'border', 'border-2', 'border-light', 'fs-5');
        progressBarText.textContent = '0%';
        progress.appendChild(progressBarText);

        progressContainer.appendChild(progress);

        return progressContainer;
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

        <div class="row row-cols-4 justify-content-around py-3">

            <div class="col d-flex flex-column align-items-center justify-content-center shadow rounded bg-body-tertiary text-muted clickable" id="voltage_" name="totalVoltage">
                    <div class="title">Voltage</div>
                    <div class="value fs-4">
                        <i class="bi bi-caret-down-fill opacity-25"></i>
                        <span id="voltage" class="fw-medium">0.00</span><span class="fw-medium">V</span>
                    </div>
            </div>

            <div class="col d-flex flex-column align-items-center justify-content-center shadow rounded bg-body-tertiary text-muted clickable" id="current_" name="current">
                    <div class="title text-muted">Current</div>
                    <div class="value fs-4">
                        <i class="bi bi-caret-down-fill opacity-25"></i>
                        <span id="current" class="fw-medium">0.00</span><span class="fw-medium">A</span>
                    </div>
            </div>

            <div class="col d-flex flex-column align-items-center justify-content-center shadow rounded bg-body-tertiary text-muted clickable" id="power_" name="power">
                    <div class="title text-muted">Power</div>
                    <div class="value fs-4">
                        <i class="bi bi-caret-down-fill opacity-25"></i>
                        <span id="power" class="fw-medium">0.00</span><span class="fw-medium">W</span>
                    </div>
            </div>

            <div class="col d-flex flex-column align-items-center justify-content-center shadow rounded bg-body-tertiary text-muted clickable" id="capacity_" name="residualCapacity">
                    <div class="title text-muted">Capacity</div>
                    <div class="value fs-4">
                        <i class="bi bi-caret-down-fill opacity-25"></i>
                        <span id="capacity" class="fw-medium">0.00</span><span class="fw-medium">Ah</span>
                    </div>
            </div>

        </div>

        <div class="row row-cols-4 py-3">
            <div class="d-flex align-items-center justify-content-center">
                <div class="value fs-5 shadow p-3 mb-5 bg-body-tertiary rounded opacity-25 text-muted clickable" id="temperature-sensor-0" name="temperature-sensor-0">
                    <i class="bi bi-thermometer-half position-relative fs-3">
                        <i class="bi bi-caret-up-fill position-absolute top-50 start-0 translate-middle" style="font-size: 10px;"></i>
                    </i>
                    <span class="temp-sensor fs-4">0.0</span><span class="fs-4"> °C</span>
                </div>
            </div>
            <div class="d-flex align-items-center justify-content-center">
                <div class="value fs-5 shadow p-3 mb-5 bg-body-tertiary rounded opacity-25 text-muted clickable" id="temperature-sensor-1" name="temperature-sensor-1">
                    <i class="bi bi-thermometer-half position-relative fs-3">
                        <i class="bi bi-caret-up-fill position-absolute top-50 start-0 translate-middle" style="font-size: 10px;"></i>
                    </i>
                    <span class="temp-sensor fs-4">0.0</span><span class="fs-4"> °C</span>
                </div>
            </div>
            <div class="d-flex align-items-center justify-content-center">
                <div class="value fs-5 shadow p-3 mb-5 bg-body-tertiary rounded opacity-25 text-muted clickable" id="temperature-sensor-2" name="temperature-sensor-2">
                    <i class="bi bi-thermometer-half position-relative fs-3">
                        <i class="bi bi-caret-up-fill position-absolute top-50 start-0 translate-middle" style="font-size: 10px;"></i>
                    </i>
                    <span class="temp-sensor fs-4">0.0</span><span class="fs-4"> °C</span>
                </div>
            </div>
            <div class="d-flex align-items-center justify-content-center">
                <div class="value fs-5 shadow p-3 mb-5 bg-body-tertiary rounded opacity-25 text-muted clickable" id="temperature-sensor-3" name="temperature-sensor-3">
                    <i class="bi bi-thermometer-half position-relative fs-3">
                        <i class="bi bi-caret-up-fill position-absolute top-50 start-0 translate-middle" style="font-size: 10px;"></i>
                    </i>
                    <span class="temp-sensor fs-4"0.0</span><span class="fs-4"> °C</span>
                </div>
            </div>
        </div>

        <div class="row row-cols-3 p-3">

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

        <div class="row row-cols-3 p-3">

            <div class="col border-start" id="ntc_config">
                <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" role="switch" name="ntc1" disabled>
                    <label class="form-check-label" for="ntc_config_ntc1">ntc1</label>
                </div>
                <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" role="switch" name="ntc2" disabled>
                    <label class="form-check-label" for="ntc_config_ntc2">ntc2</label>
                </div>
                <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" role="switch" name="ntc3" disabled>
                    <label class="form-check-label" for="ntc_config_ntc3">ntc3</label>
                </div>
                <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" role="switch" name="ntc4" disabled>
                    <label class="form-check-label" for="ntc_config_ntc4">ntc4</label>
                </div>
                <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" role="switch" name="ntc5" disabled>
                    <label class="form-check-label" for="ntc_config_ntc5">ntc5</label>
                </div>
                <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" role="switch" name="ntc6" disabled>
                    <label class="form-check-label" for="ntc_config_ntc6">ntc6</label>
                </div>
                <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" role="switch" name="ntc7" disabled>
                    <label class="form-check-label" for="ntc_config_ntc7">ntc7</label>
                </div>
                <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" role="switch" name="ntc8" disabled>
                    <label class="form-check-label" for="ntc_config_ntc8">ntc8</label>
                </div>

            </div>

            <div class="col border-start" id="func_config">
                <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" role="switch" name="switch" disabled>
                    <label class="form-check-label" for="func_config_switch">switch</label>
                </div>
                <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" role="switch" name="scrl" disabled>
                    <label class="form-check-label" for="func_config_scrl">scrl</label>
                </div>
                <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" role="switch" name="balance_en" disabled>
                    <label class="form-check-label" for="func_config_balance_en">balance_en</label>
                </div>
                <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" role="switch" name="chg_balance_en" disabled>
                    <label class="form-check-label" for="func_config_chg_balance_en">chg_balance_en</label>
                </div>
                <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" role="switch" name="led_en" disabled>
                    <label class="form-check-label" for="func_config_led_en">led_en</label>
                </div>
                <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" role="switch" name="led_num" disabled>
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
            this.callback({ chargeMosfet: controlsContainer.querySelector('#switchChargeMosfet').checked, });
        });

        controlsContainer.querySelector('#switchDisChargeMosfet').addEventListener('change', () => {
            this.callback({ dischargeMosfet: controlsContainer.querySelector('#switchDisChargeMosfet').checked });
        });

        controlsContainer.querySelector('#switchEepromMode').addEventListener('change', () => {
            this.callback({ eepromMode: controlsContainer.querySelector('#switchEepromMode').checked });
        });


        const ntcConfigContainer = controlsContainer.querySelector('#ntc_config');
        ntcConfigContainer.querySelectorAll('.form-check').forEach(element => {
            element.querySelector('.form-check-input').addEventListener('change', () => {
                const switchesState = {};
                ntcConfigContainer.querySelectorAll('.form-check-input').forEach(input => {
                    const name = input.getAttribute('name');
                    const value = input.checked;
                    if (!name || !value) return;
                    switchesState[name] = value;
                });

                console.log(switchesState);
                this.callback({ ntc_config: switchesState });
            });
        })

        const funcConfigContainer = controlsContainer.querySelector('#func_config');
        funcConfigContainer.querySelectorAll('.form-check').forEach(element => {
            element.querySelector('.form-check-input').addEventListener('change', () => {
                const switchesState = {};
                funcConfigContainer.querySelectorAll('.form-check-input').forEach(input => {
                    const name = input.getAttribute('name');
                    const value = input.checked;
                    if (!name || !value) return;
                    switchesState[name] = value;
                });
                console.log(switchesState);
                this.callback({ func_config: switchesState });
            });
        })


        if (document.querySelector('#graphics')) {

            controlsContainer.querySelectorAll('.clickable').forEach(element => {
                element.addEventListener('click', (event) => {
                    if (event.target.closest('.clickable')) {
                        const paramName = event.target.closest('.clickable').getAttribute('name');
                        console.log('paramName', paramName);

                        const loadedData = JSON.parse(localStorage.getItem('bleDataCollection')) || [];
                        console.log('Данные обновлены', loadedData);

                        this.chart = new ApexCharts(document.querySelector("#graphics").querySelector(".modal-body"), {
                            chart: {
                                type: 'line',
                                stroke: {
                                    curve: 'smooth'
                                },
                                markers: {
                                    size: 0
                                }
                            },
                            series: [{
                                name: paramName,
                                data: paramName.includes("temperature-sensor-") ? loadedData.map(item => item.bleData.temperature[parseInt(paramName.substring(paramName.length - 1))]) : loadedData.map(item => item.bleData[paramName].toFixed(2)),
                            }],
                            xaxis: {
                                categories: loadedData.map(item => new Date(item.timestamp).toLocaleTimeString())
                            }
                        });
                        this.chart.render().then(() => this.modal.show());
                    }
                })
            });
        }

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

        const updateValueWithFlash = (element, newValue) => {
            const valueDiv = element.querySelector('.value');
            const icon = valueDiv.querySelector('i');
            const span = valueDiv.querySelector('span');
            const spanValue = parseFloat(span.textContent);

            if (spanValue !== newValue) {
                span.textContent = newValue.toFixed(2);
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


        updateValueWithFlash(document.getElementById('voltage_'), voltage);
        updateValueWithFlash(document.getElementById('current_'), current);
        updateValueWithFlash(document.getElementById('power_'), power);
        updateValueWithFlash(document.getElementById('capacity_'), capacity);


        for (let i = 0; i < data.numberOfTemperatureSensors; i++) {
            const temperatureSensor = this.controls.querySelector(`#temperature-sensor-${i}`);
            const span = temperatureSensor.querySelector('span');
            span.textContent = data.temperature[i].toFixed(1);
            if (temperatureSensor.classList.contains('opacity-25')) temperatureSensor.classList.remove('opacity-25');
        }

        const protection = this.controls.querySelector('#protection');
        const span = protection.querySelector('span');
        const icon = protection.querySelector('i');
        if (data.protection && data.protectionStatus.length > 0) {
            icon.classList.remove('bi-check-lg');
            icon.classList.add('bi-x-lg');
            span.textContent = data.protectionStatus;
        } else {
            icon.classList.remove('bi-x-lg');
            icon.classList.add('bi-check-lg');
            span.textContent = 'No active protections';
        }
    }

}