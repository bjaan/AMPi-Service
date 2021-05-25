const SerialPort = require('serialport');
const ByteLength = require('@serialport/parser-byte-length');
const ShairportReader = require('shairport-sync-reader');
const fs = require('fs');
const loadIniFile = require('read-ini-file');
const { exec } = require("child_process");
const Jimp = require('jimp');

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
					PLAYER_DATA.songStartTime = null; PLAYER_DATA.songEndTime = null;
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
	/*if (PLAYER_DATA.songStartTime && PLAYER_DATA.songEndTime) {
		console.log("CURRENT START TIME: " + PLAYER_DATA.songStartTime);
		console.log("CURRENT END TIME: " + PLAYER_DATA.songEndTime);
	}*/
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
			console.log('Starting pianobar.');
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
   PLAYER_DATA.artist = pianobarNowPlaying.artist;
   PLAYER_DATA.title = pianobarNowPlaying.title;
   PLAYER_DATA.songStartTime = fs.statSync(PIANOBAR_NOWPLAYING).mtime;
   PLAYER_DATA.songEndTime = new Date(); PLAYER_DATA.songEndTime.setSeconds(PLAYER_DATA.songStartTime.getSeconds() + songDuration);
   updatePlayerUI();
}

// Player UI 

const PLAYER_DATA = {
	artist : null,
	title : null,
    songStartTime : null,
    songEndTime : null   
};

const CANVAS_WIDTH = 150;
const CANVAS_HEIGHT = 105;
const CANVAS_BLOCK_HEIGHT = 5;

const canvas1 = new Jimp(CANVAS_WIDTH, CANVAS_HEIGHT, 0x000000FF);
const canvas2 = new Jimp(CANVAS_WIDTH, CANVAS_HEIGHT, 0x000000FF);

const blockdatasize = 2 + (CANVAS_BLOCK_HEIGHT * CANVAS_BLOCK_HEIGHT * 2);
let blockbuffer = Buffer.alloc(2 /* <> */ + 2 /* command + size */ + blockdatasize /* block data */);
blockbuffer[0 /*begin*/] = 60 /*<*/; blockbuffer[blockbuffer.length-1 /*end*/] = 62 /*>*/;
blockbuffer[1 /*command*/] = 68 /*D*/; blockbuffer[2 /*payloadsize*/] = blockdatasize;

blockbuffer[3 /*x*/] = 0;
blockbuffer[4 /*y*/] = 0;

function convertRGB888toRGB565(r, g, b) 
{
  r = (r * 249 + 1014) >> 11;
  g = (g * 253 + 505) >> 10;
  b = (b * 249 + 1014) >> 11;
  let RGB565 = 0;
  RGB565 = RGB565 | (r << 11);
  RGB565 = RGB565 | (g << 5);
  RGB565 = RGB565 | b;

  return RGB565;
}

let prev_artist = '';
let prev_title = '';

function updatePlayerUI() {
  Jimp.loadFont(Jimp.FONT_SANS_16_BLACK)
    .then(font => 
	{
		canvas1.print(font, 0, 30, prev_artist);
		canvas1.print(font, 0, 50, prev_title);
	})
	.then(() => Jimp.loadFont(Jimp.FONT_SANS_16_WHITE))
    .then(font => {
		canvas1.print(font, 0, 30, PLAYER_DATA.artist);
		canvas1.print(font, 0, 50, PLAYER_DATA.title);
	})
	.then(() => {
		prev_artist = PLAYER_DATA.artist;
		prev_title = PLAYER_DATA.title;
		sendUIUpdates();
	});
}

function sendUIUpdates() {
	let different = false;
	//scan image and determine changes
	let s = Math.floor(Math.random() * CANVAS_WIDTH*CANVAS_HEIGHT); //select random pixel
	let i = s*4; //4 bytes per pixel in data
	let y = Math.floor(s / CANVAS_WIDTH); //line to scan based on pixel
	let x = s - (y * CANVAS_WIDTH); //pixel on line
	while (i < CANVAS_WIDTH*CANVAS_HEIGHT*4) { //from selected pixel to end
		//console.log("i="+i + " x="+x+ " y="+y)
		if (canvas1.bitmap.data[i] == canvas2.bitmap.data[i]) {
			i++;
			if (canvas1.bitmap.data[i] == canvas2.bitmap.data[i]) {
				i++;
				if (canvas1.bitmap.data[i] == canvas2.bitmap.data[i]) {
					i+=2;
				} else { different = true; break; }
			} else { different = true; break; }
		} else { different = true; break; };
		if (x < CANVAS_WIDTH-1) x++; else { x = 0; y++; };
	}
	if (!different) { //no differences found from selected pixel to end
		i = 0; y = 0; x = 0;
		while (i < s*4) { //from beginning to selected pixel
			if (canvas1.bitmap.data[i] == canvas2.bitmap.data[i]) {
				i++;
				if (canvas1.bitmap.data[i] == canvas2.bitmap.data[i]) {
					i++;
					if (canvas1.bitmap.data[i] == canvas2.bitmap.data[i]) {
						i+=2;
					} else { different = true; break; }
				} else { different = true; break; }
			} else { different = true; break; };
			if (x < CANVAS_WIDTH-1) x++; else { x = 0; y++; };
		}
	}
	if (!different) {
		console.log("UI updated.");
		return;
	}
	//console.log("difference detected at x="+x+" y="+y);
	//send one block
	let blockx = Math.floor(x / CANVAS_BLOCK_HEIGHT);
	let blocky = Math.floor(y / CANVAS_BLOCK_HEIGHT);
	blockbuffer[3 /*x*/] = blockx;
	blockbuffer[4 /*y*/] = blocky;
	//console.log("sending block x="+blockx+" y="+blocky);
	let j = ((blocky*CANVAS_WIDTH*CANVAS_BLOCK_HEIGHT)+(blockx*CANVAS_BLOCK_HEIGHT))*4;
	let g = 0;
	for (i = 5; i < blockbuffer.length-1; i+=2) {
		let RGB565 = convertRGB888toRGB565(canvas1.bitmap.data[j],canvas1.bitmap.data[j+1],canvas1.bitmap.data[j+2]); //get color and convert
		canvas2.bitmap.data[j] = canvas1.bitmap.data[j]; canvas2.bitmap.data[j+1] = canvas1.bitmap.data[j+1]; canvas2.bitmap.data[j+2] = canvas1.bitmap.data[j+2]; //copy to canvas2
		blockbuffer[i]= (RGB565 >> 8);
		blockbuffer[i+1]  = RGB565 & 0xFF;		
		j+=4; g++;
		if (g == CANVAS_BLOCK_HEIGHT) {
			j += (CANVAS_WIDTH-CANVAS_BLOCK_HEIGHT)*4; //next rows index at the left hand side of the (square) block
			g = 0;
		}
		
	}
	serialSend(blockbuffer, () => { /* console.log('Block sent'); */ });	
}

// Serial Management

let serial0 = new SerialPort('/dev/serial0', { baudRate: 115200 });

serial0.on('open', showPortOpen);
serial0.on('close', showPortClose);
serial0.on('error', showError);

function showPortOpen() {
	console.log('port open. Data rate: ' + serial0.baudRate);
	unblock()
		.then(powerOnConfirm())
		.then(() => checkStatusses());
}

function showPortClose() { console.log('serial port closed.'); }

function showError(error) { console.log('Serial port error: ' + error); }

let serialParser = serial0.pipe(new ByteLength({length: 1}))
serialParser.on('data', serialReceiveByte) // will have 1 byte per data event

const PPP_T_POWER_OFF_REQUEST = 0x70; //p   <p>
const PPP_PANDORA_MUSIC       = 0x4E; //N   <N>
const PPP_T_READY             = 0x79; //y   <y>

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
		.then(shutdownShairport())
		.then(startupPianobar())
		.then(unblock())
		.then(new Promise((resolve) => { serialSendStatus("Pandora ready."); resolve() }));
	  break;
	case PPP_T_READY:
	  sendUIUpdates();
	  break;
    default:
      console.log("Command " + receiveBuffer[PPP_NDX_COMMAND] + " NOT IMPLEMETED\n");
      break;
  }  
}