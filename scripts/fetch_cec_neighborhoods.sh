#!/bin/sh
# Vendor the CEC neighborhood layers used by elections.govmap.gov.il (no CORS, so they cannot be read from the browser).
# Each polygon groups the kalpiot whose polling location falls inside it (CEC: "does not accurately represent where voters live").
set -eu
cd "$(dirname "$0")/.."
mkdir -p raw/cec
for p in latest 25 24; do
  for f in neighborhood_geometry.topojson neighborhood_data.json; do
    curl -fsS --retry 3 -o "raw/cec/${p}_$f" "https://elections.govmap.gov.il/data/votes/$p/$f"
  done
done
python3 scripts/build_nb.py
