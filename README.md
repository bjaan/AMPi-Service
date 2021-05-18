# AMPi-Service

AMPi is an audio receiver that integrates an amplifier with a mains electricity power supply, a 4-channel audio relay switcher, a ground loop isolator, a Raspberry Pi with a DAC-HAT, a ST7735-based TFT-display, and an Arduino Nano micro-controller.

It is an integrated audio system that combines 3 external analog stereo inputs and digital-to-analog converter that supports high-quality audio playback though wireless or wired local area network audio streaming (like AirPlay), and internet audio streaming (like Pandora.com), and personal area networks (Bluetooth 4.2) in one box less than 10 inches (250mm) wide, 4 inches (80mm) high, and 8 inches (190mm) deep.

This repository is the service code for the Raspberry Pi.

The Node.js app lives in the **AMPi-Node** folder.

For the code running on the Arduino Nano, go to the [AMPi-Display-Interface](https://github.com/bjaan/AMPi-Display-Interface) repository.

# AMPi features

* Mini size 250mm x 190mm x 80mm. Maxi sound
* 2 channels x 100W (Stereo) Class D Audio Amplifier
* Built-in internet audio streaming device with high-quality Digital-to-Analog Converter (DAC), e.g. FLAC 24-bits 192khz
* Built-in pre-amplifier and audio transformers functioning as a ground loop isolator. This allows for a full galvanic separation between external audio equipment and the DAC and AMPi
* Computer-controlled interface that controls the screen, manages the power of and the services running on the built-in audio streaming device
* 3 switchable external analog audio input channels using a relay array through a rotary switch
* Audio level indicator
* Built-in mains power supply (100-230V)
* AirPlay playback using [Shairport Sync](https://github.com/mikebrady/shairport-sync). AMPi identifies itself as a AirPlay network player, where your iPhone or iTunes on a Mac can be connected to, to play music.  You can also use iTunes on Windows 10 to play music through AirPlay or route your audio to AMPi using [TuneBlade](http://www.tuneblade.com/)
* Bluetooth 4.2 Playback, this overrides everything and directly accessible after power-up
* Pandora.com music player (WIP), using [Pianobar](https://github.com/PromyLOPh/pianobar)

For parts / tools used for the hardware, refer to the [AMPi-Display-Interface](https://github.com/bjaan/AMPi-Display-Interface) repository.

# First prototype (WIP)

Contains a Raspberry Pi Model 3 and an Arduino Nano

![Front Side (first prototype)](https://raw.githubusercontent.com/bjaan/AMPi-Display-Interface/main/firstprototype-top.jpg)

# TODO / WIP

* Front & Back Panel Label - with level indicators and indications what the knobs do
* HDMI break-out cable to add in the back, needed for possibly external display or video streaming (currently shipping)
* Raspberry Pi Software - further integration with the display interface component
* Interface to enter Wi-Fi / LAN settings
* Streaming software for Apple Music
* ...and more

# Required software

* Raspbian GNU/Linux 10 (buster) - I installed a new Raspberry Pi image with the `ampi` hostname and connected it to the Internet
* Node.js 10.x for running the service - installed from the Raspbian repository using `sudo apt-get install npm nodejs`
* [Shairport Sync](https://github.com/mikebrady/shairport-sync) 3.3.8+ for Airplay playback. Build according the [instructions](https://github.com/mikebrady/shairport-sync/blob/master/INSTALL.md) on its GitHub. (3.3.7rc2 has a bug that does not create the metadata pipe) & installed it as a service called `shairport-sync`
* Samba service to have a [WINS](https://en.wikipedia.org/wiki/Windows_Internet_Name_Service) local host name eg. `ampi.local` - installed from the Raspbian repository using `sudo apt-get install samba`, `sudo nano /etc/samba/smb.conf`, set `wins support = yes` and run `sudo service smbd restart`, see [link](https://www.raspberrypi.org/forums/viewtopic.php?t=213401)
* Pianobar - when Pandora Music is required, see this [pandorasbox](https://github.com/bjaan/pandorasbox) repository

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