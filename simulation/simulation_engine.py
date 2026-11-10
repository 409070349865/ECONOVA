from simulation.scenarios.sensitivity import percentage_shock

def execute(baseline, shock_percent):
    result=percentage_shock(baseline,shock_percent)
    return {**result,"assumption":"Constant percentage sensitivity","causal_claim":False}
