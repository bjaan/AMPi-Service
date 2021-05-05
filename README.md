# AMPi-Service
AMPi is a project that integrates a mains electricity power supply with an audio amplifier, an 4-channel audio relay switcher, input audio transformers, a Raspberry Pi with DAC, a ST7735 based TFT display, and an Arduino Nano (to control the Raspberry PI over serial and the built-in screen) to make a completely integrated digital audio solution that supports the latest high quality internet audio streaming and smart speaker AirPlay & Bluetooth 4.2 functionality over either wired Ethernet or Wi-Fi in one box.

This repository is the service code for the Raspberry Pi.

The Node.js app lives in the **AMPi-Node** folder.

For the code running on the Arduino Nano, go to the [AMPi-Display-Interface](https://github.com/bjaan/AMPi-Display-Interface) repository.

# AMPi features

* 2 channels x 100W (Stereo) Class D Audio Amplifier
* Built-in internet audio streaming device with high-quality Digital-to-Analog Converter (DAC), e.g. FLAC 24-bits 192khz
* Built-in pre-amplifier and audio transformers, to allow full galvanic separation between external audio equipment and the DAC and AMPi
* Computer-controlled interface that controls the screen, manages the power of and the services running on the built-in audio streaming device
* 3 switchable analog audio input channels using a relay array through a rotary switch
* Audio level indicator
* Built-in mains power supply (100-230V)
* AirPlay playback using [**Shairport Sync**](https://github.com/mikebrady/shairport-sync). AMPi identifies itself as a AirPlay network player, where your iPhone or iTunes on a Mac can be connected to, to play music.  You can also use iTunes on Windows 10 to play music through AirPlay or route your audio to AMPi using [**TuneBlade**](http://www.tuneblade.com/)
* Bluetooth 4.2 Playback, this overrides everything and directly accessible after power-up
* Pandora.com music player (WIP), using [Pianobar](https://github.com/PromyLOPh/pianobar)

For parts / tools used for the hardware, refer to the [AMPi-Display-Interface](https://github.com/bjaan/AMPi-Display-Interface) repository.

# pandorasbox - Pandora Music player

This repository also has (alpha-level) code for a Pandora Player remote control application, called **pandorasbox**, that is allows control via Web Browser, and not yet through the AMPi interface.  It sends keyboard strokes over an [Express](https://expressjs.com/) Node.js application to control a local instance of [Pianobar](https://github.com/PromyLOPh/pianobar), and displays the cover art of the currently playing song.

This will be moved to a seperate repository soon.

![pandorasbox - playing a song in the web browser](https://raw.githubusercontent.com/bjaan/AMPi-Service/main/pandorasbox-playing.png)
![pandorasbox - showing the available channels on Pandora.com which can be switched to](https://raw.githubusercontent.com/bjaan/AMPi-Service/main/pandorasbox-channellist.png)

# First prototype (WIP)

Contains a Raspberry Pi Model 3 and an Arduino Nano

![Front Side (first prototype)](https://raw.githubusercontent.com/bjaan/AMPi-Display-Interface/main/firstprototype-top.jpg)
![Back Side (first prototype)](https://raw.githubusercontent.com/bjaan/AMPi-Display-Interface/main/firstprototype-back.jpg)

# TODO / WIP

* Front & Back Panel Label - with level indicators and indications what the knobs do
* HDMI break-out cable to add in the back, needed for possibly external display or video streaming (currently shipping)
* Raspberry Pi Software - further integration with the display interface component

* Interface to enter Wi-Fi / LAN settings
* Streaming software for Apple Music
* etc

# Required software

* Raspbian GNU/Linux 10 (buster) - I installed a new Raspberry Pi image with the `ampi` hostname and connected it to the Internet
* Node.js 13.5.0+ for running the service - installed from the Raspbian repository using `sudo apt-get install node`
* [Shairport Sync](https://github.com/mikebrady/shairport-sync) 3.3.8+ for Airplay playback. Build according the [instructions](https://github.com/mikebrady/shairport-sync/blob/master/INSTALL.md) on its GitHub. (3.3.7rc2 has a bug that does not create the metadata pipe) & installed it as a service called `shairport-sync`
* Samba service to have a [WINS](https://en.wikipedia.org/wiki/Windows_Internet_Name_Service) local host name eg. `ampi.local` - installed from the Raspbian repository using `sudo apt-get install samba`, `sudo nano /etc/samba/smb.conf`, set `wins support = yes` and run `sudo service smbd restart`, see [link](https://www.raspberrypi.org/forums/viewtopic.php?t=213401)
* Pianobar - installed from the Raspbian repository using `sudo apt-get install pianobar`, and set-up the service, but make sure is **disabled** to restart at every reboot - see below
* Python - already installed on the Raspbian by default (needed for the `eventcmd.py` used by Pianobar)

# Configuration changes

* Raspberry Pi boot configuration in `/boot/config.txt`
```sh
...

# Uncomment some or all of these to enable the optional hardware interfaces
dtparam=i2c_arm=on
dtparam=i2s=on
#dtparam=spi=on

....

# Enable audio (loads snd_bcm2835)
#dtparam=audio=on
dtoverlay=hifiberry-dacplus

[pi4]
# Enable DRM VC4 V3D driver on top of the dispmanx display stack
dtoverlay=vc4-fkms-v3d
max_framebuffers=2

[all]
#dtoverlay=vc4-fkms-v3d

enable_uart=1
hdmi_blanking=2
```

* ALSA (sound system) configuration in `/etc/asound.conf`
```sh
pcm.!default {
  type hw card 0
}
ctl.!default {
  type hw card 0
}
```

Resulting in the following output:
```
pi@ampi:~ $ aplay -l
**** List of PLAYBACK Hardware Devices ****
card 0: sndrpihifiberry [snd_rpi_hifiberry_dacplus], device 0: HiFiBerry DAC+ HiFi pcm512x-hifi-0 [HiFiBerry DAC+ HiFi pcm512x-hifi-0]
  Subdevices: 0/1
  Subdevice #0: subdevice #0
```

* Shairport Sync configuration changes in `/etc/shairport-sync.conf`:
```sh
metadata =
{
        enabled = "yes"; // set this to yes to get Shairport Sync to solicit metadata from the source and to pass it on via a pipe
        include_cover_art = "yes"; // set to "yes" to get Shairport Sync to solicit cover art from the source and pass it via the pipe. You must also set "ena$
        cover_art_cache_directory = "/tmp/shairport-sync/.cache/coverart"; // artwork will be  stored in this directory if the dbus or MPRIS interfaces are en$
        pipe_name = "/tmp/shairport-sync-metadata";
        pipe_timeout = 5000; // wait for this number of milliseconds for a blocked pipe to unblock before giving up
};
```

* Pianobar service file `/etc/systemd/system/pianobar.service` to set-up a service for Pianobar, called `pianobar` - and installed the service following these [instructions](https://www.shubhamdipt.com/blog/how-to-create-a-systemd-service-in-linux/)

```ini
[Unit]
Description=pianobar
After=network.target

[Service]
ExecStartPre=/bin/sleep 30
ExecStart=/usr/bin/pianobar
WorkingDirectory=/home/pi
StandardOutput=inherit
StandardError=inherit
Restart=always
User=pi

[Install]
WantedBy=multi-user.target
```

* Pianobar configuration file at `/home/pi/.config/pianobar`

```sh
# This is an example configuration file for pianobar. You may remove the # from
# lines you need and copy/move this file to ~/.config/pianobar/config
# See manpage for a description of the config keys
#

# User (your Pandora.com account)
user = your-pandora@your-domain.com
password = password
# or
#password_command = gpg --decrypt ~/password

# Proxy (for those who are not living in the USA)
#control_proxy = socks5://127.0.0.1:4444/
#bind_to = if!tun0

# Keybindings
#act_help = ?
#act_songlove = +
#act_songban = -
act_stationaddmusic = A
#act_stationcreate = c
#act_stationdelete = d
#act_songexplain = e
#act_stationaddbygenre = g
#act_songinfo = i
#act_addshared = j
#act_songmove = m
#act_songnext = n
#act_songpause = S
#act_songpausetoggle = p
#act_songpausetoggle2 =  
#act_songplay = P
#act_quit = q
#act_stationrename = r
#act_stationchange = s
#act_stationcreatefromsong = v
act_songtired = T
#act_upcoming = u
#act_stationselectquickmix = x
#act_voldown = (
#act_volup = )
#act_volreset = ^

# Misc
audio_quality = high
#autostart_station = 1234556
event_command = /home/pi/.config/pianobar/eventcmd.py
fifo = /home/pi/.config/pianobar/ctl
sort = quickmix_10_name_az
volume = 0
ca_bundle = /etc/ssl/certs/ca-certificates.crt
#gain_mul = 1.0
#sample_rate = 48000
#audio_pipe = /tmp/mypipe

# Format strings
#format_nowplaying_song = [32m%t[0m by [34m%a[0m on %l[31m%r[0m%@%s
#format_nowplaying_song = [32m%t[0m by [34m%a[0m on %l%r%@%s
#ban_icon =  [32m</3[0m
#love_icon =  [31m<3[0m
#tired_icon =  [33mzZ[0m
#format_nowplaying_station = Station [35m%n[0m
#format_list_song = %i) %a - %t%r (%d)%@%s

#rpc_host = internal-tuner.pandora.com
partner_password = AC7IBG09A3DTSYM4R41UJWL07VLN8JI7
partner_user = android
device = android-generic
decrypt_password = R=U!LH$O2B#
encrypt_password = 6#26FRL$ZWD
```

* Pianobar event Python script `/home/pi/.config/pianobar/eventcmd.py`, needed by Pianobar to communicate when playback events happen

```python
#!/usr/bin/env python

import os
import sys
from os.path import expanduser, join

path = os.environ.get('XDG_CONFIG_HOME')
if not path:
    path = expanduser("~/.config")
else:
    path = expanduser(path)

fnnp = join(path, 'pianobar', 'nowplaying')
fnevent = join(path, 'pianobar', 'event')

info = sys.stdin.readlines()
event = sys.argv[1]

if event == 'songstart':
    with open(fnnp, 'w') as f:
        f.write("".join(info))
	f.close()

with open(fnevent, 'w') as f:
	f.write(event)
	f.close()
```

* Pianobar command file (control fifo) `/home/pi/.config/pianobar/ctl`, needed by Pianobar to communicate commands

Execute `mkfifo /home/pi/.config/pianobar/ctl` to the create file
