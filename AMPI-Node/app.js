let SerialPort = require('serialport');
let serial0 = new SerialPort('/dev/serial0', 9600);

serial0.on('open', showPortOpen);
serial0.on('data', readSerialData);
serial0.on('close', showPortClose);
serial0.on('error', showError);

function showPortOpen() {
  console.log('port open. Data rate: ' + serial0.baudRate);
  serial0.write('\x7EP\x7F', function(err) {
  if (err) {
    console.log('Error on write: ', err.message);
    return;
  }
  console.log('message written')
})
}

function readSerialData(data) {
  console.log(data);
}

function showPortClose() {
  console.log('port closed.');
}

function showError(error) {
  console.log('Serial port error: ' + error);
}