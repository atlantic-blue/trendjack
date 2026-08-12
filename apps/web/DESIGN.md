# Design

One screen, read once a day, over coffee. The reader answers one question per video: is this
worth my time today. Then they watch it. Nothing else happens here.

## What changed from the first attempt

The first design was a dark dashboard with a table of rows and a play triangle that was only an
icon. Two things were wrong with it, and both are the point of this one.

**It was dark and dense.** This is read in the morning to make a quick choice, not monitored on a
wall. The page is now bright, and the surface stays out of the way of the thumbnails.

**The videos were not watchable.** A row of numbers about a video is not a video. Now every card
is the video, at nine by sixteen, and it plays where it sits.

## The rules

**The video is the content.** Thumbnails fill the cards. Text sits on top of them or under them,
never instead of them. A card is a still that becomes a player.

**The poster loads, the player waits.** Twenty embedded players would each pull a whole video
framework. The poster arrives immediately and the player only when somebody asks. Watching costs
one tap, anywhere on the picture.

**One accent, one job.** The accent colour marks how far above normal a video is, and nothing
else. Everything else is ink on paper. When every number is coloured, no number is.

**The numbers are the loudest thing.** The multiple sits on the video in tabular figures, because
it is the reason that video is on the page at all.

**Never make a short day look like a quiet one.** The counts of what was held back and what could
not be scored are always shown, even at zero. Three videos on a day when forty were suppressed is
a different thing from a quiet day.

**Say what is unknown.** A video whose counts are reported too roundly to measure says "rate
unreadable" rather than showing a rate of zero. Those mean opposite things.

## Tokens

They live in `src/tokens.css` and nothing uses a raw value.

Surface is warm rather than blue, so thumbnails do not look cold against it. Ink is near black,
not black. One accent, a warm red. Three states: rising, falling, and unknown. Radii at 8, 14 and 22. Spacing on a 4 and 8 point grid. A 1.25 type scale. Two shadows, at rest and lifted.

A dark palette exists because a browser set to dark should not flash white at somebody at seven
in the morning. It is the same design with ink and paper swapped, not a second design.

## Accessibility

Focus is visible everywhere, at three pixels in the accent colour. The play control is a real
button, named after the video rather than called "play", so a screen reader announces what it
will play. Tap targets clear 44 pixels. Motion is only applied where reduced motion is not
requested. Contrast meets AA in both palettes.

## Checked, not assumed

The layout is measured at 390, 430, 768, 1024 and 1440 pixels, and nothing overflows sideways at
any of them. That measurement compares the document's scroll width with the viewport width. A
screenshot cannot show this, because a screenshot is always exactly the window width, so it will
happily crop an overflow and look fine.

The play control is covered by tests that press it and assert the player appears with the right
video. Removing what the button does turns three of them red, which is the difference between
this and the decorative triangle in the first design.
