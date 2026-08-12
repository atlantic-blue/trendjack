# Infrastructure

One DynamoDB table, one private bucket, one CloudFront distribution, one registry and one
Lambda. That is the whole footprint.

## What runs where

The poller is a Lambda on a container image, because it runs yt-dlp. EventBridge invokes it once
a day. It writes `digest.json` into the site bucket and clears that one path from the cache.

The page is static files in the same bucket. CloudFront serves both, so the page reads the
digest from its own address and needs no API.

Everything is cached for a day, which is how often the data changes.

## Applying

Never from a laptop. The deploy job assumes `trendjack-deploy` through GitHub OIDC and applies
on merge to `main`.

The one exception is `bootstrap/`, and it has to be: the deploy role cannot create itself,
because it needs permissions before it can grant itself any. An administrator applies that once:

```
terraform -chdir=infra/bootstrap init
terraform -chdir=infra/bootstrap apply
```

It creates the state bucket and the role, and reuses the account's existing GitHub OIDC
provider. Its own state stays local; nothing depends on it after the first apply and the two
resources can be imported again if it is lost.

## The panel

The panel is the curation worth having, so it is not in this repository. It lives in the
`TRENDJACK_PANEL_JSON` repository secret and the deploy passes it to the function as a setting.
