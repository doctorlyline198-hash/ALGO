import pytest

from mutating_confirmation import (
    clamp_contracts,
    engine_settings,
    generation_stats,
    record_signal,
    should_halt_trading,
    signal_log,
    update_engine_settings,
)


@pytest.fixture(autouse=True)
def reset_engine_state():
    settings_backup = dict(engine_settings)
    stats_backup = dict(generation_stats)
    signal_log.clear()
    yield
    engine_settings.clear()
    engine_settings.update(settings_backup)
    generation_stats.clear()
    generation_stats.update(stats_backup)
    signal_log.clear()


def test_clamp_contracts_respects_bounds():
    update_engine_settings({"min_contracts": 2, "max_contracts": 4})
    assert clamp_contracts(1) == 2.0
    assert clamp_contracts(10) == 4.0


def test_should_halt_trading_threshold():
    update_engine_settings({"risk_cap": 400})
    generation_stats["realized"] = -401
    assert should_halt_trading() is True
    generation_stats["realized"] = -399
    assert should_halt_trading() is False


def test_update_engine_settings_coerces_values():
    update_engine_settings({"min_contracts": "3", "max_contracts": "2", "time_in_force": "gtc "})
    assert engine_settings["min_contracts"] == 3
    assert engine_settings["max_contracts"] == 3
    assert engine_settings["time_in_force"] == "gtc"


def test_record_signal_respects_toggle():
    engine_settings["show_signals"] = False
    record_signal({"symbol": "ES"})
    assert len(signal_log) == 0
    engine_settings["show_signals"] = True
    record_signal({"symbol": "ES"})
    assert len(signal_log) == 1
