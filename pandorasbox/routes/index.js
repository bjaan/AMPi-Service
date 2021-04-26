var fs = require('fs');
var express = require('express');
var router = express.Router();
var loadIniFile = require('read-ini-file');
const { exec } = require("child_process");

/* GET home page. */
router.get('/', function(req, res, next) {
  let action = req.query.action;
  let id = null;
  if (action) {
    if (action.indexOf("_")>=0) {
      id = action.substring(action.indexOf("_")+1);
      action = action.substring(0,action.indexOf("_"));
    }
    switch (action) {
      case 'love':
        exec("echo -n '+' > /home/pi/.config/pianobar/ctl");
        return res.redirect('/');
      case 'pause':
        exec("echo -n 'p' > /home/pi/.config/pianobar/ctl");
        return res.redirect('/');
      case 'next':
        exec("echo -n 'n' > /home/pi/.config/pianobar/ctl");
        return res.redirect('/');
      case 'hate':
        exec("echo -n '-' > /home/pi/.config/pianobar/ctl");
        return res.redirect('/');
      case 'station':
        exec("printf 's"+id+"\\n' > /home/pi/.config/pianobar/ctl");
        return res.redirect('/');
      case 'newstationsong':
        exec("printf 'c"+id+"\\nt\\n0\\n\\ns0\\n' > /home/pi/.config/pianobar/ctl");
        return res.redirect('/');
      case 'newstationartist':
        exec("printf 'c"+id+"\\na\\n0\\n\\ns0\\n' > /home/pi/.config/pianobar/ctl");
        return res.redirect('/');
      case 'delete':
        exec("printf 'dy\\ns0\\n' > /home/pi/.config/pianobar/ctl");
        return res.redirect('/');
      default:
        //no action
        return null;
    }
  }
  const nowplaying = loadIniFile.sync('/home/pi/.config/pianobar/nowplaying');
  const playingStart = fs.statSync('/home/pi/.config/pianobar/nowplaying').mtimeMs;
  const event = fs.readFileSync('/home/pi/.config/pianobar/event', 'utf8');
  const state = loadIniFile.sync('/home/pi/.config/pianobar/state');
  const artist = nowplaying.artist;
  const coverArt = nowplaying.coverArt;
  const title = nowplaying.title;
  const album = nowplaying.album;
  const station = nowplaying.stationName;
  const songDuration = nowplaying.songDuration;
  const stations = [];
  let nStation = 0;
  while (nowplaying["station"+nStation]) {
    stations.push(nowplaying["station"+nStation]);
    nStation++;
  }
  const volume = parseInt(state.volume);
  res.render('index', 
	{
		page:'Home', 
		menuId:'home',
		artist : artist,
		title : title,
		album : album,
		station : station,
		coverArt : coverArt,
		event : event,
                stations : stations,
                volume : volume,
                songDuration : songDuration,
                playingStart : playingStart
	});
});

module.exports = router;
