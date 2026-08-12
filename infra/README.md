# Infrastructure

One DynamoDB table. That is the whole footprint.

## Why there is no Lambda here

The poller runs as a scheduled GitHub Actions job rather than as a Lambda, and that is a
deliberate choice rather than a shortcut.

Polling needs `yt-dlp`, which is a Python program, so a Lambda would mean a container image, a
registry, and a build pipeline to keep the image current with a tool that has to be updated
often to keep working at all. A scheduled workflow installs it in one line.

The open question either way is whether TikTok answers a request from a data centre address at
all. It is far more aggressive with those than with home connections, and I have not verified
it. Running the schedule in Actions answers that question for the price of a workflow file
instead of the price of an image pipeline. If it turns out to be blocked, the options are a
residential proxy, a paid data provider whose whole business is solving exactly this, or running
the poll from a machine on a home connection and writing to the same table. Nothing above the
`TrendSource` port changes in any of those cases.

## The one time bootstrap, which needs an administrator

The deploy workflow assumes an OIDC role. That role cannot create itself, because it needs
permissions before it can grant itself any, so the first apply has to be done by somebody with
administrator credentials. Until that exists the deploy workflow is manual only, so nothing on
`main` goes red waiting for it.

What is needed:

1. An IAM OIDC provider for `token.actions.githubusercontent.com` in the Atlantic Blue account,
   if one is not there already.
2. A role, `trendjack-deploy`, trusted by this repository on `main` only, with permission to
   manage the table and read and write the Terraform state bucket.
3. A state bucket, or a reuse of an existing one, wired into a backend block here.

Then set `AWS_DEPLOY_ROLE_ARN` as a repository variable and the deploy workflow can be switched
from manual to running on merge.

## Applying

Never from a laptop. `terraform plan` and `validate` locally are fine; the apply runs in CI.
