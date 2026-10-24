
import requests
from datetime import datetime, timezone

BASE = "https://data.elexon.co.uk/bmrs/api/v1/datasets"
session = requests.Session()

def get_rows(dataset, params):
    response = session.get(
        f"{BASE}/{dataset}/stream",
        params=params,
        timeout=90,
    )
    response.raise_for_status()
    return response.json()

# Provisional cutoff: 09:20 UTC on the day before delivery.
# January in the UK is on GMT (UTC+0).
cutoff = datetime(2025, 12, 31, 9, 20, tzinfo=timezone.utc)

forecasts = get_rows("WINDFOR", {
    "publishDateTimeFrom": "2025-12-31T00:00:00Z",
    "publishDateTimeTo": "2026-01-01T00:00:00Z",
})

# Keep January 1 delivery periods with eligible forecast publications.
eligible = []
for row in forecasts:
    delivery = datetime.fromisoformat(
        row["startTime"].replace("Z", "+00:00")
    )
    published = datetime.fromisoformat(
        row["publishTime"].replace("Z", "+00:00")
    )

    if (
        delivery.date().isoformat() == "2026-01-01"
        and published <= cutoff
    ):
        eligible.append(row)

# Choose latest eligible forecast for each delivery timestamp.
selected = {}
for row in eligible:
    key = row["startTime"]
    if (
        key not in selected
        or row["publishTime"] > selected[key]["publishTime"]
    ):
        selected[key] = row

actuals = get_rows("FUELHH", {
    "settlementDateFrom": "2026-01-01",
    "settlementDateTo": "2026-01-01",
    "fuelType": "WIND",
})

actual_by_time = {
    row["startTime"]: row["generation"]
    for row in actuals
    if row.get("fuelType") == "WIND"
}

print("Forecast rows retrieved:", len(forecasts))
print("Eligible January 1 forecast rows:", len(eligible))
print("Unique hourly delivery periods:", len(selected))
print("Actual half-hourly rows:", len(actuals))
print("Actual timestamps:", len(actual_by_time))

print("\nSelected forecast sample:")
for timestamp in sorted(selected)[:5]:
    row = selected[timestamp]
    print(
        timestamp,
        "published:", row["publishTime"],
        "generation:", row["generation"],
        "actual:", actual_by_time.get(timestamp, "NO EXACT MATCH"),
    )

print("\nPublication times before cutoff:")
print(*sorted({
    row["publishTime"] for row in eligible
}), sep="\n")
