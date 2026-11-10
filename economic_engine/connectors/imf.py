class IMFConnector:
    provider = "International Monetary Fund"
    source_url = "https://data.imf.org/"

    def import_series(self, dataset, series):
        raise NotImplementedError("Configure a supported IMF API or SDMX dataset and its identifiers")
