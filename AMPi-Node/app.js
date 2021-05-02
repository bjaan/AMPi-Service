let SerialPort = require('serialport');
let ShairportReader = require('shairport-sync-reader');
const { exec } = require("child_process");

let shairportActive = false;
let shairportOpen = false;
const MAX_MESSAGE = 200;
const MAX_TEXT = 35;

// Utility Functions

function serialSend(buf, success) {
	serial0.write(buf, (err) => {
		if (err) { console.log('Error on write: ', err.message); return; }
		success();
	});
}
function serialSendStatus(text) {
	let textBuf = Buffer.from(text, 'ascii');
	let buf = Buffer.alloc(textBuf.length+4);
	textBuf.copy(buf, 3);
	buf[0] = 60; // < 3C
	buf[1] = 83; // S 53
	buf[2] = textBuf.length;
	buf[buf.length-1] = 62; // > 3E
	console.log(buf);
	serialSend(buf, () => console.log('Status "' + text + '" sent'));
}

// Service Monitor

function checkShairport() {
	exec("service shairport-sync status | grep inactive", (error, stdout, stderr) => {
		if (stdout.includes("inactive")) {
			if (shairportActive /*only once*/) {
				console.log("shairport down");
				serialSend(Buffer.from('<R\x03\xFF\x8C\x1A>', 'ascii'), () => console.log('Airplay RED sent'));
				shairportOpen = false;
			}
			shairportActive = false;
		} else {
			if (!shairportOpen /*when not connected*/ && !shairportActive /*only once*/) {
				console.log("shairport up");
				serialSend(Buffer.from('<R\x03\xFF\xFF\xFF>', 'ascii'), () => console.log('Airplay WHITE sent'));
			}
			shairportActive = true;
		}
	});
}

setInterval(function() {
	checkShairport();
}, 5000);

// Shairport Sync Management

let shairPort = new ShairportReader({ path: '/tmp/shairport-sync-metadata' });
shairPort.on('pbeg',readShairPortBegin);
shairPort.on('pend',readShairPortEnd);

function readShairPortBegin(data) {
	console.log("shairport pbeg " + JSON.stringify(data));
	serialSend(Buffer.from('<R\x03\x10\x79\xE6>', 'ascii'), () => {
		shairportOpen = true;
		console.log('Airplay BLUE sent');
	});
	serialSendStatus("> " + data["Client-IP"]);
}

function readShairPortEnd(data) {
	console.log("shairport pend " + JSON.stringify(data));
	serialSend(Buffer.from('<R\x03\xFF\xFF\xFF>', 'ascii'), () => {
		shairportOpen = false;
		console.log('Airplay WHITE sent');
	});
	serialSendStatus("");
}

// Serial Management

let serial0 = new SerialPort('/dev/serial0', 9600);

serial0.on('open', showPortOpen);
serial0.on('data', readSerialData);
serial0.on('close', showPortClose);
serial0.on('error', showError);

function showPortOpen() {
	console.log('port open. Data rate: ' + serial0.baudRate);
	serialSend(Buffer.from('<P>', 'ascii'), () => console.log('Power On (P) sent'));
	checkShairport();
}

function readSerialData(data) {
	//console.log(data.toString());
}

function showPortClose() { console.log(' serial port closed.'); }

function showError(error) { console.log('Serial port error: ' + error); }