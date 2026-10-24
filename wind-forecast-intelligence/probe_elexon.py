
import requests

BASE = "https://data.elexon.co.uk/bmrs/api/v1/datasets"
session = requests.Session()

def fetch(dataset, params):
    url = f"{BASE}/{dataset}/stream"
    response = session.get(url, params=params, timeout=90)
    print(f"\n{dataset}: HTTP {response.status_code}")
    response.raise_for_status()
    data = response.json()

    if not isinstance(data, list):
        print("Unexpected response:", str(data)[:1000])
        return []

    print("Rows returned:", len(data))
    if data:
        print("First row:", data[0])
    return data

try:
    # Inspect forecast publication vintages
    forecasts = fetch("WINDFOR", {
        "publishDateTimeFrom": "2025-12-30T00:00:00Z",
        "publishDateTimeTo": "2025-12-31T00:00:00Z",
    })

    if forecasts:
        publications = sorted({
            row.get("publishTime") for row in forecasts
            if row.get("publishTime")
        })
        delivery_times = sorted({
            row.get("startTime") for row in forecasts
            if row.get("startTime")
        })

        print("\nPublication timestamps:")
        print(*publications, sep="\n")

        print("\nFirst 10 delivery timestamps:")
        print(*delivery_times[:10], sep="\n")

        print("\nSample forecast generations:")
        print([
            (row.get("startTime"), row.get("generation"))
            for row in forecasts[:10]
        ])

    # Inspect actual wind generation
    actuals = fetch("FUELHH", {
        "settlementDateFrom": "2026-01-01",
        "settlementDateTo": "2026-01-01",
        "fuelType": "WIND",
    })

    print("\nActual settlement periods:")
    print(sorted({
        row.get("settlementPeriod") for row in actuals
        if row.get("settlementPeriod") is not None
    }))

except requests.RequestException as exc:
    print("\nNetwork/API request failed:", exc)
except (ValueError, KeyError, TypeError) as exc:
    print("\nUnexpected response format:", exc)
