#!/usr/bin/env python3
"""Build js/data.js for "Ohio is a Piano".

Standard library only. Run from the project root:

    python3 tools/build_data.py --cache /some/cache/dir

Sources (all U.S. Census Bureau, public domain):
  * County boundaries and land area: 2024 cartographic boundary file, 1:5,000,000
    https://www2.census.gov/geo/tiger/GENZ2024/shp/cb_2024_us_county_5m.zip
  * Attributes: American Community Survey 5-year estimates, 2010-2024 vintages,
    read from the data.census.gov table endpoint (no API key needed).

Raw downloads are kept in the cache directory so reruns do not refetch.
"""
import argparse
import io
import json
import math
import os
import struct
import sys
import time
import urllib.request
import zipfile

YEARS = list(range(2010, 2025))
STATE_FIPS = "39"
SHP_URL = "https://www2.census.gov/geo/tiger/GENZ2024/shp/cb_2024_us_county_5m.zip"
TABLE_URL = "https://data.census.gov/api/access/data/table?id=ACSDT5Y{year}.{table}&g=040XX00US39$0500000"
TABLES = ["B01003", "B01002", "B03002", "B25002", "B25003", "B11001", "B11002",
          "B19013", "B15002", "B17001", "B25077", "B08013", "B08303"]
SQ_M_PER_SQ_MI = 2589988.110336
VIEW_W = 1000.0
PAD = 12.0

SEATS = {
    "Adams": "West Union", "Allen": "Lima", "Ashland": "Ashland", "Ashtabula": "Jefferson",
    "Athens": "Athens", "Auglaize": "Wapakoneta", "Belmont": "St. Clairsville",
    "Brown": "Georgetown", "Butler": "Hamilton", "Carroll": "Carrollton",
    "Champaign": "Urbana", "Clark": "Springfield", "Clermont": "Batavia",
    "Clinton": "Wilmington", "Columbiana": "Lisbon", "Coshocton": "Coshocton",
    "Crawford": "Bucyrus", "Cuyahoga": "Cleveland", "Darke": "Greenville",
    "Defiance": "Defiance", "Delaware": "Delaware", "Erie": "Sandusky",
    "Fairfield": "Lancaster", "Fayette": "Washington Court House", "Franklin": "Columbus",
    "Fulton": "Wauseon", "Gallia": "Gallipolis", "Geauga": "Chardon", "Greene": "Xenia",
    "Guernsey": "Cambridge", "Hamilton": "Cincinnati", "Hancock": "Findlay",
    "Hardin": "Kenton", "Harrison": "Cadiz", "Henry": "Napoleon", "Highland": "Hillsboro",
    "Hocking": "Logan", "Holmes": "Millersburg", "Huron": "Norwalk", "Jackson": "Jackson",
    "Jefferson": "Steubenville", "Knox": "Mount Vernon", "Lake": "Painesville",
    "Lawrence": "Ironton", "Licking": "Newark", "Logan": "Bellefontaine", "Lorain": "Elyria",
    "Lucas": "Toledo", "Madison": "London", "Mahoning": "Youngstown", "Marion": "Marion",
    "Medina": "Medina", "Meigs": "Pomeroy", "Mercer": "Celina", "Miami": "Troy",
    "Monroe": "Woodsfield", "Montgomery": "Dayton", "Morgan": "McConnelsville",
    "Morrow": "Mount Gilead", "Muskingum": "Zanesville", "Noble": "Caldwell",
    "Ottawa": "Port Clinton", "Paulding": "Paulding", "Perry": "New Lexington",
    "Pickaway": "Circleville", "Pike": "Waverly", "Portage": "Ravenna", "Preble": "Eaton",
    "Putnam": "Ottawa", "Richland": "Mansfield", "Ross": "Chillicothe",
    "Sandusky": "Fremont", "Scioto": "Portsmouth", "Seneca": "Tiffin", "Shelby": "Sidney",
    "Stark": "Canton", "Summit": "Akron", "Trumbull": "Warren",
    "Tuscarawas": "New Philadelphia", "Union": "Marysville", "Van Wert": "Van Wert",
    "Vinton": "McArthur", "Warren": "Lebanon", "Washington": "Marietta", "Wayne": "Wooster",
    "Williams": "Bryan", "Wood": "Bowling Green", "Wyandot": "Upper Sandusky",
}


def fetch(url, path, binary=False):
    """Download url to path unless it is already cached; return the bytes."""
    if os.path.exists(path) and os.path.getsize(path) > 0:
        with open(path, "rb") as f:
            return f.read()
    last = None
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "ohio-piano-build/1.0"})
            with urllib.request.urlopen(req, timeout=90) as r:
                body = r.read()
            if not binary:
                json.loads(body)["response"]["data"]  # raises if the table is missing
            with open(path, "wb") as f:
                f.write(body)
            time.sleep(0.4)
            return body
        except Exception as e:  # retry on network hiccups
            last = e
            time.sleep(2 + 3 * attempt)
    raise RuntimeError("failed to fetch %s: %r" % (url, last))


# ---------------------------------------------------------------- shapefile

def read_dbf(data):
    nrec, hlen, rlen = struct.unpack("<IHH", data[4:12])
    fields = []
    pos = 32
    while data[pos] != 0x0D:
        name = data[pos:pos + 11].split(b"\0")[0].decode("ascii")
        fields.append((name, data[pos + 16]))
        pos += 32
    rows = []
    for i in range(nrec):
        rec = data[hlen + i * rlen: hlen + (i + 1) * rlen]
        off = 1
        row = {}
        for name, length in fields:
            row[name] = rec[off:off + length].decode("utf-8", "replace").strip()
            off += length
        rows.append(row)
    return rows


def read_shp_polygons(data):
    """Return one list of rings per record; each ring is a list of (lon, lat)."""
    shapes = []
    pos = 100
    while pos < len(data):
        _, clen = struct.unpack(">ii", data[pos:pos + 8])
        content = data[pos + 8: pos + 8 + clen * 2]
        pos += 8 + clen * 2
        stype = struct.unpack("<i", content[:4])[0]
        if stype == 0:
            shapes.append([])
            continue
        if stype != 5:
            raise ValueError("unexpected shape type %d" % stype)
        nparts, npoints = struct.unpack("<ii", content[36:44])
        parts = list(struct.unpack("<%di" % nparts, content[44:44 + 4 * nparts]))
        base = 44 + 4 * nparts
        pts = struct.unpack("<%dd" % (2 * npoints), content[base:base + 16 * npoints])
        parts.append(npoints)
        rings = []
        for a, b in zip(parts[:-1], parts[1:]):
            rings.append([(pts[2 * k], pts[2 * k + 1]) for k in range(a, b)])
        shapes.append(rings)
    return shapes


# --------------------------------------------------------------- projection

def make_albers(lat1, lat2, lat0, lon0):
    p1, p2, p0, l0 = (math.radians(v) for v in (lat1, lat2, lat0, lon0))
    n = (math.sin(p1) + math.sin(p2)) / 2
    c = math.cos(p1) ** 2 + 2 * n * math.sin(p1)
    rho0 = math.sqrt(c - 2 * n * math.sin(p0)) / n

    def project(lon, lat):
        rho = math.sqrt(c - 2 * n * math.sin(math.radians(lat))) / n
        theta = n * (math.radians(lon) - l0)
        return rho * math.sin(theta), rho0 - rho * math.cos(theta)
    return project


def ring_area_centroid(ring):
    a = cx = cy = 0.0
    for (x0, y0), (x1, y1) in zip(ring, ring[1:] + ring[:1]):
        cross = x0 * y1 - x1 * y0
        a += cross
        cx += (x0 + x1) * cross
        cy += (y0 + y1) * cross
    a /= 2
    if a == 0:
        return 0.0, ring[0]
    return abs(a), (cx / (6 * a), cy / (6 * a))


def build_geometry(cache):
    z = zipfile.ZipFile(io.BytesIO(fetch(SHP_URL, os.path.join(cache, "cb_2024_us_county_5m.zip"), binary=True)))
    names = {os.path.splitext(n)[1].lower(): n for n in z.namelist()}
    rows = read_dbf(z.read(names[".dbf"]))
    shapes = read_shp_polygons(z.read(names[".shp"]))
    assert len(rows) == len(shapes)
    counties = []
    for row, rings in zip(rows, shapes):
        if row["STATEFP"] == STATE_FIPS:
            counties.append({"fips": row["GEOID"], "name": row["NAME"],
                             "aland": float(row["ALAND"]), "rings": rings})
    counties.sort(key=lambda c: c["name"])
    assert len(counties) == 88, len(counties)

    # Rook adjacency: counties that share at least two boundary vertices.
    owners = {}
    for i, c in enumerate(counties):
        for ring in c["rings"]:
            for pt in ring:
                owners.setdefault((round(pt[0], 6), round(pt[1], 6)), set()).add(i)
    shared = {}
    for ids in owners.values():
        ids = sorted(ids)
        for a in range(len(ids)):
            for b in range(a + 1, len(ids)):
                shared[(ids[a], ids[b])] = shared.get((ids[a], ids[b]), 0) + 1
    neighbors = [set() for _ in counties]
    for (a, b), count in shared.items():
        if count >= 2:
            neighbors[a].add(b)
            neighbors[b].add(a)

    project = make_albers(39.5, 41.5, 40.2, -82.7)
    for c in counties:
        c["proj"] = [[project(lon, lat) for lon, lat in ring] for ring in c["rings"]]
    xs = [x for c in counties for ring in c["proj"] for x, _ in ring]
    ys = [y for c in counties for ring in c["proj"] for _, y in ring]
    scale = (VIEW_W - 2 * PAD) / (max(xs) - min(xs))
    view_h = (max(ys) - min(ys)) * scale + 2 * PAD

    out = []
    for i, c in enumerate(counties):
        best = (-1.0, None)
        d = []
        for ring in c["proj"]:
            pts = []
            for x, y in ring:
                p = (round((x - min(xs)) * scale + PAD, 1), round((max(ys) - y) * scale + PAD, 1))
                if not pts or pts[-1] != p:
                    pts.append(p)
            if len(pts) > 1 and pts[0] == pts[-1]:
                pts.pop()
            if len(pts) < 3:
                continue
            area, cen = ring_area_centroid(pts)
            if area > best[0]:
                best = (area, cen)
            d.append("M" + "L".join("%g,%g" % p for p in pts) + "Z")
        out.append({
            "fips": c["fips"], "name": c["name"], "seat": SEATS[c["name"]],
            "d": "".join(d), "c": [round(best[1][0], 1), round(best[1][1], 1)],
            "n": sorted(neighbors[i]),
        })
    return counties, out, round(view_h, 1)


# --------------------------------------------------------------------- data

def load_table(cache, year, table):
    path = os.path.join(cache, "acs5_%d_%s.json" % (year, table))
    url = TABLE_URL.format(year=year, table=table)
    data = json.loads(fetch(url, path))["response"]["data"]
    head = data[0]
    gi = head.index("GEO_ID")
    out = {}
    for row in data[1:]:
        rec = {}
        for k, v in zip(head, row):
            if k.startswith(table + "_") and k.endswith("E"):
                try:
                    num = float(v)
                except (TypeError, ValueError):
                    num = None
                if num is not None and num <= -99999999:  # Census "not available" codes
                    num = None
                rec[k[len(table) + 1:-1]] = num
        out[row[gi][-5:]] = rec
    return out


def build_values(cache, counties):
    fips = [c["fips"] for c in counties]
    area = {c["fips"]: c["aland"] / SQ_M_PER_SQ_MI for c in counties}
    ids = ["area", "medage", "famsize", "density", "pop", "white", "black", "hisp", "asian",
           "other", "renter", "owner", "vacant", "income", "bach", "poverty", "homeval", "commute"]
    values = {k: [] for k in ids}
    for year in YEARS:
        t = {name: load_table(cache, year, name) for name in TABLES}
        sys.stderr.write("loaded %d\n" % year)
        cols = {k: [] for k in ids}
        for f in fips:
            pop = t["B01003"][f]["001"]
            race = t["B03002"][f]
            occ, ten = t["B25002"][f], t["B25003"][f]
            fam = t["B11002"][f]
            edu = t["B15002"][f]
            # internal consistency checks on table layouts
            assert abs(fam["001"] - fam["002"] - fam["012"]) < 1, (year, f, "B11002")
            assert abs(occ["001"] - occ["002"] - occ["003"]) < 1, (year, f, "B25002")
            assert abs(ten["001"] - ten["002"] - ten["003"]) < 1, (year, f, "B25003")
            assert abs(occ["002"] - ten["001"]) < 1, (year, f, "tenure")
            assert abs(race["001"] - race["002"] - race["012"]) < 1, (year, f, "B03002")
            nh_other = race["001"] - race["003"] - race["004"] - race["006"] - race["012"]
            bach = sum(edu[k] for k in ("015", "016", "017", "018", "032", "033", "034", "035"))
            cols["area"].append(round(area[f], 1))
            cols["medage"].append(t["B01002"][f]["001"])
            cols["famsize"].append(round((fam["004"] + fam["007"] + fam["010"]) / t["B11001"][f]["002"], 3))
            cols["density"].append(round(pop / area[f], 2))
            cols["pop"].append(int(pop))
            cols["white"].append(round(100 * race["003"] / race["001"], 3))
            cols["black"].append(round(100 * race["004"] / race["001"], 3))
            cols["hisp"].append(round(100 * race["012"] / race["001"], 3))
            cols["asian"].append(round(100 * race["006"] / race["001"], 3))
            cols["other"].append(round(100 * nh_other / race["001"], 3))
            cols["renter"].append(round(100 * ten["003"] / occ["001"], 3))
            cols["owner"].append(round(100 * ten["002"] / occ["001"], 3))
            cols["vacant"].append(round(100 * occ["003"] / occ["001"], 3))
            cols["income"].append(int(t["B19013"][f]["001"]))
            cols["bach"].append(round(100 * bach / edu["001"], 3))
            cols["poverty"].append(round(100 * t["B17001"][f]["002"] / t["B17001"][f]["001"], 3))
            cols["homeval"].append(int(t["B25077"][f]["001"]))
            cols["commute"].append(round(t["B08013"][f]["001"] / t["B08303"][f]["001"], 3))
        for k in ids:
            assert all(v is not None for v in cols[k]), (year, k)
            values[k].append(cols[k])
    return values


VARS = [
    {"id": "name", "label": "County name"},
    {"id": "area", "label": "Land area"},
    {"id": "medage", "label": "Median age"},
    {"id": "famsize", "label": "Average family size"},
    {"id": "density", "label": "Population per square mile"},
    {"id": "pop", "label": "Total population"},
    {"id": "white", "label": "Percent white (non-Hispanic)"},
    {"id": "black", "label": "Percent Black (non-Hispanic)"},
    {"id": "hisp", "label": "Percent Hispanic or Latino"},
    {"id": "asian", "label": "Percent Asian (non-Hispanic)"},
    {"id": "other", "label": "Percent other or multiple race"},
    {"id": "renter", "label": "Percent of all homes that are rented"},
    {"id": "owner", "label": "Percent of all homes that are owner-occupied"},
    {"id": "vacant", "label": "Percent of all homes that are vacant"},
    {"id": "income", "label": "Median household income", "added": True},
    {"id": "bach", "label": "Percent with a bachelor's degree or higher", "added": True},
    {"id": "poverty", "label": "Percent below the poverty line", "added": True},
    {"id": "homeval", "label": "Median home value", "added": True},
    {"id": "commute", "label": "Average commute time (minutes)", "added": True},
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True, help="directory for raw downloads")
    ap.add_argument("--out", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "js", "data.js"))
    args = ap.parse_args()
    os.makedirs(args.cache, exist_ok=True)

    assert len(SEATS) == 88 and len(set(SEATS.values())) == 88
    raw, counties, view_h = build_geometry(args.cache)
    degree = [len(c["n"]) for c in counties]
    assert min(degree) >= 2, "isolated county in adjacency graph"
    values = build_values(args.cache, raw)

    payload = {
        "years": YEARS,
        "view": [VIEW_W, view_h],
        "vars": VARS,
        "counties": counties,
        "values": values,
    }
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w") as f:
        f.write("// Generated by tools/build_data.py. Do not edit by hand.\n")
        f.write("window.OHIO_DATA = ")
        json.dump(payload, f, separators=(",", ":"))
        f.write(";\n")
    sys.stderr.write("wrote %s (%d bytes); view %sx%s; %d adjacency pairs\n" % (
        args.out, os.path.getsize(args.out), VIEW_W, view_h, sum(degree) // 2))


if __name__ == "__main__":
    main()
