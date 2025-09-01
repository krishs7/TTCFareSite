// frontend/src/makeIcs.js
export function makeIcs(deadlineISO) {
  const dt = new Date(deadlineISO);
  const pad = n => String(n).padStart(2, '0');
  const toUTC = d => (
    d.getUTCFullYear() +
    pad(d.getUTCMonth()+1) +
    pad(d.getUTCDate()) + 'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) + 'Z'
  );

  const uid = 'one-fare-' + crypto.randomUUID();
  const dtstamp = toUTC(new Date());
  const dtstart = toUTC(dt); // we put alarms relative to this

  // Two alarms: 5 minutes before, 1 minute before
  const ics =
`BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//One-Fare//Reminders//EN
BEGIN:VEVENT
UID:${uid}
DTSTAMP:${dtstamp}
SUMMARY:Tap-by deadline (One-Fare)
DTSTART:${dtstart}
DESCRIPTION:Tap before this time to keep your One-Fare discount.
BEGIN:VALARM
TRIGGER:-PT5M
ACTION:DISPLAY
DESCRIPTION:One-Fare: 5 minutes left. Tap soon to keep your discount.
END:VALARM
BEGIN:VALARM
TRIGGER:-PT1M
ACTION:DISPLAY
DESCRIPTION:One-Fare: 1 minute left. Tap before your window expires.
END:VALARM
END:VEVENT
END:VCALENDAR`;
  return ics;
}

export function downloadIcs(filename, icsString) {
  const blob = new Blob([icsString], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(url);
  a.remove();
}

