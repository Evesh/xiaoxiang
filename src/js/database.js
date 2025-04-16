let bleDataPrev = {
    totalVoltage: 0,
    current: 0,
    power: 0,
    nominalCapacity: 0,
    temperature: [0, 0, 0, 0, 0, 0, 0, 0],
};


export function saveBLEData(bleData) {

    const currentTime = new Date();

    if (bleData.totalVoltage - bleDataPrev.totalVoltage >= 0.2 || bleData.totalVoltage - bleDataPrev.totalVoltage <= -0.2 ||
        bleData.current - bleDataPrev.current >= 0.1 || bleData.current - bleDataPrev.current <= -0.1 ||
        bleData.power - bleDataPrev.power >= 1 || bleData.power - bleDataPrev.power <= -1 ||
        bleData.nominalCapacity - bleDataPrev.nominalCapacity >= 0.1 || bleData.nominalCapacity - bleDataPrev.nominalCapacity <= -0.1 ||
        bleData.temperature.some((temp, index) => Math.abs(temp - bleDataPrev.temperature[index]) >= 0.1)) {
        bleDataPrev = bleData;

        const dataToSave = {
            timestamp: currentTime.toISOString(),
            bleData: bleData
        };

        let savedData = JSON.parse(localStorage.getItem('bleDataCollection')) || [];
        savedData.push(dataToSave);
        localStorage.setItem('bleDataCollection', JSON.stringify(savedData));
    }

    // if (bleData.totalVoltage === bleDataPrev.totalVoltage &&
    //     bleData.current === bleDataPrev.current &&
    //     bleData.power === bleDataPrev.power &&
    //     bleData.nominalCapacity === bleDataPrev.nominalCapacity &&
    //     bleData.temperature.every((temp, index) => temp === bleDataPrev.temperature[index])) {
    //     return;
    // }

    // if(bleData.totalVoltage - bleDataPrev.totalVoltage < 0.01 || bleDataPrev.totalVoltage - bleData.totalVoltage < 0.01) {
    //     return
    // }


}


