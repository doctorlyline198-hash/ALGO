import json
import time
import urllib.request
from typing import Dict

BASE_URL = "http://localhost:8000"
SYMBOL = "SYMBOL1"


def post(path: str, payload: Dict) -> None:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url=f"{BASE_URL}{path}",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=5) as resp:
        body = resp.read().decode("utf-8")
    print(f"POST {path} -> {resp.status} {body[:80]}")


def seed_ticks(count: int = 240) -> None:
    now = int(time.time())
    for idx in range(count):
        price = 2000 + idx * 0.5
        payload = {
            "symbol": SYMBOL,
            "price": round(price, 2),
            "size": 1,
            "ts": now - (count - idx),
        }
        post("/tick", payload)
        time.sleep(0.01)


def seed_alerts() -> None:
    now = int(time.time())
    alerts = [
        {
            "strategy": "mutating-seed",
            "symbol": SYMBOL,
            "side": side,
            "price": 2000 + offset,
            "ts": now + offset,
        }
        for side, offset in (("buy", 1), ("buy", 2), ("sell", 3), ("buy", 4))
    ]
    for alert in alerts:
        post("/alert", alert)
        time.sleep(0.25)


if __name__ == "__main__":
    seed_ticks()
    seed_alerts()
