/* Read-only availability for the B&B suites, the B&B whole house, and The River Front House.
 * Reads each listing's private Airbnb iCal feed from env vars ICAL_ROOM1..ICAL_ROOM4,
 * ICAL_BNB (whole-house listing) and ICAL_RIVERFRONT, plus the VRBO feeds
 * ICAL_BNB_VRBO and ICAL_RIVERFRONT_VRBO (feed URLs must never be committed — the
 * repo is public) and returns only booked date ranges. Guest details in the
 * feeds (reservation codes, phone digits) are never returned.
 *
 * GET /.netlify/functions/availability
 * → { updated, rooms: { "1": [{ start: "2026-10-17", end: "2026-10-19" }, ...], "riverfront": [...] } }
 * end is exclusive (the checkout day is free).
 * "bnb" (whole house) is busy whenever its own listing OR any suite is booked.
 * "riverfront" combines its Airbnb and VRBO calendars (Airbnb's export leaves
 * out dates it imported from VRBO). A VRBO B&B booking is for the whole house,
 * so it blocks "bnb" and every suite.
 */

const FEEDS = {
  '1': 'ICAL_ROOM1',
  '2': 'ICAL_ROOM2',
  '3': 'ICAL_ROOM3',
  '4': 'ICAL_ROOM4',
  bnb: 'ICAL_BNB',
  riverfront: 'ICAL_RIVERFRONT',
  riverfrontVrbo: 'ICAL_RIVERFRONT_VRBO',
  bnbVrbo: 'ICAL_BNB_VRBO',
};

const byStart = (a, b) => a.start.localeCompare(b.start);

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
  return ranges.sort(byStart);
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

  /* A VRBO B&B booking takes the whole house, so it blocks every suite. */
  const bnbVrbo = rooms.bnbVrbo || [];
  delete rooms.bnbVrbo;
  for (const r of ['1', '2', '3', '4']) {
    if (rooms[r]) rooms[r] = rooms[r].concat(bnbVrbo).sort(byStart);
  }

  /* The whole house is only free when every suite is free too. */
  if (rooms.bnb) {
    rooms.bnb = ['1', '2', '3', '4']
      .flatMap((r) => rooms[r] || [])
      .concat(rooms.bnb)
      .sort(byStart);
  }

  if (rooms.riverfrontVrbo) {
    rooms.riverfront = (rooms.riverfront || []).concat(rooms.riverfrontVrbo).sort(byStart);
    delete rooms.riverfrontVrbo;
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ updated: new Date().toISOString(), rooms }),
  };
};
