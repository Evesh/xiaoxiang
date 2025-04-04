import { initializeApp } from "firebase/app";

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


export const SERVICE_UUID = '0000ff00-0000-1000-8000-00805f9b34fb'; // UUID сервиса
export const CHARACTERISTIC_TX_UUID = '0000ff02-0000-1000-8000-00805f9b34fb'; // UUID характеристики TX
export const CHARACTERISTIC_RX_UUID = '0000ff01-0000-1000-8000-00805f9b34fb'; // UUID характеристики RX
export const BMS_REQUEST_MAIN = new Uint8Array([0xDD, 0xA5, 0x03, 0x00, 0xFF, 0xFD, 0x77]);
export const BMS_REQUEST_CELLS = new Uint8Array([0xDD, 0xA5, 0x4, 0x0, 0xFF, 0xFC, 0x77]);

export const bms_mosfet_write = [
    new Uint8Array([0xDD, 0x5A, 0xE1, 0x02, 0x00, 0x00, 0xFF, 0x1D, 0x77]), // All ON
    new Uint8Array([0xDD, 0x5A, 0xE1, 0x02, 0x00, 0x01, 0xFF, 0x1C, 0x77]), // discharge ON
    new Uint8Array([0xDD, 0x5A, 0xE1, 0x02, 0x00, 0x02, 0xFF, 0x1B, 0x77]), // charge ON
    new Uint8Array([0xDD, 0x5A, 0xE1, 0x02, 0x00, 0x03, 0xFF, 0x1A, 0x77]), // All OFF
  ];
  
export const EEPROM = [
    new Uint8Array([0xdd, 0x5a, 0x00, 0x02, 0x56, 0x78, 0xff, 0x30, 0x77]), // Enter
    new Uint8Array([0xdd, 0x5a, 0x01, 0x02, 0x00, 0x00, 0xff, 0xfd, 0x77]), // Exit
  ]