let SerialPort = require('serialport');
let ShairportReader = require('shairport-sync-reader');

// Shairport Sync Management
let shairPort = new ShairportReader({ path: '/tmp/shairport-sync-metadata' });
shairPort.on('pbeg',readShairPortBegin);

function readShairPortBegin(data) {
  console.log("shairport pbeg " + JSON.stringify(data));
  serial0.write('\x7ER\xDC\x13\x7F', function(err) {
  if (err) {
        console.log('Error on write: ', err.message);
        return;
  }
  console.log('Airplay BLUE sent');
})
}

// Serial Management

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
  console.log('Power On (P) sent')
})
}

function readSerialData(data) {
  console.log(data.toString());
}

function showPortClose() {
  console.log('port closed.');
}

function showError(error) {
  console.log('Serial port error: ' + error);
}

