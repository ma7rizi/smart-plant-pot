@echo off
rem Real pot plugged in by USB (also accepts Wi-Fi). Change COM5 if Windows gave the pot another port.
cd /d "%~dp0"
python -m pip install -q -r requirements.txt
start "" http://localhost:5000
python app.py --real --usb COM5
pause
