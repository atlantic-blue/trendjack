# Trendjack

Find a short form video while it is still rising, work out which product it fits, groom it into
a ready spec, and produce our version of it.

Four stages, each with its own contract.

```
detect  ->  apply  ->  groom  ->  create
trend       product    spec      video
```

## Why detection is the hard part

There is no endpoint anywhere that returns "what is trending". Neither TikTok nor Instagram
publishes one, and no vendor sells one. What you can ask for is narrower: the recent posts of a
creator you name, with view counts attached. The trend is not fetched, it is inferred.

So Trendjack watches a curated panel of creators several times a day, keeps an append only
history of what each post did, and scores a video by how far it is beating that creator's own
settled baseline, how fast it is still climbing, whether the engagement says it was loved or
merely pushed, and whether the same shape is breaking out for other creators too.

The scoring formula is public knowledge and copyable in an afternoon. The labelled history that
says which version of the formula was right is not, and it cannot be backfilled by anyone who
starts later.

## Status

Phase 1, detection, in progress. Nothing else is built.

## Running it

Needs Node 22.6 or newer. The source runs through type stripping, so there is no build step.

```
npm install
npm run typecheck
npm test
npm run format:check
```

## Layout

```
src/contracts   the ports and the domain types, depended on by everything else
src/ranking     the heuristic, pure functions, no input or output
src/store       the append only observation history
src/sources     one adapter per data source, behind the TrendSource port
src/digest      what a human reads in the morning
```

## What is not in this repository

The panel, meaning the creators, hashtags and sounds we watch, is deliberately not here. That
curation is the thing worth having, so it lives outside the repository and only a small
invented sample is committed as a test fixture.

## Licence

MIT.
