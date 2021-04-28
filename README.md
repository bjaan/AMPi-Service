# AMPi-Service
AMPi is a project that integrates a mains electricity power supply with an audio amplifier, an 4-channel audio relay switcher, input audio transformers, a Raspberry Pi with DAC, a ST7735 based TFT display, and an Arduino Nano (to control the Raspberry PI over serial and the built-in screen) to make a completely integrated digital audio solution that supports the latest high quality internet audio streaming and smart speaker AirPlay & Bluetooth 4.2 functionality over either wired Ethernet or Wi-Fi in one box.

This repository is the service code for the Raspberry Pi. It currently only has alpha-level code for the Pandora Player, called **pandorasbox** that is controlled via the web browser, and not yet through the AMPi interface.

Some recent tests, create a Node.js app live in the ***AMPi-Node***.

For the code running on  Arduino Nano, go to [AMPi-Display-Interface](https://github.com/bjaan/AMPi-Display-Interface) repository.

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
* AirPlay playback using [**Shairport Sync**](https://github.com/mikebrady/shairport-sync).  AMPi identifies itself as a AirPlay network player where you can connect your iPhone or Mac to play music.  You can also use iTunes on Windows 10 to play music or route your audio to AMPi using [**TuneBlade**](http://www.tuneblade.com/)
* Bluetooth 4.2 Playback, this overrides everything and directly accessible after power-up
* Pandora.com music player (WIP), using [Pianobar](https://github.com/PromyLOPh/pianobar)

For parts / tools used for the hardware, refer to the [AMPi-Display-Interface](https://bjaan.github.io/AMPi-Display-Interface/) repository.

# TODO / WIP

* Front & Back Panel Label - with level indicators and indications what the knobs do
* HDMI break-out cable to add in the back, needed for possibly external display or video streaming (currently shipping)
* Raspberry Pi Software - further integration with the display interface component

* Interface to enter Wi-Fi / LAN settings
* Streaming software for Apple Music
* etc
