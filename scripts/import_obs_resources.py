#!/usr/bin/env python3

from __future__ import annotations

import argparse
import concurrent.futures
import datetime as dt
import hashlib
import html
import json
import re
import sys
import threading
import time
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin
from urllib.request import Request, urlopen

BASE_URL = "https://obsproject.com"
LIST_URL = BASE_URL + "/forum/resources/?direction=desc&order=download_count&page={page}"
USER_AGENT = "Mozilla/5.0 (compatible; OBSDesktopCatalogBot/1.0)"
REQUEST_DELAY_SECONDS = 0.05
MIN_REQUEST_INTERVAL_SECONDS = 0.35
RESOURCE_MARKER = '<div class="structItem structItem--resource'

CATEGORY_LABELS = {
  "OBS Studio Plugins": "Plugins",
  "Scripts": "Scripts",
  "Tools": "Tools",
  "Themes": "Themes",
  "Guides (General)": "Guides",
  "Guides (Live Events)": "Guides",
}

GENERIC_NAME_WORDS = {
  "a",
  "an",
  "and",
  "for",
  "in",
  "obs",
  "plugin",
  "plugins",
  "resource",
  "resources",
  "studio",
  "the",
}

ACCENT_PAIRS = [
  ("#0ea5e9", "#2563eb"),
  ("#10b981", "#059669"),
  ("#f97316", "#ef4444"),
  ("#f59e0b", "#d97706"),
  ("#22c55e", "#14b8a6"),
  ("#ec4899", "#8b5cf6"),
  ("#6366f1", "#0ea5e9"),
  ("#84cc16", "#16a34a"),
  ("#ef4444", "#f97316"),
  ("#06b6d4", "#3b82f6"),
]

REQUEST_LOCK = threading.Lock()
LAST_REQUEST_AT = 0.0


def fetch_text(url: str) -> str:
  global LAST_REQUEST_AT

  last_error: Exception | None = None
  for attempt in range(5):
    try:
      with REQUEST_LOCK:
        now = time.monotonic()
        wait_time = max(0.0, LAST_REQUEST_AT + MIN_REQUEST_INTERVAL_SECONDS - now)
        if wait_time:
          time.sleep(wait_time)
        LAST_REQUEST_AT = time.monotonic()

      request = Request(url, headers={"User-Agent": USER_AGENT})
      with urlopen(request, timeout=30) as response:
        body = response.read().decode("utf-8", "ignore")
      time.sleep(REQUEST_DELAY_SECONDS)
      return body
    except HTTPError as error:
      last_error = error
      if error.code not in {429, 500, 502, 503, 504} or attempt == 4:
        raise
      retry_after = error.headers.get("Retry-After")
      delay = float(retry_after) if retry_after else 2 ** attempt
      print(
        f"Retrying {url} after HTTP {error.code} (attempt {attempt + 1}/5)",
        file=sys.stderr,
        flush=True,
      )
      time.sleep(delay)
    except URLError as error:
      last_error = error
      if attempt == 4:
        raise
      time.sleep(2 ** attempt)

  if last_error:
    raise last_error
  raise RuntimeError(f"Could not fetch {url}")


def collapse_whitespace(value: str) -> str:
  return re.sub(r"\s+", " ", value).strip()


def strip_tags(value: str) -> str:
  value = re.sub(r"<br\s*/?>", "\n", value, flags=re.I)
  value = re.sub(r"</p>", "\n\n", value, flags=re.I)
  value = re.sub(r"<[^>]+>", " ", value)
  return html.unescape(re.sub(r"[ \t]+\n", "\n", value)).strip()


def trim_paragraphs(value: str, max_length: int) -> str:
  paragraphs = [collapse_whitespace(part) for part in value.splitlines() if collapse_whitespace(part)]
  if not paragraphs:
    return ""

  joined = "\n\n".join(paragraphs[:3])
  if len(joined) <= max_length:
    return joined
  return joined[: max_length - 1].rstrip() + "…"


def summarize_description(tagline: str, description: str) -> str:
  base = collapse_whitespace(tagline or description)
  if len(base) <= 190:
    return base
  return base[:189].rstrip() + "…"


def parse_int(value: str) -> int:
  digits = re.sub(r"[^0-9]", "", value or "")
  return int(digits) if digits else 0


def format_compact_count(value: int) -> str:
  if value >= 1_000_000:
    return f"{value / 1_000_000:.1f}M"
  if value >= 1_000:
    return f"{value / 1_000:.1f}K"
  return str(value)


def singularize(token: str) -> str:
  if token.endswith("ies") and len(token) > 4:
    return token[:-3] + "y"
  if token.endswith("s") and len(token) > 4:
    return token[:-1]
  return token


def normalize_name(value: str) -> str:
  tokens = [
    singularize(token)
    for token in re.findall(r"[a-z0-9]+", value.lower())
    if token not in GENERIC_NAME_WORDS
  ]
  return "".join(tokens)


def slugify(value: str) -> str:
  slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
  return slug or "obs-resource"


def normalize_category(value: str) -> str:
  return CATEGORY_LABELS.get(value, value)


def choose_icon_key(name: str, category: str, text: str) -> str:
  tokens = set(re.findall(r"[a-z0-9]+", f"{name} {category} {text}".lower()))
  if tokens.intersection({"transition", "transitions", "motion", "animate", "animation", "move"}):
    return "motion"
  if tokens.intersection({"switcher", "macro", "macros", "automation", "scheduler"}):
    return "automation"
  if tokens.intersection({"stream", "streaming", "output", "outputs", "rtmp", "ndi", "broadcast"}):
    return "broadcast"
  if tokens.intersection({"music", "audio", "sound", "midi", "volume"}):
    return "music"
  if tokens.intersection({"effect", "effects", "filter", "filters", "shader", "shaders", "mask", "blur"}):
    return "effects"
  if category == "Scripts":
    return "automation"
  if category == "Tools":
    return "motion"
  if category == "Guides":
    return "broadcast"
  return "effects"


def choose_accents(resource_id: str) -> tuple[str, str]:
  digest = hashlib.sha1(resource_id.encode("utf-8")).digest()[0]
  return ACCENT_PAIRS[digest % len(ACCENT_PAIRS)]


def iso_date_from_timestamp(value: str | int | None) -> str:
  if value is None:
    return dt.date.today().isoformat()
  timestamp = int(value)
  return dt.datetime.fromtimestamp(timestamp, dt.UTC).date().isoformat()


def iter_resource_blocks(page_html: str) -> list[str]:
  blocks: list[str] = []
  start = 0
  div_pattern = re.compile(r"</?div\b", re.I)

  while True:
    index = page_html.find(RESOURCE_MARKER, start)
    if index == -1:
      break

    depth = 0
    end_index = -1
    for match in div_pattern.finditer(page_html, index):
      is_close = match.group().startswith("</")
      if is_close:
        depth -= 1
        if depth == 0:
          end_index = page_html.find(">", match.start()) + 1
          break
      else:
        depth += 1

    if end_index == -1:
      break

    blocks.append(page_html[index:end_index])
    start = end_index

  return blocks


def find_first(pattern: str, text: str) -> str | None:
  match = re.search(pattern, text, re.S)
  if not match:
    return None
  return match.group(1)


def parse_listing_item(block: str) -> dict[str, Any] | None:
  title_match = re.search(
    r'<div class="structItem-title">\s*.*?<a href="([^"]+)"[^>]*data-tp-primary="on">(.+?)</a>\s*(?:<span class="u-muted">([^<]+)</span>)?',
    block,
    re.S,
  )
  if not title_match:
    return None

  category_match = re.search(r"<li><a href=\"([^\"]+)\">([^<]+)</a></li>\s*</ul>", block)
  rating_match = re.search(r'title="([0-9.]+) star\(s\)".*?ratingStarsRow-text">\s*([0-9,]+)\s+ratings?', block, re.S)
  downloads = find_first(r"structItem-metaItem--downloads.*?<dd>([^<]+)</dd>", block) or "0"
  last_update = find_first(r"structItem-metaItem--lastUpdate.*?data-timestamp=\"([0-9]+)\"", block)
  created_at = find_first(r"structItem-startDate.*?data-timestamp=\"([0-9]+)\"", block)
  icon_src = find_first(r'<a href="/forum/resources/[^"]+" class="avatar [^"]*"><img src="([^"]+)"', block)

  return {
    "url": urljoin(BASE_URL, html.unescape(title_match.group(1))),
    "name": strip_tags(title_match.group(2)),
    "version": collapse_whitespace(html.unescape(title_match.group(3) or "")) or "Unknown",
    "author": html.unescape(find_first(r'data-author="([^"]+)"', block) or "Unknown"),
    "tagline": collapse_whitespace(strip_tags(find_first(r'<div class="structItem-resourceTagLine">(.*?)</div>', block) or "")),
    "category": normalize_category(category_match.group(2) if category_match else "Resources"),
    "downloads": parse_int(downloads),
    "download_label": collapse_whitespace(strip_tags(downloads)),
    "rating_value": float(rating_match.group(1)) if rating_match else 0.0,
    "rating_count": parse_int(rating_match.group(2)) if rating_match else 0,
    "created_at": int(created_at) if created_at else 0,
    "last_update": int(last_update) if last_update else int(created_at or 0),
    "featured": "structItem-status--featured" in block,
    "icon_url": urljoin(BASE_URL, icon_src) if icon_src else None,
  }


def parse_platforms(raw_values: list[str]) -> list[str]:
  platforms: list[str] = []
  for raw in raw_values:
    value = raw.lower()
    if "windows" in value and "windows" not in platforms:
      platforms.append("windows")
    if ("mac" in value or "osx" in value) and "macos" not in platforms:
      platforms.append("macos")
    if "linux" in value and "linux" not in platforms:
      platforms.append("linux")
  return platforms


def extract_custom_fields(page_html: str) -> dict[str, dict[str, Any]]:
  fields: dict[str, dict[str, Any]] = {}
  for field_id, label, dd_html in re.findall(
    r'<dl class="pairs pairs--columns pairs--fixedSmall pairs--customField" data-field="([^"]+)">\s*<dt>(.*?)</dt>\s*<dd>(.*?)</dd>\s*</dl>',
    page_html,
    re.S,
  ):
    raw_values = [collapse_whitespace(strip_tags(value)) for value in re.findall(r"<li>(.*?)</li>", dd_html, re.S)]
    if not raw_values:
      raw_values = [collapse_whitespace(strip_tags(dd_html))]
    urls = [html.unescape(url) for url in re.findall(r'href="([^"]+)"', dd_html)]
    fields[field_id] = {
      "label": collapse_whitespace(strip_tags(label)),
      "values": [value for value in raw_values if value],
      "urls": [urljoin(BASE_URL, url) for url in urls],
    }
  return fields


def extract_ldjson(page_html: str) -> dict[str, Any]:
  match = re.search(r'<script type="application/ld\+json">\s*(\{.*?\})\s*</script>', page_html, re.S)
  if not match:
    return {}
  return json.loads(match.group(1))


def extract_download_url(page_html: str) -> str | None:
  href = find_first(
    r'<a href="([^"]+)" class="button [^"]*button--cta[^"]*"[^>]*>\s*(?:.*?)<span class="button-text">Go to download</span>',
    page_html,
  )
  if not href:
    return None
  return urljoin(BASE_URL, html.unescape(href))


def looks_like_source_code(url: str) -> bool:
  return any(host in url for host in ("github.com", "gitlab.com", "bitbucket.org", "codeberg.org"))


def first_url_in_text(value: str) -> str | None:
  match = re.search(r"https?://[^\s)]+", value)
  return match.group(0) if match else None


def build_install_notes(listing: dict[str, Any], platforms: list[str], min_obs_version: str | None, source_url: str | None) -> list[str]:
  notes = [
    "Imported from the official OBS Forums Resources catalog.",
    "Use the official resource page to review install steps, release notes, and downloads.",
  ]

  if source_url:
    notes.append("A source code link was published on the official resource page.")

  if min_obs_version:
    notes.append(f"Minimum OBS version listed on the resource page: {min_obs_version}.")
  else:
    notes.append("OBS version compatibility was not explicitly listed on the resource page.")

  if not platforms:
    notes.append("Platform support was not explicitly listed on the resource page.")

  if listing["category"] != "Plugins":
    notes.append(f"This entry comes from the official {listing['category']} section, not the one-click curated install set.")

  return notes[:4]


def build_resource_entry(listing: dict[str, Any], curated_entries: list[dict[str, Any]]) -> dict[str, Any] | None:
  page_html = fetch_text(listing["url"])
  ldjson = extract_ldjson(page_html)
  entity = ldjson.get("mainEntity", {}) if isinstance(ldjson, dict) else {}
  fields = extract_custom_fields(page_html)
  download_url = extract_download_url(page_html)

  source_field = fields.get("source_code") or {}
  source_url = next((url for url in source_field.get("urls", []) if looks_like_source_code(url)), None)
  if not source_url:
    description_url = first_url_in_text(entity.get("description", ""))
    if description_url and looks_like_source_code(description_url):
      source_url = description_url

  supported_platforms = parse_platforms((fields.get("supp_platforms") or {}).get("values", []))
  min_obs_version = next(iter((fields.get("min_studio_ver") or {}).get("values", [])), None)
  supported_obs_versions = f"OBS {min_obs_version}+" if min_obs_version else "See official resource page"

  long_description = trim_paragraphs(entity.get("description", ""), 900)
  tagline = collapse_whitespace(entity.get("alternativeHeadline", "")) or listing["tagline"] or summarize_description("", long_description)
  description = summarize_description(tagline, long_description)
  slug_source = listing["url"].rstrip("/").split("/")[-1].split(".")[0]
  resource_id = slugify(slug_source)
  accent_from, accent_to = choose_accents(resource_id)

  current_name_key = normalize_name(entity.get("headline", listing["name"]))
  current_source_key = source_url or ""
  for curated in curated_entries:
    curated_name_key = normalize_name(curated.get("name", ""))
    curated_source = curated.get("sourceUrl") or curated.get("homepageUrl") or ""
    if current_name_key and current_name_key == curated_name_key:
      return None
    if current_source_key and curated_source and current_source_key == curated_source:
      return None

  verified = listing["downloads"] >= 10_000 and listing["rating_count"] >= 3 and listing["rating_value"] >= 4.0

  return {
    "_downloads": listing["downloads"],
    "id": resource_id,
    "moduleName": resource_id,
    "name": entity.get("headline", listing["name"]),
    "tagline": tagline,
    "description": description,
    "longDescription": long_description or description,
    "author": entity.get("author", {}).get("name", listing["author"]) if isinstance(entity.get("author"), dict) else listing["author"],
    "version": entity.get("version", listing["version"]) or "Unknown",
    "supportedPlatforms": supported_platforms,
    "supportedOBSVersions": supported_obs_versions,
    "minOBSVersion": min_obs_version or "0.0.0",
    "maxOBSVersion": None,
    "category": listing["category"],
    "homepageUrl": entity.get("url", listing["url"]),
    "sourceUrl": source_url,
    "iconKey": choose_icon_key(listing["name"], listing["category"], f"{listing['tagline']} {long_description}"),
    "iconUrl": listing["icon_url"],
    "screenshots": [],
    "installNotes": build_install_notes(listing, supported_platforms, min_obs_version, source_url),
    "verified": verified,
    "featured": False,
    "guideOnly": True,
    "manualInstallUrl": download_url or entity.get("url", listing["url"]),
    "statusNote": "Official OBS resource import",
    "lastUpdated": iso_date_from_timestamp(listing["last_update"]),
    "downloadCount": format_compact_count(listing["downloads"]),
    "accentFrom": accent_from,
    "accentTo": accent_to,
    "packages": [],
  }


def load_curated_entries(path: Path) -> list[dict[str, Any]]:
  return json.loads(path.read_text())


def should_keep_for_stability(item: dict[str, Any], minimum_age_days: int, today: dt.date) -> bool:
  if not item["created_at"]:
    return False
  created_at = dt.datetime.fromtimestamp(item["created_at"], dt.UTC).date()
  return (today - created_at).days >= minimum_age_days


def select_candidates(all_items: list[dict[str, Any]], target_count: int, minimum_age_days: int) -> list[dict[str, Any]]:
  today = dt.date.today()
  stable = [item for item in all_items if should_keep_for_stability(item, minimum_age_days, today)]
  fallback = [item for item in all_items if item not in stable]

  seen_names: set[str] = set()
  selected: list[dict[str, Any]] = []

  for item in stable + fallback:
    name_key = normalize_name(item["name"])
    if name_key in seen_names:
      continue
    seen_names.add(name_key)
    selected.append(item)
    if len(selected) >= target_count:
      break

  return selected


def load_all_listing_items(target_candidates: int, minimum_age_days: int) -> list[dict[str, Any]]:
  items: list[dict[str, Any]] = []
  page = 1

  while True:
    print(f"Fetching listing page {page}", file=sys.stderr, flush=True)
    page_html = fetch_text(LIST_URL.format(page=page))
    blocks = iter_resource_blocks(page_html)
    if not blocks:
      break

    for block in blocks:
      item = parse_listing_item(block)
      if item:
        items.append(item)

    if len(select_candidates(items, target_candidates, minimum_age_days)) >= target_candidates:
      break

    if 'rel="next"' not in page_html:
      break

    page += 1
    time.sleep(REQUEST_DELAY_SECONDS)

  return items


def set_featured_flags(entries: list[dict[str, Any]], target_featured_count: int) -> None:
  featured_entries = 0
  for entry in entries:
    if featured_entries >= target_featured_count:
      break
    if entry["verified"]:
      entry["featured"] = True
      featured_entries += 1


def import_resources(target_count: int, minimum_age_days: int, curated_path: Path, output_path: Path) -> int:
  curated_entries = load_curated_entries(curated_path)
  candidate_buffer = min(100, max(10, target_count // 5))
  candidate_count = target_count + candidate_buffer
  all_items = load_all_listing_items(candidate_count, minimum_age_days)
  selected_items = select_candidates(all_items, candidate_count, minimum_age_days)
  print(
    f"Fetched {len(all_items)} listing items and selected {len(selected_items)} candidates",
    file=sys.stderr,
    flush=True,
  )

  imported_entries: list[dict[str, Any]] = []
  seen_ids = {entry["id"] for entry in curated_entries}

  with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
    future_map = {
      executor.submit(build_resource_entry, item, curated_entries): item
      for item in selected_items
    }
    for index, future in enumerate(concurrent.futures.as_completed(future_map), start=1):
      entry = future.result()
      if not entry or entry["id"] in seen_ids:
        continue
      seen_ids.add(entry["id"])
      imported_entries.append(entry)
      if index % 25 == 0:
        print(
          f"Processed {index}/{len(future_map)} resource detail pages",
          file=sys.stderr,
          flush=True,
        )

  imported_entries.sort(key=lambda entry: entry["_downloads"], reverse=True)
  imported_entries = imported_entries[:target_count]

  set_featured_flags(imported_entries, 48)
  for entry in imported_entries:
    entry.pop("_downloads", None)
  output_path.write_text(json.dumps(imported_entries, indent=2, ensure_ascii=False) + "\n")
  return len(imported_entries)


def main() -> int:
  parser = argparse.ArgumentParser(description="Import official OBS resources into the desktop catalog.")
  parser.add_argument("--target-count", type=int, default=995)
  parser.add_argument("--minimum-age-days", type=int, default=90)
  parser.add_argument("--curated-path", default="src/data/plugins.json")
  parser.add_argument("--output-path", default="src/data/resources.json")
  args = parser.parse_args()

  repo_root = Path(__file__).resolve().parents[1]
  curated_path = repo_root / args.curated_path
  output_path = repo_root / args.output_path

  try:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    imported_count = import_resources(
      target_count=args.target_count,
      minimum_age_days=args.minimum_age_days,
      curated_path=curated_path,
      output_path=output_path,
    )
  except Exception as error:  # pragma: no cover - importer failure should stay visible
    print(f"Importer failed: {error}", file=sys.stderr)
    return 1

  print(f"Wrote {imported_count} OBS resources to {output_path}")
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
