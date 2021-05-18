const SerialPort = require('serialport');
const ByteLength = require('@serialport/parser-byte-length');
const ShairportReader = require('shairport-sync-reader');
const fs = require('fs');
const loadIniFile = require('read-ini-file');
const { exec } = require("child_process");

let shairportActive = false;
let shairportOpen = false;

let pianobarActive = false;
let pianobarNowPlayingListener = function (curr, prev) { readPianobarInfo(); };

// Serial Commenication

const MAX_MESSAGE = 200;
const MAX_TEXT = 35;
const PPP_BEGIN_FLAG = 0x3C; const PPP_END_FLAG = 0x3E; const PPP_NDX_COMMAND = 0; const PPP_NDX_LENGTH = 1;
let receiving = false;
let receiveBuffer = Buffer.alloc(MAX_MESSAGE);
let receiveIndex = 0;
let receiveSizeLeft = 0;

// Configuration

const SHAIRPORT_METADATA = '/tmp/shairport-sync-metadata';
const PIANOBAR_NOWPLAYING = '/home/pi/.config/pianobar/nowplaying';

// Playing Song Information to share with  

let songStartTime = null;
let songEndTime = null;
   
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

function serialReceiveByte(buffer /*1 byte*/) {
	let character = buffer[0];
    if (!receiving) {
		if (character == PPP_BEGIN_FLAG) {
			receiving = true;
			receiveIndex = 0;
			receiveSizeLeft = 1; //the command is expected - so 1 byte
		}
    } else {
      if (character == PPP_END_FLAG && receiveSizeLeft == 0) {
        if (receiveIndex <= PPP_NDX_LENGTH) receiveBuffer[PPP_NDX_LENGTH] = 0; //no length received - 1 byte packet like <P>
        receiving = false;
        processReceiveBuffer();
      } else {
        if (receiveIndex < MAX_MESSAGE-1) {
          receiveBuffer[receiveIndex] = character;
          if (receiveIndex == PPP_NDX_LENGTH) receiveSizeLeft = character;  
                                         else if (receiveSizeLeft == 0) receiving = false; else receiveSizeLeft--;
          receiveIndex++;
        } else receiving = false;
      } 
    }
}

function powerOnConfirm() {
	return new Promise((resolve, reject) => {
		serialSend(Buffer.from('<P>', 'ascii'), () => { console.log('Power On (P) sent'); resolve(); });
	});
}

function block() {
	return new Promise((resolve, reject) => {
		serialSend(Buffer.from('<B>', 'ascii'), () => { console.log('Block command sent'); resolve(); });
	});
}

function unblock() {
	return new Promise((resolve, reject) => {
		serialSend(Buffer.from('<b>', 'ascii'), () => { console.log('Unblock command sent'); resolve(); });
	});
}

function powerOff() {
	exec("sudo poweroff", (error, stdout, stderr) => {
		if (error) { console.log(`error: ${error.message}`); return; }
		if (stderr) { console.log(`stderr: ${stderr}`);	return;	}
		console.log(`stdout: ${stdout}`);
		console.log('Powering off...');
	});
}

// Service Monitor

function checkShairport() {
	return new Promise((resolve, reject) => {
		exec("service shairport-sync status | grep inactive", (error, stdout, stderr) => {
			if (stdout.includes("inactive")) {
				if (shairportActive /*only once*/) {
					console.log("shairport down");
					serialSend(Buffer.from('<R\x03\xFF\x8C\x1A>', 'ascii'), () => console.log('Airplay RED sent'));
					serialSendStatus("");
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
			resolve();
		});
	});
}

function checkPianobar() {
	return new Promise((resolve, reject) => {
		exec("service pianobar status | grep inactive", (error, stdout, stderr) => {
			if (stdout.includes("inactive")) {
				if (pianobarActive /*only once*/) {
					console.log("pianobar down");
					serialSend(Buffer.from('<N\x03\xFF\x8C\x1A>', 'ascii'), () => console.log('Pandora RED sent'));
					serialSendStatus("");
					fs.unwatchFile(PIANOBAR_NOWPLAYING, pianobarNowPlayingListener);
					songStartTime = null; songEndTime = null;
				}
				pianobarActive = false;
			} else {
				if (!pianobarActive /*only once*/) {
					console.log("pianobar up");
					serialSend(Buffer.from('<N\x03\xFF\xFF\xFF>', 'ascii'), () => console.log('Pandora WHITE sent'));
					readPianobarInfo();
					fs.watchFile(PIANOBAR_NOWPLAYING, pianobarNowPlayingListener);
				}
				pianobarActive = true;
			}
			resolve();
		});
	});
}

function checkStatusses() {
	checkShairport()
	.then(checkPianobar());
	if (songStartTime && songEndTime) {
		console.log("CURRENT START TIME: " + songStartTime);
		console.log("CURRENT END TIME: " + songEndTime);
	}
}
setInterval(checkStatusses, 5000);

// Shairport Sync Management

let shairPort = new ShairportReader({ path: SHAIRPORT_METADATA });
shairPort.on('pbeg',readShairPortBegin);
shairPort.on('pend',readShairPortEnd);

function readShairPortBegin(data) {
	console.log("sudo shairport pbeg " + JSON.stringify(data));
	serialSend(Buffer.from('<R\x03\x00\xBE\xFF>', 'ascii'), () => {
		shairportOpen = true;
		console.log('Airplay BLUE sent');
	});
	serialSendStatus("> " + data["Client-IP"]);
}

function readShairPortEnd(data) {
	console.log("sudo shairport pend " + JSON.stringify(data));
	serialSend(Buffer.from('<R\x03\xFF\xFF\xFF>', 'ascii'), () => {
		shairportOpen = false;
		console.log('Airplay WHITE sent');
	});
	serialSendStatus("");
}

function shutdownShairport() {
	return new Promise((resolve, reject) => {
		if (!shairportActive) 
			resolve();
		else {
			exec("sudo service shairport-sync stop", (error, stdout, stderr) => {
				console.log('Airplay stopped.');
				return checkShairport();
			});
		}
	});
}

function startupShairport() {
	return new Promise((resolve, reject) => {
		if (!shairportActive) 
			resolve();
		else {
			exec("sudo service shairport-sync start", (error, stdout, stderr) => {
				console.log('Airplay started.');
				return checkShairport();
			});
		}
	});
}

// Pianobar Management

function shutdownPianobar() {
	return new Promise((resolve, reject) => {
		if (!pianobarActive)
			resolve();
		else {
			exec("sudo service pianobar stop", (error, stdout, stderr) => {
				console.log('Pianobar stopped.');
				return checkPianobar();
			});
		}
	});
}

function startupPianobar() {
	return new Promise((resolve, reject) => {
		if (pianobarActive) {
			resolve();
		} else {
			exec("sudo service pianobar start", (error, stdout, stderr) => {
				console.log('Pianobar started.');
				return checkPianobar();
			});
		}
	});
}

function readPianobarInfo() {
   let pianobarNowPlaying = loadIniFile.sync(PIANOBAR_NOWPLAYING);
   console.log(`CURRENT SONG: ${pianobarNowPlaying.artist} - ${pianobarNowPlaying.title} on ${pianobarNowPlaying.album} on ${pianobarNowPlaying.stationName}` );
   let songDuration = parseInt(pianobarNowPlaying.songDuration);
   songStartTime = fs.statSync(PIANOBAR_NOWPLAYING).mtime;
   songEndTime = new Date(); songEndTime.setSeconds(songStartTime.getSeconds() + songDuration);
}

// Serial Management

let serial0 = new SerialPort('/dev/serial0', 9600);

serial0.on('open', showPortOpen);
serial0.on('close', showPortClose);
serial0.on('error', showError);

function showPortOpen() {
	console.log('port open. Data rate: ' + serial0.baudRate);
	unblock()
		.then(powerOnConfirm)
		.then(() => checkStatusses());
}

function showPortClose() { console.log('serial port closed.'); }

function showError(error) { console.log('Serial port error: ' + error); }

let serialParser = serial0.pipe(new ByteLength({length: 1}))
serialParser.on('data', serialReceiveByte) // will have 1 byte per data event

const PPP_T_POWER_OFF_REQUEST = 0x70; //p   <p>
const PPP_PANDORA_MUSIC       = 0x4E; //N   <N>

function processReceiveBuffer() {
	switch (receiveBuffer[PPP_NDX_COMMAND]) {  //first byte to be expected signal/command type - second (depending on the command) is the size in bytes of the payload
    case PPP_T_POWER_OFF_REQUEST: /*Power Off command sent by Raspberry Pi and we need to shut down! */ 
		serialSend(Buffer.from('<p>', 'ascii'), () => {
			setInterval(function() {
				powerOff();
			}, 2000);
		});
      break;
    case PPP_PANDORA_MUSIC:
	  console.log('Pandora Music command.');
	  block()
		.then(shutdownShairport)
		.then(startupPianobar)
		.then(unblock)
		.then(() => serialSendStatus("Pandora ready."));
	  break;
    default:
      console.log("Command " + receiveBuffer[PPP_NDX_COMMAND] + " NOT IMPLEMETED\n");
      break;
  }  
}