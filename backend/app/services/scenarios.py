from decimal import Decimal, ROUND_HALF_UP


def run_scenario(baseline_value: float, shock_percent: float):
    baseline = Decimal(str(baseline_value))
    shock = Decimal(str(shock_percent))
    multiplier = Decimal("1") + (shock / Decimal("100"))
    scenario_value = float((baseline * multiplier).quantize(Decimal("0.0000000001"), rounding=ROUND_HALF_UP))
    delta = float((scenario_value - baseline_value).__round__(10))
    return {
        "baseline": float(baseline),
        "scenario": scenario_value,
        "delta": delta,
        "shock_percent": float(shock),
        "interpretation": "Mechanical sensitivity calculation, not a causal policy estimate.",
    }
