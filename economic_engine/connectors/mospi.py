class MOSPIConnector:
    provider = "Ministry of Statistics and Programme Implementation"
    source_url = "https://www.mospi.gov.in/"

    def import_dataset(self, path, metadata):
        raise NotImplementedError("Select an official MOSPI release and map its base year, reference period and units before ingestion")
