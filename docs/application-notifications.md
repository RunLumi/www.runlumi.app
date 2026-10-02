# Applicant notifications

The `runlumi` Worker sends a Discord notification after a valid application,
its answers, and private-file metadata have committed to D1. All published roles
use the same notification channel.

Set `DISCORD_APPLICATION_WEBHOOK_URL` as an encrypted Worker secret. Never place
its value in source, Wrangler configuration, build arguments, or deployment logs.
The deployment preflight checks that the secret exists.

Messages contain the role title, application reference, and an authenticated
admin-page link. Names, email addresses, phone numbers, answers, and CVs remain
in the hiring desk. Discord mentions are disabled.

Delivery uses `wait=true`, rejects redirects, times out after five seconds, and
requires a returned Discord message ID. The application timeline records
`discord_notification_sent` or `discord_notification_failed`. Errors record only
a safe reason code, never the webhook URL or upstream body.

Discord failure does not undo a saved application. There is no automatic retry
of ambiguous failures, which could duplicate messages. If a delivery fails,
review the hiring desk and Worker logs; this is not a durable delivery queue.

Verify deployment with one clearly marked synthetic application through the
public form and check both its stored application and Discord message ID. Do not
send real candidate data or files to Discord for testing.
