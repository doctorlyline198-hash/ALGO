"""
Mutating Confirmation Trader (prototype)
----------------------------------------

This module exposes a FastAPI application that keeps a population of simple
rule-based "genomes". Incoming alerts are scored by each genome, gradually
mutating the population over time. The best scoring genome drives a set of risk
managed paper-trading bots that size positions based on per-trade risk.

Run locally with:

    uvicorn mutating_confirmation:app --reload

The API surface intentionally stays lightweight so it can be wired into the
existing Node/React stack later (for example via a gateway). All values and
behaviour are easy to tweak – this is meant to be a sandbox, not production
infrastructure.
"""

from __future__ import annotations

import asyncio
import itertools
import json
import math
import random
import time
import urllib.error
import urllib.request
from collections import deque
from contextlib import asynccontextmanager, suppress
from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# ---------- CONFIG ----------
SYMBOL_DEFAULT = "SYMBOL1"
CANDLE_SECONDS = 60
POP_SIZE = 14
ELITES = 4
MUT_RATE = 0.25
EVAL_WINDOW = 200  # candles used for quick in-sample evaluation
PAPER_CAPITAL = 100_000.0
MIN_CONFIRM_SCORE = 0.6  # engine-level threshold for execution (0-1)
SCALP_MAX_SECONDS = 60 * 5  # treat as scalp if genome.scalp_window <= this
# ----------------------------

# ---------- Data stores ----------
# rolling candle buffer per symbol
candles: Dict[str, deque] = {}
# raw alert history (recent)
alerts_log: deque = deque(maxlen=2000)
# paper trades list
paper_trades: List[Dict[str, Any]] = []
trade_id_counter = itertools.count(1)

# genome population
population: List[Dict[str, Any]] = []
pop_scores: List[float] = []
generation = 0

# bot registry
bots: Dict[str, Dict[str, Any]] = {}
bot_state: Dict[str, Dict[str, Any]] = {}

# engine runtime state / settings
ENGINE_MODES = {"alerts", "paper", "live"}
engine_settings: Dict[str, Any] = {
    "execution_mode": "alerts",
    "risk_cap": 400.0,
    "min_contracts": 1,
    "max_contracts": 5,
    "show_signals": True,
    "live_account_id": None,
    "live_contract_id": None,
    "live_endpoint": "http://localhost:3001/api/orders",
    "time_in_force": "Day",
}

open_trades: List[Dict[str, Any]] = []
signal_log: deque = deque(maxlen=500)
generation_stats: Dict[str, Any] = {
    "generation": 0,
    "realized": 0.0,
    "min_equity": 0.0,
    "wins": 0,
    "losses": 0,
}


background_task: Optional[asyncio.Task] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global background_task
    init_population()
    init_default_bots()
    background_task = asyncio.create_task(evolve_loop())
    try:
        yield
    finally:
        if background_task:
            background_task.cancel()
            with suppress(asyncio.CancelledError):
                await background_task
            background_task = None


app = FastAPI(title="Mutating Confirmation Trader (prototype)", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- Bot models & helpers ----------
class BotConfigModel(BaseModel):
    name: str = Field(..., pattern=r"^[a-zA-Z0-9_\-]+$")
    symbol: str = SYMBOL_DEFAULT
    capital: float = Field(PAPER_CAPITAL, gt=0)
    risk_fraction: float = Field(0.01, gt=0, le=1)
    max_size: float = Field(10.0, gt=0)
    leverage: float = Field(1.0, gt=0)
    min_size: float = Field(0.01, gt=0)
    mode: Literal["auto", "scalp_only", "swing_only"] = "auto"
    side_bias: Literal["both", "long", "short"] = "both"
    active: bool = True
    description: Optional[str] = None


class BotToggleModel(BaseModel):
    active: bool


class EngineSettingsPatch(BaseModel):
    execution_mode: Optional[Literal["alerts", "paper", "live"]] = None
    risk_cap: Optional[float] = Field(default=None, ge=0)
    min_contracts: Optional[int] = Field(default=None, ge=0)
    max_contracts: Optional[int] = Field(default=None, ge=0)
    show_signals: Optional[bool] = None
    live_account_id: Optional[str] = None
    live_contract_id: Optional[str] = None
    live_endpoint: Optional[str] = None
    time_in_force: Optional[str] = None


ENGINE_SETTING_KEYS = set(engine_settings.keys())


def safe_json_parse(payload: str) -> Any:
    if not payload:
        return None
    try:
        return json.loads(payload)
    except json.JSONDecodeError:
        return payload


def update_engine_settings(update: Dict[str, Any]) -> Dict[str, Any]:
    if not update:
        return dict(engine_settings)
    for key, value in update.items():
        if key not in ENGINE_SETTING_KEYS:
            continue
        if key in {"min_contracts", "max_contracts"}:
            if value is None:
                continue
            try:
                numeric = int(value)
            except (TypeError, ValueError):
                continue
            engine_settings[key] = max(0, numeric)
            continue
        if key == "risk_cap":
            if value is None:
                engine_settings[key] = 0.0
            else:
                try:
                    engine_settings[key] = max(0.0, float(value))
                except (TypeError, ValueError):
                    continue
            continue
        if key == "execution_mode":
            if value in ENGINE_MODES:
                engine_settings[key] = value
            continue
        if key == "show_signals":
            engine_settings[key] = bool(value)
            continue
        if key in {"live_account_id", "live_contract_id", "live_endpoint", "time_in_force"}:
            if value is None:
                engine_settings[key] = None
            else:
                text = str(value).strip()
                engine_settings[key] = text or None
            continue
        engine_settings[key] = value

    min_contracts = int(engine_settings.get("min_contracts", 0) or 0)
    max_contracts = int(engine_settings.get("max_contracts", min_contracts) or min_contracts)
    if max_contracts < min_contracts:
        max_contracts = min_contracts
    engine_settings["min_contracts"] = max(0, min_contracts)
    engine_settings["max_contracts"] = max(engine_settings["min_contracts"], max_contracts)

    tif = engine_settings.get("time_in_force")
    if isinstance(tif, str):
        stripped = tif.strip()
        engine_settings["time_in_force"] = stripped or "Day"
    else:
        engine_settings["time_in_force"] = "Day"

    return dict(engine_settings)


def engine_snapshot() -> Dict[str, Any]:
    open_only = [trade for trade in open_trades if trade.get("status") == "open"]
    return {
        "settings": dict(engine_settings),
        "stats": dict(generation_stats),
        "halted": should_halt_trading(),
        "open_trades": open_only,
    }


def dispatch_live_order(payload: Dict[str, Any]) -> Dict[str, Any]:
    endpoint = engine_settings.get("live_endpoint") or ""
    endpoint = endpoint.strip()
    if not endpoint:
        return {"status": "skipped", "reason": "missing_endpoint"}

    encoded = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        endpoint,
        data=encoded,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=7) as response:
            body = response.read().decode("utf-8")
            return {
                "status": "ok",
                "code": response.getcode(),
                "body": safe_json_parse(body),
            }
    except urllib.error.HTTPError as err:
        data = err.read().decode("utf-8", errors="ignore")
        return {
            "status": "error",
            "code": err.code,
            "body": safe_json_parse(data) or str(err),
        }
    except Exception as exc:  # noqa: BLE001
        return {"status": "error", "error": str(exc)}

DEFAULT_BOTS = [
    BotConfigModel(
        name="momentum_scalper",
        symbol=SYMBOL_DEFAULT,
        capital=60_000.0,
        risk_fraction=0.0075,
        max_size=6.0,
        leverage=1.0,
        min_size=0.01,
        mode="scalp_only",
        side_bias="both",
        description="Takes only scalp-qualified confirmations with 0.75% risk."
    ),
    BotConfigModel(
        name="swing_confirmer",
        symbol=SYMBOL_DEFAULT,
        capital=120_000.0,
        risk_fraction=0.0125,
        max_size=3.5,
        leverage=1.0,
        min_size=0.01,
        mode="swing_only",
        side_bias="both",
        description="Waits for higher-confidence (non-scalp) confirmations."
    ),
]


def register_bot(config: BotConfigModel) -> Dict[str, Any]:
    """Insert or replace a bot configuration and ensure state tracking."""
    record = config.dict()
    bots[record["name"]] = record
    state = bot_state.setdefault(record["name"], {})
    state.setdefault("trades", [])
    state.setdefault("realized_pnl", 0.0)
    state.setdefault("last_trade_ts", None)
    state.setdefault("wins", 0)
    state.setdefault("losses", 0)
    return record


def init_default_bots() -> None:
    for bot in DEFAULT_BOTS:
        register_bot(bot)


# ---------- Engine helpers ----------
def clamp_contracts(size: float) -> float:
    if size is None:
        return 0.0
    numeric = abs(float(size))
    floor = max(1, int(engine_settings.get("min_contracts") or 1))
    cap = max(floor, int(engine_settings.get("max_contracts") or floor))
    if numeric <= 0:
        return 0.0
    return float(min(max(numeric, floor), cap))


def is_finite(value: Any) -> bool:
    return isinstance(value, (int, float)) and math.isfinite(value)


def reset_generation_state() -> None:
    generation_stats["generation"] = generation
    generation_stats["realized"] = 0.0
    generation_stats["min_equity"] = 0.0
    generation_stats["wins"] = 0
    generation_stats["losses"] = 0


def should_halt_trading() -> bool:
    try:
        cap = float(engine_settings.get("risk_cap", 0))
    except (TypeError, ValueError):
        cap = 0.0
    if cap <= 0:
        return False
    return generation_stats.get("realized", 0.0) <= -abs(cap)


def record_signal(event: Dict[str, Any]) -> None:
    if not engine_settings.get("show_signals", True):
        return
    event = dict(event)
    event.setdefault("ts", now_s())
    signal_log.append(event)


def register_open_trade(trade: Dict[str, Any]) -> None:
    open_trades.append(trade)


def record_trade_close(trade: Dict[str, Any], exit_price: float, exit_reason: str) -> None:
    if trade.get("status") == "closed":
        return
    trade["status"] = "closed"
    trade["exit"] = exit_price
    trade["exit_reason"] = exit_reason
    trade["exit_ts"] = now_s()
    side_multiplier = 1 if trade.get("side") == "buy" else -1
    tick_value = float(trade.get("meta", {}).get("tickValue", 1.0))
    pnl = (exit_price - trade["entry"]) * side_multiplier * trade["size"] * tick_value
    trade["pnl"] = pnl

    generation_stats["realized"] += pnl
    generation_stats["min_equity"] = min(generation_stats["min_equity"], generation_stats["realized"])

    bot_id = trade.get("meta", {}).get("bot")
    if bot_id:
        state = bot_state.setdefault(bot_id, {})
        state.setdefault("realized_pnl", 0.0)
        state.setdefault("wins", 0)
        state.setdefault("losses", 0)
        state.setdefault("last_trade_ts", trade.get("exit_ts"))
        state["realized_pnl"] += pnl
        if pnl >= 0:
            state["wins"] = state.get("wins", 0) + 1
            generation_stats["wins"] += 1
        else:
            state["losses"] = state.get("losses", 0) + 1
            generation_stats["losses"] += 1
        state["last_trade_ts"] = trade.get("exit_ts")

    try:
        open_trades.remove(trade)
    except ValueError:
        pass


def evaluate_open_trades(symbol: str, price: float) -> None:
    if not open_trades:
        return
    snapshot = list(open_trades)
    for trade in snapshot:
        if trade.get("symbol") != symbol or trade.get("status") != "open":
            continue
        side = trade.get("side")
        sl = trade.get("sl")
        tp = trade.get("tp")
        if side == "buy":
            if is_finite(sl) and price <= float(sl):
                record_trade_close(trade, float(sl), "stop")
                continue
            if is_finite(tp) and price >= float(tp):
                record_trade_close(trade, float(tp), "target")
        elif side == "sell":
            if is_finite(sl) and price >= float(sl):
                record_trade_close(trade, float(sl), "stop")
                continue
            if is_finite(tp) and price <= float(tp):
                record_trade_close(trade, float(tp), "target")


def bot_allows_trade(bot_cfg: Dict[str, Any], side: str, symbol: str) -> bool:
    algo = bot_cfg.get("algo")
    if algo == "sma_confluence":
        df = get_candle_df(symbol, n=120)
        if df.empty or len(df) < 40:
            return False
        sma_fast = df["close"].rolling(10).mean().iloc[-1]
        sma_slow = df["close"].rolling(40).mean().iloc[-1]
        if not (is_finite(sma_fast) and is_finite(sma_slow)):
            return False
        if side == "buy":
            return sma_fast > sma_slow
        return sma_fast < sma_slow
    return True


# ---------- Utilities ----------
def now_s() -> int:
    return int(time.time())


def ensure_symbol(symbol: str) -> None:
    if symbol not in candles:
        candles[symbol] = deque(maxlen=5000)


def add_tick(symbol: str, price: float, size: float = 1, ts: Optional[int] = None) -> None:
    ts = ts or now_s()
    ensure_symbol(symbol)
    bucket = ts - (ts % CANDLE_SECONDS)
    dq = candles[symbol]
    if not dq or dq[-1]["t"] != bucket:
        dq.append({"t": bucket, "o": price, "h": price, "l": price, "c": price, "v": size})
    else:
        candle = dq[-1]
        candle["h"] = max(candle["h"], price)
        candle["l"] = min(candle["l"], price)
        candle["c"] = price
        candle["v"] += size


def get_candle_df(symbol: str, n: Optional[int] = None) -> pd.DataFrame:
    ensure_symbol(symbol)
    dq = candles[symbol]
    if not dq:
        return pd.DataFrame(columns=["t", "open", "high", "low", "close", "vol"])
    arr = list(dq)[-(n if n else len(dq)) :]
    df = pd.DataFrame(arr)
    df = df.rename(columns={"o": "open", "h": "high", "l": "low", "c": "close", "v": "vol"})
    return df


def atr(series_high: pd.Series, series_low: pd.Series, series_close: pd.Series, n: int = 14) -> float:
    high = series_high
    low = series_low
    close = series_close
    tr1 = high - low
    tr2 = (high - close.shift(1)).abs()
    tr3 = (low - close.shift(1)).abs()
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    if len(tr) >= n:
        return float(tr.rolling(n).mean().iloc[-1])
    return float(tr.mean()) if len(tr) else 0.0

def random_genome() -> Dict[str, Any]:
    return {
        "confirm_count": random.randint(1, 3),
        "require_agreement_fraction": round(random.uniform(0.5, 0.9), 2),
        "min_volume_mult": round(random.uniform(0.1, 3.0), 2),
        "momentum_z": round(random.uniform(0.1, 2.0), 2),
        "use_atr_sl": random.choice([True, False]),
        "sl_mult": round(random.uniform(0.5, 3.0), 2),
        "tp_mult": round(random.uniform(0.5, 6.0), 2),
        "scalp_window": random.randint(30, 300),
        "time_bias_start": random.randint(0, 23),
        "time_bias_end": random.randint(0, 23),
        "scalp_aggressiveness": round(random.uniform(0.1, 1.0), 2),
    }


def mutate_genome(g: Dict[str, Any]) -> Dict[str, Any]:
    ng = dict(g)
    if random.random() < 0.4:
        ng["confirm_count"] = max(1, ng["confirm_count"] + random.choice([-1, 0, 1]))
    if random.random() < 0.5:
        ng["require_agreement_fraction"] = min(1.0, max(0.1, ng["require_agreement_fraction"] + random.gauss(0, 0.07)))
    if random.random() < 0.5:
        ng["min_volume_mult"] = max(0.01, ng["min_volume_mult"] * (1 + random.gauss(0, 0.2)))
    if random.random() < 0.5:
        ng["momentum_z"] = max(0.01, ng["momentum_z"] + random.gauss(0, 0.3))
    if random.random() < 0.3:
        ng["use_atr_sl"] = not ng["use_atr_sl"]
    if random.random() < 0.5:
        ng["sl_mult"] = max(0.01, ng["sl_mult"] * (1 + random.gauss(0, 0.15)))
    if random.random() < 0.5:
        ng["tp_mult"] = max(0.01, ng["tp_mult"] * (1 + random.gauss(0, 0.2)))
    if random.random() < 0.3:
        ng["scalp_window"] = max(10, ng["scalp_window"] + random.randint(-30, 30))
    if random.random() < 0.4:
        ng["scalp_aggressiveness"] = min(1.0, max(0.01, ng["scalp_aggressiveness"] + random.gauss(0, 0.1)))
    if random.random() < 0.2:
        start = (ng["time_bias_start"] + random.randint(-2, 2)) % 24
        end = (ng["time_bias_end"] + random.randint(-2, 2)) % 24
        ng["time_bias_start"], ng["time_bias_end"] = start, end
    return ng


def crossover(a: Dict[str, Any], b: Dict[str, Any]) -> Dict[str, Any]:
    return {k: (a[k] if random.random() < 0.5 else b[k]) for k in a.keys()}


# ---------- Population bootstrap ----------
def init_population() -> None:
    global population, pop_scores
    population = [random_genome() for _ in range(POP_SIZE)]
    pop_scores = [0.0] * POP_SIZE


# ---------- Decision logic ----------
def features_from_context(symbol: str, alert: Dict[str, Any]) -> Dict[str, Any]:
    df = get_candle_df(symbol, n=120)
    feat: Dict[str, Any] = {}
    if df.empty:
        feat["recent_close"] = alert["price"]
        feat["vol_mult"] = 1.0
        feat["mom_z"] = 0.0
        feat["atr"] = 0.0
    else:
        close = df["close"]
        vol = float(df["vol"].iloc[-1]) if "vol" in df.columns else 1.0
        returns = close.pct_change().fillna(0)
        last_return = float(returns.iloc[-1]) if len(returns) else 0.0
        std = float(returns.std()) if returns.std() not in (None, 0) else 0.0
        z = (last_return - float(returns.mean())) / std if std else 0.0
        feat["recent_close"] = float(close.iloc[-1])
        rolling_vol = df["vol"].rolling(20).mean()
        baseline_vol = float(rolling_vol.iloc[-1]) if len(df) >= 20 and rolling_vol.iloc[-1] > 0 else vol
        feat["vol_mult"] = float(vol / baseline_vol) if baseline_vol else 1.0
        feat["mom_z"] = float(z)
        feat["atr"] = float(atr(df["high"], df["low"], df["close"])) if len(df) >= 5 else 0.0
    feat["alert_side"] = 1 if alert["side"].lower() == "buy" else -1
    feat["alert_ts"] = alert.get("ts", now_s())
    feat["symbol"] = symbol
    return feat


def genome_vote(genome: Dict[str, Any], feat: Dict[str, Any], recent_alerts: List[Dict[str, Any]]) -> tuple[str, float]:
    window_s = genome["scalp_window"]
    ts_cut = feat["alert_ts"] - window_s
    same_side_alerts = [
        a
        for a in recent_alerts
        if a.get("symbol") == feat.get("symbol")
        and a["side"].lower() == ("buy" if feat["alert_side"] == 1 else "sell")
        and a.get("ts", 0) >= ts_cut
    ]
    agree_fraction = len(same_side_alerts) / max(1, genome["confirm_count"])
    volume_ok = feat["vol_mult"] >= genome["min_volume_mult"]
    momentum_ok = abs(feat["mom_z"]) >= genome["momentum_z"]

    hour = datetime.utcfromtimestamp(feat["alert_ts"]).hour
    a = genome["time_bias_start"]
    b = genome["time_bias_end"]
    if a <= b:
        in_time = a <= hour <= b
    else:
        in_time = hour >= a or hour <= b

    checks = [
        (1.0, agree_fraction >= genome["require_agreement_fraction"]),
        (0.8, volume_ok),
        (0.6, momentum_ok),
        (0.4, in_time),
    ]
    weight_sum = sum(weight for weight, _ in checks)
    score = sum(weight for weight, ok in checks if ok) / weight_sum if weight_sum else 0.0

    is_scalp = genome["scalp_window"] <= SCALP_MAX_SECONDS or genome["scalp_aggressiveness"] > 0.7
    if score < 0.2:
        return ("ignore", score)
    if score < 0.6 and is_scalp:
        return ("scalp", score)
    return ("buy" if feat["alert_side"] > 0 else "sell", score)


# ---------- Paper execution ----------
def paper_execute(symbol: str, side: str, price: float, sl: float, tp: float, size: float, meta: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    adjusted_size = clamp_contracts(size)
    if adjusted_size <= 0:
        return {}
    trade = {
        "id": next(trade_id_counter),
        "ts": now_s(),
        "symbol": symbol,
        "side": side,
        "entry": price,
        "sl": sl,
        "tp": tp,
        "size": adjusted_size,
        "status": "open",
        "meta": meta or {},
        "mode": engine_settings.get("execution_mode", "paper"),
    }
    paper_trades.append(trade)
    register_open_trade(trade)
    print("PAPER EXECUTE:", trade)
    return trade


def resolve_position_size(bot_cfg: Dict[str, Any], entry_price: float, stop_price: float) -> float:
    per_unit_risk = abs(entry_price - stop_price)
    if per_unit_risk <= 0:
        return 0.0
    risk_capital = bot_cfg["capital"] * bot_cfg["risk_fraction"]
    size = risk_capital / per_unit_risk
    size *= bot_cfg.get("leverage", 1.0)
    max_size = bot_cfg.get("max_size", size)
    size = min(size, max_size)
    return float(size) if size >= bot_cfg.get("min_size", 0.0) else 0.0


def execute_for_bots(
    symbol: str,
    side: str,
    price: float,
    sl: float,
    tp: float,
    feat: Dict[str, Any],
    meta: Dict[str, Any],
) -> List[Dict[str, Any]]:
    executed: List[Dict[str, Any]] = []
    is_scalp = meta.get("is_scalp", False)
    for name, bot_cfg in bots.items():
        if not bot_cfg.get("active", True):
            continue
        if bot_cfg["symbol"] != symbol:
            continue
        mode = bot_cfg.get("mode", "auto")
        if mode == "scalp_only" and not is_scalp:
            continue
        if mode == "swing_only" and is_scalp:
            continue
        side_bias = bot_cfg.get("side_bias", "both")
        if side_bias == "long" and side != "buy":
            continue
        if side_bias == "short" and side != "sell":
            continue
        if should_halt_trading():
            break
        if not bot_allows_trade(bot_cfg, side, symbol):
            continue
        size = resolve_position_size(bot_cfg, price, sl)
        size = clamp_contracts(size)
        if size <= 0:
            continue
        trade_meta = {**meta, "source": "bot", "bot": name}
        trade = paper_execute(symbol, side, price, sl, tp, size=size, meta=trade_meta)
        if not trade:
            continue
        state = bot_state.setdefault(name, {})
        state.setdefault("trades", []).append(trade["id"])
        state["last_trade_ts"] = trade.get("ts")
        executed.append(trade)
    return executed


# ---------- Evaluation function ----------
def evaluate_on_short_forward(symbol: str, decision: tuple[str, float], feat: Dict[str, Any]) -> float:
    action, confidence = decision
    if action == "ignore":
        return -0.1
    atr_val = max(1e-6, feat.get("atr", 0.0001))
    expected_hit_prob = min(0.95, 0.1 + confidence * 0.9)
    score = expected_hit_prob * atr_val - (1 - expected_hit_prob) * atr_val * 0.5
    return score

# ---------- Alert model & endpoints ----------
class AlertModel(BaseModel):
    strategy: str
    symbol: str
    side: Literal["buy", "sell"]
    price: float
    ts: Optional[int] = None
    meta: Dict[str, Any] = Field(default_factory=dict)


@app.post("/alert")
async def receive_alert(alert_model: AlertModel, request: Request):
    alert = alert_model.dict()
    alert["ts"] = alert["ts"] or now_s()
    alerts_log.appendleft(alert)

    feat = features_from_context(alert["symbol"], alert)
    recent_alerts = list(alerts_log)[:200]

    votes: List[tuple[int, tuple[str, float]]] = []
    for idx, genome in enumerate(population):
        decision = genome_vote(genome, feat, recent_alerts)
        votes.append((idx, decision))
        fitness = evaluate_on_short_forward(alert["symbol"], decision, feat)
        pop_scores[idx] = pop_scores[idx] * 0.9 + fitness * 0.1

    if not votes:
        return {"status": "no_population"}

    best_idx = int(np.argmax(pop_scores))
    best_genome = population[best_idx]
    best_decision = genome_vote(best_genome, feat, recent_alerts)
    execute_votes = sum(1 for _, decision in votes if decision[0] != "ignore")
    consensus = execute_votes / len(population)

    execution_mode = engine_settings.get("execution_mode", "alerts")
    signal_payload = {
        "symbol": alert["symbol"],
        "side": "buy" if feat["alert_side"] > 0 else "sell",
        "price": float(alert["price"]),
        "consensus": consensus,
        "confidence": best_decision[1],
        "genome": best_idx,
        "mode": execution_mode,
    }

    if should_halt_trading():
        signal_payload["status"] = "halted"
        record_signal(signal_payload)
        return {
            "status": "halted",
            "halted": True,
            "consensus": consensus,
            "best": best_decision,
        }

    if consensus < MIN_CONFIRM_SCORE and best_decision[1] < 0.85:
        signal_payload["status"] = "filtered"
        record_signal(signal_payload)
        return {"status": "no_action", "consensus": consensus, "best": best_decision}

    action = best_decision[0]
    if action == "ignore":
        signal_payload["status"] = "ignored"
        record_signal(signal_payload)
        return {"status": "no_action", "consensus": consensus, "best": best_decision}

    side = signal_payload["side"]
    is_scalp = action == "scalp" or best_genome["scalp_window"] <= SCALP_MAX_SECONDS or best_genome["scalp_aggressiveness"] > 0.7

    price = float(alert["price"])
    atr_value = feat.get("atr", 0.0001) or 0.0001

    if best_genome["use_atr_sl"]:
        base_sl_distance = max(1e-6, best_genome["sl_mult"] * atr_value)
        base_tp_distance = max(1e-6, best_genome["tp_mult"] * atr_value)
    else:
        base_sl_distance = max(1e-6, price * (best_genome["sl_mult"] / 100.0))
        base_tp_distance = max(1e-6, price * (best_genome["tp_mult"] / 100.0))

    if is_scalp:
        base_sl_distance *= 0.5
        base_tp_distance *= 0.6

    if side == "buy":
        sl = price - base_sl_distance
        tp = price + base_tp_distance
    else:
        sl = price + base_sl_distance
        tp = price - base_tp_distance

    trade_meta = {
        "source": "engine",
        "genome": best_idx,
        "consensus": consensus,
        "confidence": best_decision[1],
        "is_scalp": is_scalp,
        "strategy": alert.get("strategy"),
        "execution_mode": execution_mode,
    }

    if execution_mode == "alerts":
        signal_payload.update({"status": "signal_only", "sl": sl, "tp": tp})
        record_signal(signal_payload)
        return {
            "status": "signal_only",
            "consensus": consensus,
            "best_decision": best_decision,
            "execution_mode": execution_mode,
        }

    engine_size = clamp_contracts(engine_settings.get("min_contracts", 1))
    engine_trade = paper_execute(alert["symbol"], side, price, sl, tp, size=engine_size, meta=trade_meta)
    bot_trades = execute_for_bots(alert["symbol"], side, price, sl, tp, feat, trade_meta)

    live_result: Optional[Dict[str, Any]] = None
    if execution_mode == "live":
        account_id = engine_settings.get("live_account_id")
        contract_id = engine_settings.get("live_contract_id")
        if account_id and contract_id and engine_trade:
            order_payload = {
                "accountId": account_id,
                "contractId": contract_id,
                "side": side,
                "size": engine_trade.get("size"),
                "type": "market",
                "timeInForce": engine_settings.get("time_in_force", "Day"),
                "meta": trade_meta,
            }
            if is_finite(sl):
                order_payload["stopLoss"] = sl
            if is_finite(tp):
                order_payload["takeProfit"] = tp
            order_payload["price"] = price
            live_result = dispatch_live_order(order_payload)
        else:
            live_result = {"status": "skipped", "reason": "missing_account_or_contract"}

    signal_payload.update(
        {
            "status": "executed",
            "trade_id": engine_trade.get("id") if engine_trade else None,
            "bot_trades": len(bot_trades),
        }
    )
    if live_result:
        signal_payload["live_status"] = live_result.get("status")
    record_signal(signal_payload)

    return {
        "status": "executed_live" if execution_mode == "live" else "executed_paper",
        "engine_trade": engine_trade,
        "bot_trades": bot_trades,
        "best_genome_idx": best_idx,
        "consensus": consensus,
        "best_decision": best_decision,
        "execution_mode": execution_mode,
        "live_order": live_result,
        "halted": False,
    }


@app.post("/tick")
async def receive_tick(payload: Dict[str, Any]):
    try:
        sym = payload["symbol"]
        price = float(payload["price"])
        ts = payload.get("ts")
        add_tick(sym, price, payload.get("size", 1), ts)
        evaluate_open_trades(sym, price)
        return {"ok": True}
    except Exception as exc:
        return {"ok": False, "err": str(exc)}


@app.get("/status")
async def status():
    snapshot = engine_snapshot()
    snapshot.update(
        {
            "population_size": len(population),
            "generation": generation,
            "best_score": max(pop_scores) if pop_scores else None,
            "paper_trades": len(paper_trades),
            "bots": {name: {k: v for k, v in cfg.items() if k != "description"} for name, cfg in bots.items()},
        }
    )
    return snapshot


@app.get("/paper_trades")
async def list_paper_trades(limit: int = 50):
    limit = max(1, min(limit, 500))
    return {"trades": paper_trades[-limit:]}


@app.get("/bots")
async def list_bots():
    return {
        "bots": [
            {
                **cfg,
                "state": bot_state.get(name, {}),
            }
            for name, cfg in bots.items()
        ]
    }


@app.get("/signals")
async def list_signals(limit: int = 50):
    limit = max(1, min(limit, 500))
    entries = list(signal_log)[-limit:]
    entries.reverse()
    return {"signals": entries}


@app.get("/settings")
async def get_settings():
    return engine_snapshot()


@app.post("/settings")
async def patch_settings(patch: EngineSettingsPatch):
    payload = patch.dict(exclude_unset=True)
    updated = update_engine_settings(payload)
    snapshot = engine_snapshot()
    snapshot["settings"] = updated
    return snapshot


@app.post("/bots")
async def upsert_bot(bot_model: BotConfigModel):
    record = register_bot(bot_model)
    return {"status": "ok", "bot": record}


@app.post("/bots/{bot_name}/toggle")
async def toggle_bot(bot_name: str, payload: BotToggleModel):
    if bot_name not in bots:
        raise HTTPException(status_code=404, detail="Bot not found")
    bots[bot_name]["active"] = payload.active
    return {"status": "ok", "active": payload.active}


# ---------- Evolution loop ----------
async def evolve_loop():
    global population, pop_scores, generation
    while True:
        await asyncio.sleep(30)
        if not population:
            continue
        order = sorted(range(len(pop_scores)), key=lambda idx: -pop_scores[idx])
        elites = [population[idx] for idx in order[:ELITES]]
        new_population = elites.copy()
        while len(new_population) < POP_SIZE:
            if random.random() < 0.3 and elites:
                parent = random.choice(elites)
                new_population.append(mutate_genome(parent))
            elif len(elites) >= 2:
                a, b = random.sample(elites, 2)
                child = crossover(a, b)
                if random.random() < MUT_RATE:
                    child = mutate_genome(child)
                new_population.append(child)
            else:
                new_population.append(random_genome())
        population = new_population
        pop_scores = [score * 0.5 for score in pop_scores]
        generation += 1
        print(f"[evolve] gen {generation} elites kept, new population ready.")


