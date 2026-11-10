import csv
from pathlib import Path

def export_observations(rows, destination):
    path=Path(destination); path.parent.mkdir(parents=True,exist_ok=True)
    fields=["country","indicator","period","value","unit","source"]
    with path.open("w",newline="",encoding="utf-8") as stream:
        writer=csv.DictWriter(stream,fieldnames=fields); writer.writeheader(); writer.writerows(rows)
    return path
