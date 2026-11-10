class RBIConnector:
    provider = "Reserve Bank of India DBIE"
    source_url = "https://data.rbi.org.in/"

    def import_csv(self, path):
        raise NotImplementedError("RBI file layouts and reuse terms must be confirmed for each dataset before automated ingestion")
