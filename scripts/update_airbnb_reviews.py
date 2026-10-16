"""Refresh the review count and star rating on each B&B suite card in index.html.

Each card marks its numbers with the Airbnb listing ID:
  <span class="suite-rating" data-airbnb-rating="ID">★ 5.0</span>
  <span data-airbnb-reviews="ID">10 reviews</span>

The script reads each listing's public Airbnb page and rewrites those spans.
If a listing can't be read (blocked, layout changed), its card is left as is.
Run by .github/workflows/update-reviews.yml on the 1st and 15th of each month.
"""

import re
import sys
import urllib.request

PAGE = "index.html"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/130.0 Safari/537.36")


def fetch(listing_id):
    req = urllib.request.Request(
        f"https://www.airbnb.com/rooms/{listing_id}",
        headers={"User-Agent": UA, "Accept-Language": "en-US"},
    )
    with urllib.request.urlopen(req, timeout=30) as res:
        return res.read().decode("utf-8", "replace")


def main():
    html = open(PAGE, encoding="utf-8").read()
    ids = sorted(set(re.findall(r'data-airbnb-reviews="(\d+)"', html)))
    if not ids:
        sys.exit("No data-airbnb-reviews markers found in index.html")

    for listing_id in ids:
        try:
            page = fetch(listing_id)
        except Exception as e:  # network error, 403, etc.
            print(f"{listing_id}: could not fetch ({e}); leaving as is")
            continue

        count = re.search(r'"reviewCount":(\d+)', page)
        if count:
            n = int(count.group(1))
            label = f"{n} review" if n == 1 else f"{n} reviews"
            html = re.sub(
                rf'(<span data-airbnb-reviews="{listing_id}">)[^<]*(</span>)',
                rf"\g<1>{label}\g<2>", html)
            print(f"{listing_id}: {label}")
        else:
            print(f"{listing_id}: review count not found; leaving as is")

        rating = re.search(r'og:title" content="[^"]*★\s*([\d.]+)', page)
        if rating:
            html = re.sub(
                rf'(<span class="suite-rating" data-airbnb-rating="{listing_id}">)[^<]*(</span>)',
                rf"\g<1>★ {rating.group(1)}\g<2>", html)
            print(f"{listing_id}: rating {rating.group(1)}")

    open(PAGE, "w", encoding="utf-8", newline="").write(html)


if __name__ == "__main__":
    main()
