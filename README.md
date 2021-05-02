# AMPi-Service
AMPi is a project that integrates a mains electricity power supply with an audio amplifier, an 4-channel audio relay switcher, input audio transformers, a Raspberry Pi with DAC, a ST7735 based TFT display, and an Arduino Nano (to control the Raspberry PI over serial and the built-in screen) to make a completely integrated digital audio solution that supports the latest high quality internet audio streaming and smart speaker AirPlay & Bluetooth 4.2 functionality over either wired Ethernet or Wi-Fi in one box.

This repository is the service code for the Raspberry Pi.

The Node.js app lives in the **AMPi-Node** folder.

It also has alpha-level code for the Pandora Player, called **pandorasbox** that is controlled via the web browser, and not yet through the AMPi interface.

For the code running on the Arduino Nano, go to [AMPi-Display-Interface](https://github.com/bjaan/AMPi-Display-Interface) repository.

First prototype (WIP) with Raspberry Pi Model 3 and an Arduino Nano

![Front Side (first prototype)](https://raw.githubusercontent.com/bjaan/AMPi-Display/main/firstprototype-top.jpg)
![Back Side (first prototype)](https://raw.githubusercontent.com/bjaan/AMPi-Display/main/firstprototype-back.jpg)

# AMPi features

* 2 x 100W Class D Audio Amplifier
* 3 switchable analog audio channels using a relay array through a rotary switch
* Audio level indicator
* Clear audio using build-in pre-amp and audio transformers, to allow full galvanic separation between the external audio equipment and AMPi
* Computer-controlled interface that controls screen, the power of and the service running on the built-in audio streaming device
* Built-in power supply
* AirPlay playback using [**Shairport Sync**](https://github.com/mikebrady/shairport-sync). AMPi identifies itself as a AirPlay network player, where your iPhone or iTunes on a Mac can be connected to, to play music.  You can also use iTunes on Windows 10 to play music through AirPlay or route your audio to AMPi using [**TuneBlade**](http://www.tuneblade.com/)
* Bluetooth 4.2 Playback, this overrides everything and directly accessible after power-up
* Pandora.com music player (WIP), using [Pianobar](https://github.com/PromyLOPh/pianobar)

For parts / tools used for the hardware, refer to the [AMPi-Display-Interface](https://github.com/bjaan/AMPi-Display-Interface) repository.

# TODO / WIP

* Front & Back Panel Label - with level indicators and indications what the knobs do
* HDMI break-out cable to add in the back, needed for possibly external display or video streaming (currently shipping)
* Raspberry Pi Software - further integration with the display interface component

* Interface to enter Wi-Fi / LAN settings
* Streaming software for Apple Music
* etc

# Required software

* Raspbian GNU/Linux 10 (buster)
* Node.js 13.5.0+ for running the service - installed from the Raspbian repository using `apt get install node`
* [Shairport Sync](https://github.com/mikebrady/shairport-sync) 3.3.8+ for Airplay playback. Build according the [instructions](https://github.com/mikebrady/shairport-sync/blob/master/INSTALL.md) on its GitHub. (3.3.7rc2 has a bug that does not create the metadata pipe)


# Configuration changes

* Raspberry Pi boot configuration in `/boot/config.txt`
```
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

* Shairport config changes in `/etc/shairport-sync.conf`:
```
metadata =
{
        enabled = "yes"; // set this to yes to get Shairport Sync to solicit metadata from the source and to pass it on via a pipe
        include_cover_art = "yes"; // set to "yes" to get Shairport Sync to solicit cover art from the source and pass it via the pipe. You must also set "ena$
        cover_art_cache_directory = "/tmp/shairport-sync/.cache/coverart"; // artwork will be  stored in this directory if the dbus or MPRIS interfaces are en$
        pipe_name = "/tmp/shairport-sync-metadata";
        pipe_timeout = 5000; // wait for this number of milliseconds for a blocked pipe to unblock before giving up
};
```

