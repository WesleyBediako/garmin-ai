"""
One-time Garmin Connect login.

Run this yourself, directly in Terminal:

    cd ~/garmin-ai && ./venv/bin/python3 garmin_login.py

Your email and password are typed here, in your own terminal — never in
chat. The password is hidden as you type it (getpass) and is never saved,
printed, or logged anywhere. Only the resulting session token is saved
locally, so you won't need to log in again until it expires.
"""

import getpass
import sys
from pathlib import Path

from garminconnect import Garmin

TOKEN_STORE = str(Path(__file__).parent / ".garmintokens")


def main():
    print("Garmin Connect login")
    print("---------------------")
    email = input("Garmin email: ").strip()
    password = getpass.getpass("Garmin password (hidden): ")

    client = Garmin(email, password)

    try:
        client.login()
    except Exception as e:
        print(f"\nLogin failed: {e}")
        sys.exit(1)

    client.garth.dump(TOKEN_STORE)
    print(f"\nLogin successful. Session saved to {TOKEN_STORE}")
    print("You can now close this and run garmin_sync.py whenever you like —")
    print("no more logins needed until the session expires.")


if __name__ == "__main__":
    main()
