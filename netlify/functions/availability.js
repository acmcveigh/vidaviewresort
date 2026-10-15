/* Read-only availability for the B&B suites and The River Front House.
 * Reads each listing's private Airbnb iCal feed from env vars ICAL_ROOM1..ICAL_ROOM4
 * and ICAL_RIVERFRONT (feed URLs must never be committed — the repo is public) and returns only
 * booked date ranges. Guest details in the feed (reservation codes, phone
 * digits) are never returned.
 *
 * GET /.netlify/functions/availability
 * → { updated, rooms: { "1": [{ start: "2026-10-17", end: "2026-10-19" }, ...], "riverfront": [...] } }
 * end is exclusive (the checkout day is free).
 */

const FEEDS = {
  '1': 'ICAL_ROOM1',
  '2': 'ICAL_ROOM2',
  '3': 'ICAL_ROOM3',
  '4': 'ICAL_ROOM4',
  riverfront: 'ICAL_RIVERFRONT',
};

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=600',
};

/* "20261017" or "20261017T150000Z" → "2026-10-17" */
const toISODate = (v) => `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;

function parseBusy(ics) {
  const text = ics.replace(/\r?\n[ \t]/g, ''); // unfold continuation lines
  const ranges = [];
  for (const block of text.split('BEGIN:VEVENT').slice(1)) {
    const start = block.match(/^DTSTART[^:\n]*:(\d{8})/m);
    const end = block.match(/^DTEND[^:\n]*:(\d{8})/m);
    if (start && end) ranges.push({ start: toISODate(start[1]), end: toISODate(end[1]) });
  }
  return ranges.sort((a, b) => a.start.localeCompare(b.start));
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const rooms = {};
  await Promise.all(
    Object.entries(FEEDS).map(async ([room, envVar]) => {
      const url = process.env[envVar];
      if (!url) return;
      try {
        const res = await fetch(url, { headers: { 'User-Agent': 'VidaViewRetreat-availability/1.0' } });
        if (!res.ok) return;
        rooms[room] = parseBusy(await res.text());
      } catch {
        /* leave this room out; the site hides its calendar button */
      }
    })
  );

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ updated: new Date().toISOString(), rooms }),
  };
};
