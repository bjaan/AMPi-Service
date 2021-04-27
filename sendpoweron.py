#!/usr/bin/env python3
import serial
if __name__ == '__main__':
    ser = serial.Serial('/dev/serial0', 9600, timeout=10)
    ser.flush()
    ser.write("\x7EP\x7F");