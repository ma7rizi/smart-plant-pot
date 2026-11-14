# Hosting the website online (PythonAnywhere, free plan)

This puts the dashboard at `http://ma7rizi.pythonanywhere.com`, so it opens from anywhere and the pot can send readings over any internet connection.

## Free plan: what to know

| Limit | What it means for us |
|---|---|
| 1 web app | Enough: this project is one app. |
| 1 web worker | Requests are answered one at a time. Fine for the pot and a few viewers. |
| 100 CPU-seconds a day | Counts **consoles and scheduled tasks only**, not the website. Don't leave commands running in a console. |
| 512 MB storage | The database keeps at most 20,000 readings (a few MB). |
| Expires after 3 months | Log in and click **Run until 3 months from today** on the **Web** tab before it expires. |

## 1. Get the code

Open **Consoles → Bash** and run:

> Until the `1-host-online` branch is merged into `main`, use `git clone -b 1-host-online ...` in the first line instead.

```bash
git clone https://github.com/ma7rizi/smart-plant-pot.git
cd smart-plant-pot
pip3.10 install --user -r requirements.txt
```

Close the console when it's done, so it doesn't use CPU time.

## 2. Create the web app

1. Open the **Web** tab and click **Add a new web app**.
2. Click **Next**, choose **Manual configuration** (not "Flask"), then **Python 3.10**.
3. In the **Code** section set:
   - **Source code:** `/home/ma7rizi/smart-plant-pot`
   - **Working directory:** `/home/ma7rizi/smart-plant-pot`

## 3. Point it at our app

In the **Code** section, click the **WSGI configuration file** link. Delete everything in it and paste:

```python
import sys

path = "/home/ma7rizi/smart-plant-pot"
if path not in sys.path:
    sys.path.insert(0, path)

from wsgi import application  # noqa: F401
```

Click **Save**.

## 4. Serve the static files directly (faster on the free plan)

In the **Static files** section add two entries:

| URL | Directory |
|---|---|
| `/js/` | `/home/ma7rizi/smart-plant-pot/static/js` |
| `/css/` | `/home/ma7rizi/smart-plant-pot/static/css` |

This lets PythonAnywhere send these files itself, so our single worker only handles the API.

## 5. Start it

1. Leave **Force HTTPS** switched **off** for now, so the pot can send readings over plain `http://`.
2. Click the green **Reload** button at the top of the **Web** tab.
3. Open `http://ma7rizi.pythonanywhere.com`. You should see "Waiting for the pot…".

## 6. Point the pot at the online server

In `firmware/smart_pot/secrets.h` set:

```cpp
const char* SERVER_URL = "http://ma7rizi.pythonanywhere.com/api/readings";
```

Upload the firmware. The pot now works on any Wi-Fi network with internet access, and the dashboard shows **Pot online · Wi-Fi**.

## Updating the website later

After changes are merged into `main` on GitHub:

```bash
cd ~/smart-plant-pot
git pull
```

Then click **Reload** on the **Web** tab.

## If something goes wrong

On the **Web** tab, open the **Error log** link in the **Log files** section. The last lines show what failed.

| Problem | Fix |
|---|---|
| "Something went wrong" page | Check the error log. Usually a typo in the WSGI file or the path. |
| `ModuleNotFoundError: flask` | Run the `pip3.10 install --user -r requirements.txt` step again. |
| Pot stays offline | Check that `SERVER_URL` uses `http://` (not https) and the exact username, and that Force HTTPS is off. |
