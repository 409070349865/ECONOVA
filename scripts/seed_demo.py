import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"backend"))
from app.database import Base,engine,SessionLocal
from app.models import Country,Indicator,DataSource,Observation
Base.metadata.create_all(engine)
db=SessionLocal()
try:
    country=db.query(Country).filter_by(iso3="IND").first() or Country(iso3="IND",name="India",region="South Asia")
    indicator=db.query(Indicator).filter_by(code="NY.GDP.MKTP.KD.ZG").first() or Indicator(code="NY.GDP.MKTP.KD.ZG",name="GDP growth (annual %)",unit="%",frequency="annual",definition="Annual real GDP growth")
    source=db.query(DataSource).filter_by(provider="ECONOVA sample fixture").first() or DataSource(provider="ECONOVA sample fixture",dataset_code="SAMPLE",terms_url="")
    db.add_all([country,indicator,source]); db.flush()
    values=[4.0,7.9,5.2,6.4,7.4,8.0,8.3,6.8,6.5,7.0,6.1,4.0,(-7.3),8.7,7.2,8.2,7.6,6.5,7.0,6.8]
    for year,value in zip(range(2005,2025),values):
        if not db.query(Observation).filter_by(country_id=country.id,indicator_id=indicator.id,source_id=source.id,period=str(year)).first(): db.add(Observation(country_id=country.id,indicator_id=indicator.id,source_id=source.id,period=str(year),value=value,unit="%"))
    db.commit()
    print("Demo observations ready. Source is explicitly labelled ECONOVA sample fixture.")
finally: db.close()
