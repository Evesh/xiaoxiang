

let bleDataPrev = {
    totalVoltage: 0,
    current: 0,
    power: 0,
    nominalCapacity: 0,
    temperature: [0, 0, 0, 0, 0, 0, 0, 0],
};


export function saveBLEData(bleData) {

    console.log(typeof bleData.totalVoltage, typeof bleDataPrev.totalVoltage);

    if (bleData.totalVoltage === bleDataPrev.totalVoltage &&
        bleData.current === bleDataPrev.current &&
        bleData.power === bleDataPrev.power &&
        bleData.nominalCapacity === bleDataPrev.nominalCapacity &&
        bleData.temperature.every((temp, index) => temp === bleDataPrev.temperature[index])) {
        return;
    }

    bleDataPrev = bleData;

    const currentTime = new Date().toISOString(); // или .toLocaleString() для удобного чтения

    const dataToSave = {
        timestamp: currentTime,
        bleData: bleData
    };

    let savedData = JSON.parse(localStorage.getItem('bleDataCollection')) || [];
    savedData.push(dataToSave);
    localStorage.setItem('bleDataCollection', JSON.stringify(savedData));
    console.log('Данные сохранены:', dataToSave);
}
